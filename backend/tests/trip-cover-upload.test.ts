import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for POST /api/v1/trips/cover-upload-url
 * (docs/REMEDIATION.md §8.4).
 *
 * create.tsx's custom-cover-image picker used to set the picked asset's
 * local uri directly as a trip's coverImage — a device-local path only ever
 * reachable on the organizer's own device, which is why the mirror route
 * exists (see avatar-upload.test.ts for the identical §8.2 bug). This
 * environment has no OBJECT_STORAGE_* credentials configured, so — per the
 * 2026-08-27 decision on credential-dependent features — that must produce
 * a clear typed error rather than a fake success, and that's the real
 * current behavior of every deployment until an operator sets those vars.
 *
 * Also proves the route is registered ahead of the /:id routes below it, so
 * it isn't swallowed as `GET/POST /:id` with `id: 'cover-upload-url'`.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-covurl-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `CoverUrl ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/trips/cover-upload-url', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/trips/cover-upload-url').send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('rejects a content type that is not a plain image, and is not swallowed by GET /:id', async () => {
    const user = await registerAndLogin('badtype');
    const res = await request(app)
      .post('/api/v1/trips/cover-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'application/pdf' });
    // A TRIP_NOT_FOUND here would mean this request got routed to
    // GET/POST /:id with id="cover-upload-url" instead of this route.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('reports STORAGE_UNAVAILABLE rather than a fake success when object storage is not configured', async () => {
    const user = await registerAndLogin('unconfigured');
    const res = await request(app)
      .post('/api/v1/trips/cover-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
  });
});
