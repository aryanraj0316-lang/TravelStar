import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Family Connect Midway / day-range join: a JoinRequest can carry
 * familyMemberCount, and the seat claimed/released on approval must be the
 * whole party (partySize = 1 + familyMemberCount), not just 1 — see
 * services/trip-membership.ts's claimSeatAndJoin/releaseSeatAndLeave and
 * api/routes/interactions.ts's POST /join-request and /join-request/:id/status.
 *
 * Runs against the real configured DATABASE_URL, same pattern as
 * seat-concurrency.test.ts.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-family-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Family ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Family Connect Midway party-size seat claiming', () => {
  it('claims and releases the whole party (1 + familyMemberCount) as one unit', async () => {
    const organizer = await registerAndLogin('organizer');
    const requester = await registerAndLogin('requester');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Family Trip ${runId}`,
        cities: ['Jaipur', 'Udaipur'],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        budget: 1000,
        totalSeats: 5,
        meetingPoint: 'Jaipur Junction',
        privacy: 'PRIVATE',
      });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);

    // Family of 4 (requester + 3 family members) requests to join.
    const joinRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ tripId, familyMemberCount: 3 });
    expect(joinRes.status).toBe(201);
    expect(joinRes.body.data.partySize).toBe(4);
    const joinRequestId = joinRes.body.data.id;

    // A party of 4 against a trip that only has 5 seats total is fine to
    // approve. This trip charges a fee, so approval asks for payment rather
    // than seating the party — the seats are claimed when it is paid for.
    const approveRes = await request(app)
      .post(`/api/v1/interactions/join-request/${joinRequestId}/status`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('AWAITING_PAYMENT');

    // The whole party is charged for, not just the requester: 1000 × 4.
    const paid = await request(app)
      .post('/api/v1/trip-payments/pay')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ joinRequestId });
    expect(paid.status).toBe(200);
    expect(Number(paid.body.data.amount)).toBe(4000);

    const afterApprove = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(afterApprove?.availableSeats).toBe(1); // 5 - 4

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: requester.userId } },
    });
    expect(member?.partySize).toBe(4);

    // Withdrawing releases all 4 seats, not just 1.
    const cancelRes = await request(app)
      .delete(`/api/v1/interactions/join-request/${tripId}`)
      .set('Authorization', `Bearer ${requester.token}`);
    expect(cancelRes.status).toBe(200);

    const afterRelease = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(afterRelease?.availableSeats).toBe(5);
  }, 30_000);

  it('lists the unjoined companions of a party booking on the roster, so the extra seats are visible people', async () => {
    const organizer = await registerAndLogin('roster-organizer');
    const requester = await registerAndLogin('roster-requester');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 24 * 60 * 60 * 1000);

    // Created directly because POST /trips requires a positive budget: this
    // trip is free on purpose, so approval seats the party immediately and
    // the test stays about the roster rather than about payment.
    const createdTrip = await prisma.trip.create({
      data: {
        creatorId: organizer.userId,
        name: `Roster Family Trip ${runId}`,
        description: 'Roster companion visibility',
        category: 'ADVENTURE',
        cities: ['Goa'],
        startDate: start,
        endDate: end,
        durationDays: 4,
        budget: 0,
        totalSeats: 6,
        availableSeats: 6,
        meetingPoint: 'Panaji',
        privacy: 'PRIVATE',
      },
    });
    const tripId = createdTrip.id;
    createdTripIds.push(tripId);

    // One traveller books for themselves plus two companions.
    const joinRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ tripId, familyMemberCount: 2 });
    const joinRequestId = joinRes.body.data.id;

    await request(app)
      .post(`/api/v1/interactions/join-request/${joinRequestId}/status`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'APPROVED' });

    const roster = await request(app)
      .get(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(roster.status).toBe(200);

    type RosterRow = {
      userId: string | null;
      name: string;
      isCreator: boolean;
      partySize: number;
      isPendingCompanion: boolean;
      companionOf: string | null;
    };
    const rows: RosterRow[] = roster.body.data;

    // Two real people are here: the organizer and the traveller who booked.
    const joined = rows.filter((r) => !r.isPendingCompanion);
    expect(joined).toHaveLength(2);
    const booker = joined.find((r) => !r.isCreator)!;
    expect(booker.partySize).toBe(3);

    // The two seats they booked for other people are now visible as people
    // who are expected but have not joined — previously they existed only
    // inside the availableSeats arithmetic and appeared nowhere at all.
    const companions = rows.filter((r) => r.isPendingCompanion);
    expect(companions).toHaveLength(2);
    for (const c of companions) {
      expect(c.userId).toBeNull();
      expect(c.companionOf).toBe(booker.name);
      expect(c.name).toContain(booker.name);
    }

    // Seats still reconcile: 6 total − 3 booked = 3 left.
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(trip?.availableSeats).toBe(3);
  }, 60_000);

  it('rejects a party too large for the remaining seats up front', async () => {
    const organizer = await registerAndLogin('organizer2');
    const requester = await registerAndLogin('requester2');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Small Trip ${runId}`,
        cities: ['Goa'],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        budget: 1000,
        totalSeats: 2,
        meetingPoint: 'Mapusa',
        privacy: 'PRIVATE',
      });
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);

    const joinRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ tripId, familyMemberCount: 5 }); // party of 6 against 2 seats
    expect(joinRes.status).toBe(409);
    expect(joinRes.body.error.code).toBe('TRIP_FULL');
  }, 30_000);
});
