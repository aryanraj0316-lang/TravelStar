import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * The seat-booking concurrency test docs/REMEDIATION.md §5.4 asks for by
 * name: "Write a concurrency test that fires 50 simultaneous joins at a
 * 10-seat trip and asserts exactly 10 succeed."
 *
 * The bug this guards against was a read-modify-write with no transaction:
 *
 *   const dbTrip = await prisma.trip.findUnique(...);
 *   if (dbTrip.availableSeats > 0) {
 *     await prisma.trip.update({ data: { availableSeats: dbTrip.availableSeats - 1 } });
 *   }
 *
 * Two concurrent joins both read 1, both write 0, and the trip is oversold —
 * with no `TripMember` row created either way. The fix (services/
 * trip-membership.ts) is a single transaction whose seat claim is a
 * conditional `updateMany` on `availableSeats > 0`, so the database decides
 * the winner and `count === 0` means "someone else got the last seat".
 *
 * This is the test that would actually have caught it: the read-modify-write
 * version passes every sequential test and only fails under real contention.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

const SEATS = 10;
const CONTENDERS = 50;

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-seatrace-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Seat ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Seat booking under concurrency (docs/REMEDIATION.md §5.4)', () => {
  it(`sells exactly ${SEATS} seats when ${CONTENDERS} users join a ${SEATS}-seat trip simultaneously`, async () => {
    const organizer = await registerAndLogin('organizer');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Seat Race Trip ${runId}`,
        cities: ['Jaipur', 'Udaipur'],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        budget: 5000,
        totalSeats: SEATS,
        meetingPoint: 'Jaipur Junction',
        privacy: 'PUBLIC',
      });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);
    expect(tripRes.body.data.availableSeats).toBe(SEATS);

    // Register the contenders up front so the race itself contains nothing
    // but the join calls.
    const contenders = await Promise.all(
      Array.from({ length: CONTENDERS }, (_, i) => registerAndLogin(`c${i}`)),
    );

    const results = await Promise.all(
      contenders.map((c) =>
        request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${c.token}`),
      ),
    );

    const succeeded = results.filter((r) => r.status === 200);
    const full = results.filter((r) => r.status === 409);

    // Exactly the seats that existed, no more and no fewer.
    expect(succeeded).toHaveLength(SEATS);
    // Everyone else is told the trip is full — not a 500, and not a silent
    // success that consumed a seat which was not there. Before the critical
    // section was shortened, 48 of these were 500s: the callers could not
    // even acquire a transaction slot within the timeout, so a busy trip
    // answered almost everyone with an error that told them nothing.
    expect(full).toHaveLength(CONTENDERS - SEATS);
    expect(full.every((r) => r.body.error.code === 'TRIP_FULL')).toBe(true);

    // The counter landed on zero rather than going negative. There is also a
    // DB-level CHECK ("trip_available_seats_non_negative", migration
    // 000000000001) behind this, so a regression fails loudly rather than
    // storing a negative seat count.
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(trip?.availableSeats).toBe(0);

    // The seat count and the membership rows must agree — the original bug
    // decremented the counter without ever creating a TripMember, so a trip
    // could read as sold out with nobody on it.
    const memberCount = await prisma.tripMember.count({ where: { tripId } });
    expect(memberCount).toBe(SEATS);
  }, 120_000);

  it('does not consume a second seat when the same user joins twice', async () => {
    const organizer = await registerAndLogin('idem-organizer');
    const joiner = await registerAndLogin('idem-joiner');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Seat Idempotency Trip ${runId}`,
        cities: ['Goa'],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        budget: 3000,
        totalSeats: 2,
        meetingPoint: 'Mapusa',
        privacy: 'PUBLIC',
      });
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);

    const first = await request(app)
      .post(`/api/v1/trips/${tripId}/join`)
      .set('Authorization', `Bearer ${joiner.token}`);
    const second = await request(app)
      .post(`/api/v1/trips/${tripId}/join`)
      .set('Authorization', `Bearer ${joiner.token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(trip?.availableSeats).toBe(1);

    const memberCount = await prisma.tripMember.count({ where: { tripId, userId: joiner.userId } });
    expect(memberCount).toBe(1);
  }, 60_000);
});
