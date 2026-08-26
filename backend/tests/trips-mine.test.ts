import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for GET /api/v1/trips/mine (docs/REMEDIATION.md §8.11).
 *
 * This route is the real, payment-free v1 replacement for the old
 * MOCK_BOOKINGS-backed "My Bookings" screen. It must surface a trip a user
 * organizes (Trip.creatorId — no TripMember row exists for the creator)
 * and a trip a user has joined (a real TripMember row), and must never
 * leak another user's trips.
 *
 * Runs against the real configured DATABASE_URL — see auth-security.test.ts
 * for why there's no separate throwaway Postgres in this environment.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

function uniqueEmail(label: string): string {
  const email = `test-tripsmine-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  return email;
}

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = uniqueEmail(label);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Trips Mine ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  // TripMember/ChatRoom/ChatRoomMember all cascade off Trip; JoinRequest too.
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/trips/mine', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/trips/mine');
    expect(res.status).toBe(401);
  });

  it('includes a trip the user organizes, and a trip the user joined, but not an unrelated trip', async () => {
    const organizer = await registerAndLogin('organizer');
    const joiner = await registerAndLogin('joiner');
    const stranger = await registerAndLogin('stranger');

    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    const organizedTripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Mine-Test Organized Trip ${runId}`,
        cities: ['Ranchi', 'Delhi'],
        startDate,
        endDate,
        budget: 5000,
        totalSeats: 4,
        meetingPoint: 'Ranchi Junction',
        privacy: 'PUBLIC',
      });
    expect(organizedTripRes.status).toBe(201);
    const organizedTripId = organizedTripRes.body.data.id;
    createdTripIds.push(organizedTripId);

    const strangerTripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({
        name: `Mine-Test Unrelated Trip ${runId}`,
        cities: ['Mumbai', 'Pune'],
        startDate,
        endDate,
        budget: 3000,
        totalSeats: 4,
        meetingPoint: 'Mumbai CST',
        privacy: 'PUBLIC',
      });
    expect(strangerTripRes.status).toBe(201);
    createdTripIds.push(strangerTripRes.body.data.id);

    const joinRes = await request(app)
      .post(`/api/v1/trips/${organizedTripId}/join`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({});
    expect(joinRes.status).toBe(200);

    // Organizer sees their own trip, with ORGANIZER role and no TripMember row needed.
    const organizerMine = await request(app)
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(organizerMine.status).toBe(200);
    const organizerEntry = organizerMine.body.data.find((t: { id: string }) => t.id === organizedTripId);
    expect(organizerEntry).toBeTruthy();
    expect(organizerEntry.memberRole).toBe('ORGANIZER');
    expect(organizerEntry.status).toBe('UPCOMING');
    expect(organizerMine.body.data.some((t: { id: string }) => t.id === strangerTripRes.body.data.id)).toBe(false);

    // Joiner sees the trip they joined, with MEMBER role from the real TripMember row.
    const joinerMine = await request(app)
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${joiner.token}`);
    expect(joinerMine.status).toBe(200);
    const joinerEntry = joinerMine.body.data.find((t: { id: string }) => t.id === organizedTripId);
    expect(joinerEntry).toBeTruthy();
    expect(joinerEntry.memberRole).toBe('MEMBER');

    // A stranger with no relation to the organized trip never sees it.
    const strangerMine = await request(app)
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(strangerMine.status).toBe(200);
    expect(strangerMine.body.data.some((t: { id: string }) => t.id === organizedTripId)).toBe(false);
  });

  it('excludes a cancelled trip', async () => {
    const organizer = await registerAndLogin('cancelled-organizer');
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Mine-Test Cancelled Trip ${runId}`,
        cities: ['Jaipur', 'Udaipur'],
        startDate,
        endDate,
        budget: 4000,
        totalSeats: 4,
        meetingPoint: 'Jaipur Station',
        privacy: 'PUBLIC',
      });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.data.id;
    createdTripIds.push(tripId);

    await prisma.trip.update({ where: { id: tripId }, data: { status: 'CANCELLED' } });

    const mine = await request(app)
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((t: { id: string }) => t.id === tripId)).toBe(false);
  });
});
