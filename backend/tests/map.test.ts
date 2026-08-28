import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for the map data routes (docs/REMEDIATION.md §8.8).
 *
 * map.tsx and map.web.tsx each rendered the same four hardcoded pins — a
 * guide "Rajesh Kumar", a "Ranchi-Vrindavan Group", solo tourist "Neha
 * Mehta", and Prem Mandir — plus a hardcoded Ranchi→Vrindavan route, for
 * every user, with nothing behind any of it. Worse, when a trip's city was
 * missing from the client's local coordinate table, the client *hashed the
 * city name* into a latitude/longitude in central India and drew that as
 * the trip's real route. These cover the real endpoints that replaced all
 * of it.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-map-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Map ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(token: string, cities: string[], meetingPoint: string): Promise<string> {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Map Trip ${runId}`,
      cities,
      startDate,
      endDate,
      budget: 5000,
      totalSeats: 4,
      meetingPoint,
      privacy: 'PUBLIC',
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id as string;
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/map/pins', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/map/pins');
    expect(res.status).toBe(401);
  });

  it('returns no trace of the four hardcoded pins', async () => {
    const user = await registerAndLogin('nofake');
    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);

    const names = (res.body.data as { name: string }[]).map((p) => p.name);
    for (const invented of ['Rajesh Kumar (Guide)', 'Ranchi-Vrindavan Group', 'Neha Mehta (Solo)', 'Prem Mandir Temple']) {
      expect(names).not.toContain(invented);
    }
  });

  it('places a real trip at its meeting point as a GROUP pin', async () => {
    const organizer = await registerAndLogin('grouppin');
    const tripId = await createTrip(organizer.token, ['Jaipur', 'Udaipur'], 'Jaipur');

    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${organizer.token}`);
    const pin = (res.body.data as { id: string; type: string; latitude: number; longitude: number; tripId?: string }[]).find(
      (p) => p.tripId === tripId
    );
    expect(pin).toBeDefined();
    expect(pin!.type).toBe('GROUP');
    // Jaipur's real coordinates, from the server's reference table — not a
    // hash of the city name.
    expect(pin!.latitude).toBeCloseTo(26.9124, 3);
    expect(pin!.longitude).toBeCloseTo(75.7873, 3);
  });

  it('omits a trip whose location cannot be resolved rather than guessing one', async () => {
    const organizer = await registerAndLogin('unplaceable');
    const tripId = await createTrip(organizer.token, ['Zzzznotarealcity'], 'Zzzznotarealcity');

    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${organizer.token}`);
    const pin = (res.body.data as { tripId?: string }[]).find((p) => p.tripId === tripId);
    expect(pin).toBeUndefined();
  });

  it('does not include the caller, and respects a shared location', async () => {
    const viewer = await registerAndLogin('viewer');
    const sharer = await registerAndLogin('sharer');

    await prisma.liveLocation.create({
      data: { userId: viewer.userId, latitude: 26.9124, longitude: 75.7873, updatedAt: new Date() },
    });
    await prisma.liveLocation.create({
      data: { userId: sharer.userId, latitude: 19.076, longitude: 72.8777, updatedAt: new Date() },
    });

    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${viewer.token}`);
    const ids = (res.body.data as { id: string }[]).map((p) => p.id);
    // The caller already has their own GPS marker.
    expect(ids).not.toContain(`user-${viewer.userId}`);
    expect(ids).toContain(`user-${sharer.userId}`);
  });

  it('drops a live position from someone who turned location sharing off', async () => {
    const viewer = await registerAndLogin('optout-viewer');
    const optedOut = await registerAndLogin('optout-user');

    await prisma.profile.update({ where: { userId: optedOut.userId }, data: { locationSharing: false } });
    await prisma.liveLocation.create({
      data: { userId: optedOut.userId, latitude: 19.076, longitude: 72.8777, updatedAt: new Date() },
    });

    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${viewer.token}`);
    const ids = (res.body.data as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(`user-${optedOut.userId}`);
  });

  it('drops a stale live position rather than showing someone where they no longer are', async () => {
    const viewer = await registerAndLogin('stale-viewer');
    const stale = await registerAndLogin('stale-user');

    await prisma.liveLocation.create({
      data: {
        userId: stale.userId,
        latitude: 19.076,
        longitude: 72.8777,
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get('/api/v1/map/pins').set('Authorization', `Bearer ${viewer.token}`);
    const ids = (res.body.data as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(`user-${stale.userId}`);
  });
});

describe('GET /api/v1/map/trips/:tripId/route', () => {
  it('builds the route from the trip\'s real cities, in order', async () => {
    const organizer = await registerAndLogin('route');
    const tripId = await createTrip(organizer.token, ['Delhi', 'Jaipur', 'Udaipur'], 'Delhi');

    const res = await request(app)
      .get(`/api/v1/map/trips/${tripId}/route`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.points.map((p: { name: string }) => p.name)).toEqual(['Delhi', 'Jaipur', 'Udaipur']);
    expect(res.body.data.unplacedCities).toBe(0);
    // Straight lines between city centres, never a road route.
    expect(res.body.data.approximate).toBe(true);
  });

  it('reports the cities it could not place instead of inventing coordinates', async () => {
    const organizer = await registerAndLogin('route-partial');
    const tripId = await createTrip(organizer.token, ['Delhi', 'Zzzznotarealcity'], 'Delhi');

    const res = await request(app)
      .get(`/api/v1/map/trips/${tripId}/route`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.body.data.points).toHaveLength(1);
    expect(res.body.data.unplacedCities).toBe(1);
  });

  it('404s for a trip that does not exist', async () => {
    const user = await registerAndLogin('route-404');
    const res = await request(app)
      .get('/api/v1/map/trips/00000000-0000-4000-8000-000000000000/route')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/map/hazards', () => {
  it('returns active alerts with resolved coordinates where possible', async () => {
    const user = await registerAndLogin('hazards');
    const res = await request(app).get('/api/v1/map/hazards').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Every row carries the coordinate fields, null when unplaceable — the
    // client skips those rather than dropping them somewhere arbitrary.
    for (const hazard of res.body.data as { latitude: number | null; longitude: number | null }[]) {
      expect(hazard).toHaveProperty('latitude');
      expect(hazard).toHaveProperty('longitude');
    }
  });
});
