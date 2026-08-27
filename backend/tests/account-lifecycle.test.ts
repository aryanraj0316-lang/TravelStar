import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Data export (right to access) and account deletion (right to erasure) —
 * docs/REMEDIATION.md §12.4. Both are mandatory for the app stores.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const T = 90_000;

async function registerAndLogin(label: string): Promise<{ userId: string; token: string; email: string }> {
  const email = `test-lifecycle-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Lifecycle ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token, email };
}

afterAll(async () => {
  await prisma.tripExpense.deleteMany({ where: { tripId: { in: createdTripIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Account lifecycle (§12.4)', () => {
  it('exports the caller\'s own data and nothing else, without the password hash', async () => {
    const user = await registerAndLogin('export');
    const res = await request(app).get('/api/v1/auth/export').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account.id).toBe(user.userId);
    expect(JSON.stringify(res.body.data)).not.toContain('passwordHash');
    expect(res.body.data).toHaveProperty('organizedTrips');
    expect(res.body.data).toHaveProperty('emergencyContacts');
  }, T);

  it('requires the correct password to delete, then hard-deletes the account and its trips', async () => {
    const user = await registerAndLogin('delete');
    const startDate = new Date(Date.now() + 7 * 864e5).toISOString();
    const endDate = new Date(Date.now() + 10 * 864e5).toISOString();
    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: `Lifecycle Trip ${runId}`, cities: ['Delhi'], startDate, endDate, budget: 5000, totalSeats: 4, meetingPoint: 'Delhi', privacy: 'PUBLIC' });
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);

    const wrong = await request(app)
      .post('/api/v1/auth/delete-account')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'not-my-password' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/v1/auth/delete-account')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'correcthorsebattery' });
    expect(ok.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull();
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).toBeNull();

    // The account is gone. The short-lived access JWT still verifies until
    // it expires, but the profile lookup now 404s; the refresh session was
    // revoked so no new access token can be minted.
    const afterDelete = await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${user.token}`);
    expect([401, 404]).toContain(afterDelete.status);
  }, T);

  it('rejects an unauthenticated deletion', async () => {
    const res = await request(app).post('/api/v1/auth/delete-account').send({ password: 'x' });
    expect(res.status).toBe(401);
  });
});
