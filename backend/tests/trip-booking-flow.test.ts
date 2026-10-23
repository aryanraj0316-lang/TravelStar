import crypto from 'node:crypto';
import request from 'supertest';

// Razorpay is mocked: no network, and every refund call is recorded so the
// test can assert real money would go back to the original payment.
const mockRefund = jest.fn();
const mockOrderCreate = jest.fn();
jest.mock('razorpay', () =>
  jest.fn().mockImplementation(() => ({
    orders: { create: mockOrderCreate },
    payments: { refund: mockRefund },
  })),
);

import app from '../src/app';
import prisma from '../src/services/db';
import { env } from '../src/config/env';
import { uniqueTestPhone } from './test-phone';
import { travellers } from './traveller-details-fixture';

const runId = Date.now();
let seq = 0;
const emails: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `booking-flow-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

let organizer: { token: string; userId: string };

async function makeTrip(opts: { daysAway: number; seats?: number; budget?: number }) {
  const trip = await prisma.trip.create({
    data: {
      creatorId: organizer.userId,
      name: `Booking Flow ${runId} ${opts.daysAway}d`,
      description: 'test',
      cities: ['Rishikesh', 'Auli'],
      startDate: new Date(Date.now() + opts.daysAway * 864e5),
      endDate: new Date(Date.now() + (opts.daysAway + 3) * 864e5),
      durationDays: 3,
      budget: opts.budget ?? 2000,
      totalSeats: opts.seats ?? 5,
      availableSeats: opts.seats ?? 5,
      meetingPoint: 'Rishikesh Bus Stand',
      privacy: 'PUBLIC',
    },
  });
  return trip.id;
}

async function walletBalance(userId: string) {
  return Number((await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0);
}

/** Books, pays from a funded wallet and gets allocated. */
async function confirmedWalletBooking(tripId: string, label: string) {
  const traveller = await registerUser(label);
  await prisma.wallet.upsert({ where: { userId: traveller.userId }, create: { userId: traveller.userId, balance: 5000 }, update: { balance: 5000 } });
  const booked = await request(app).post('/api/v1/interactions/join-request').set(auth(traveller.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
  const joinRequestId = booked.body.data.id as string;
  const paid = await request(app).post('/api/v1/trip-payments/wallet-pay').set(auth(traveller.token)).send({ joinRequestId });
  expect(paid.status).toBe(200);
  const allocated = await request(app)
    .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
    .set(auth(organizer.token))
    .send({
      joinRequestId,
      verificationToken: paid.body.data.verificationToken,
      allocations: [{ dayNumber: 1, checkpointName: 'Rishikesh', hotelName: 'Ganga View', roomNumber: '12', vehicleNumber: 'UK-07-TA-1234', seatNumber: '5' }],
    });
  expect(allocated.status).toBe(200);

  // The traveller's confirmation carries the token and the details they filled in.
  const confirmation = await prisma.notification.findFirst({
    where: { userId: traveller.userId, tripId, category: 'JOIN_ACCEPTED' },
    orderBy: { createdAt: 'desc' },
  });
  expect(confirmation?.content).toContain(`Booking token: ${paid.body.data.verificationToken}`);
  expect(confirmation?.content).toContain('Test Traveller, 30 yrs, Male');
  expect(confirmation?.content).toContain('ID: Passport P1234567');

  // ...and so do their booking (Trip Pass) and the organizer's allocation list.
  const mine = await request(app).get(`/api/v1/trips/${tripId}/my-booking`).set(auth(traveller.token));
  expect(mine.body.data.travellerDetails[0].fullName).toBe('Test Traveller');
  return { traveller, joinRequestId, chatRoomId: allocated.body.data.chatRoomId as string };
}

beforeAll(async () => {
  organizer = await registerUser('Flow Organizer');
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.tripPaymentOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('tiered cancellation', () => {
  it('7+ days out: refunds 95.5% and releases seat, membership, allocations and group chat', async () => {
    const tripId = await makeTrip({ daysAway: 10 });
    const { traveller, joinRequestId, chatRoomId } = await confirmedWalletBooking(tripId, 'Early Canceller');
    expect(await walletBalance(traveller.userId)).toBe(3000);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(4);

    const quote = await request(app).get(`/api/v1/trips/${tripId}/my-booking`).set(auth(traveller.token));
    expect(quote.body.data.cancellation.refundAmount).toBe('1910.00');

    const res = await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(traveller.token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REFUNDED');
    expect(res.body.data.refundAmount).toBe('1910.00');

    expect(await walletBalance(traveller.userId)).toBe(4910);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(5);
    expect(await prisma.tripMember.count({ where: { tripId, userId: traveller.userId } })).toBe(0);
    expect(await prisma.tripMemberAllocation.count({ where: { tripMember: { tripId } } })).toBe(0);
    expect(await prisma.chatRoomMember.count({ where: { chatRoomId, userId: traveller.userId } })).toBe(0);
    const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
    expect(order?.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(order?.refundedAmount)).toBe(1910);

    // Organizer keeps nothing; the platform keeps its 4.5%.
    const sums = await request(app).get('/api/v1/trips/mine/payment-summaries').set(auth(organizer.token));
    const s = sums.body.data.find((x: { tripId: string }) => x.tripId === tripId);
    expect(s.collected).toBe('90.00');
    expect(s.platformFees).toBe('90.00');
    expect(s.organizerShare).toBe('0.00');

    // Cancelling again is harmless — no second refund.
    const again = await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(traveller.token));
    expect(again.status).toBe(409);
    expect(await walletBalance(traveller.userId)).toBe(4910);
  }, 120_000);

  it('3–7 days out: refunds 50%', async () => {
    const tripId = await makeTrip({ daysAway: 5 });
    const { traveller } = await confirmedWalletBooking(tripId, 'Mid Canceller');
    const res = await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(traveller.token));
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('HALF');
    expect(res.body.data.refundAmount).toBe('1000.00');
    expect(await walletBalance(traveller.userId)).toBe(4000);
  }, 120_000);

  it('inside 72 hours: no refund, but the seat is still released', async () => {
    const tripId = await makeTrip({ daysAway: 2 });
    const { traveller, joinRequestId } = await confirmedWalletBooking(tripId, 'Late Canceller');
    const res = await request(app).delete(`/api/v1/interactions/join-request/${tripId}`).set(auth(traveller.token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.refundAmount).toBe('0.00');
    expect(await walletBalance(traveller.userId)).toBe(3000);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(5);
    expect((await prisma.joinRequest.findUnique({ where: { id: joinRequestId } }))?.status).toBe('CANCELLED');
    // The money stays collected (organizer share + platform fee).
    expect((await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } }))?.status).toBe('CAPTURED');
  }, 120_000);

  it('the traveller can book again after cancelling', async () => {
    const tripId = await makeTrip({ daysAway: 20 });
    const { traveller } = await confirmedWalletBooking(tripId, 'Rebooker');
    await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(traveller.token));
    const again = await request(app).post('/api/v1/interactions/join-request').set(auth(traveller.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(again.status).toBe(201);
    expect(again.body.data.status).toBe('PAYMENT_PENDING');
  }, 120_000);
});

describe('organizer rejection after confirmation', () => {
  it('refunds the full amount (no fee kept) and removes the member', async () => {
    const tripId = await makeTrip({ daysAway: 2 });
    const { traveller, joinRequestId } = await confirmedWalletBooking(tripId, 'Rejected Member');
    const res = await request(app)
      .post(`/api/v1/interactions/join-request/${joinRequestId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(200);
    expect(await walletBalance(traveller.userId)).toBe(5000);
    expect(await prisma.tripMember.count({ where: { tripId, userId: traveller.userId } })).toBe(0);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(5);
  }, 120_000);
});

describe('trip fills during checkout', () => {
  it('a payment that can no longer get a seat is refunded in full automatically', async () => {
    const tripId = await makeTrip({ daysAway: 15, seats: 1 });
    const a = await registerUser('Seat Winner');
    const b = await registerUser('Seat Loser');
    for (const u of [a, b]) await prisma.wallet.upsert({ where: { userId: u.userId }, create: { userId: u.userId, balance: 5000 }, update: { balance: 5000 } });
    const ja = await request(app).post('/api/v1/interactions/join-request').set(auth(a.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
    const jb = await request(app).post('/api/v1/interactions/join-request').set(auth(b.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });

    expect((await request(app).post('/api/v1/trip-payments/wallet-pay').set(auth(a.token)).send({ joinRequestId: ja.body.data.id })).status).toBe(200);
    // B is now refused before money moves (the gateway path refuses at /initiate)...
    const lost = await request(app).post('/api/v1/trip-payments/wallet-pay').set(auth(b.token)).send({ joinRequestId: jb.body.data.id });
    expect(lost.status).toBe(409);
    expect(lost.body.error.code).toBe('TRIP_FULL');
    // ...and whatever was taken came straight back.
    expect(await walletBalance(b.userId)).toBe(5000);
    expect((await prisma.joinRequest.findUnique({ where: { id: jb.body.data.id } }))?.status).toBe('REFUNDED');
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(0);
  }, 120_000);
});

describe('integrity', () => {
  it('a paid booking cannot be allocated before it is paid', async () => {
    const tripId = await makeTrip({ daysAway: 15 });
    const t = await registerUser('Unpaid');
    const booked = await request(app).post('/api/v1/interactions/join-request').set(auth(t.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
      .set(auth(organizer.token))
      .send({
        joinRequestId: booked.body.data.id,
        verificationToken: 'TST-123456',
        allocations: [{ dayNumber: 1, checkpointName: 'X', hotelName: 'H', roomNumber: '1', vehicleNumber: 'V', seatNumber: '1' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_PAID');
    expect(await prisma.tripMember.count({ where: { tripId, userId: t.userId } })).toBe(0);
  });

  it('the retired instant-join endpoint seats nobody', async () => {
    const tripId = await makeTrip({ daysAway: 15 });
    const t = await registerUser('Instant');
    const res = await request(app).post(`/api/v1/trips/${tripId}/join`).set(auth(t.token));
    expect(res.status).toBe(410);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(5);
  });
});

describe('Razorpay path (gateway mocked)', () => {
  const secret = 'test_razorpay_secret';
  beforeAll(() => {
    (env as { RAZORPAY_KEY_ID?: string }).RAZORPAY_KEY_ID = 'rzp_test_key';
    (env as { RAZORPAY_KEY_SECRET?: string }).RAZORPAY_KEY_SECRET = secret;
  });
  afterAll(() => {
    delete (env as { RAZORPAY_KEY_ID?: string }).RAZORPAY_KEY_ID;
    delete (env as { RAZORPAY_KEY_SECRET?: string }).RAZORPAY_KEY_SECRET;
  });

  it('verifies a signed payment, then refunds a cancellation to the original payment via Razorpay', async () => {
    const tripId = await makeTrip({ daysAway: 30 });
    const t = await registerUser('Card Payer');
    const booked = await request(app).post('/api/v1/interactions/join-request').set(auth(t.token)).send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
    const joinRequestId = booked.body.data.id;

    mockOrderCreate.mockResolvedValueOnce({ id: `order_${runId}` });
    const init = await request(app)
      .post('/api/v1/trip-payments/initiate')
      .set(auth(t.token))
      .send({ joinRequestId, idempotencyKey: `idem-${runId}` });
    expect(init.status).toBe(200);
    expect(init.body.data.platformFee).toBe('90');

    const paymentId = `pay_${runId}`;
    const signature = crypto.createHmac('sha256', secret).update(`order_${runId}|${paymentId}`).digest('hex');
    const verified = await request(app)
      .post('/api/v1/trip-payments/verify')
      .set(auth(t.token))
      .send({ razorpayOrderId: `order_${runId}`, razorpayPaymentId: paymentId, razorpaySignature: signature });
    expect(verified.status).toBe(200);
    expect(verified.body.data.verificationToken).toMatch(/^TST-/);

    // A replayed verify (or the webhook) does not double-book.
    const replay = await request(app)
      .post('/api/v1/trip-payments/verify')
      .set(auth(t.token))
      .send({ razorpayOrderId: `order_${runId}`, razorpayPaymentId: paymentId, razorpaySignature: signature });
    expect(replay.body.data.verificationToken).toBe(verified.body.data.verificationToken);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(4);

    // A gateway failure leaves everything as it was, so it can be retried.
    mockRefund.mockRejectedValueOnce(new Error('gateway down'));
    const failed = await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(t.token));
    expect(failed.status).toBe(502);
    expect((await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } }))?.status).toBe('CAPTURED');
    expect((await prisma.joinRequest.findUnique({ where: { id: joinRequestId } }))?.status).toBe('PAYMENT_COMPLETED');

    mockRefund.mockResolvedValueOnce({ id: `rfnd_${runId}` });
    const cancelled = await request(app).post(`/api/v1/trips/${tripId}/cancel-booking`).set(auth(t.token));
    expect(cancelled.status).toBe(200);
    expect(mockRefund).toHaveBeenLastCalledWith(paymentId, expect.objectContaining({ amount: 191000 }));
    const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
    expect(order?.razorpayRefundId).toBe(`rfnd_${runId}`);
    expect((await prisma.trip.findUnique({ where: { id: tripId } }))!.availableSeats).toBe(5);
  }, 120_000);
});
