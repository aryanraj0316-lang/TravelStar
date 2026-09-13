import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * The budget tracker end to end: exact shares, a settlement plan, custom
 * splits, and who may write.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-settle-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Settle ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      cities: ['Jaipur'],
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 5000,
      totalSeats: 6,
      meetingPoint: 'Jaipur Jn',
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id;
}

const sumRupees = (values: string[]) =>
  values.reduce((acc, v) => acc + Math.round(parseFloat(v) * 100), 0);

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Budget tracker', () => {
  it('splits an amount that does not divide evenly without losing a paisa', async () => {
    const organizer = await registerAndLogin('org');
    const second = await registerAndLogin('second');
    const third = await registerAndLogin('third');
    const tripId = await createTrip(organizer.token, `Uneven ${runId}`);

    for (const joiner of [second, third]) {
      const joined = await request(app)
        .post(`/api/v1/trips/${tripId}/join`)
        .set('Authorization', `Bearer ${joiner.token}`);
      expect(joined.status).toBe(200);
    }

    // ₹1000 across 3 people: 333.34 / 333.33 / 333.33.
    const added = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ description: 'Hotel', amount: 1000, category: 'LODGING' });
    expect(added.status).toBe(201);

    const read = await request(app)
      .get(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(read.status).toBe(200);

    const balances = read.body.data.balances as { userId: string; owes: string; net: string }[];
    expect(balances).toHaveLength(3);

    // The shares add up to exactly the total, and the balances net to zero.
    expect(sumRupees(balances.map((b) => b.owes))).toBe(100000);
    expect(sumRupees(balances.map((b) => b.net))).toBe(0);
    expect(balances.map((b) => b.owes).sort()).toEqual(['333.33', '333.33', '333.34']);

    // And the plan clears it in at most participants - 1 transfers.
    const settlements = read.body.data.settlements as { fromUserId: string; toUserId: string; amount: string }[];
    expect(settlements.length).toBeLessThanOrEqual(2);
    // Only the organizer paid anything, so every transfer goes to them and
    // they total exactly what the organizer is owed — whichever of the three
    // happened to receive the leftover paisa.
    settlements.forEach((t) => expect(t.toUserId).toBe(organizer.userId));
    const organizerNet = balances.find((b) => b.userId === organizer.userId)!.net;
    expect(sumRupees(settlements.map((t) => t.amount))).toBe(sumRupees([organizerNet]));
  }, 120_000);

  it('honours a custom split and refuses one that does not add up', async () => {
    const organizer = await registerAndLogin('customorg');
    const friend = await registerAndLogin('customfriend');
    const tripId = await createTrip(organizer.token, `Custom ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${friend.token}`);

    const mismatched = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        description: 'Dinner',
        amount: 1000,
        category: 'FOOD',
        splitMode: 'CUSTOM',
        shares: [
          { userId: organizer.userId, amount: 400 },
          { userId: friend.userId, amount: 400 },
        ],
      });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.error.code).toBe('VALIDATION_FAILED');

    const ok = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        description: 'Dinner',
        amount: 1000,
        category: 'FOOD',
        splitMode: 'CUSTOM',
        shares: [
          { userId: organizer.userId, amount: 250 },
          { userId: friend.userId, amount: 750 },
        ],
      });
    expect(ok.status).toBe(201);

    const read = await request(app)
      .get(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`);
    const balances = read.body.data.balances as { userId: string; owes: string; net: string }[];
    const friendBalance = balances.find((b) => b.userId === friend.userId)!;
    expect(friendBalance.owes).toBe('750.00');
    expect(friendBalance.net).toBe('-750.00');
    expect(sumRupees(balances.map((b) => b.net))).toBe(0);

    const settlements = read.body.data.settlements as { fromUserId: string; amount: string }[];
    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.fromUserId).toBe(friend.userId);
    expect(settlements[0]!.amount).toBe('750.00');
  }, 120_000);

  it('re-divides an existing expense when a new member joins', async () => {
    const organizer = await registerAndLogin('groworg');
    const first = await registerAndLogin('growfirst');
    const late = await registerAndLogin('growlate');
    const tripId = await createTrip(organizer.token, `Growing ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${first.token}`);

    await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ description: 'Cab', amount: 900, category: 'TRANSPORT' });

    const before = await request(app)
      .get(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(
      (before.body.data.balances as { userId: string; owes: string }[]).find((b) => b.userId === first.userId)!.owes,
    ).toBe('450.00');

    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${late.token}`);

    // The split is derived at read time, so it follows the roster.
    const after = await request(app)
      .get(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(
      (after.body.data.balances as { userId: string; owes: string }[]).find((b) => b.userId === first.userId)!.owes,
    ).toBe('300.00');
  }, 120_000);

  it('lets the payer edit and refuses a non-member every write', async () => {
    const organizer = await registerAndLogin('editorg');
    const outsider = await registerAndLogin('editoutsider');
    const tripId = await createTrip(organizer.token, `Edits ${runId}`);

    const added = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ description: 'Snacks', amount: 200, category: 'FOOD' });
    const expenseId = added.body.data.id;

    const edited = await request(app)
      .patch(`/api/v1/trips/${tripId}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ amount: 250, description: 'Snacks and chai' });
    expect(edited.status).toBe(200);

    const read = await request(app)
      .get(`/api/v1/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(read.body.data.total).toBe('250.00');
    expect(read.body.data.expenses[0].description).toBe('Snacks and chai');

    for (const attempt of [
      request(app)
        .post(`/api/v1/trips/${tripId}/expenses`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ description: 'Nope', amount: 10, category: 'OTHER' }),
      request(app)
        .patch(`/api/v1/trips/${tripId}/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ amount: 1 }),
      request(app)
        .delete(`/api/v1/trips/${tripId}/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${outsider.token}`),
      request(app).get(`/api/v1/trips/${tripId}/expenses`).set('Authorization', `Bearer ${outsider.token}`),
    ]) {
      const res = await attempt;
      expect(res.status).toBe(403);
    }
  }, 120_000);
});
