import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

// User-media uploads (docs/REMEDIATION.md §8.2 — avatar upload). Per the
// 2026-08-27 decision on credential-dependent features: code the real path,
// read credentials from env, and throw a clear typed error at the point of
// use when they're not configured — never fake the upload or silently keep
// accepting files that go nowhere. This project has no real bucket
// provisioned yet, so `isObjectStorageConfigured()` will be false until an
// operator sets the five OBJECT_STORAGE_* vars; the route that calls this
// reports that honestly to the client instead of pretending to succeed.
//
// Talks to any S3-compatible provider (AWS S3, Cloudflare R2, MinIO,
// Backblaze B2) via the standard AWS SDK — OBJECT_STORAGE_ENDPOINT selects
// a non-AWS provider; omit it for real AWS S3.

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isObjectStorageConfigured(): boolean {
  return !!(
    env.OBJECT_STORAGE_BUCKET &&
    env.OBJECT_STORAGE_REGION &&
    env.OBJECT_STORAGE_ACCESS_KEY_ID &&
    env.OBJECT_STORAGE_SECRET_ACCESS_KEY &&
    env.OBJECT_STORAGE_PUBLIC_URL_BASE
  );
}

export class ObjectStorageNotConfiguredError extends Error {
  constructor() {
    super('Object storage is not configured on this server.');
    this.name = 'ObjectStorageNotConfiguredError';
  }
}

export class UnsupportedContentTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported content type: ${contentType}`);
    this.name = 'UnsupportedContentTypeError';
  }
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: env.OBJECT_STORAGE_REGION!,
    // Path-style addressing is what every non-AWS S3-compatible provider
    // (R2, MinIO, B2) expects; real AWS S3 accepts it too.
    forcePathStyle: !!env.OBJECT_STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
    },
    // `exactOptionalPropertyTypes` rejects `endpoint: undefined` — only
    // include the key at all when a non-AWS endpoint was actually given.
    ...(env.OBJECT_STORAGE_ENDPOINT ? { endpoint: env.OBJECT_STORAGE_ENDPOINT } : {}),
  });
  return client;
}

const PRESIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * Returns a short-lived presigned PUT URL the client uploads directly to
 * (never through this server — a photo doesn't belong in our
 * request/response cycle), plus the public URL it will be readable at
 * afterwards. Throws ObjectStorageNotConfiguredError if the five
 * OBJECT_STORAGE_* vars aren't set, or UnsupportedContentTypeError for
 * anything that isn't a plain image.
 *
 * `keyPrefix` namespaces the upload by what it's for (`avatars`,
 * `trip-covers`, …) and `ownerId` scopes it to whoever's uploading — not
 * necessarily the eventual owner of the *entity* the photo is for, since a
 * trip cover is picked before the trip exists and so can't be keyed by a
 * trip id yet.
 */
async function createUploadUrl(
  keyPrefix: string,
  ownerId: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (!isObjectStorageConfigured()) {
    throw new ObjectStorageNotConfiguredError();
  }
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) {
    throw new UnsupportedContentTypeError(contentType);
  }

  // A fresh random key per upload (not a fixed path) so an old cached copy
  // of a previous photo can't be resurrected by re-signing the same URL,
  // and so a race between two uploads from the same account can't corrupt
  // one file.
  const key = `${keyPrefix}/${ownerId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: env.OBJECT_STORAGE_BUCKET!,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  const publicUrl = `${env.OBJECT_STORAGE_PUBLIC_URL_BASE!.replace(/\/$/, '')}/${key}`;

  return { uploadUrl, publicUrl };
}

export function createAvatarUploadUrl(userId: string, contentType: string) {
  return createUploadUrl('avatars', userId, contentType);
}

// docs/REMEDIATION.md §8.4 — create.tsx's custom-cover-image picker had the
// exact same bug as the avatar picker (§8.2): it set the picked asset's
// local file://(/blob:/data: on web) URI directly as `coverImage`, which is
// only ever reachable on the organizer's own device. Every other trip
// list/detail screen rendering that trip for anyone else would try to load
// that same local path and fail. Keyed by the *uploader's* id, not a trip
// id, because the trip doesn't exist yet when the cover is picked.
export function createTripCoverUploadUrl(uploaderId: string, contentType: string) {
  return createUploadUrl('trip-covers', uploaderId, contentType);
}
