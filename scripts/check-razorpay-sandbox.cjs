// Sandbox only. Never loads the backend's normal database/environment files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dotenv = require('../backend/node_modules/dotenv');
const secrets = dotenv.parse(fs.readFileSync(path.join(root, '.expo/razorpay-test.env.local')));
assert(secrets.RAZORPAY_KEY_ID?.startsWith('rzp_test_'), 'Only test keys are accepted');
assert(secrets.RAZORPAY_KEY_SECRET, 'Test secret is missing');
const db = fs.readFileSync(path.join(root, '.expo/web-check-db.txt'), 'utf8').trim();
assert(/^yatrenzo_web_check_\d+$/.test(db), 'Only the isolated local database is accepted');
Object.assign(process.env, secrets, {
  NODE_ENV: 'test', ALLOW_TEST_PAYMENTS: 'false',
  DATABASE_URL: `postgresql://postgres@localhost:5432/${db}?schema=public`,
  DIRECT_URL: `postgresql://postgres@localhost:5432/${db}?schema=public`,
  JWT_SECRET: 'isolated-web-validation-secret-at-least-32-bytes',
  RAZORPAY_WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
  TS_NODE_PROJECT: path.join(root, 'backend/tsconfig.json'),
});
require('../backend/node_modules/ts-node/register/transpile-only');
const { Decimal } = require('../backend/node_modules/@prisma/client/runtime/library');
const prisma = require('../backend/src/services/db').default;
const payments = require('../backend/src/services/trip-payments');
const request = require('../backend/node_modules/supertest');
const app = require('../backend/src/app').default;

(async () => {
  let user, trip;
  try {
    assert.equal(payments.testPaymentsAllowed(), false);
    user = await prisma.user.create({ data: {
      email: `sandbox-${crypto.randomUUID()}@travelstar.test`,
      phoneNumber: `9${String(Date.now()).slice(-9)}`,
    } });
    trip = await prisma.trip.create({ data: {
      creatorId: user.id, name: 'Sandbox payment validation', description: 'Isolated test fixture',
      category: 'ADVENTURE', cities: ['Manali'], startDate: new Date(Date.now() + 20 * 864e5),
      endDate: new Date(Date.now() + 22 * 864e5), durationDays: 2, budget: 1,
      totalSeats: 4, availableSeats: 4, meetingPoint: 'Test', privacy: 'PUBLIC',
    } });
    const booking = await prisma.joinRequest.create({ data: {
      userId: user.id, tripId: trip.id, status: 'PAYMENT_PENDING', partySize: 1,
    } });
    const args = { joinRequestId: booking.id, userId: user.id, amount: new Decimal(1), idempotencyKey: crypto.randomUUID() };
    const order = await payments.getOrCreatePaymentOrder(args);
    assert(order.razorpayOrderId?.startsWith('order_'));
    const remote = await payments.razorpayClient().orders.fetch(order.razorpayOrderId);
    assert.equal(Number(remote.amount), 100);
    assert.equal(remote.currency, 'INR');
    assert.equal(remote.status, 'created');
    const retry = await payments.getOrCreatePaymentOrder(args);
    assert.equal(retry.id, order.id);
    assert.equal(await prisma.tripPaymentOrder.count({ where: { joinRequestId: booking.id } }), 1);
    assert.equal(payments.verifyRazorpaySignature(order.razorpayOrderId, 'fake', 'bad'), false);
    const body = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { order_id: order.razorpayOrderId } } } });
    const endpoint = '/api/v1/trip-payments/webhook';
    const invalid = await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', 'bad').send(body);
    assert.equal(invalid.status, 400);
    assert.equal((await prisma.tripPaymentOrder.findUnique({ where: { id: order.id } })).status, 'CREATED');
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
    const valid = await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);
    assert.equal(valid.status, 200);
    assert.equal((await prisma.tripPaymentOrder.findUnique({ where: { id: order.id } })).status, 'FAILED');
    assert.equal((await prisma.trip.findUnique({ where: { id: trip.id } })).availableSeats, 4);
    const checkout = await require('./razorpay-sandbox-checkout.cjs')({ key: secrets.RAZORPAY_KEY_ID, orderId: order.razorpayOrderId });
    assert(payments.verifyRazorpaySignature(checkout.razorpay_order_id, checkout.razorpay_payment_id, checkout.razorpay_signature));
    const payment = await payments.razorpayClient().payments.fetch(checkout.razorpay_payment_id);
    assert.equal(Number(payment.amount), 100);
    assert.equal(payment.status, 'captured');
    const capture = { razorpayOrderId: order.razorpayOrderId, razorpayPaymentId: checkout.razorpay_payment_id, signatureVerified: true };
    const receipt = await payments.captureAndHoldSeat(capture);
    assert(receipt.ok && receipt.verificationToken);
    assert.equal((await prisma.trip.findUnique({ where: { id: trip.id } })).availableSeats, 3);
    const repeat = await payments.captureAndHoldSeat(capture);
    assert(repeat.ok && repeat.alreadyCompleted);
    assert.equal((await prisma.trip.findUnique({ where: { id: trip.id } })).availableSeats, 3);
    const lateFailure = await request(app).post(endpoint).set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);
    assert.equal(lateFailure.status, 200);
    assert.equal((await prisma.tripPaymentOrder.findUnique({ where: { id: order.id } })).status, 'CAPTURED');
    const refund = await payments.refundOrder(order.id, new Decimal(1), 'Sandbox validation');
    assert(refund.ok);
    console.log(JSON.stringify({ realSandboxCheckoutCaptured: true, callbackSignatureVerified: true, receiptIssued: true, seatHeldOnce: true, lateFailureCannotOverwriteCapture: true, sandboxRefundAccepted: true }));
    console.log(JSON.stringify({ testOrderCreated: true, amountPaise: 100, orderRetryReused: true, invalidWebhookRejected: true, signedFailureWebhookAccepted: true, seatsUnchangedOnFailure: true, simulationDisabled: true }));
  } finally {
    if (trip) {
      await prisma.joinRequest.updateMany({ where: { tripId: trip.id }, data: { currentPaymentOrderId: null } });
      await prisma.tripPaymentOrder.deleteMany({ where: { userId: user.id } });
      await prisma.joinRequest.deleteMany({ where: { tripId: trip.id } });
      await prisma.trip.delete({ where: { id: trip.id } });
    }
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    require('../backend/src/services/login-attempts').closeLoginAttemptStore?.();
    await require('../backend/src/lib/cache').closeCache?.();
    await require('../backend/src/lib/presence-store').closePresenceStore?.();
  }
})().catch(() => { console.error('Sandbox validation failed; credentials were not printed.'); process.exitCode = 1; });
