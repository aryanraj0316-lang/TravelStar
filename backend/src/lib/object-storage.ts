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
  // Guide reels (§8.17) are the one upload kind that's video, not a photo.
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

// TEMPORARY DIAGNOSTIC — remove before merging. Names exactly which
// required OBJECT_STORAGE_* vars are unset at runtime, since an operator
// looking at Render's dashboard can see the key *names* they typed but not
// whether the *values* actually saved and reached this process's env.
// OBJECT_STORAGE_ENDPOINT is deliberately excluded — it's optional (AWS S3
// itself doesn't need it; only non-AWS providers like R2/MinIO/B2 do).
export function getMissingObjectStorageVars(): string[] {
  const required: Record<string, string | undefined> = {
    OBJECT_STORAGE_BUCKET: env.OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_REGION: env.OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_ACCESS_KEY_ID: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    OBJECT_STORAGE_PUBLIC_URL_BASE: env.OBJECT_STORAGE_PUBLIC_URL_BASE,
  };
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function isObjectStorageConfigured(): boolean {
  return getMissingObjectStorageVars().length === 0;
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

// docs/REMEDIATION.md §8.17 — travel-guide.tsx's "Upload Stories & Reels"
// tab had a "Simulated media selection gallery" (its own comment's words)
// of 5 hardcoded stock Unsplash photos in place of a real picker, and the
// one real picker it did have (video, for reels) never uploaded the picked
// file — it set the local uri directly as videoUrl, same class of bug as
// §8.2/§8.4. Covers a guide's story cover photo, reel video, and reel
// thumbnail — all keyed by the uploading user, same as trip covers.
export function createGuideMediaUploadUrl(uploaderId: string, contentType: string) {
  return createUploadUrl('guide-media', uploaderId, contentType);
}

// docs/REMEDIATION.md §8.7 — chat.tsx's photo attachment set the picker's
// local file://(/blob:/data: on web) URI straight onto the outgoing
// message's mediaUrl, so a photo "sent" to a group was only ever visible on
// the sender's own device; every other member's client tried to load a path
// that does not exist for them. Same class of bug as §8.2/§8.4/§8.17, and
// the last remaining instance of it. Keyed by the uploading user rather than
// the room, so leaving a room cannot orphan the key's ownership.
export function createChatMediaUploadUrl(uploaderId: string, contentType: string) {
  return createUploadUrl('chat-media', uploaderId, contentType);
}
