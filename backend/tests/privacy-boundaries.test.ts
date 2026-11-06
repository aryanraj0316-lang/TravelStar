import request from 'supertest';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { io as client, Socket } from 'socket.io-client';
import app from '../src/app';
import prisma from '../src/services/db';
import { createSocketServer } from '../src/socket-server';
import { canSendAttachment, decodeChatImage, visibleChatMedia } from '../src/services/chat-attachments';
import {
  runMediaErasureJobs,
  migrateLegacyChatMedia,
  advancePrivateChatMigration,
} from '../src/services/privacy-maintenance';
import { eraseUserObjects, eraseLegacyChatObject } from '../src/lib/object-storage';
import { uniqueTestPhone } from './test-phone';

jest.mock('../src/lib/object-storage', () => ({
  ...jest.requireActual('../src/lib/object-storage'),
  eraseUserObjects: jest.fn().mockResolvedValue(undefined),
  legacyChatKey: (url: string) =>
    url.startsWith('https://media.fixture/chat-media/') ? url.slice('https://media.fixture/'.length) : null,
  legacyChatPublicUrl: (key: string) => `https://media.fixture/${key}`,
  readLegacyChatObject: jest.fn(async () => ({ contentType: 'image/png', bytes: Buffer.from(png, 'base64') })),
  eraseLegacyChatObject: jest.fn().mockResolvedValue(undefined),
  isObjectStorageConfigured: jest.fn().mockReturnValue(true),
  listLegacyChatObjects: async function* () {
    yield [];
  },
}));

// Deliberately refuse to exercise destructive cases on the configured live DB.
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  const local = url.hostname === '127.0.0.1' && url.port === '55439';
  const ci =
    process.env.CI === 'true' &&
    url.hostname === 'localhost' &&
    url.port === '5432' &&
    url.pathname === '/travelstar_test';
  if (!local && !ci) throw new Error('Use the isolated privacy test database on 127.0.0.1:55439.');
});
const password = 'Privacy-Test-Password-123!';
const userIds: string[] = [];
const tripIds: string[] = [];
const roomIds: string[] = [];
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=';
async function account(label: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: `Privacy ${label}`,
      email: `${randomUUID()}@privacy.test`,
      phoneNumber: uniqueTestPhone(),
      password,
    });
  expect(res.status).toBe(201);
  const id = res.body.data.user.id as string;
  userIds.push(id);
  return { id, token: res.body.data.token as string };
}
async function trip(ownerId: string) {
  const result = await prisma.trip.create({
    data: {
      creatorId: ownerId,
      name: 'Privacy fixture',
      description: '',
      cities: ['Jaipur'],
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-02'),
      durationDays: 2,
      budget: 0,
      availableSeats: 4,
      totalSeats: 4,
      meetingPoint: 'Station',
      languages: ['English'],
    },
  });
  tripIds.push(result.id);
  return result;
}
const bearer = (token: string) => `Bearer ${token}`;

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } });
  await prisma.chatRoom.deleteMany({ where: { id: { in: roomIds } } });
  await prisma.booking.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } });
  await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.mediaErasureJob.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.legacyChatMediaErasure.deleteMany({
    where: { OR: userIds.map((id) => ({ key: { startsWith: `chat-media/${id}/` } })) },
  });
  await prisma.$disconnect();
});

test('deletion removes stories, interactions, snapshots, restrictive relations, sessions and private media, and queues file cleanup', async () => {
  const owner = await account('delete');
  const other = await account('survivor');
  const owned = await trip(owner.id);
  const joined = await trip(other.id);
  const room = await prisma.chatRoom.create({
    data: { isGroup: true, tripId: joined.id, members: { create: [{ userId: other.id }] } },
  });
  roomIds.push(room.id);
  const jr = await prisma.joinRequest.create({
    data: {
      userId: owner.id,
      tripId: joined.id,
      status: 'CANCELLED',
      travellerDetails: { name: 'Copied personal details' },
    },
  });
  const story = await prisma.travelStory.create({
    data: {
      userId: owner.id,
      authorName: 'Privacy delete',
      title: 'Mine',
      content: '',
      location: '',
      mediaUrl: 'https://fixture.invalid/uploads/story-old123.jpg',
    },
  });
  const otherStory = await prisma.travelStory.create({
    data: { userId: other.id, authorName: 'Other', title: 'Keep', content: '', location: '' },
  });
  await prisma.storyView.create({
    data: { storyId: otherStory.id, userId: owner.id, userName: 'Copied name', userAvatar: 'copied' },
  });
  await prisma.storyLike.create({ data: { storyId: otherStory.id, userId: owner.id, userName: 'Copied name' } });
  await prisma.notification.createMany({
    data: [
      { userId: other.id, type: 'TRIP', title: 'Payment', content: 'ID and phone', time: 'now', joinRequestId: jr.id },
      {
        userId: other.id,
        type: 'TRIP',
        title: 'Booking cancelled — Privacy fixture',
        content: 'Privacy delete cancelled their booking.',
        time: 'now',
        tripId: joined.id,
      },
      {
        userId: other.id,
        type: 'TRIP',
        title: 'New copy',
        content: 'Copied details',
        time: 'now',
        subjectUserId: owner.id,
      },
    ],
  });
  await prisma.message.create({
    data: { chatRoomId: room.id, senderId: other.id, isSystem: true, content: 'Privacy delete has joined the trip!' },
  });
  const kept = await prisma.message.create({
    data: { chatRoomId: room.id, senderId: other.id, content: 'Keep ordinary messages' },
  });
  await prisma.transaction.create({ data: { userId: owner.id, amount: 0, type: 'PAYMENT' } });
  await prisma.callLog.create({ data: { initiatorId: owner.id, receiverId: other.id, isVideo: false } });
  await prisma.booking.create({
    data: { userId: owner.id, type: 'TRIP', tripId: owned.id, travelDate: new Date(), amount: 0 },
  });
  await prisma.chatAttachment.create({
    data: { ownerId: owner.id, chatRoomId: room.id, bytes: Buffer.from(png, 'base64'), contentType: 'image/png' },
  });
  const res = await request(app)
    .post('/api/v1/auth/delete-account')
    .set('Authorization', bearer(owner.token))
    .send({ password });
  expect(res.status).toBe(200);
  expect(await prisma.user.findUnique({ where: { id: owner.id } })).toBeNull();
  expect(await prisma.travelStory.findUnique({ where: { id: story.id } })).toBeNull();
  expect(await prisma.storyView.count({ where: { userId: owner.id } })).toBe(0);
  expect(await prisma.storyLike.count({ where: { userId: owner.id } })).toBe(0);
  expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(0);
  expect(await prisma.message.count({ where: { chatRoomId: room.id, isSystem: true } })).toBe(0);
  expect(await prisma.message.findUnique({ where: { id: kept.id } })).not.toBeNull();
  expect(await prisma.chatAttachment.count({ where: { ownerId: owner.id } })).toBe(0);
  expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
  expect((await prisma.mediaErasureJob.findUnique({ where: { ownerId: owner.id } }))?.localFiles).toEqual([
    'story-old123.jpg',
  ]);
  expect((await request(app).get('/api/v1/auth/profile').set('Authorization', bearer(owner.token))).status).toBe(401);
  await expect(
    prisma.travelStory.create({
      data: { userId: owner.id, authorName: 'Resurrect', title: '', content: '', location: '' },
    }),
  ).rejects.toThrow();
});

test('private photos require current room membership; public uploads and cross-user/cross-room reuse are rejected', async () => {
  const owner = await account('photo');
  const member = await account('member');
  const stranger = await account('stranger');
  const room = await prisma.chatRoom.create({
    data: { members: { create: [{ userId: owner.id }, { userId: member.id }] } },
  });
  roomIds.push(room.id);
  const upload = await request(app)
    .post('/api/v1/chats/attachments')
    .set('Authorization', bearer(owner.token))
    .send({ chatRoomId: room.id, contentType: 'image/png', base64: png });
  expect(upload.status).toBe(201);
  expect(upload.body.data.mediaUrl).toMatch(/^chat-private:/);
  const id = upload.body.data.mediaUrl.split(':')[1];
  const endpoint = `/api/v1/chats/attachments/${id}`;
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect((await request(app).get(endpoint).set('Authorization', bearer(stranger.token))).status).toBe(404);
  const read = await request(app).get(endpoint).set('Authorization', bearer(member.token));
  expect(read.body.data.uri).toBe(`data:image/png;base64,${png}`);
  expect(read.headers['cache-control']).toBe('no-store');
  expect(await canSendAttachment(upload.body.data.mediaUrl, owner.id, room.id)).toBe(true);
  expect(await canSendAttachment(upload.body.data.mediaUrl, member.id, room.id)).toBe(false);
  expect(await canSendAttachment(upload.body.data.mediaUrl, owner.id, randomUUID())).toBe(false);
  await prisma.chatRoomMember.delete({ where: { chatRoomId_userId: { chatRoomId: room.id, userId: member.id } } });
  expect((await request(app).get(endpoint).set('Authorization', bearer(member.token))).status).toBe(404);
  expect(
    (
      await request(app)
        .post('/api/v1/chats/media-upload-url')
        .set('Authorization', bearer(owner.token))
        .send({ contentType: 'image/png' })
    ).status,
  ).toBe(410);
  const server = createServer(app);
  const io = createSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let socket: Socket | undefined;
  try {
    const addr = server.address() as { port: number };
    socket = client(`http://127.0.0.1:${addr.port}`, {
      auth: { token: owner.token },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 8000);
      socket!.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket!.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const rejected = new Promise<{ message: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing private-media rejection')), 8000);
      socket!.once('sendMessageError', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
    socket.emit('sendMessage', {
      chatRoomId: room.id,
      mediaType: 'IMAGE',
      mediaUrl: 'https://public.invalid/private.jpg',
    });
    expect((await rejected).message).toMatch(/private/);
    expect(await prisma.message.count({ where: { chatRoomId: room.id } })).toBe(0);
  } finally {
    socket?.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

test('location sharing and Stop Live remove positions and block stale or concurrent republishing', async () => {
  const guide = await account('guide');
  const viewer = await account('viewer');
  await prisma.user.update({ where: { id: guide.id }, data: { role: 'GUIDE' } });
  const profile = await prisma.guideProfile.create({
    data: {
      userId: guide.id,
      licenseNumber: randomUUID(),
      experienceYears: 1,
      expertisePlaces: [],
      languagesSpoken: [],
      hourlyRate: 10,
      dailyRate: 10,
      availability: {},
    },
  });
  const base = `/api/v1/guides/${profile.id}/live-status`;
  const post = () =>
    request(app).post(base).set('Authorization', bearer(guide.token)).send({ latitude: 23, longitude: 84 });
  expect((await post()).status).toBe(403);
  expect((await request(app).post(`${base}/start`).set('Authorization', bearer(guide.token))).status).toBe(200);
  expect((await post()).status).toBe(200);
  expect((await request(app).get(base).set('Authorization', bearer(viewer.token))).body.data.location.latitude).toBe(
    23,
  );
  await Promise.all([
    post(),
    request(app).put('/api/v1/auth/profile').set('Authorization', bearer(guide.token)).send({ locationSharing: false }),
  ]);
  expect(await prisma.liveLocation.count({ where: { userId: guide.id } })).toBe(0);
  expect((await post()).status).toBe(403);
  expect((await request(app).get(base).set('Authorization', bearer(viewer.token))).body.data.location).toBeNull();
  expect((await request(app).post(`${base}/start`).set('Authorization', bearer(guide.token))).status).toBe(403);
  await request(app)
    .put('/api/v1/auth/profile')
    .set('Authorization', bearer(guide.token))
    .send({ locationSharing: true });
  expect((await post()).status).toBe(403); // Turning the master toggle on does not restart broadcasts.
  await request(app).post(`${base}/start`).set('Authorization', bearer(guide.token));
  await post();
  await prisma.liveLocation.updateMany({
    where: { userId: guide.id },
    data: { updatedAt: new Date(Date.now() - 120_000) },
  });
  expect((await request(app).get(base).set('Authorization', bearer(viewer.token))).body.data.location).toBeNull();
  await post();
  await request(app).delete(base).set('Authorization', bearer(guide.token));
  expect(await prisma.liveLocation.count({ where: { userId: guide.id } })).toBe(0);
  expect((await post()).status).toBe(403);
});

test('storage failure is retried durably and jobs survive until old upload URLs expire', async () => {
  const ownerId = randomUUID();
  userIds.push(ownerId);
  await prisma.mediaErasureJob.create({
    data: { ownerId, localFiles: [], finishAfter: new Date(Date.now() + 600_000) },
  });
  const erase = jest.mocked(eraseUserObjects);
  erase.mockRejectedValueOnce(new Error('Storage outage'));
  await runMediaErasureJobs();
  expect(await prisma.mediaErasureJob.findUnique({ where: { ownerId } })).not.toBeNull();
  await prisma.mediaErasureJob.update({ where: { ownerId }, data: { nextAttemptAt: new Date(0) } });
  await runMediaErasureJobs();
  expect(await prisma.mediaErasureJob.findUnique({ where: { ownerId } })).not.toBeNull();
  await prisma.mediaErasureJob.update({
    where: { ownerId },
    data: { nextAttemptAt: new Date(0), finishAfter: new Date(0) },
  });
  await runMediaErasureJobs();
  expect(await prisma.mediaErasureJob.findUnique({ where: { ownerId } })).toBeNull();
});

test('chat upload validation rejects spoofed content, malformed base64 and oversized payloads', () => {
  expect(() => decodeChatImage(png, 'image/jpeg')).toThrow();
  expect(() => decodeChatImage('arbitrary text', 'image/png')).toThrow();
  expect(() => decodeChatImage('A'.repeat(7_000_000), 'image/png')).toThrow();
});

test('legacy photos migrate to private bytes and source deletion survives provider failure', async () => {
  const user = await account('legacy');
  const room = await prisma.chatRoom.create({ data: { members: { create: { userId: user.id } } } });
  roomIds.push(room.id);
  const mediaUrl = `https://media.fixture/chat-media/${user.id}/old.jpg`;
  const message = await prisma.message.create({
    data: { chatRoomId: room.id, senderId: user.id, mediaType: 'IMAGE', mediaUrl },
  });
  expect(visibleChatMedia(mediaUrl)).toBeNull();
  await migrateLegacyChatMedia();
  const migrated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
  expect(migrated.mediaUrl).toMatch(/^chat-private:/);
  const asset = await prisma.chatAttachment.findUniqueOrThrow({ where: { id: migrated.mediaUrl!.split(':')[1] } });
  expect(Buffer.from(asset.bytes).toString('base64')).toBe(png);
  expect(asset.legacyKey).toBe(`chat-media/${user.id}/old.jpg`);
  jest.mocked(eraseLegacyChatObject).mockRejectedValueOnce(new Error('Provider outage'));
  await expect(migrateLegacyChatMedia()).rejects.toThrow('Provider outage');
  expect((await prisma.chatAttachment.findUniqueOrThrow({ where: { id: asset.id } })).legacyKey).not.toBeNull();
  await migrateLegacyChatMedia();
  expect((await prisma.chatAttachment.findUniqueOrThrow({ where: { id: asset.id } })).legacyKey).toBeNull();
});

test('a shared legacy file survives conversion across batch boundaries and is deleted only after every reference moves', async () => {
  const user = await account('shared legacy');
  const room = await prisma.chatRoom.create({ data: { members: { create: { userId: user.id } } } });
  roomIds.push(room.id);
  const mediaUrl = `https://media.fixture/chat-media/${user.id}/shared.jpg`;
  await prisma.message.createMany({
    data: Array.from({ length: 21 }, () => ({
      chatRoomId: room.id,
      senderId: user.id,
      mediaType: 'IMAGE' as const,
      mediaUrl,
    })),
  });
  const erase = jest.mocked(eraseLegacyChatObject);
  erase.mockClear();
  await migrateLegacyChatMedia();
  expect(await prisma.message.count({ where: { chatRoomId: room.id, mediaUrl } })).toBe(1);
  await migrateLegacyChatMedia();
  expect(erase).not.toHaveBeenCalled();
  expect(await prisma.message.count({ where: { chatRoomId: room.id, mediaUrl } })).toBe(0);
  await migrateLegacyChatMedia();
  expect(erase).toHaveBeenCalledWith(`chat-media/${user.id}/shared.jpg`);
});

test('server-managed maintenance completes only after legacy copies and revocations finish', async () => {
  await prisma.privacyMaintenanceState.upsert({
    where: { id: 'private-chat-v1' },
    create: { id: 'private-chat-v1', readyAfter: new Date(0) },
    update: { readyAfter: new Date(0), inventoriedAt: null, completedAt: null, phase: 'COPYING' },
  });
  await advancePrivateChatMigration();
  const state = await prisma.privacyMaintenanceState.findUniqueOrThrow({ where: { id: 'private-chat-v1' } });
  expect(state.phase).toBe('COMPLETE');
  expect(state.completedAt).not.toBeNull();
});
