import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for PATCH /api/v1/trips/:id/members/:userId and
 * POST /api/v1/trips/:id/announcements (docs/REMEDIATION.md §8.6).
 *
 * group-organizer.tsx's roster tools (check-in, room/seat allocation) and
 * "Group Announcements" were pure client-side useState — silently
 * discarded the next time the member list was refetched, and (for
 * announcements) an Alert.alert that claimed a push notification had been
 * sent when nothing was sent to anyone. These routes back the real
 * versions.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-roster-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Roster ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string): Promise<string> {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Roster Trip ${runId}`,
      cities: ['Jaipur'],
      startDate,
      endDate,
      budget: 5000,
      totalSeats: 4,
      meetingPoint: 'Jaipur Jn',
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id as string;
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { tripId: { in: createdTripIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('PATCH /api/v1/trips/:id/members/:userId', () => {
  it('rejects an unauthenticated request', async () => {
    const organizer = await registerAndLogin('roster-owner-unauth');
    const tripId = await createTrip(organizer.token);
    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${organizer.userId}`)
      .send({ checkedIn: true });
    expect(res.status).toBe(401);
  });

  it('rejects a non-organizer', async () => {
    const organizer = await registerAndLogin('roster-owner');
    const joiner = await registerAndLogin('roster-joiner');
    const outsider = await registerAndLogin('roster-outsider');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${joiner.token}`).send({});

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ checkedIn: true });
    expect(res.status).toBe(403);
  });

  it('rejects a body with none of the three fields', async () => {
    const organizer = await registerAndLogin('roster-empty-body');
    const joiner = await registerAndLogin('roster-empty-body-joiner');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${joiner.token}`).send({});

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('persists check-in and room/seat allocation, and reflects them in GET /:id/members', async () => {
    const organizer = await registerAndLogin('roster-persist-owner');
    const joiner = await registerAndLogin('roster-persist-joiner');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${joiner.token}`).send({});

    const patchRes = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${joiner.userId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ checkedIn: true, roomAllocated: 'Room 402', seatAllocated: 'Seat 12A' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.checkedIn).toBe(true);
    expect(patchRes.body.data.roomAllocated).toBe('Room 402');
    expect(patchRes.body.data.seatAllocated).toBe('Seat 12A');

    // Not a client-side illusion — a fresh GET reflects it too.
    const membersRes = await request(app)
      .get(`/api/v1/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(membersRes.status).toBe(200);
    const joinerRow = membersRes.body.data.find((m: { userId: string }) => m.userId === joiner.userId);
    expect(joinerRow.checkedIn).toBe(true);
    expect(joinerRow.roomAllocated).toBe('Room 402');
    expect(joinerRow.seatAllocated).toBe('Seat 12A');

    // The organizer's own synthetic row has no roster fields to update.
    const organizerRow = membersRes.body.data.find((m: { userId: string }) => m.userId === organizer.userId);
    expect(organizerRow.checkedIn).toBeNull();
  });

  it('rejects a userId that is not a member of the trip', async () => {
    const organizer = await registerAndLogin('roster-nonmember-owner');
    const stranger = await registerAndLogin('roster-nonmember-stranger');
    const tripId = await createTrip(organizer.token);

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/members/${stranger.userId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ checkedIn: true });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/trips/:id/announcements', () => {
  it('rejects a non-organizer', async () => {
    const organizer = await registerAndLogin('announce-owner');
    const joiner = await registerAndLogin('announce-joiner');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${joiner.token}`).send({});

    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ title: 'Not yours to send', content: 'x' });
    expect(res.status).toBe(403);
  });

  it('creates a real Notification for every member, not the organizer, and reaches GET /notifications', async () => {
    const organizer = await registerAndLogin('announce-real-owner');
    const memberA = await registerAndLogin('announce-real-a');
    const memberB = await registerAndLogin('announce-real-b');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${memberA.token}`).send({});
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${memberB.token}`).send({});

    const postRes = await request(app)
      .post(`/api/v1/trips/${tripId}/announcements`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ title: 'Bring warm clothes', content: 'Temperatures are dropping tonight.' });
    expect(postRes.status).toBe(201);
    expect(postRes.body.data.recipientCount).toBe(2);

    const feedA = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${memberA.token}`);
    expect(feedA.body.data.some((n: { title: string }) => n.title === 'Bring warm clothes')).toBe(true);

    // The organizer wrote it — it should not also land in their own feed.
    const feedOrganizer = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(feedOrganizer.body.data.some((n: { title: string }) => n.title === 'Bring warm clothes')).toBe(false);
  });
});
