import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for POST /api/v1/guides/media-upload-url and the
 * validation added to POST /api/v1/guides/:id/reels (docs/REMEDIATION.md
 * §8.17).
 *
 * travel-guide.tsx's "Upload Stories & Reels" tab had a "Simulated media
 * selection gallery" (its own comment's words) of hardcoded stock photos in
 * place of a real picker, and its one real picker (video, for reels) never
 * uploaded the picked file — it set the local uri directly as videoUrl,
 * same class of bug as §8.2/§8.4's avatar/cover-photo fixes. This
 * environment has no OBJECT_STORAGE_* credentials configured, so —
 * per the 2026-08-27 decision on credential-dependent features — the
 * unconfigured path asserted here is also the real current behavior, not
 * just a defensive branch.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdGuideProfileIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-guidemedia-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `GuideMedia ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

let licenseCounter = 0;

async function createGuideProfile(token: string): Promise<string> {
  licenseCounter += 1;
  const res = await request(app)
    .post('/api/v1/guides/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({
      licenseNumber: `LIC-${runId}-${licenseCounter}`,
      experienceYears: 5,
      expertisePlaces: ['Jaipur'],
      languagesSpoken: ['English'],
      hourlyRate: 500,
      dailyRate: 3000,
    });
  expect(res.status).toBe(201);
  createdGuideProfileIds.push(res.body.data.id);
  return res.body.data.id as string;
}

afterAll(async () => {
  await prisma.guideReel.deleteMany({ where: { guideProfileId: { in: createdGuideProfileIds } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: createdGuideProfileIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/guides/media-upload-url', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/guides/media-upload-url').send({ contentType: 'video/mp4' });
    expect(res.status).toBe(401);
  });

  it('accepts video/mp4 (rejected on other upload routes) and reports STORAGE_UNAVAILABLE, not a fake success', async () => {
    const user = await registerAndLogin('video');
    const res = await request(app)
      .post('/api/v1/guides/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'video/mp4' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('rejects an unsupported content type, and is not swallowed by GET /:id', async () => {
    const user = await registerAndLogin('badtype');
    const res = await request(app)
      .post('/api/v1/guides/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /api/v1/guides/:id/reels', () => {
  it('rejects a non-URL videoUrl instead of storing it verbatim', async () => {
    const owner = await registerAndLogin('reel-owner');
    const guideId = await createGuideProfile(owner.token);

    const res = await request(app)
      .post(`/api/v1/guides/${guideId}/reels`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ videoUrl: 'not-a-url', caption: 'Trip highlights' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('creates a reel for a real https URL', async () => {
    const owner = await registerAndLogin('reel-owner2');
    const guideId = await createGuideProfile(owner.token);

    const res = await request(app)
      .post(`/api/v1/guides/${guideId}/reels`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        videoUrl: 'https://example-bucket.test/guide-media/vid.mp4',
        thumbnailUrl: 'https://example-bucket.test/guide-media/thumb.jpg',
        caption: 'Trip highlights',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.videoUrl).toBe('https://example-bucket.test/guide-media/vid.mp4');
  });
});
