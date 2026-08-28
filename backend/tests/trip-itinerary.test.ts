import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for the trip itinerary / day-schedule routes
 * (docs/REMEDIATION.md §8.6).
 *
 * group-organizer.tsx's "Day Schedule" tab rendered the same two hardcoded
 * days for every trip, and "Insert Itinerary Day" only pushed onto local
 * useState — the day was gone on unmount and no trip member ever saw it.
 * These cover the real version: participant-only reads, organizer-only
 * writes, server-assigned day numbers, and renumbering on delete.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-itinerary-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Itinerary ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string): Promise<string> {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Itinerary Trip ${runId}`,
      cities: ['Munnar'],
      startDate,
      endDate,
      budget: 5000,
      totalSeats: 4,
      meetingPoint: 'Kochi',
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id as string;
}

async function addDay(token: string, tripId: string, title: string, plan: string) {
  return request(app)
    .post(`/api/v1/trips/${tripId}/itinerary`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title, plan });
}

afterAll(async () => {
  // TripItineraryDay cascades from Trip.
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/trips/:tripId/itinerary', () => {
  it('rejects an unauthenticated request', async () => {
    const organizer = await registerAndLogin('get-unauth');
    const tripId = await createTrip(organizer.token);
    const res = await request(app).get(`/api/v1/trips/${tripId}/itinerary`);
    expect(res.status).toBe(401);
  });

  it('rejects someone who is not on the trip', async () => {
    const organizer = await registerAndLogin('get-owner');
    const outsider = await registerAndLogin('get-outsider');
    const tripId = await createTrip(organizer.token);

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/itinerary`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  it('starts empty rather than with a hardcoded plan', async () => {
    const organizer = await registerAndLogin('get-empty');
    const tripId = await createTrip(organizer.token);

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/itinerary`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toEqual([]);
    expect(res.body.data.canEdit).toBe(true);
  });
});

describe('POST /api/v1/trips/:tripId/itinerary', () => {
  it('rejects a member who is not the organizer, and reports canEdit false to them', async () => {
    const organizer = await registerAndLogin('post-owner');
    const member = await registerAndLogin('post-member');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${member.token}`).send({});

    const post = await addDay(member.token, tripId, 'Sneaky day', 'Not mine to add');
    expect(post.status).toBe(403);

    const get = await request(app)
      .get(`/api/v1/trips/${tripId}/itinerary`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.canEdit).toBe(false);
  });

  it('rejects an empty title or plan', async () => {
    const organizer = await registerAndLogin('post-validation');
    const tripId = await createTrip(organizer.token);

    const res = await addDay(organizer.token, tripId, '   ', 'Some plan');
    expect(res.status).toBe(400);
  });

  it('numbers days server-side and makes them visible to every trip member', async () => {
    const organizer = await registerAndLogin('post-persist-owner');
    const member = await registerAndLogin('post-persist-member');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${member.token}`).send({});

    const first = await addDay(organizer.token, tripId, 'Arrival', 'Airport pickup, hotel check-in.');
    const second = await addDay(organizer.token, tripId, 'Trek', 'Guided 6km forest trek.');
    expect(first.status).toBe(201);
    expect(first.body.data.day).toBe(1);
    expect(second.body.data.day).toBe(2);

    // The member — not just the author — can read the real schedule.
    const get = await request(app)
      .get(`/api/v1/trips/${tripId}/itinerary`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(get.body.data.days.map((d: { day: number; title: string }) => [d.day, d.title])).toEqual([
      [1, 'Arrival'],
      [2, 'Trek'],
    ]);
  });
});

describe('DELETE /api/v1/trips/:tripId/itinerary/:dayId', () => {
  it('rejects a non-organizer', async () => {
    const organizer = await registerAndLogin('del-owner');
    const member = await registerAndLogin('del-member');
    const tripId = await createTrip(organizer.token);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${member.token}`).send({});
    const day = await addDay(organizer.token, tripId, 'Arrival', 'Airport pickup.');

    const res = await request(app)
      .delete(`/api/v1/trips/${tripId}/itinerary/${day.body.data.id}`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(res.status).toBe(403);
  });

  it('renumbers the remaining days so there is no gap', async () => {
    const organizer = await registerAndLogin('del-renumber');
    const tripId = await createTrip(organizer.token);
    await addDay(organizer.token, tripId, 'Day one', 'One.');
    const middle = await addDay(organizer.token, tripId, 'Day two', 'Two.');
    await addDay(organizer.token, tripId, 'Day three', 'Three.');

    const del = await request(app)
      .delete(`/api/v1/trips/${tripId}/itinerary/${middle.body.data.id}`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(del.status).toBe(200);

    const get = await request(app)
      .get(`/api/v1/trips/${tripId}/itinerary`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(get.body.data.days.map((d: { day: number; title: string }) => [d.day, d.title])).toEqual([
      [1, 'Day one'],
      [2, 'Day three'],
    ]);

    // And the next added day continues from the renumbered end, not 4.
    const next = await addDay(organizer.token, tripId, 'Day four', 'Four.');
    expect(next.body.data.day).toBe(3);
  });

  it('404s for a day that belongs to another trip', async () => {
    const organizer = await registerAndLogin('del-crosstrip');
    const tripA = await createTrip(organizer.token);
    const tripB = await createTrip(organizer.token);
    const day = await addDay(organizer.token, tripA, 'Day one', 'One.');

    const res = await request(app)
      .delete(`/api/v1/trips/${tripB}/itinerary/${day.body.data.id}`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(404);
  });
});
