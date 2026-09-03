import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Consent capture (§12.3) — explicit, granular, timestamped, and
 * version-tagged, one append-only row per grant/revoke rather than a
 * single overwritten "current state" column.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const T = 90_000;

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-consent-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Consent ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.consentRecord.deleteMany({
    where: { user: { email: { in: createdEmails } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Consent capture (§12.3)', () => {
  it('rejects an unauthenticated write and read', async () => {
    const write = await request(app)
      .post('/api/v1/consent')
      .send({ category: 'LOCATION', granted: true, policyVersion: '1' });
    expect(write.status).toBe(401);

    const read = await request(app).get('/api/v1/consent');
    expect(read.status).toBe(401);
  }, T);

  it('rejects an invalid category, a non-boolean granted, and a missing policy version', async () => {
    const user = await registerAndLogin('validation');
    const auth = { Authorization: `Bearer ${user.token}` };

    const badCategory = await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'AADHAAR', granted: true, policyVersion: '1' });
    expect(badCategory.status).toBe(400);

    const badGranted = await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'LOCATION', granted: 'yes', policyVersion: '1' });
    expect(badGranted.status).toBe(400);

    const missingVersion = await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'LOCATION', granted: true });
    expect(missingVersion.status).toBe(400);
  }, T);

  it('records a grant and reads it back as the current state for that category', async () => {
    const user = await registerAndLogin('grant');
    const auth = { Authorization: `Bearer ${user.token}` };

    const write = await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'LOCATION', granted: true, policyVersion: '2026-09-03-placeholder' });
    expect(write.status).toBe(201);
    expect(write.body.data.granted).toBe(true);
    expect(write.body.data.category).toBe('LOCATION');
    expect(typeof write.body.data.createdAt).toBe('string');

    const read = await request(app).get('/api/v1/consent').set(auth);
    expect(read.status).toBe(200);
    expect(read.body.data.current.LOCATION.granted).toBe(true);
    expect(read.body.data.current.CAMERA).toBeNull();
    expect(read.body.data.current.PHOTOS).toBeNull();
    expect(read.body.data.current.NOTIFICATIONS).toBeNull();
    expect(typeof read.body.data.policyVersion).toBe('string');
  }, T);

  it('does not overwrite a previous record — a later revoke is a new row, and reads return the latest', async () => {
    const user = await registerAndLogin('history');
    const auth = { Authorization: `Bearer ${user.token}` };

    await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'CAMERA', granted: true, policyVersion: 'v1' });
    await request(app)
      .post('/api/v1/consent')
      .set(auth)
      .send({ category: 'CAMERA', granted: false, policyVersion: 'v1' });

    const rows = await prisma.consentRecord.findMany({ where: { userId: user.userId, category: 'CAMERA' } });
    expect(rows).toHaveLength(2);

    const read = await request(app).get('/api/v1/consent').set(auth);
    expect(read.body.data.current.CAMERA.granted).toBe(false);
  }, T);

  it("keeps each user's consent history separate from every other user's", async () => {
    const userA = await registerAndLogin('isolation-a');
    const userB = await registerAndLogin('isolation-b');

    await request(app)
      .post('/api/v1/consent')
      .set({ Authorization: `Bearer ${userA.token}` })
      .send({ category: 'NOTIFICATIONS', granted: true, policyVersion: 'v1' });

    const readB = await request(app).get('/api/v1/consent').set({ Authorization: `Bearer ${userB.token}` });
    expect(readB.body.data.current.NOTIFICATIONS).toBeNull();
  }, T);
});
