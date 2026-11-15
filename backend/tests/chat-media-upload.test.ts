import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/** The old public-bucket chat upload endpoint is retired for every authenticated client.
 * Private image upload/read coverage is in privacy-boundaries.test.ts. */

const runId = Date.now();
const createdEmails: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-chatmedia-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ termsAccepted: true, name: `ChatMedia ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
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

  it('retires the public upload route even for invalid media', async () => {
    const user = await registerAndLogin('badtype');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'application/pdf' });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('UPGRADE_REQUIRED');
  });

  it('requires private-media clients regardless of bucket configuration', async () => {
    const user = await registerAndLogin('unconfigured');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/jpeg' });

    expect(res.status).toBe(410);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('UPGRADE_REQUIRED');
    // The failure must not hand back anything the client could mistake for
    // a usable destination.
    expect(res.body.data).toBeUndefined();
  });

  it('is not swallowed by the /:id routes registered above it', async () => {
    // `media-upload-url` is a single path segment, so a POST to it could be
    // matched by a one-segment `/:id` route if one were ever added. Asserting
    // the 410 shape (rather than a 404 for a non-existent chat room id)
    // pins the routing down.
    const user = await registerAndLogin('routing');
    const res = await request(app)
      .post('/api/v1/chats/media-upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ contentType: 'image/webp' });

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(410);
  });
});
