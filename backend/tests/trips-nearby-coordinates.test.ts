import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Radius search runs against each trip's own stored coordinates.
 *
 * It used to re-derive a position from the trip's city *names* on every
 * request, through a ~76-entry static table. Any trip whose city was not in
 * that table got `distanceKm: null` and was dropped from every radius
 * result — however close it actually was. Coordinates are now resolved once
 * at creation from the organizer's geocoded timeline stops and stored on
 * the Trip, so a route through an unlisted town is found like any other.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

// A real place with no entry in lib/india-city-coords.ts, ~55km from Jaipur.
const UNLISTED_TOWN = { city: `Chomu-${runId}`, latitude: 27.1667, longitude: 75.7167 };
const JAIPUR = { lat: 26.9124, lng: 75.7873 };

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-nearbycoords-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Nearby ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/trips/nearby — stored trip coordinates', () => {
  it('finds a trip whose city is not in the static table, using its geocoded stop', async () => {
    const organizer = await registerAndLogin('org');
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Unlisted Town Trip ${runId}`,
        cities: [UNLISTED_TOWN.city],
        startDate,
        endDate,
        budget: 4000,
        totalSeats: 4,
        meetingPoint: 'Town square',
        privacy: 'PUBLIC',
        timeline: [
          {
            city: UNLISTED_TOWN.city,
            stayDays: 2,
            activities: '',
            latitude: UNLISTED_TOWN.latitude,
            longitude: UNLISTED_TOWN.longitude,
          },
        ],
      });
    expect(created.status).toBe(201);
    const tripId = created.body.data.id;
    createdTripIds.push(tripId);

    // The coordinates were resolved and stored at creation, not left null.
    const stored = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { latitude: true, longitude: true },
    });
    expect(stored?.latitude).toBeCloseTo(UNLISTED_TOWN.latitude, 3);
    expect(stored?.longitude).toBeCloseTo(UNLISTED_TOWN.longitude, 3);

    // ~55km away, so a 100km radius includes it and a 10km radius does not.
    const within = await request(app).get(
      `/api/v1/trips/nearby?lat=${JAIPUR.lat}&lng=${JAIPUR.lng}&radiusKm=100&limit=50`,
    );
    expect(within.status).toBe(200);
    const hit = (within.body.data as { id: string; distanceKm: number | null }[]).find((t) => t.id === tripId);
    expect(hit).toBeTruthy();
    expect(hit!.distanceKm).toBeGreaterThan(20);
    expect(hit!.distanceKm).toBeLessThan(100);

    const tooFar = await request(app).get(
      `/api/v1/trips/nearby?lat=${JAIPUR.lat}&lng=${JAIPUR.lng}&radiusKm=10&limit=50`,
    );
    expect(tooFar.status).toBe(200);
    expect((tooFar.body.data as { id: string }[]).some((t) => t.id === tripId)).toBe(false);
  }, 60_000);

  it('still places a trip that carries no stop coordinates, via its city name', async () => {
    const organizer = await registerAndLogin('citytable');
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `City Table Trip ${runId}`,
        cities: ['Jaipur'],
        startDate,
        endDate,
        budget: 4000,
        totalSeats: 4,
        meetingPoint: 'Jaipur Jn',
        privacy: 'PUBLIC',
      });
    expect(created.status).toBe(201);
    createdTripIds.push(created.body.data.id);

    const stored = await prisma.trip.findUnique({
      where: { id: created.body.data.id },
      select: { latitude: true },
    });
    expect(stored?.latitude).toBeCloseTo(JAIPUR.lat, 1);
  }, 60_000);
});
