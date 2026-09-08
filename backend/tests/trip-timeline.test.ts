import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for the trip route timeline and packing checklist —
 * the create screen's Timeline and Checklist tabs.
 *
 * Both tabs used to be pure local component state that was discarded on
 * submit: there was no column to store a stop's stay length, transit leg or
 * activities, and nothing in the create payload carried them. A traveller
 * deciding whether to join saw a flat list of city names and nothing else.
 *
 * These pin the three things that has to keep doing:
 *   1. a trip can be created with its full timeline and checklist,
 *   2. an ANONYMOUS caller can read both back (the whole point is that it is
 *      visible before you commit to joining), and
 *   3. the map route carries the same detail, with day numbers derived from
 *      the stays rather than each client re-deriving them.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];

let organizerSeq = 0;

async function registerOrganizer(): Promise<string> {
  organizerSeq += 1;
  const email = `timeline-${runId}-${organizerSeq}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Timeline Organizer', email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

const TIMELINE = [
  {
    city: 'Leh',
    stayDays: 3,
    transitTimeMinutes: null,
    transitMode: null,
    activities: 'Acclimatise, Shanti Stupa',
    latitude: 34.1526,
    longitude: 77.5771,
  },
  {
    city: 'Nubra',
    stayDays: 2,
    transitTimeMinutes: 300,
    transitMode: 'CAB',
    activities: 'Khardung La pass, Hunder dunes',
    latitude: 34.687,
    longitude: 77.5619,
  },
  {
    city: 'Pangong',
    stayDays: 2,
    transitTimeMinutes: 390,
    transitMode: 'CAB',
    activities: 'Lakeside camp',
    latitude: 33.75,
    longitude: 78.6667,
  },
];

const CHECKLIST = ['Thermal layers', 'Sunscreen SPF50', 'Diamox for altitude'];

async function createTripWithTimeline(token: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Timeline Trip ${runId}`,
      description: 'Nine days across the high passes.',
      cities: ['Leh', 'Nubra', 'Pangong'],
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 39 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 42000,
      totalSeats: 8,
      meetingPoint: 'Leh Airport',
      privacy: 'PUBLIC',
      timeline: TIMELINE,
      checklist: CHECKLIST,
      ...overrides,
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

describe('trip timeline and checklist', () => {
  it('rejects a client-supplied trip id instead of trusting it', async () => {
    // The create screen used to send `trip-${Date.now()}`. Ids are
    // database-generated (CONVENTIONS.md §5); an `id` in the body is simply
    // not part of the schema, so it is ignored rather than honoured.
    const token = await registerOrganizer();
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'trip-1757312345678',
        name: `Ignores Client Id ${runId}`,
        cities: ['Delhi', 'Agra'],
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString(),
        budget: 5000,
        totalSeats: 4,
        meetingPoint: 'Delhi',
        privacy: 'PUBLIC',
      });
    expect(res.status).toBe(201);
    createdTripIds.push(res.body.data.id);
    expect(res.body.data.id).not.toBe('trip-1757312345678');
    // A real UUID, not the string the client made up.
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores the timeline and checklist, and serves both to an anonymous caller', async () => {
    const token = await registerOrganizer();
    const tripId = await createTripWithTimeline(token);

    // No Authorization header: this is the prospective joiner's view.
    const res = await request(app).get(`/api/v1/trips/${tripId}`);
    expect(res.status).toBe(200);

    expect(res.body.data.description).toBe('Nine days across the high passes.');
    expect(res.body.data.timeline).toHaveLength(3);
    expect(res.body.data.checklist.map((c: { label: string }) => c.label)).toEqual(CHECKLIST);

    const [leh, nubra, pangong] = res.body.data.timeline;
    expect(leh).toMatchObject({ order: 0, city: 'Leh', stayDays: 3, activities: 'Acclimatise, Shanti Stupa' });
    expect(nubra).toMatchObject({ order: 1, city: 'Nubra', transitTimeMinutes: 300, transitMode: 'CAB' });
    expect(pangong).toMatchObject({ order: 2, city: 'Pangong', transitTimeMinutes: 390 });
  });

  it('never records a transit leg for the first stop', async () => {
    const token = await registerOrganizer();
    // A client that wrongly sends transit on stop 0 must not have it stored:
    // nothing precedes the first stop, so there is no leg to describe.
    const tripId = await createTripWithTimeline(token, {
      timeline: [{ ...TIMELINE[0], transitTimeMinutes: 120, transitMode: 'TRAIN' }, TIMELINE[1]],
    });

    const res = await request(app).get(`/api/v1/trips/${tripId}`);
    expect(res.body.data.timeline[0].transitTimeMinutes).toBeNull();
    expect(res.body.data.timeline[0].transitMode).toBeNull();
    // The second stop keeps its leg.
    expect(res.body.data.timeline[1].transitMode).toBe('CAB');
  });

  it('serves the same detail on the public map route, with derived day numbers', async () => {
    const token = await registerOrganizer();
    const tripId = await createTripWithTimeline(token);

    const res = await request(app).get(`/api/v1/map/trips/${tripId}/route`);
    expect(res.status).toBe(200);
    expect(res.body.data.hasTimeline).toBe(true);
    expect(res.body.data.unplacedCities).toBe(0);

    // Day 1 is arrival at the first stop; each stay pushes the next out.
    // 3 nights at Leh -> days 1-3, 2 at Nubra -> 4-5, 2 at Pangong -> 6-7.
    const [leh, nubra, pangong] = res.body.data.points;
    expect(leh).toMatchObject({ name: 'Leh', arrivalDay: 1, departureDay: 3 });
    expect(nubra).toMatchObject({ name: 'Nubra', arrivalDay: 4, departureDay: 5, transitMode: 'CAB' });
    expect(pangong).toMatchObject({ name: 'Pangong', arrivalDay: 6, departureDay: 7 });
  });

  it('keeps a trip with no timeline working, without inventing stop detail', async () => {
    const token = await registerOrganizer();
    const tripId = await createTripWithTimeline(token, { timeline: undefined, checklist: undefined });

    const detail = await request(app).get(`/api/v1/trips/${tripId}`);
    expect(detail.body.data.timeline).toEqual([]);
    expect(detail.body.data.checklist).toEqual([]);

    // The map still plots the plain city list, and says it has no timeline
    // rather than fabricating stays and transit legs for it.
    const route = await request(app).get(`/api/v1/map/trips/${tripId}/route`);
    expect(route.body.data.hasTimeline).toBe(false);
    expect(route.body.data.points.length).toBeGreaterThan(0);
    expect(route.body.data.points[0].stayDays).toBeNull();
    expect(route.body.data.points[0].arrivalDay).toBeNull();
  });
});
