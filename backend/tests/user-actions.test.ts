import http from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { createSocketServer } from '../src/socket-server';
import { uniqueTestPhone } from './test-phone';
import { travellers } from './traveller-details-fixture';
import { TEST_ORGANIZER_AGREEMENT } from './organizer-agreement-fixture';

// Twenty things real users deliberately do in the app that break it. Each
// test states what SHOULD happen; a failing test is a bug users will hit.

const runId = Date.now();
let seq = 0;
const emails: string[] = [];
const guideProfileIds: string[] = [];
const storyIds: string[] = [];
const PASSWORD = 'correcthorsebattery';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const next = () => `${runId}-${++seq}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

type User = { token: string; userId: string; name: string };

async function registerUser(name: string): Promise<User> {
  const email = `actions-${next()}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email, phoneNumber: uniqueTestPhone(), password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token, userId: res.body.data.user.id, name };
}

async function makeTrip(creatorId: string, extra: Partial<{ cities: string[]; privacy: string; name: string; budget: number }> = {}) {
  return prisma.trip.create({
    data: {
      creatorId,
      name: extra.name ?? `Actions Trip ${next()}`,
      description: 'test',
      cities: extra.cities ?? ['Rishikesh', 'Auli'],
      startDate: new Date(Date.now() + 30 * DAY),
      endDate: new Date(Date.now() + 33 * DAY),
      durationDays: 3,
      budget: extra.budget ?? 2000,
      totalSeats: 6,
      availableSeats: 6,
      meetingPoint: 'Rishikesh Bus Stand',
      privacy: extra.privacy ?? 'PUBLIC',
    },
  });
}

/** Books and pays (development bypass) — a paid booking awaiting allocation. */
async function bookAndPay(t: User, tripId: string) {
  const booked = await request(app)
    .post('/api/v1/interactions/join-request')
    .set(auth(t.token))
    .send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
  expect(booked.status).toBeLessThan(300);
  const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: booked.body.data.id });
  expect(paid.status).toBe(200);
  return { joinRequestId: booked.body.data.id as string, token: paid.body.data.verificationToken as string };
}

async function makeGuide(name: string) {
  const u = await registerUser(name);
  const res = await request(app)
    .post('/api/v1/guides/profile')
    .set(auth(u.token))
    .send({
      licenseNumber: `LIC-ACT-${next()}`,
      experienceYears: 5,
      expertisePlaces: ['Rishikesh'],
      languagesSpoken: ['Hindi'],
      hourlyRate: 500,
      dailyRate: 3000,
      availability: {},
    });
  expect(res.status).toBeLessThan(300);
  guideProfileIds.push(res.body.data.id);
  return { ...u, guideProfileId: res.body.data.id as string };
}

function hire(organizer: User, guideProfileId: string, startInDays: number) {
  return request(app)
    .post('/api/v1/bookings/hire')
    .set(auth(organizer.token))
    .send({
      guideProfileId,
      scope: 'CUSTOM_DATES',
      startDate: new Date(Date.now() + startInDays * DAY).toISOString(),
      endDate: new Date(Date.now() + (startInDays + 2) * DAY).toISOString(),
      amount: 3000,
    });
}

// ── Sockets ────────────────────────────────────────────────────────────────
let httpServer: http.Server;
let port: number;

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function joinRoom(s: ClientSocket, roomId: string): Promise<boolean> {
  return new Promise((resolve) => s.emit('joinRoom', roomId, (ok: boolean) => resolve(ok)));
}

function gotEvent(s: ClientSocket, event: string, ms = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    s.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function openDm(a: User, b: User): Promise<string> {
  const res = await request(app).post('/api/v1/chats/dm').set(auth(a.token)).send({ userId: b.userId });
  expect(res.status).toBeLessThan(300);
  return res.body.data.chatRoomId as string;
}

beforeAll(async () => {
  httpServer = http.createServer(app);
  createSocketServer(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => httpServer.close(() => r()));
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.travelStory.deleteMany({ where: { id: { in: storyIds } } });
  await prisma.booking.deleteMany({ where: { guideProfileId: { in: guideProfileIds } } });
  await prisma.chatRoom.deleteMany({ where: { OR: [{ dmUserAId: { in: ids } }, { dmUserBId: { in: ids } }] } });
  await prisma.tripPaymentOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: guideProfileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('Deliberate user actions that break the app', () => {
  // ── Accounts & profile ──────────────────────────────────────────────────
  it('1. double-tapping "Sign up" does not show an error for an account that was created', async () => {
    const email = `actions-double-${next()}@travelstar.test`;
    emails.push(email);
    const body = { name: 'Double Tap', email, phoneNumber: uniqueTestPhone(), password: PASSWORD };
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/register').send(body),
      request(app).post('/api/v1/auth/register').send(body),
    ]);
    // One account; the other tap is told it already exists — never a 500.
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  }, 60_000);

  it('2. a user cannot take over someone else\'s phone number without verifying it', async () => {
    const squatter = await registerUser('Number Squatter');
    const realOwnerNumber = uniqueTestPhone();
    const change = await request(app).put('/api/v1/auth/profile').set(auth(squatter.token)).send({ phoneNumber: realOwnerNumber });
    const email = `actions-owner-${next()}@travelstar.test`;
    emails.push(email);
    const owner = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Real Owner', email, phoneNumber: realOwnerNumber, password: PASSWORD });
    // Either the unverified change is refused, or the real owner can still sign up.
    expect(change.status >= 400 || owner.status === 201).toBe(true);
  }, 60_000);

  it('3. typing words instead of a number as the SOS emergency contact is refused', async () => {
    const u = await registerUser('Lazy Contact');
    const res = await request(app).put('/api/v1/auth/profile').set(auth(u.token)).send({ emergencyContact: 'call mom' });
    expect(res.status).toBe(400);
  }, 60_000);

  // ── Booking forms ───────────────────────────────────────────────────────
  it('4. giving your own number as your emergency contact is refused', async () => {
    const organizer = await registerUser('Org Four');
    const trip = await makeTrip(organizer.userId);
    const t = await registerUser('Own Number');
    const details = travellers(1);
    details[0] = { ...details[0]!, emergencyContactPhone: details[0]!.phone };
    const res = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId: trip.id, acceptedTerms: true, travellerDetails: details });
    expect(res.status).toBe(400);
  }, 60_000);

  it('5. copy-pasting the same ID number for every family member is refused', async () => {
    const organizer = await registerUser('Org Five');
    const trip = await makeTrip(organizer.userId);
    const t = await registerUser('Copy Paste');
    const details = travellers(3).map((d) => ({ ...d, idType: 'AADHAAR', idNumber: '1234 5678 9012' }));
    const res = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId: trip.id, acceptedTerms: true, familyMemberCount: 2, travellerDetails: details });
    expect(res.status).toBe(400);
  }, 60_000);

  it('6. a midway traveller can join the return leg of a round trip (Delhi → Agra → Delhi)', async () => {
    const organizer = await registerUser('Org Six');
    const trip = await makeTrip(organizer.userId, { cities: ['Delhi', 'Agra', 'Delhi'] });
    const t = await registerUser('Return Leg');
    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/midway-join`)
      .set(auth(t.token))
      .send({ fromCity: 'Agra', toCity: 'Delhi' });
    expect(res.status).toBe(200);
  }, 60_000);

  // ── Trips (organizer) ───────────────────────────────────────────────────
  it('7. a "Private" trip is not listed publicly and strangers cannot book it', async () => {
    const organizer = await registerUser('Org Seven');
    const name = `Family Only ${next()}`;
    const trip = await makeTrip(organizer.userId, { privacy: 'PRIVATE', name });
    const stranger = await registerUser('Stranger');
    const list = await request(app).get('/api/v1/trips').query({ search: name }).set(auth(stranger.token));
    const items: { id: string }[] = Array.isArray(list.body.data) ? list.body.data : (list.body.data?.items ?? list.body.data?.trips ?? []);
    const booked = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(stranger.token))
      .send({ tripId: trip.id, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(items.some((i) => i.id === trip.id)).toBe(false);
    expect(booked.status).toBeGreaterThanOrEqual(400);
  }, 60_000);

  it('8. typing a price with too many zeros gives a clear error, not a crash', async () => {
    const organizer = await registerUser('Org Eight');
    const res = await request(app)
      .post('/api/v1/trips')
      .set(auth(organizer.token))
      .send({
        organizerAgreement: TEST_ORGANIZER_AGREEMENT,
        name: `Zeros ${next()}`,
        cities: ['Goa', 'Gokarna'],
        startDate: new Date(Date.now() + 20 * DAY).toISOString(),
        endDate: new Date(Date.now() + 23 * DAY).toISOString(),
        budget: 99_999_999_999,
        totalSeats: 10,
        meetingPoint: 'Panjim',
      });
    expect(res.status).toBe(400);
  }, 60_000);

  it('9. the organizer cannot give the same bus seat to two travellers', async () => {
    const organizer = await registerUser('Org Nine');
    const trip = await makeTrip(organizer.userId);
    const allocate = (joinRequestId: string, token: string) =>
      request(app)
        .post(`/api/v1/trips/${trip.id}/approve-and-allocate`)
        .set(auth(organizer.token))
        .send({
          joinRequestId,
          verificationToken: token,
          allocations: [{ dayNumber: 1, checkpointName: 'Rishikesh', hotelName: 'Ganga View', roomNumber: '12', vehicleNumber: 'UK-07-1234', seatNumber: '5' }],
        });
    const a = await bookAndPay(await registerUser('Seat A'), trip.id);
    const b = await bookAndPay(await registerUser('Seat B'), trip.id);
    expect((await allocate(a.joinRequestId, a.token)).status).toBe(200);
    expect((await allocate(b.joinRequestId, b.token)).status).toBe(409);
  }, 120_000);

  it('10. paid travellers awaiting their seat still get the organizer\'s announcements', async () => {
    const organizer = await registerUser('Org Ten');
    const trip = await makeTrip(organizer.userId);
    const t = await registerUser('Paid Waiting');
    await bookAndPay(t, trip.id);
    const title = `Meeting point moved ${next()}`;
    const res = await request(app)
      .post(`/api/v1/trips/${trip.id}/announcements`)
      .set(auth(organizer.token))
      .send({ title, content: 'We now meet at Laxman Jhula at 6 am.' });
    expect(res.status).toBe(201);
    const got = await prisma.notification.findFirst({ where: { userId: t.userId, title } });
    expect(got).not.toBeNull();
  }, 120_000);

  // ── Guides ──────────────────────────────────────────────────────────────
  it('11. a guide cannot accept two hires for the same dates', async () => {
    const guide = await makeGuide('Busy Guide');
    const o1 = await registerUser('Hirer One');
    const o2 = await registerUser('Hirer Two');
    const h1 = await hire(o1, guide.guideProfileId, 40);
    const h2 = await hire(o2, guide.guideProfileId, 40);
    expect(h1.status).toBe(201);
    expect(h2.status).toBe(201);
    const c1 = await request(app).post(`/api/v1/bookings/${h1.body.data.id}/status`).set(auth(guide.token)).send({ status: 'CONFIRMED' });
    const c2 = await request(app).post(`/api/v1/bookings/${h2.body.data.id}/status`).set(auth(guide.token)).send({ status: 'CONFIRMED' });
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(409);
  }, 120_000);

  it('12. hiring a guide for dates that have already passed is refused', async () => {
    const guide = await makeGuide('Past Guide');
    const o = await registerUser('Past Hirer');
    const res = await hire(o, guide.guideProfileId, -5);
    expect(res.status).toBe(400);
  }, 60_000);

  it('13. double-tapping "Hire" does not send the guide two identical requests', async () => {
    const guide = await makeGuide('Twice Guide');
    const o = await registerUser('Twice Hirer');
    const first = await hire(o, guide.guideProfileId, 50);
    const second = await hire(o, guide.guideProfileId, 50);
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  }, 60_000);

  // ── Likes ───────────────────────────────────────────────────────────────
  it('14. double-tapping the heart on a trip never errors', async () => {
    const organizer = await registerUser('Org Fourteen');
    const trip = await makeTrip(organizer.userId);
    const u = await registerUser('Heart Tapper');
    const taps = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post('/api/v1/interactions/like').set(auth(u.token)).send({ tripId: trip.id })),
    );
    expect(taps.every((r) => r.status < 500)).toBe(true);
  }, 60_000);

  it('15. double-tapping like on a story never errors', async () => {
    const author = await registerUser('Story Author');
    const story = await prisma.travelStory.create({
      data: { userId: author.userId, authorName: author.name, title: 'Sunrise', content: 'Kunjapuri sunrise', location: 'Rishikesh' },
    });
    storyIds.push(story.id);
    const u = await registerUser('Story Tapper');
    const taps = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post(`/api/v1/stories/${story.id}/like`).set(auth(u.token))),
    );
    expect(taps.every((r) => r.status < 500)).toBe(true);
  }, 60_000);

  // ── Safety ──────────────────────────────────────────────────────────────
  it('16. an SOS always shows the real sender\'s name, not one typed by the sender', async () => {
    const u = await registerUser('Real Sender');
    const res = await request(app)
      .post('/api/v1/safety/sos')
      .set(auth(u.token))
      .send({ latitude: 30.0869, longitude: 78.2676, userName: 'Trip Organizer' });
    expect(res.status).toBe(201);
    expect(res.body.data.userName).toBe('Real Sender');
  }, 60_000);

  // ── Chat ────────────────────────────────────────────────────────────────
  it('17. deleting a direct chat on your phone does not delete it for the other person', async () => {
    const a = await registerUser('Deleter');
    const b = await registerUser('Other Person');
    const room = await openDm(a, b);
    await prisma.message.create({ data: { chatRoomId: room, senderId: b.userId, content: 'See you at the station!' } });
    expect((await request(app).delete(`/api/v1/chats/${room}`).set(auth(a.token))).status).toBe(200);
    const theirs = await request(app).get(`/api/v1/chats/${room}/messages`).set(auth(b.token));
    expect(theirs.status).toBe(200);
  }, 60_000);

  it('18. pasting a very long message tells the sender it was not sent', async () => {
    const a = await registerUser('Long Paster');
    const b = await registerUser('Long Reader');
    const room = await openDm(a, b);
    const s = await connect(a.token);
    try {
      expect(await joinRoom(s, room)).toBe(true);
      const errored = gotEvent(s, 'sendMessageError');
      s.emit('sendMessage', { chatRoomId: room, content: 'x'.repeat(5000) });
      expect(await errored).toBe(true);
    } finally {
      s.disconnect();
    }
  }, 60_000);

  it('19. sending a blank (spaces-only) message is not delivered', async () => {
    const a = await registerUser('Blank Sender');
    const b = await registerUser('Blank Reader');
    const room = await openDm(a, b);
    const s = await connect(a.token);
    try {
      expect(await joinRoom(s, room)).toBe(true);
      s.emit('sendMessage', { chatRoomId: room, content: '     ' });
      await sleep(2000);
      expect(await prisma.message.count({ where: { chatRoomId: room } })).toBe(0);
    } finally {
      s.disconnect();
    }
  }, 60_000);

  it('20. a photo message cannot point at any website the sender chooses', async () => {
    const a = await registerUser('Pixel Sender');
    const b = await registerUser('Pixel Reader');
    const room = await openDm(a, b);
    const s = await connect(a.token);
    try {
      expect(await joinRoom(s, room)).toBe(true);
      s.emit('sendMessage', { chatRoomId: room, content: '', mediaType: 'IMAGE', mediaUrl: 'http://tracker.example.com/pixel.png' });
      await sleep(2000);
      expect(await prisma.message.count({ where: { chatRoomId: room, mediaUrl: { contains: 'tracker.example.com' } } })).toBe(0);
    } finally {
      s.disconnect();
    }
  }, 60_000);
});
