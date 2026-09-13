import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

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
    .send({ name: `Family ${label}`, email, password: 'correcthorsebattery' });
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
    // approve.
    const approveRes = await request(app)
      .post(`/api/v1/interactions/join-request/${joinRequestId}/status`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);

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
