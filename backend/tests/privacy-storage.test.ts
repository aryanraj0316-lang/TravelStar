/* eslint-disable @typescript-eslint/no-explicit-any -- SDK command mocks intentionally cover multiple command shapes. */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import { eraseUserObjects, eraseLegacyChatNamespace, legacyChatKey } from '../src/lib/object-storage';
import { eraseLocalMedia, localMediaFilename } from '../src/services/account-erasure';
import fs from 'fs/promises';
jest.mock('../src/config/env', () => ({
  env: {
    OBJECT_STORAGE_BUCKET: 'privacy-fixture',
    OBJECT_STORAGE_REGION: 'test',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'fixture',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'fixture',
    OBJECT_STORAGE_PUBLIC_URL_BASE: 'https://media.fixture',
  },
}));
jest.mock('../src/services/db', () => ({ __esModule: true, default: {} }));
jest.mock('../src/lib/presence-store', () => ({ removeUserLocation: jest.fn() }));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: { readdir: jest.fn(), rm: jest.fn().mockResolvedValue(undefined) },
}));
afterEach(() => jest.restoreAllMocks());

test('account erasure lists every owned namespace, paginates and deletes current and historical versions', async () => {
  const sent: any[] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
    sent.push(command);
    if (command instanceof ListObjectsV2Command)
      return command.input.ContinuationToken
        ? { Contents: [{ Key: `${command.input.Prefix}replaced.jpg` }] }
        : {
            Contents: [{ Key: `${command.input.Prefix}unattached.jpg` }],
            IsTruncated: true,
            NextContinuationToken: 'page2',
          };
    if (command instanceof GetBucketVersioningCommand) return { Status: 'Enabled' };
    if (command instanceof ListObjectVersionsCommand)
      return {
        Versions: [{ Key: `${command.input.Prefix}unattached.jpg`, VersionId: 'old-version' }],
        DeleteMarkers: [{ Key: `${command.input.Prefix}unattached.jpg`, VersionId: 'marker' }],
      };
    return {};
  }) as any);
  await eraseUserObjects('owner-123');
  expect(new Set(sent.filter((c) => c instanceof ListObjectsV2Command).map((c) => c.input.Prefix))).toEqual(
    new Set([
      'avatars/owner-123/',
      'trip-covers/owner-123/',
      'guide-media/owner-123/',
      'chat-media/owner-123/',
      'stories/owner-123/',
    ]),
  );
  expect(
    sent
      .filter((c) => c instanceof DeleteObjectsCommand)
      .some((c) => c.input.Delete.Objects.some((o: any) => o.VersionId === 'old-version')),
  ).toBe(true);
  expect(
    sent
      .filter((c) => c instanceof DeleteObjectsCommand)
      .every((c) => c.input.Delete.Objects.every((o: any) => o.Key.includes('/owner-123/'))),
  ).toBe(true);
});

test('partial provider deletion and version permissions fail closed for durable retry', async () => {
  jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (c: any) => {
    if (c instanceof ListObjectsV2Command) return { Contents: [{ Key: 'avatars/owner/a.jpg' }] };
    if (c instanceof DeleteObjectsCommand) return { Errors: [{ Code: 'AccessDenied' }] };
    return {};
  }) as any);
  await expect(eraseUserObjects('owner')).rejects.toThrow('incomplete');
  jest.restoreAllMocks();
  jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (c: any) => {
    if (c instanceof GetBucketVersioningCommand) throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
    return {};
  }) as any);
  await expect(eraseUserObjects('owner')).rejects.toThrow('denied');
});

test('legacy cleanup is restricted to chat-media, and never resolves arbitrary URLs or traversal', async () => {
  const prefixes: string[] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (c: any) => {
    if (c instanceof ListObjectsV2Command) prefixes.push(c.input.Prefix);
    return {};
  }) as any);
  await eraseLegacyChatNamespace();
  expect(prefixes).toEqual(['chat-media/']);
  expect(legacyChatKey('https://media.fixture/chat-media/owner/photo.jpg')).toBe('chat-media/owner/photo.jpg');
  expect(legacyChatKey('https://evil.invalid/chat-media/owner/photo.jpg')).toBeNull();
  expect(legacyChatKey('https://media.fixture/chat-media/owner/../../secret')).toBeNull();
  expect(localMediaFilename('https://media.fixture/uploads/../../secret')).toBeNull();
});

test('disk cleanup removes unattached owned files and legacy references without touching other owners', async () => {
  jest.mocked(fs.readdir).mockResolvedValue(['story-owner1-a.jpg', 'story-owner2-a.jpg', 'story-legacy.jpg'] as any);
  jest.mocked(fs.rm).mockClear();
  await eraseLocalMedia('owner1', ['story-legacy.jpg']);
  const removed = jest.mocked(fs.rm).mock.calls.map((c) => String(c[0]).replace(/\\/g, '/').split('/').pop());
  expect(removed.sort()).toEqual(['story-legacy.jpg', 'story-owner1-a.jpg']);
  await expect(eraseLocalMedia('owner1', ['../secret'])).rejects.toThrow('Unsafe');
});
