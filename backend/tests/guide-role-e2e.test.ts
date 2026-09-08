import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * End-to-end walk of the Travel Guide role view (src/app/travel-guide.tsx),
 * in the order the screen actually calls things: land as a plain tourist,
 * apply, then drive every dashboard tool and check both that it persists and
 * that the traveller-facing side sees the right thing.
 */

const runId = Date.now();
const emails: string[] = [];
let seq = 0;

async function registerUser(label: string): Promise<{ token: string; userId: string; email: string }> {
  seq += 1;
  const email = `guide-e2e-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id, email };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let guideToken: string;
let guideUserId: string;
let otherToken: string;
let guideProfileId: string;

beforeAll(async () => {
  ({ token: guideToken, userId: guideUserId } = await registerUser('Guide Applicant'));
  ({ token: otherToken } = await registerUser('Unrelated User'));
});

afterAll(async () => {
  // Trip.creatorId is RESTRICT, so the trips these users created have to go
  // before the users themselves.
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('guide onboarding', () => {
  it('reports no profile before applying, so the screen can show the apply form', async () => {
    const res = await request(app).get('/api/v1/guides/profile').set(auth(guideToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GUIDE_PROFILE_NOT_FOUND');
  });

  it('creates the profile as PENDING — applying must not confer verified status', async () => {
    const res = await request(app)
      .post('/api/v1/guides/profile')
      .set(auth(guideToken))
      .send({
        licenseNumber: `GID-${runId}`,
        experienceYears: 3,
        expertisePlaces: ['Leh', 'Manali'],
        languagesSpoken: ['Hindi', 'English'],
        hourlyRate: 350,
        dailyRate: 2500,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.verifiedStatus).toBe('PENDING');
    guideProfileId = res.body.data.id;
  });

  it('rejects a second application instead of silently creating a duplicate', async () => {
    const res = await request(app)
      .post('/api/v1/guides/profile')
      .set(auth(guideToken))
      .send({
        licenseNumber: `GID-${runId}-dup`,
        experienceYears: 1,
        expertisePlaces: ['Goa'],
        languagesSpoken: ['English'],
        hourlyRate: 100,
        dailyRate: 800,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GUIDE_PROFILE_EXISTS');
  });

  it('rejects a device-local licence photo path', async () => {
    const { token } = await registerUser('Bad Photo Guide');
    const res = await request(app)
      .post('/api/v1/guides/profile')
      .set(auth(token))
      .send({
        licenseNumber: `GID-${runId}-file`,
        licensePhotoUrl: 'file:///data/user/0/com.travelstar.app/cache/licence.jpg',
        experienceYears: 1,
        expertisePlaces: ['Goa'],
        languagesSpoken: ['English'],
        hourlyRate: 100,
        dailyRate: 800,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('guide dashboard reads', () => {
  it('serves every panel the screen fetches on mount', async () => {
    for (const path of ['earnings', 'packages', 'reels', 'live-status', 'leads']) {
      const res = await request(app).get(`/api/v1/guides/${guideProfileId}/${path}`).set(auth(guideToken));
      expect([path, res.status]).toEqual([path, 200]);
    }
  });

  it('reports a brand-new guide as genuinely empty rather than inventing activity', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`).set(auth(guideToken));
    expect(res.status).toBe(200);
    expect(res.body.data.walletBalance).toBe('0');
    expect(res.body.data.totalEarnings).toBe(0);
    expect(res.body.data.completedTripsCount).toBe(0);
    expect(res.body.data.hasActivity).toBe(false);
    expect(res.body.data.chartData).toHaveLength(7);
    expect(res.body.data.chartData.every((d: { amt: number }) => d.amt === 0)).toBe(true);
  });
});

describe('package CRUD survives a round trip', () => {
  let packageId: string;

  it('creates', async () => {
    const res = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/packages`)
      .set(auth(guideToken))
      .send({ title: 'Spiti 5D', description: 'High passes', price: 18000, durationDays: 5, citiesIncluded: ['Kaza'] });
    expect(res.status).toBe(201);
    packageId = res.body.data.id;
  });

  it('lists what was created', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/packages`).set(auth(guideToken));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Spiti 5D');
  });

  it('updates in place', async () => {
    const res = await request(app)
      .put(`/api/v1/guides/${guideProfileId}/packages/${packageId}`)
      .set(auth(guideToken))
      .send({ title: 'Spiti 6D', durationDays: 6 });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Spiti 6D');
    expect(res.body.data.durationDays).toBe(6);
  });

  it('deletes', async () => {
    const del = await request(app)
      .delete(`/api/v1/guides/${guideProfileId}/packages/${packageId}`)
      .set(auth(guideToken));
    expect(del.status).toBe(200);
    const list = await request(app).get(`/api/v1/guides/${guideProfileId}/packages`).set(auth(guideToken));
    expect(list.body.data).toHaveLength(0);
  });
});

describe('live location broadcast', () => {
  it('stores and reads back the guide pin', async () => {
    const post = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/live-status`)
      .set(auth(guideToken))
      .send({ latitude: 32.2432, longitude: 77.1892 });
    expect(post.status).toBe(200);

    const get = await request(app).get(`/api/v1/guides/${guideProfileId}/live-status`).set(auth(guideToken));
    expect(get.body.data.location.latitude).toBeCloseTo(32.2432, 4);
    expect(get.body.data.activeGuiding).toBeNull();
  });

  it('refuses a pin that is not a place on Earth', async () => {
    const res = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/live-status`)
      .set(auth(guideToken))
      .send({ latitude: 999, longitude: 'north' });
    expect(res.status).toBe(400);
  });
});

describe('authorisation', () => {
  it('stops another user creating packages on my profile', async () => {
    const res = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/packages`)
      .set(auth(otherToken))
      .send({ title: 'HIJACK', price: 1, durationDays: 1 });
    expect(res.status).toBe(403);
  });

  it('stops another user spoofing my GPS pin', async () => {
    const res = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/live-status`)
      .set(auth(otherToken))
      .send({ latitude: 0, longitude: 0 });
    expect(res.status).toBe(403);
  });

  it('stops another user reading my earnings', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`).set(auth(otherToken));
    expect(res.status).toBe(403);
  });

  it('stops another user reading my leads', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/leads`).set(auth(otherToken));
    expect(res.status).toBe(403);
  });

  it('stops a non-admin reaching the verification queue', async () => {
    const res = await request(app).get('/api/v1/guides/pending').set(auth(otherToken));
    expect(res.status).toBe(403);
  });

  it('stops a non-admin verifying their own profile', async () => {
    const res = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/verify`)
      .set(auth(guideToken))
      .send({ decision: 'VERIFIED' });
    expect(res.status).toBe(403);
  });

  it('requires a session for the private panels', async () => {
    expect((await request(app).get('/api/v1/guides/profile')).status).toBe(401);
    expect((await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`)).status).toBe(401);
  });
});

describe('what the traveller side sees', () => {
  it('lists the new guide publicly', async () => {
    const res = await request(app).get('/api/v1/guides');
    expect(res.status).toBe(200);
    const row = res.body.data.find((g: { id: string }) => g.id === guideProfileId);
    expect(row).toBeDefined();
  });

  it('does not present an unverified guide as verified', async () => {
    // The applicant above is PENDING. Whatever the public row says about
    // trust must not contradict that — a traveller picks a guide on it.
    const res = await request(app).get('/api/v1/guides');
    const row = res.body.data.find((g: { id: string }) => g.id === guideProfileId);
    expect(row.name).not.toMatch(/verified/i);
    expect(row.verifiedStatus).toBe('PENDING');
  });

  it('does not invent a rating for a guide nobody has rated', async () => {
    const res = await request(app).get('/api/v1/guides');
    const row = res.body.data.find((g: { id: string }) => g.id === guideProfileId);
    expect(row.rating).toBeNull();
  });
});

describe('leads', () => {
  it('does not leak a stock photo as a real traveller face', async () => {
    // A lead row is a real person's identity shown to a guide. When they
    // have no avatar, the honest answer is "no avatar", not a stranger's
    // photograph from Unsplash.
    const organizer = await registerUser('Lead Organizer');
    const applicant = await registerUser('Lead Applicant');

    const trip = await request(app)
      .post('/api/v1/trips')
      .set(auth(organizer.token))
      .send({
        name: `Leads Trip ${runId}`,
        cities: ['Leh'],
        startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
        endDate: new Date(Date.now() + 34 * 864e5).toISOString(),
        budget: 20000,
        totalSeats: 4,
        meetingPoint: 'Leh',
        privacy: 'PUBLIC',
      });
    expect(trip.status).toBe(201);

    await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(applicant.token))
      .send({ tripId: trip.body.data.id, message: 'Keen to join' });

    const leads = await request(app).get(`/api/v1/guides/${guideProfileId}/leads`).set(auth(guideToken));
    expect(leads.status).toBe(200);
    const lead = leads.body.data.find((l: { tripId: string }) => l.tripId === trip.body.data.id);
    expect(lead).toBeDefined();
    expect(lead.avatar).not.toMatch(/unsplash/i);
  });
});

describe('sending a quote on a lead', () => {
  it('has an endpoint that records the quote and notifies the traveller', async () => {
    // travel-guide.tsx tells the guide "your bid has been sent to the
    // traveller, they will be notified immediately". Nothing is sent: there
    // is no quote route, no stored bid, and the traveller receives nothing.
    const routes = await request(app)
      .post(`/api/v1/guides/${guideProfileId}/quotes`)
      .set(auth(guideToken))
      .send({ leadId: '00000000-0000-0000-0000-000000000000', amount: 5000 });
    expect(routes.status).not.toBe(404);
  });
});
