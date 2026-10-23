import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';
import { TEST_ORGANIZER_AGREEMENT } from './organizer-agreement-fixture';
import { travellers } from './traveller-details-fixture';

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
      .send({ organizerAgreement: TEST_ORGANIZER_AGREEMENT,
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
      .send({ tripId, familyMemberCount: 3, acceptedTerms: true, travellerDetails: travellers(4) });
    expect(joinRes.status).toBe(201);
    expect(joinRes.body.data.partySize).toBe(4);
    // A paid trip is booked pay-first: no organizer approval before payment.
    expect(joinRes.body.data.status).toBe('PAYMENT_PENDING');
    const joinRequestId = joinRes.body.data.id;

    // The whole party is charged for, not just the requester: 1000 × 4.
    const paid = await request(app)
      .post('/api/v1/trip-payments/pay')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ joinRequestId });
    expect(paid.status).toBe(200);
    expect(Number(paid.body.data.amount)).toBe(4000);

    // Payment holds all 4 seats at once...
    const afterPayment = await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } });
    expect(afterPayment?.availableSeats).toBe(1); // 5 - 4

    // ...and the organizer's allocation admits the party as one member.
    const allocated = await request(app)
      .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        joinRequestId,
        verificationToken: paid.body.data.verificationToken,
        allocations: [{ dayNumber: 1, checkpointName: 'Jaipur', hotelName: 'Haveli', roomNumber: '201-202', vehicleNumber: 'RJ-14-1234', seatNumber: '1-4' }],
      });
    expect(allocated.status).toBe(200);
    // Allocation consumes no further seats.
    expect((await prisma.trip.findUnique({ where: { id: tripId }, select: { availableSeats: true } }))?.availableSeats).toBe(1);

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: requester.userId } },
    });
    expect(member?.partySize).toBe(4);

    // Cancelling releases all 4 seats, not just 1 (and refunds per policy).
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
    // trip is free on purpose, so the test stays about the roster rather than
    // about payment. Free trips: approval reserves the seats, allocation
    // admits the party.
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
      .send({ tripId, familyMemberCount: 2, travellerDetails: travellers(3) });
    const joinRequestId = joinRes.body.data.id;

    const approved = await request(app)
      .post(`/api/v1/interactions/join-request/${joinRequestId}/status`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'APPROVED' });
    expect(approved.body.data.status).toBe('ALLOCATION_PENDING');
    const allocated = await request(app)
      .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        joinRequestId,
        allocations: [{ dayNumber: 1, checkpointName: 'Goa', hotelName: 'Beach Hut', roomNumber: '7', vehicleNumber: 'GA-01-1', seatNumber: '1-3' }],
      });
    expect(allocated.status).toBe(200);

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
      .send({ organizerAgreement: TEST_ORGANIZER_AGREEMENT,
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
      .send({ tripId, familyMemberCount: 5, travellerDetails: travellers(6) }); // party of 6 against 2 seats
    expect(joinRes.status).toBe(409);
    expect(joinRes.body.error.code).toBe('TRIP_FULL');
  }, 30_000);
});
