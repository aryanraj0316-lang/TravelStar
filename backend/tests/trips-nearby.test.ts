import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for GET /api/v1/trips/nearby (docs/REMEDIATION.md §8.13).
 *
 * This route used to return a fixed list of hardcoded Delhi-area "places"
 * regardless of the caller, and the client fabricated a Trip object from
 * each one and POSTed a join request against a nonexistent id. It now
 * returns real upcoming public trips; when the caller passes ?lat&lng it
 * annotates each with a straight-line distance to the nearest city on the
 * route that we have reference coordinates for, and sorts nearest-first.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-nearby-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Nearby ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/trips/nearby', () => {
  it('returns real trips and, with a location, sorts them nearest-first with an honest distance', async () => {
    const organizer = await registerAndLogin('org');
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    // A trip starting in Jaipur and one starting in Chennai.
    const near = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ name: `Nearby Jaipur ${runId}`, cities: ['Jaipur', 'Agra'], startDate, endDate, budget: 5000, totalSeats: 4, meetingPoint: 'Jaipur Jn', privacy: 'PUBLIC' });
    const far = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ name: `Nearby Chennai ${runId}`, cities: ['Chennai', 'Madurai'], startDate, endDate, budget: 5000, totalSeats: 4, meetingPoint: 'Chennai Central', privacy: 'PUBLIC' });
    expect(near.status).toBe(201);
    expect(far.status).toBe(201);
    createdTripIds.push(near.body.data.id, far.body.data.id);

    // From Delhi (28.61, 77.21): Jaipur (~240 km) is much closer than Chennai (~1750 km).
    const res = await request(app).get('/api/v1/trips/nearby?lat=28.6139&lng=77.209');
    expect(res.status).toBe(200);
    const list: { id: string; distanceKm: number | null; distanceIsApproximate: boolean }[] = res.body.data;

    const nearEntry = list.find((t) => t.id === near.body.data.id);
    const farEntry = list.find((t) => t.id === far.body.data.id);
    expect(nearEntry).toBeTruthy();
    expect(farEntry).toBeTruthy();
    expect(nearEntry!.distanceIsApproximate).toBe(true);
    expect(nearEntry!.distanceKm).toBeGreaterThan(100);
    expect(nearEntry!.distanceKm).toBeLessThan(400);
    expect(nearEntry!.distanceKm!).toBeLessThan(farEntry!.distanceKm!);

    // Nearest-first ordering: the Jaipur trip appears before the Chennai trip.
    const nearIdx = list.findIndex((t) => t.id === near.body.data.id);
    const farIdx = list.findIndex((t) => t.id === far.body.data.id);
    expect(nearIdx).toBeLessThan(farIdx);
  });

  it('rejects an out-of-range latitude', async () => {
    const res = await request(app).get('/api/v1/trips/nearby?lat=999&lng=77');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('works with no location (distances null, still real trips)', async () => {
    const res = await request(app).get('/api/v1/trips/nearby');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const t of res.body.data) {
      expect(t.distanceKm).toBeNull();
    }
  });
});
