import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Route-based guide matching: which guides actually work this trip's route.
 *
 * Before this, the only guide↔place link was GuideProfile.expertisePlaces —
 * free text that cannot answer "does this guide cover a stop 40km outside
 * Jaipur", so the organizer's checkpoint view offered every guide in the
 * app. Guides now declare real service zones (centre + radius) and a trip's
 * waypoints are matched against them by distance.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdGuideProfileIds: string[] = [];

const JAIPUR = { lat: 26.9124, lng: 75.7873 };
const UDAIPUR = { lat: 24.5854, lng: 73.7125 };
const KOLKATA = { lat: 22.5726, lng: 88.3639 };

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-routematch-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Match ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createGuideWithZones(
  label: string,
  zones: { label: string; latitude: number; longitude: number; radiusKm: number }[],
): Promise<string> {
  const account = await registerAndLogin(label);

  const profileRes = await request(app)
    .post('/api/v1/guides/profile')
    .set('Authorization', `Bearer ${account.token}`)
    .send({
      licenseNumber: `LIC-${label}-${runId}`,
      experienceYears: 5,
      expertisePlaces: ['Somewhere'],
      languagesSpoken: ['Hindi', 'English'],
      hourlyRate: 500,
      dailyRate: 3000,
      availability: {},
    });
  expect(profileRes.status).toBeLessThan(300);
  const guideProfileId = profileRes.body.data.id;
  createdGuideProfileIds.push(guideProfileId);

  for (const zone of zones) {
    const zoneRes = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/service-zones`)
      .set('Authorization', `Bearer ${account.token}`)
      .send(zone);
    expect(zoneRes.status).toBe(201);
  }

  return guideProfileId;
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: createdGuideProfileIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/trips/:id/matching-guides', () => {
  it('returns only guides whose zones cover the route, and flags whole-route coverage', async () => {
    const organizer = await registerAndLogin('org');

    // Covers both stops on the route.
    const fullRouteGuide = await createGuideWithZones('full', [
      { label: `Jaipur area ${runId}`, latitude: JAIPUR.lat, longitude: JAIPUR.lng, radiusKm: 60 },
      { label: `Udaipur area ${runId}`, latitude: UDAIPUR.lat, longitude: UDAIPUR.lng, radiusKm: 60 },
    ]);
    // Covers only the first stop.
    const partialGuide = await createGuideWithZones('partial', [
      { label: `Jaipur only ${runId}`, latitude: JAIPUR.lat, longitude: JAIPUR.lng, radiusKm: 40 },
    ]);
    // Works the other side of the country.
    const farGuide = await createGuideWithZones('far', [
      { label: `Kolkata ${runId}`, latitude: KOLKATA.lat, longitude: KOLKATA.lng, radiusKm: 80 },
    ]);

    const startDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: `Rajasthan Route ${runId}`,
        cities: ['Jaipur', 'Udaipur'],
        startDate,
        endDate,
        budget: 9000,
        totalSeats: 6,
        meetingPoint: 'Jaipur Jn',
        privacy: 'PUBLIC',
        timeline: [
          { city: 'Jaipur', stayDays: 2, activities: '', latitude: JAIPUR.lat, longitude: JAIPUR.lng },
          { city: 'Udaipur', stayDays: 2, activities: '', latitude: UDAIPUR.lat, longitude: UDAIPUR.lng },
        ],
      });
    expect(created.status).toBe(201);
    const tripId = created.body.data.id;
    createdTripIds.push(tripId);

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/matching-guides`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(200);

    expect(res.body.data.waypoints).toHaveLength(2);
    expect(res.body.data.unplacedCities).toEqual([]);

    const guides = res.body.data.guides as {
      guideProfileId: string;
      coversEntireRoute: boolean;
      coveredOrders: number[];
    }[];

    const full = guides.find((g) => g.guideProfileId === fullRouteGuide);
    const partial = guides.find((g) => g.guideProfileId === partialGuide);
    const far = guides.find((g) => g.guideProfileId === farGuide);

    expect(full).toBeTruthy();
    expect(full!.coversEntireRoute).toBe(true);
    expect(full!.coveredOrders).toEqual([0, 1]);

    expect(partial).toBeTruthy();
    expect(partial!.coversEntireRoute).toBe(false);
    expect(partial!.coveredOrders).toEqual([0]);

    // A guide working 800km away is not a match for this route at all.
    expect(far).toBeFalsy();

    // Widest coverage sorts first.
    const fullIdx = guides.findIndex((g) => g.guideProfileId === fullRouteGuide);
    const partialIdx = guides.findIndex((g) => g.guideProfileId === partialGuide);
    expect(fullIdx).toBeLessThan(partialIdx);
  }, 120_000);

  it("refuses to let a guide delete another guide's service zone", async () => {
    const victimId = await createGuideWithZones('victim', [
      { label: `Victim zone ${runId}`, latitude: JAIPUR.lat, longitude: JAIPUR.lng, radiusKm: 30 },
    ]);
    const attacker = await registerAndLogin('attacker');
    await request(app)
      .post('/api/v1/guides/profile')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({
        licenseNumber: `LIC-attacker-${runId}`,
        experienceYears: 2,
        expertisePlaces: ['Elsewhere'],
        languagesSpoken: ['Hindi'],
        hourlyRate: 100,
        dailyRate: 900,
        availability: {},
      });

    const zones = await prisma.guideServiceZone.findMany({ where: { guideProfileId: victimId } });
    expect(zones).toHaveLength(1);

    const res = await request(app)
      .delete(`/api/v1/guides/${victimId}/service-zones/${zones[0]!.id}`)
      .set('Authorization', `Bearer ${attacker.token}`);
    expect(res.status).toBe(403);

    const stillThere = await prisma.guideServiceZone.count({ where: { guideProfileId: victimId } });
    expect(stillThere).toBe(1);
  }, 60_000);
});
