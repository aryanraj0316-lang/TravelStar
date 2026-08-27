import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for the shared trip-expense / budget-tracker routes
 * (docs/REMEDIATION.md §8.12). budget-tracker.tsx used to be pure local
 * useState with a hardcoded budget and expense rows that reset on unmount;
 * these routes back a real, trip-scoped, equally-split shared ledger.
 *
 * Runs against the real configured DATABASE_URL. Per-test timeouts are
 * generous because that database is a remote Neon instance with cold-start
 * latency (see the other integration suites).
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const T = 90_000;

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-tripexp-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `TripExp ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string, name: string): Promise<string> {
  const startDate = new Date(Date.now() + 7 * 864e5).toISOString();
  const endDate = new Date(Date.now() + 10 * 864e5).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, cities: ['Delhi', 'Agra'], startDate, endDate, budget: 5000, totalSeats: 4, meetingPoint: 'Delhi', privacy: 'PUBLIC' });
  const id = res.body.data.id;
  if (id) createdTripIds.push(id);
  return id;
}

afterAll(async () => {
  // Trip.creatorId is onDelete: RESTRICT, so trips must go before their creators.
  await prisma.tripExpense.deleteMany({ where: { tripId: { in: createdTripIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Trip expenses (§8.12)', () => {
  it('splits equally and tracks per-member balances', async () => {
    const organizer = await registerAndLogin('org');
    const joiner = await registerAndLogin('joiner');
    const tripId = await createTrip(organizer.token, `Expense Trip ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${joiner.token}`).send({});

    await request(app).post(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${organizer.token}`).send({ description: 'Fuel', amount: 1000, category: 'TRANSPORT' });
    await request(app).post(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${joiner.token}`).send({ description: 'Snacks', amount: 200 });

    const read = await request(app).get(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${joiner.token}`);
    expect(read.status).toBe(200);
    expect(read.body.data.headCount).toBe(2);
    expect(read.body.data.total).toBe('1200.00');
    expect(read.body.data.yourShare).toBe('600.00');
    expect(read.body.data.yourNet).toBe('-400.00'); // joiner paid 200, owes 600
    const orgBalance = read.body.data.balances.find((b: { userId: string }) => b.userId === organizer.userId);
    expect(orgBalance.net).toBe('400.00');
  }, T);

  it('enforces trip membership and delete ownership', async () => {
    const organizer = await registerAndLogin('own-org');
    const stranger = await registerAndLogin('own-stranger');
    const tripId = await createTrip(organizer.token, `Expense Own ${runId}`);

    const strangerRead = await request(app).get(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${stranger.token}`);
    expect(strangerRead.status).toBe(403);

    const e = await request(app).post(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${organizer.token}`).send({ description: 'Hotel', amount: 800, category: 'LODGING' });
    expect(e.status).toBe(201);

    const strangerDeletes = await request(app).delete(`/api/v1/trips/${tripId}/expenses/${e.body.data.id}`).set('Authorization', `Bearer ${stranger.token}`);
    expect(strangerDeletes.status).toBe(403);

    const ownerDeletes = await request(app).delete(`/api/v1/trips/${tripId}/expenses/${e.body.data.id}`).set('Authorization', `Bearer ${organizer.token}`);
    expect(ownerDeletes.status).toBe(200);
  }, T);

  it('rejects an unauthenticated request and a non-positive amount', async () => {
    const anon = await request(app).get('/api/v1/trips/whatever/expenses');
    expect(anon.status).toBe(401);

    const organizer = await registerAndLogin('val');
    const tripId = await createTrip(organizer.token, `Expense Validation ${runId}`);
    const bad = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ description: 'Nope', amount: -5 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  }, T);
});
