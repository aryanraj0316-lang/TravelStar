import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for POST /api/v1/chats/media-upload-url
 * (docs/REMEDIATION.md §8.7).
 *
 * chat.tsx's photo attachment used to put the picker's own local
 * file://(/blob:/data: on web) URI straight onto the outgoing message's
 * mediaUrl. That path resolves only on the sender's device, so every other
 * member of the group saw a broken image for a photo that had, as far as
 * they could tell, been sent successfully. This is the same bug §8.2/§8.4/
 * §8.17 fixed for avatars, trip covers and guide reels, and was the last
 * remaining instance of it.
 *
 * As with the other three upload routes, this environment has no
 * OBJECT_STORAGE_* credentials, so the unconfigured path returns a typed
 * 503 STORAGE_UNAVAILABLE rather than a fake success — that is both what is
 * asserted here and the real behaviour of any deployment that has not set
 * those vars.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-chatmedia-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `ChatMedia ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/chats/media-upload-url', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/chats/media-upload-url').send({ contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  it('rejects a content type that is not a plain image', async () => {
    const user = await registerAndLogin('badtype');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('reports storage as unavailable rather than faking a success when no bucket is configured', async () => {
    const user = await registerAndLogin('unconfigured');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/jpeg' });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');
    // The failure must not hand back anything the client could mistake for
    // a usable destination.
    expect(res.body.data).toBeUndefined();
  });

  it('is not swallowed by the /:id routes registered above it', async () => {
    // `media-upload-url` is a single path segment, so a POST to it could be
    // matched by a one-segment `/:id` route if one were ever added. Asserting
    // the 400/503 shape (rather than a 404 for a non-existent chat room id)
    // pins the routing down.
    const user = await registerAndLogin('routing');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/webp' });

    expect(res.status).not.toBe(404);
    expect([400, 503]).toContain(res.status);
  });
});
