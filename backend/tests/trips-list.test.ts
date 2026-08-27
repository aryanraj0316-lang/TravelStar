import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for GET /api/v1/trips (docs/REMEDIATION.md §8.3).
 *
 * search.tsx used to source its whole "browse trips" list from this route's
 * plain 20-row default and then filter/sort that fixed page entirely
 * client-side — anything past the most recent 20 trips was invisible to
 * search no matter what was typed. These tests cover the part that changed:
 * cursor-based pagination reaching the full result set, and the
 * guideRequired/verifiedOnly filters now running server-side instead of as
 * a client-side re-check of a possibly-truncated page.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-tripslist-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `TripsList ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTrip(
  token: string,
  overrides: Partial<{ name: string; guideIncluded: boolean; meetingPoint: string; cities: string[] }> = {},
): Promise<string> {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name ?? `Trips List Test ${runId}`,
      cities: overrides.cities ?? ['Jaipur', 'Agra'],
      startDate,
      endDate,
      budget: 5000,
      totalSeats: 4,
      meetingPoint: overrides.meetingPoint ?? 'Jaipur Jn',
      privacy: 'PUBLIC',
      guideIncluded: overrides.guideIncluded ?? false,
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

describe('GET /api/v1/trips', () => {
  it('rejects a query with an invalid limit instead of silently clamping it', async () => {
    const res = await request(app).get('/api/v1/trips?limit=not-a-number');
    // Non-numeric coerces to NaN, which z.coerce.number() rejects.
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('pages through the full result set via the cursor rather than truncating at one page', async () => {
    const organizer = await registerAndLogin('cursor');
    const marker = `CursorPage${runId}`;
    // 3 trips, one page size of 2 — the whole point is that trip #3 must
    // still be reachable via a second request, not just silently dropped.
    for (let i = 0; i < 3; i++) {
      await createTrip(organizer.token, { name: `${marker} ${i}` });
    }

    const page1 = await request(app).get(`/api/v1/trips?search=${marker}&limit=2`);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.cursor).toBeTruthy();

    const page2 = await request(app).get(
      `/api/v1/trips?search=${marker}&limit=2&cursor=${encodeURIComponent(page1.body.meta.cursor)}`,
    );
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(1);

    // No overlap, no gap: together the two pages are exactly the 3 seeded trips.
    const allIds = [...page1.body.data, ...page2.body.data].map((t: { id: string }) => t.id).sort();
    expect(allIds).toEqual(createdTripIds.filter((id) => allIds.includes(id)).sort());
    expect(new Set(allIds).size).toBe(3);

    // Exhausted — no further cursor, per feed.ts's identical convention.
    expect(page2.body.meta.cursor).toBeFalsy();
  });

  it('guideRequired filters to only trips with a guide included', async () => {
    const organizer = await registerAndLogin('guide-filter');
    const marker = `GuideFilter${runId}`;
    const withGuide = await createTrip(organizer.token, { name: `${marker} with-guide`, guideIncluded: true });
    await createTrip(organizer.token, { name: `${marker} without-guide`, guideIncluded: false });

    const res = await request(app).get(`/api/v1/trips?search=${marker}&guideRequired=true`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(withGuide);
    expect(ids).toHaveLength(1);
  });

  it('verifiedOnly filters to trips created by a Guide or Organizer, not a plain Tourist', async () => {
    const tourist = await registerAndLogin('verified-tourist');
    const organizer = await registerAndLogin('verified-organizer');
    const marker = `VerifiedFilter${runId}`;
    const touristTrip = await createTrip(tourist.token, { name: `${marker} tourist` });

    // Role is server-controlled (docs/REMEDIATION.md §2.6) — every fresh
    // registration starts TOURIST, and there is no self-service escalation
    // to test against. Promoting directly via the DB is the same thing an
    // admin action would do, without needing an admin-auth test harness
    // this test doesn't otherwise need. This filter reads the creator's
    // *current* role, not a snapshot from when the trip was made — so this
    // uses a second, separately-promoted user rather than promoting
    // `tourist` mid-test, which would flip touristTrip "verified" too.
    await prisma.user.update({ where: { id: organizer.userId }, data: { role: 'ORGANIZER' } });
    const organizerTrip = await createTrip(organizer.token, { name: `${marker} organizer` });

    const res = await request(app).get(`/api/v1/trips?search=${marker}&verifiedOnly=true`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(organizerTrip);
    expect(ids).not.toContain(touristTrip);
  });

  it('search matches the meeting point and creator name, not just the trip name', async () => {
    const organizer = await registerAndLogin('search-fields');
    const marker = `SearchFields${runId}`;
    const byMeetingPoint = await createTrip(organizer.token, { meetingPoint: `${marker} Station` });

    const res = await request(app).get(`/api/v1/trips?search=${marker}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(byMeetingPoint);
  });

  it('search matches a substring of a city name, not just an exact element (Prisma `has` regression guard)', async () => {
    const organizer = await registerAndLogin('city-substring');
    const cityMarker = `Zubaipur${runId}`;
    const withCity = await createTrip(organizer.token, { cities: [cityMarker, 'Agra'] });

    // A prefix, not the full city string — `cities: { has: search } }`
    // (Postgres array exact-element match) would find nothing here.
    const substring = cityMarker.slice(0, 8);
    const res = await request(app).get(`/api/v1/trips?search=${substring}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(withCity);
  });
});
