import crypto from 'node:crypto';
import request from 'supertest';

// Ten ways real users (and Razorpay's real-world behaviour) can break the
// booking and money flow. Each test states what SHOULD happen; a failing test
// is a bug users will hit. Razorpay is mocked: nothing leaves the machine.
const mockOrderCreate = jest.fn();
const mockRefund = jest.fn();
const mockTransfer = jest.fn();
const mockReverse = jest.fn();
const mockAccountCreate = jest.fn();
const mockProductFetch = jest.fn();
jest.mock('razorpay', () =>
  jest.fn().mockImplementation(() => ({
    orders: { create: mockOrderCreate },
    payments: { refund: mockRefund, transfer: mockTransfer },
    transfers: { reverse: mockReverse },
    accounts: { create: mockAccountCreate },
    products: { fetch: mockProductFetch },
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
const PASSWORD = 'correcthorsebattery';
const keySecret = 'breakage_key_secret';
const webhookSecret = 'breakage_webhook_secret';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const next = () => `${runId}_${++seq}`;

type User = { token: string; userId: string };

async function registerUser(label: string): Promise<User> {
  const email = `breakage-${next()}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

async function makeTrip(creatorId: string, opts: { daysAway: number; budget?: number; seats?: number }) {
  const seats = opts.seats ?? 5;
  return prisma.trip.create({
    data: {
      creatorId,
      name: `Breakage Trip ${next()}`,
      description: 'test',
      cities: ['Rishikesh', 'Auli'],
      startDate: new Date(Date.now() + opts.daysAway * 864e5),
      endDate: new Date(Date.now() + (opts.daysAway + 3) * 864e5),
      durationDays: 3,
      budget: opts.budget ?? 2000,
      totalSeats: seats,
      availableSeats: seats,
      meetingPoint: 'Rishikesh Bus Stand',
      privacy: 'PUBLIC',
    },
  });
}

async function book(t: User, tripId: string, party = 1) {
  const res = await request(app)
    .post('/api/v1/interactions/join-request')
    .set(auth(t.token))
    .send({ tripId, acceptedTerms: true, familyMemberCount: party - 1, travellerDetails: travellers(party) });
  return res;
}

/** Card/UPI payment through (mocked) Razorpay checkout. */
async function payByCard(t: User, joinRequestId: string) {
  const orderId = `order_${next()}`;
  mockOrderCreate.mockResolvedValueOnce({ id: orderId });
  const init = await request(app)
    .post('/api/v1/trip-payments/initiate')
    .set(auth(t.token))
    .send({ joinRequestId, idempotencyKey: `idem-${next()}` });
  expect(init.status).toBe(200);
  const paymentId = `pay_${next()}`;
  const signature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const verified = await request(app)
    .post('/api/v1/trip-payments/verify')
    .set(auth(t.token))
    .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
  expect(verified.status).toBe(200);
  return { orderId, paymentId, token: verified.body.data.verificationToken as string };
}

async function confirm(organizer: User, tripId: string, joinRequestId: string, token: string) {
  const res = await request(app)
    .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
    .set(auth(organizer.token))
    .send({
      joinRequestId,
      verificationToken: token,
      allocations: [{ dayNumber: 1, checkpointName: 'Rishikesh', hotelName: 'Ganga View', roomNumber: '12', vehicleNumber: 'UK-07-1234', seatNumber: '5' }],
    });
  expect(res.status).toBe(200);
}

async function linkBank(organizer: User) {
  mockAccountCreate.mockResolvedValueOnce({ id: `acc_${next()}`, product_config: { id: `prd_${next()}`, activation_status: 'activated' } });
  const res = await request(app)
    .post('/api/v1/payouts/account')
    .set(auth(organizer.token))
    .send({
      legalName: 'Ravi Kumar',
      pan: 'ABCPK1234F',
      email: `bank-${next()}@travelstar.test`,
      phone: '9876543210',
      beneficiaryName: 'Ravi Kumar',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
    });
  expect(res.status).toBe(201);
}

async function webhook(payload: object) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  return request(app)
    .post('/api/v1/trip-payments/webhook')
    .set('x-razorpay-signature', sig)
    .set('Content-Type', 'application/json')
    .send(body);
}

const orderFor = (joinRequestId: string) => prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
const transferredFor = (paymentId: string) => mockTransfer.mock.calls.some((c) => c[0] === paymentId);

beforeAll(() => {
  const e = env as Record<string, unknown>;
  e.RAZORPAY_KEY_ID = 'rzp_test_key';
  e.RAZORPAY_KEY_SECRET = keySecret;
  e.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
});

beforeEach(() => {
  for (const m of [mockOrderCreate, mockRefund, mockTransfer, mockReverse, mockAccountCreate, mockProductFetch]) m.mockReset();
  mockRefund.mockImplementation(async () => ({ id: `rfnd_${next()}` }));
  mockReverse.mockImplementation(async () => ({ id: `rvrsl_${next()}` }));
  mockTransfer.mockImplementation(async () => ({ items: [{ id: `trf_${next()}` }] }));
});

afterAll(async () => {
  const e = env as Record<string, unknown>;
  delete e.RAZORPAY_KEY_ID;
  delete e.RAZORPAY_KEY_SECRET;
  delete e.RAZORPAY_WEBHOOK_SECRET;
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.tripPaymentOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.trip.deleteMany({ where: { creatorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('How real users break TravelStar', () => {
  it('1. a late "payment failed" message from Razorpay does not overwrite a refunded payment', async () => {
    // The traveller's first UPI attempt failed, the second succeeded. They
    // later cancel and are refunded. Razorpay then delivers (or retries) the
    // old "payment.failed" event for the first attempt.
    const organizer = await registerUser('Org 1');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    const t = await registerUser('Traveller 1');
    const jr = (await book(t, trip.id)).body.data.id as string;
    const { orderId, paymentId } = await payByCard(t, jr);
    expect((await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(t.token))).status).toBe(200);
    const refunded = (await orderFor(jr))!.status;

    await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: `pay_first_attempt_${next()}`, order_id: orderId } } } });
    expect((await orderFor(jr))!.status).toBe(refunded);

    // And a retried "payment.captured" for the real payment must not refund again.
    mockRefund.mockClear();
    await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
    expect(mockRefund).not.toHaveBeenCalled();
  }, 120_000);

  it('2. a traveller is charged the current price after the organizer lowers it mid-checkout', async () => {
    // Traveller opens checkout at ₹2000 and closes it. Organizer drops the
    // price to ₹1500. The app now shows ₹1500 due — the checkout must match.
    const organizer = await registerUser('Org 2');
    const trip = await makeTrip(organizer.userId, { daysAway: 30, budget: 2000 });
    const t = await registerUser('Traveller 2');
    const jr = (await book(t, trip.id)).body.data.id as string;

    mockOrderCreate.mockResolvedValueOnce({ id: `order_${next()}` });
    const first = await request(app).post('/api/v1/trip-payments/initiate').set(auth(t.token)).send({ joinRequestId: jr, idempotencyKey: `idem-${next()}` });
    expect(first.body.data.amount).toBe('2000');

    await prisma.trip.update({ where: { id: trip.id }, data: { budget: 1500 } });
    const shown = await request(app).get(`/api/v1/trips/${trip.id}/my-booking`).set(auth(t.token));
    expect(shown.body.data.amountDue).toBe('1500');

    mockOrderCreate.mockResolvedValueOnce({ id: `order_${next()}` });
    const second = await request(app).post('/api/v1/trip-payments/initiate').set(auth(t.token)).send({ joinRequestId: jr, idempotencyKey: `idem-${next()}` });
    expect(second.body.data.amount).toBe('1500');
  }, 120_000);

  it('3. when a refund fails, the organizer keeps their share (the booking is still on)', async () => {
    // Razorpay refunds fail when the merchant balance is low — common for a
    // new account. The cancel is reported as failed and nothing is cancelled,
    // so the organizer's held share must not have been taken back.
    const organizer = await registerUser('Org 3');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    await linkBank(organizer);
    const t = await registerUser('Traveller 3');
    const jr = (await book(t, trip.id)).body.data.id as string;
    const { token } = await payByCard(t, jr);
    await confirm(organizer, trip.id, jr, token);
    expect((await orderFor(jr))!.payoutStatus).toBe('ON_HOLD');

    mockRefund.mockRejectedValueOnce({ error: { description: 'Your account does not have enough balance to carry out the refund operation.' } });
    const cancel = await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(t.token));
    expect(cancel.status).toBe(502);

    const order = await orderFor(jr);
    expect(order!.status).toBe('CAPTURED');
    expect(order!.payoutStatus).toBe('ON_HOLD');
    expect(Number(order!.payoutReversedAmount ?? 0)).toBe(0);
  }, 120_000);

  it('4. an organizer who links their bank late is still paid for a booking cancelled with no refund', async () => {
    // Trip is 2 days away: a cancellation now refunds nothing, so the
    // organizer keeps the full share — even if they link their bank later.
    const organizer = await registerUser('Org 4');
    const trip = await makeTrip(organizer.userId, { daysAway: 2 });
    const t = await registerUser('Traveller 4');
    const jr = (await book(t, trip.id)).body.data.id as string;
    const { paymentId, token } = await payByCard(t, jr);
    await confirm(organizer, trip.id, jr, token);
    expect((await orderFor(jr))!.payoutStatus).toBe('AWAITING_ACCOUNT');

    const cancel = await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(t.token));
    expect(cancel.body.data.refundAmount).toBe('0.00');

    await linkBank(organizer);
    expect(transferredFor(paymentId)).toBe(true);
  }, 120_000);

  it('5. a traveller who cancels can book and pay for the same trip again', async () => {
    const organizer = await registerUser('Org 5');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    const t = await registerUser('Traveller 5');
    const jr = (await book(t, trip.id)).body.data.id as string;
    expect((await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: jr })).status).toBe(200);
    expect((await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(t.token))).status).toBe(200);

    const rebooked = await book(t, trip.id);
    expect(rebooked.body.data.status).toBe('PAYMENT_PENDING');
    const paidAgain = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: rebooked.body.data.id });
    expect(paidAgain.status).toBe(200);
  }, 120_000);

  it('6. the organizer is paid for a re-booking after an earlier cancellation', async () => {
    const organizer = await registerUser('Org 6');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    await linkBank(organizer);
    const t = await registerUser('Traveller 6');
    const jr = (await book(t, trip.id)).body.data.id as string;
    const first = await payByCard(t, jr);
    await confirm(organizer, trip.id, jr, first.token);
    expect((await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(t.token))).status).toBe(200);

    const jr2 = (await book(t, trip.id)).body.data.id as string;
    const second = await payByCard(t, jr2);
    await confirm(organizer, trip.id, jr2, second.token);

    expect(transferredFor(second.paymentId)).toBe(true);
    const order = await orderFor(jr2);
    expect(order!.refundedAmount).toBeNull();
  }, 120_000);

  it('7. adding family members before paying is not silently ignored', async () => {
    // Traveller books for 1, goes back, adds 2 family members and continues.
    const organizer = await registerUser('Org 7');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    const t = await registerUser('Traveller 7');
    await book(t, trip.id, 1);
    const again = await book(t, trip.id, 3);
    // Either the booking now covers 3 people, or the app is told it did not.
    const handled = again.status >= 400 || again.body.data.partySize === 3;
    expect(handled).toBe(true);
  }, 60_000);

  it('8. nobody can book or pay for a trip that has already started', async () => {
    const organizer = await registerUser('Org 8');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    // Time passes: the trip is now under way (an old shared link still opens it).
    await prisma.trip.update({ where: { id: trip.id }, data: { startDate: new Date(Date.now() - 864e5) } });
    const t = await registerUser('Traveller 8');
    const res = await book(t, trip.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 60_000);

  it('9. a traveller deleting their account gives their held seat back', async () => {
    const organizer = await registerUser('Org 9');
    const trip = await makeTrip(organizer.userId, { daysAway: 30, seats: 5 });
    const t = await registerUser('Traveller 9');
    const jr = (await book(t, trip.id)).body.data.id as string;
    expect((await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: jr })).status).toBe(200);
    expect((await prisma.trip.findUnique({ where: { id: trip.id } }))!.availableSeats).toBe(4);

    const del = await request(app).post('/api/v1/auth/delete-account').set(auth(t.token)).send({ password: PASSWORD });
    expect(del.status).toBe(200);
    expect((await prisma.trip.findUnique({ where: { id: trip.id } }))!.availableSeats).toBe(5);
  }, 120_000);

  it('10. an organizer deleting their account does not wipe out travellers\' paid bookings unrefunded', async () => {
    const organizer = await registerUser('Org 10');
    const trip = await makeTrip(organizer.userId, { daysAway: 30 });
    const t = await registerUser('Traveller 10');
    const jr = (await book(t, trip.id)).body.data.id as string;
    const { paymentId } = await payByCard(t, jr);

    const del = await request(app).post('/api/v1/auth/delete-account').set(auth(organizer.token)).send({ password: PASSWORD });
    // Either deletion is refused while paid bookings exist, or every
    // traveller is refunded first.
    const refunded = mockRefund.mock.calls.some((c) => c[0] === paymentId);
    expect(del.status !== 200 || refunded).toBe(true);
  }, 120_000);
});
