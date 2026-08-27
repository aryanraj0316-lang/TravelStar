import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for POST /api/v1/auth/avatar-upload-url
 * (docs/REMEDIATION.md §8.2).
 *
 * profile.tsx's avatar picker used to hand a local file://(/blob:/data:)
 * URI straight to updateProfile — a photo path that only ever resolves on
 * the device (and session) that took it, and is gone the moment the app
 * cache clears. This route hands the client a short-lived presigned S3 PUT
 * URL instead, so the upload goes straight to the bucket.
 *
 * This test environment has no OBJECT_STORAGE_* credentials configured —
 * per the 2026-08-27 decision on credential-dependent features, that must
 * produce a clear, typed error rather than a fake success, and that
 * unconfigured path is exactly what's asserted here. It is also the real
 * behaviour of every deployment until an operator sets those five vars, so
 * this isn't a stand-in for the happy path — it's the current one.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-avatar-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Avatar ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/avatar-upload-url', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/auth/avatar-upload-url').send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('rejects a content type that is not a plain image', async () => {
    const user = await registerAndLogin('badtype');
    const res = await request(app)
      .post('/api/v1/auth/avatar-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('reports STORAGE_UNAVAILABLE rather than a fake success when object storage is not configured', async () => {
    const user = await registerAndLogin('unconfigured');
    const res = await request(app)
      .post('/api/v1/auth/avatar-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
  });
});
