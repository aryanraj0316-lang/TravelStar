import { validateSandboxRuntime } from '../src/lib/sandbox-config';

const valid = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'fixture',
  RAZORPAY_WEBHOOK_SECRET: 'a'.repeat(48), ALLOW_TEST_PAYMENTS: 'false',
  DATABASE_URL: 'postgresql://yatrenzo_sandbox:fixture@db.example:5432/yatrenzo_sandbox',
});
test('accepts only the isolated sandbox runtime', () => expect(() => validateSandboxRuntime(valid())).not.toThrow());
test.each([
  { NODE_ENV: 'production' },
  { RAZORPAY_KEY_ID: 'rzp_live_fixture' },
  { RAZORPAY_KEY_SECRET: '' },
  { RAZORPAY_WEBHOOK_SECRET: '' },
  { ALLOW_TEST_PAYMENTS: 'true' },
  { DATABASE_URL: 'postgresql://avnadmin:fixture@db.example:5432/defaultdb' },
  { DATABASE_URL: 'postgresql://avnadmin:fixture@db.example:5432/yatrenzo_sandbox' },
  { DIRECT_URL: 'postgresql://yatrenzo_sandbox:fixture@db.example:5432/defaultdb' },
  { DIRECT_URL: 'postgresql://yatrenzo_sandbox:fixture@other.example:5432/yatrenzo_sandbox' },
])('refuses unsafe sandbox configuration %j', patch => {
  expect(() => validateSandboxRuntime({ ...valid(), ...patch })).toThrow();
});
