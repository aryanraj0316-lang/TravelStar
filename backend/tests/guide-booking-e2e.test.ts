import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * The traveller -> guide booking chain, end to end.
 *
 * Every route here already existed; nothing on the client called any of
 * them, so no Booking row carrying a guideProfileId could be created and a
 * guide's earnings were zero by construction rather than because they were
 * new. This walks the whole path and asserts the earnings panel actually
 * moves, which is the only real proof the loop is closed.
 */

const runId = Date.now();
const emails: string[] = [];
let seq = 0;

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `booking-e2e-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const futureDate = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

let guide: { token: string; userId: string };
let traveller: { token: string; userId: string };
let outsider: { token: string; userId: string };
let guideProfileId: string;
let packageId: string;
let bookingId: string;

beforeAll(async () => {
  guide = await registerUser('Booking Guide');
  traveller = await registerUser('Booking Traveller');
  outsider = await registerUser('Booking Outsider');

  const profile = await request(app)
    .post('/api/v1/guides/profile')
    .set(auth(guide.token))
    .send({
      licenseNumber: `BOOK-${runId}`,
      experienceYears: 5,
      expertisePlaces: ['Jaipur'],
      languagesSpoken: ['Hindi'],
      hourlyRate: 400,
      dailyRate: 3000,
    });
  expect(profile.status).toBe(201);
  guideProfileId = profile.body.data.id;

  const pkg = await request(app)
    .post(`/api/v1/guides/${guideProfileId}/packages`)
    .set(auth(guide.token))
    .send({ title: 'Jaipur heritage day', description: 'Forts', price: 4500, durationDays: 1, citiesIncluded: ['Jaipur'] });
  expect(pkg.status).toBe(201);
  packageId = pkg.body.data.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  // Booking.userId is RESTRICT, as is Trip.creatorId, so both have to go
  // before the users that own them.
  await prisma.booking.deleteMany({ where: { userId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('a traveller can find and book a guide', () => {
  it('sees the guide on the public list without signing in', async () => {
    const res = await request(app).get('/api/v1/guides');
    expect(res.status).toBe(200);
    const row = res.body.data.find((g: { id: string }) => g.id === guideProfileId);
    expect(row).toBeDefined();
    expect(row.dailyRate).toBe('3000');
    expect(row.verifiedStatus).toBe('PENDING');
    expect(row.rating).toBeNull();
  });

  it('sees the guide packages without signing in', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/packages`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Jaipur heritage day');
  });

  it('creates a booking priced from the package, not from the request body', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(traveller.token))
      .send({ packageId, travelDate: futureDate(10), amount: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe('4500');
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.paymentStatus).toBe('PENDING');
    bookingId = res.body.data.id;
  });

  it('refuses a travel date in the past', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(traveller.token))
      .send({ packageId, travelDate: futureDate(-3) });
    expect(res.status).toBe(400);
  });

  it('stops a guide booking their own package', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(guide.token))
      .send({ packageId, travelDate: futureDate(10) });
    expect(res.status).toBe(400);
  });

  it('notifies the guide that a request arrived', async () => {
    const res = await request(app).get('/api/v1/notifications').set(auth(guide.token));
    expect(res.status).toBe(200);
    expect((res.body.data as { title: string }[]).some((n) => n.title === 'New booking request')).toBe(true);
  });

  it('shows up in the guide inbox and the traveller list', async () => {
    const incoming = await request(app).get('/api/v1/bookings/incoming').set(auth(guide.token));
    expect(incoming.status).toBe(200);
    expect(incoming.body.data).toHaveLength(1);
    expect(incoming.body.data[0].travellerAvatar).toBeNull();

    const mine = await request(app).get('/api/v1/bookings/mine').set(auth(traveller.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].id).toBe(bookingId);
  });

  it('keeps the inbox private to the guide who owns the profile', async () => {
    const res = await request(app).get('/api/v1/bookings/incoming').set(auth(outsider.token));
    expect(res.status).toBe(404);
  });
});

describe('booking status transitions', () => {
  it('will not let the traveller confirm their own booking', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/status`)
      .set(auth(traveller.token))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('will not let an unrelated user touch it', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/status`)
      .set(auth(outsider.token))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(403);
  });

  it('lets the guide confirm, and tells the traveller', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/status`)
      .set(auth(guide.token))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);

    const feed = await request(app).get('/api/v1/notifications').set(auth(traveller.token));
    expect((feed.body.data as { title: string }[]).some((n) => n.title === 'Booking confirmed 🎉')).toBe(true);
  });

  it('refuses to complete a booking that was never confirmed', async () => {
    const second = await request(app)
      .post('/api/v1/bookings')
      .set(auth(traveller.token))
      .send({ packageId, travelDate: futureDate(20) });
    expect(second.status).toBe(201);

    const res = await request(app)
      .post(`/api/v1/bookings/${second.body.data.id}/status`)
      .set(auth(guide.token))
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });
});

describe('earnings stop being zero by construction', () => {
  it('counts the confirmed booking', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`).set(auth(guide.token));
    expect(res.status).toBe(200);
    // Money as a string, like walletBalance beside it.
    expect(res.body.data.totalEarnings).toBe('4500.00');
    expect(res.body.data.hasActivity).toBe(true);
    const charted = (res.body.data.chartData as { amt: number }[]).reduce((sum, d) => sum + d.amt, 0);
    expect(charted).toBe(4500);
  });

  it('counts a completed trip once the guide marks it delivered', async () => {
    const done = await request(app)
      .post(`/api/v1/bookings/${bookingId}/status`)
      .set(auth(guide.token))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);

    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`).set(auth(guide.token));
    expect(res.body.data.completedTripsCount).toBe(1);
  });

  it('still refuses to show those earnings to anyone else', async () => {
    const res = await request(app).get(`/api/v1/guides/${guideProfileId}/earnings`).set(auth(outsider.token));
    expect(res.status).toBe(403);
  });
});
