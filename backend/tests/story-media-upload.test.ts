import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Story media has to be stored at an address other people can actually
 * load.
 *
 * Root cause of "uploaded photos and videos render blank": object storage
 * is not configured in this environment, so the presigned upload threw, the
 * client fell back to the image picker's raw `file:` uri, and the story was
 * created pointing at a path that exists only on the uploader's phone.
 * `remoteMediaUrl` exists for exactly this (it was added after the same bug
 * hit avatars) but the story schema was not using it.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdStoryIds: string[] = [];

// A 1x1 PNG, so the direct-upload path gets real bytes rather than a stub.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-storymedia-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Media ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.travelStory.deleteMany({ where: { id: { in: createdStoryIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Story media storage', () => {
  it('refuses a story whose media is a device-local uri', async () => {
    const author = await registerAndLogin('local');

    for (const uri of [
      'file:///data/user/0/com.travelstar/cache/IMG_042.jpg',
      'content://media/external/images/media/1234',
    ]) {
      const res = await request(app)
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${author.token}`)
        .send({ title: `Local ${runId}`, content: '', coverImg: uri, location: 'Goa' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }

    // Nothing was written — the user is told the upload failed instead of
    // ending up with a story nobody else can see.
    const count = await prisma.travelStory.count({ where: { title: `Local ${runId}` } });
    expect(count).toBe(0);
  }, 30_000);

  it('stores a directly-uploaded image at a fetchable url', async () => {
    const author = await registerAndLogin('direct');

    const upload = await request(app)
      .post('/api/v1/stories/upload-direct')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ base64: TINY_PNG_BASE64, contentType: 'image/png' });
    expect(upload.status).toBe(200);

    const publicUrl: string = upload.body.data.publicUrl;
    expect(publicUrl).toMatch(/^https?:\/\//);
    expect(publicUrl).toMatch(/\.png$/);

    // The url the client is handed must actually serve the bytes back.
    const served = await request(app).get(new URL(publicUrl).pathname);
    expect(served.status).toBe(200);

    const story = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: `Direct ${runId}`, content: '', coverImg: publicUrl, mediaUrl: publicUrl, location: 'Goa' });
    expect(story.status).toBe(201);
    createdStoryIds.push(story.body.data.id);
    expect(story.body.data.coverImg).toBe(publicUrl);
  }, 30_000);

  it('keeps a video its own extension instead of saving it as a jpg', async () => {
    const author = await registerAndLogin('video');

    const upload = await request(app)
      .post('/api/v1/stories/upload-direct')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ base64: TINY_PNG_BASE64, contentType: 'video/mp4' });
    expect(upload.status).toBe(200);
    // Before this, every direct upload was written as .jpg/.png/.webp, so a
    // video was served with an image content type and never played.
    expect(upload.body.data.publicUrl).toMatch(/\.mp4$/);
  }, 30_000);

  it('accepts a payload larger than the global 256kb json limit', async () => {
    const author = await registerAndLogin('largephoto');

    // ~1.4MB of base64, which is a small real photo. The global body limit
    // is 256kb, so before the upload paths got their own parser this died
    // with a 413 before reaching the route — the fallback could never store
    // an actual camera photo.
    const bigBase64 = TINY_PNG_BASE64 + 'A'.repeat(1_400_000);

    const res = await request(app)
      .post('/api/v1/stories/upload-direct')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ base64: bigBase64, contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.data.publicUrl).toMatch(/\.jpg$/);
  }, 60_000);

  it('refuses a media type it cannot store', async () => {
    const author = await registerAndLogin('badtype');

    const res = await request(app)
      .post('/api/v1/stories/upload-direct')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ base64: TINY_PNG_BASE64, contentType: 'application/zip' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  }, 30_000);
});
