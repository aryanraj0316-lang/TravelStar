import crypto from 'node:crypto';
import { env } from '../src/config/env';
import prisma from '../src/services/db';
import { testPaymentsAllowed, payDirect, isRazorpayConfigured, razorpayClient, verifyRazorpaySignature, verifyWebhookSignature } from '../src/services/trip-payments';

jest.mock('../src/config/env', () => ({ env: { NODE_ENV: 'production' } }));
jest.mock('../src/services/db', () => ({ __esModule: true, default: { joinRequest: { findUnique: jest.fn() } } }));

afterEach(() => jest.clearAllMocks());

test.each([
  ['production', undefined, undefined, false],
  ['production', true, 'rzp_test_fixture', false],
  ['production', true, 'rzp_live_fixture', false],
  ['development', true, 'rzp_test_fixture', false],
  ['test', undefined, undefined, true],
  ['test', false, undefined, false],
  ['test', true, 'rzp_live_fixture', false],
] as const)('payment simulation policy: %s, override %s, key %s', (nodeEnv, override, key, allowed) => {
  env.NODE_ENV = nodeEnv;
  env.ALLOW_TEST_PAYMENTS = override;
  env.RAZORPAY_KEY_ID = key;
  expect(testPaymentsAllowed()).toBe(allowed);
});

test('direct service calls cannot bypass payment in production or touch booking records', async () => {
  env.NODE_ENV = 'production';
  env.ALLOW_TEST_PAYMENTS = true;
  expect(await payDirect('booking', 'traveller')).toEqual({ ok: false, reason: 'TEST_PAYMENTS_DISABLED' });
  expect(prisma.joinRequest.findUnique).not.toHaveBeenCalled();
});

test('production refuses sandbox checkout and even valid sandbox callback signatures', () => {
  env.NODE_ENV = 'production';
  env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
  env.RAZORPAY_KEY_SECRET = 'fixture-secret';
  env.RAZORPAY_WEBHOOK_SECRET = 'fixture-hook';
  expect(isRazorpayConfigured()).toBe(false);
  expect(() => razorpayClient()).toThrow('credentials not configured');
  const signature = crypto.createHmac('sha256', 'fixture-secret').update('order|payment').digest('hex');
  expect(verifyRazorpaySignature('order', 'payment', signature)).toBe(false);
  const hook = crypto.createHmac('sha256', 'fixture-hook').update('{}').digest('hex');
  expect(verifyWebhookSignature('{}', hook)).toBe(false);
  env.RAZORPAY_KEY_ID = 'rzp_live_fixture';
  expect(isRazorpayConfigured()).toBe(true);
  expect(verifyRazorpaySignature('order', 'payment', signature)).toBe(true);
  expect(verifyWebhookSignature('{}', hook)).toBe(true);
});
