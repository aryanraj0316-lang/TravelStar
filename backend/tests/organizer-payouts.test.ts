import crypto from 'node:crypto';
import request from 'supertest';

// Razorpay is mocked: no network. Every Route call (linked account,
// transfer, reversal) and refund is recorded so the test can check where
// real money would go.
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

/**
 * Organizer payouts (Razorpay Route): the organizer's share of a confirmed
 * booking goes to their linked bank, held until the trip starts; refunds
 * are taken back from that share first; the testing bypass switches off
 * with live keys; refund failures reach the traveller.
 */

const runId = Date.now();
let seq = 0;
const emails: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const keySecret = 'test_route_secret';
const webhookSecret = 'test_route_webhook_secret';

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `payouts-${runId}-${seq}@travelstar.test`;
  emails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

async function makeTrip(creatorId: string, daysAway: number) {
  const trip = await prisma.trip.create({
    data: {
      creatorId,
      name: `Payout Trip ${runId} ${seq}`,
      description: 'test',
      cities: ['Rishikesh', 'Auli'],
      startDate: new Date(Date.now() + daysAway * 864e5),
      endDate: new Date(Date.now() + (daysAway + 3) * 864e5),
      durationDays: 3,
      budget: 2000,
      totalSeats: 5,
      availableSeats: 5,
      meetingPoint: 'Rishikesh Bus Stand',
      privacy: 'PUBLIC',
    },
  });
  return trip;
}

const bank = {
  legalName: 'Ravi Kumar',
  pan: 'ABCPK1234F',
  email: 'ravi.payouts@travelstar.test',
  phone: '9876543210',
  beneficiaryName: 'Ravi Kumar',
  accountNumber: '123456789012',
  ifsc: 'HDFC0001234',
};

/** Books, pays through Razorpay (mocked) and is confirmed by the organizer. */
async function confirmedCardBooking(tripId: string, organizerToken: string, label: string) {
  const t = await registerUser(label);
  const booked = await request(app)
    .post('/api/v1/interactions/join-request')
    .set(auth(t.token))
    .send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
  const joinRequestId = booked.body.data.id as string;
  const orderId = `order_${runId}_${seq}`;
  mockOrderCreate.mockResolvedValueOnce({ id: orderId });
  const init = await request(app)
    .post('/api/v1/trip-payments/initiate')
    .set(auth(t.token))
    .send({ joinRequestId, idempotencyKey: `idem-${runId}-${seq}` });
  expect(init.status).toBe(200);
  const paymentId = `pay_${runId}_${seq}`;
  const signature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const verified = await request(app)
    .post('/api/v1/trip-payments/verify')
    .set(auth(t.token))
    .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
  expect(verified.status).toBe(200);
  const allocated = await request(app)
    .post(`/api/v1/trips/${tripId}/approve-and-allocate`)
    .set(auth(organizerToken))
    .send({
      joinRequestId,
      verificationToken: verified.body.data.verificationToken,
      allocations: [{ dayNumber: 1, checkpointName: 'Rishikesh', hotelName: 'Ganga View', roomNumber: '12', vehicleNumber: 'UK-07-TA-1234', seatNumber: '5' }],
    });
  expect(allocated.status).toBe(200);
  return { traveller: t, joinRequestId, paymentId };
}

beforeAll(() => {
  const e = env as Record<string, unknown>;
  e.RAZORPAY_KEY_ID = 'rzp_test_key';
  e.RAZORPAY_KEY_SECRET = keySecret;
  e.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
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

describe('testing bypass', () => {
  it('is refused once live Razorpay keys are set', async () => {
    const organizer = await registerUser('Bypass Organizer');
    const trip = await makeTrip(organizer.userId, 20);
    const t = await registerUser('Bypass Traveller');
    const booked = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(t.token))
      .send({ tripId: trip.id, acceptedTerms: true, travellerDetails: travellers(1) });

    (env as Record<string, unknown>).RAZORPAY_KEY_ID = 'rzp_live_key';
    try {
      const order = await request(app).get(`/api/v1/trip-payments/order/${booked.body.data.id}`).set(auth(t.token));
      expect(order.body.data.testPaymentsAllowed).toBe(false);
      const skipped = await request(app).post('/api/v1/trip-payments/pay').set(auth(t.token)).send({ joinRequestId: booked.body.data.id });
      expect(skipped.status).toBe(403);
      expect(skipped.body.error.code).toBe('TEST_PAYMENTS_DISABLED');
    } finally {
      (env as Record<string, unknown>).RAZORPAY_KEY_ID = 'rzp_test_key';
    }
  });
});

describe('organizer payouts', () => {
  it('sends the share to the linked bank on confirmation, held until the trip starts, and takes refunds back from it', async () => {
    const organizer = await registerUser('Route Organizer');
    const trip = await makeTrip(organizer.userId, 30);

    mockAccountCreate.mockResolvedValueOnce({
      id: `acc_${runId}`,
      product_config: {
        id: `acc_prd_${runId}`,
        activation_status: 'activated',
        active_configuration: { settlement_accounts: [{ verification_status: 'pending' }] },
      },
    });
    const linked = await request(app).post('/api/v1/payouts/account').set(auth(organizer.token)).send(bank);
    expect(linked.status).toBe(201);
    expect(linked.body.data.account.bankAccountLast4).toBe('9012');
    expect(linked.body.data.account.panMasked).toBe('ABXXXXX34F');
    const createBody = mockAccountCreate.mock.calls[0]![0];
    expect(createBody).toMatchObject({ type: 'route', business_type: 'individual', legal_info: { pan: 'ABCPK1234F' } });
    expect(createBody.settlement_accounts[0].bank_account).toMatchObject({ account_number: '123456789012', code: 'HDFC0001234' });

    mockTransfer.mockResolvedValueOnce({ items: [{ id: `trf_${runId}` }] });
    const { traveller, joinRequestId, paymentId } = await confirmedCardBooking(trip.id, organizer.token, 'Route Traveller');

    // ₹2000 booking: organizer's 95.5% (₹1910) held until the trip starts.
    expect(mockTransfer).toHaveBeenCalledWith(paymentId, {
      transfers: [
        expect.objectContaining({
          account: `acc_${runId}`,
          amount: 191000,
          currency: 'INR',
          on_hold: 1,
          on_hold_until: Math.floor(trip.startDate.getTime() / 1000),
        }),
      ],
    });
    let order = await prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
    expect(order?.payoutStatus).toBe('ON_HOLD');
    expect(order?.razorpayTransferId).toBe(`trf_${runId}`);

    const earnings = await request(app).get('/api/v1/payouts/earnings').set(auth(organizer.token));
    expect(earnings.body.data.totals.onHold).toBe('1910.00');
    expect(earnings.body.data.items[0]).toMatchObject({ state: 'ON_HOLD', yourShare: '1910.00', travellerName: expect.any(String) });

    // Cancelled 30 days out: ₹1910 back to the traveller, reversed from the
    // organizer's held share before Razorpay refunds it.
    mockReverse.mockResolvedValueOnce({ id: `rvrsl_${runId}` });
    mockRefund.mockResolvedValueOnce({ id: `rfnd_${runId}` });
    const cancelled = await request(app).post(`/api/v1/trips/${trip.id}/cancel-booking`).set(auth(traveller.token));
    expect(cancelled.status).toBe(200);
    expect(mockReverse).toHaveBeenCalledWith(`trf_${runId}`, { amount: 191000 });
    expect(mockRefund).toHaveBeenLastCalledWith(paymentId, expect.objectContaining({ amount: 191000 }));
    order = await prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
    expect(order?.payoutStatus).toBe('REVERSED');
    expect(order?.refundStatus).toBe('PROCESSING');

    // Razorpay later reports the refund failed: recorded, traveller told.
    const body = JSON.stringify({
      event: 'refund.failed',
      payload: { refund: { entity: { id: `rfnd_${runId}`, payment_id: paymentId, amount: 191000 } } },
    });
    const sig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    const hook = await request(app)
      .post('/api/v1/trip-payments/webhook')
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(hook.status).toBe(200);
    order = await prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
    expect(order?.refundStatus).toBe('FAILED');
    const notice = await prisma.notification.findFirst({ where: { userId: traveller.userId, title: { startsWith: 'Refund delayed' } } });
    expect(notice?.content).toContain('₹1910.00');
  }, 180_000);

  it('holds payouts until the organizer links a bank, then sends them', async () => {
    const organizer = await registerUser('Late Organizer');
    const trip = await makeTrip(organizer.userId, 15);
    const { joinRequestId, paymentId } = await confirmedCardBooking(trip.id, organizer.token, 'Early Traveller');

    let order = await prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
    expect(order?.payoutStatus).toBe('AWAITING_ACCOUNT');
    const before = await request(app).get('/api/v1/payouts/earnings').set(auth(organizer.token));
    expect(before.body.data.totals.awaitingAccount).toBe('1910.00');

    mockAccountCreate.mockResolvedValueOnce({ id: `acc_late_${runId}`, product_config: { id: `prd_late_${runId}`, activation_status: 'activated' } });
    mockTransfer.mockResolvedValueOnce({ items: [{ id: `trf_late_${runId}` }] });
    const linked = await request(app)
      .post('/api/v1/payouts/account')
      .set(auth(organizer.token))
      .send({ ...bank, email: 'late.organizer@travelstar.test' });
    expect(linked.status).toBe(201);

    expect(mockTransfer).toHaveBeenLastCalledWith(paymentId, {
      transfers: [expect.objectContaining({ account: `acc_late_${runId}`, amount: 191000 })],
    });
    order = await prisma.tripPaymentOrder.findFirst({ where: { joinRequestId }, orderBy: { createdAt: 'desc' } });
    expect(order?.payoutStatus).toBe('ON_HOLD');

    // A second bank link is refused (change it through support).
    const again = await request(app).post('/api/v1/payouts/account').set(auth(organizer.token)).send(bank);
    expect(again.status).toBe(409);
  }, 180_000);

  it('refuses a payout account for someone who organizes no trips, and bad bank details', async () => {
    const nobody = await registerUser('Not Organizer');
    const res = await request(app).post('/api/v1/payouts/account').set(auth(nobody.token)).send(bank);
    expect(res.status).toBe(403);

    const bad = await request(app)
      .post('/api/v1/payouts/account')
      .set(auth(nobody.token))
      .send({ ...bank, ifsc: 'BAD' });
    expect(bad.status).toBe(400);
  });
});
