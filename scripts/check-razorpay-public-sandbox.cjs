// Proof of provider delivery: never calls captureAndHoldSeat or POST /verify.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const secrets = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, '.expo/razorpay-public-sandbox.env.local')));
const state = JSON.parse(fs.readFileSync(path.join(root, '.expo/razorpay-public-sandbox-state.json')));
assert.equal(state.url, 'https://yatrenzo-sandbox.onrender.com');
assert(state.webhookId, 'The test webhook must be registered first');
Object.assign(process.env, secrets, { TS_NODE_PROJECT: path.join(root, 'backend/tsconfig.json') });
require('../backend/node_modules/ts-node/register/transpile-only');
require('../backend/src/lib/sandbox-config').validateSandboxRuntime(process.env);
const prisma = require('../backend/src/services/db').default;
const payments = require('../backend/src/services/trip-payments');
const { Decimal } = require('../backend/node_modules/@prisma/client/runtime/library');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, label) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const value = await check();
    if (value) return value;
    await delay(2000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

(async () => {
  let user, trip;
  try {
    const health = await fetch(state.url + '/health', { signal: AbortSignal.timeout(60000) });
    assert.equal((await health.json()).environment, 'sandbox');
    for (const route of ['/api/v1/auth/register', '/api/v1/trip-payments/initiate', '/api/v1/trip-payments/pay']) {
      const response = await fetch(state.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 404);
    }
    const invalid = await fetch(state.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'invalid' }, body: '{}' });
    assert.equal(invalid.status, 400);
    user = await prisma.user.create({ data: { email: `public-sandbox-${crypto.randomUUID()}@travelstar.test`, phoneNumber: `9${String(Date.now()).slice(-9)}` } });
    trip = await prisma.trip.create({ data: {
      creatorId: user.id, name: 'Public webhook validation', description: 'Synthetic sandbox fixture',
      category: 'ADVENTURE', cities: ['Manali'], startDate: new Date(Date.now() + 20 * 864e5),
      endDate: new Date(Date.now() + 22 * 864e5), durationDays: 2, budget: 1,
      totalSeats: 4, availableSeats: 4, meetingPoint: 'Test', privacy: 'PUBLIC',
    } });
    const booking = await prisma.joinRequest.create({ data: { userId: user.id, tripId: trip.id, status: 'PAYMENT_PENDING', partySize: 1 } });
    const order = await payments.getOrCreatePaymentOrder({ joinRequestId: booking.id, userId: user.id, amount: new Decimal(1), idempotencyKey: crypto.randomUUID() });
    console.log('Public sandbox test order created; opening mock-bank checkout.');
    const callback = await require('./razorpay-sandbox-checkout.cjs')({ key: secrets.RAZORPAY_KEY_ID, orderId: order.razorpayOrderId });
    assert(payments.verifyRazorpaySignature(callback.razorpay_order_id, callback.razorpay_payment_id, callback.razorpay_signature));
    console.log('Sandbox checkout succeeded; waiting for provider webhook (no browser confirmation sent).');
    const received = await until(async () => {
      const row = await prisma.tripPaymentOrder.findUnique({ where: { id: order.id } });
      return row?.status === 'CAPTURED' && row.verificationToken ? row : null;
    }, 'Razorpay capture webhook');
    assert.equal(received.razorpayPaymentId, callback.razorpay_payment_id);
    assert.equal((await prisma.joinRequest.findUnique({ where: { id: booking.id } })).status, 'PAYMENT_COMPLETED');
    assert.equal((await prisma.trip.findUnique({ where: { id: trip.id } })).availableSeats, 3);
    console.log('Provider webhook completed the booking and held one seat.');
    const refund = await payments.refundOrder(order.id, new Decimal(1), 'Public sandbox webhook validation');
    assert(refund.ok);
    await until(async () => (await prisma.tripPaymentOrder.findUnique({ where: { id: order.id } }))?.refundStatus === 'PROCESSED', 'Razorpay refund webhook');
    const result = { checkedAt: new Date().toISOString(), sandboxUrl: state.url, webhookUrl: state.webhookUrl,
      providerCaptureWebhookVerified: true, bookingCompletedWithoutBrowserConfirmation: true,
      receiptIssued: true, oneSeatHeld: true, providerRefundWebhookVerified: true,
      invalidSignatureRejected: true, nonWebhookRoutesClosed: true, realMoneyMoved: false };
    fs.writeFileSync(path.join(root, '.expo/razorpay-public-sandbox-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    if (trip) {
      await prisma.joinRequest.updateMany({ where: { tripId: trip.id }, data: { currentPaymentOrderId: null } });
      await prisma.tripPaymentOrder.deleteMany({ where: { userId: user.id } });
      await prisma.joinRequest.deleteMany({ where: { tripId: trip.id } });
      await prisma.trip.delete({ where: { id: trip.id } });
    }
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
})().catch(error => { console.error('Public sandbox validation failed:', error.code || error.name); process.exitCode = 1; });
