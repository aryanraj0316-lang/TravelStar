/** Fail closed before loading the database or any payment handlers. */
export function validateSandboxRuntime(source: NodeJS.ProcessEnv): void {
  if (source.NODE_ENV !== 'development') throw new Error('Sandbox requires its dedicated development runtime');
  if (!source.RAZORPAY_KEY_ID?.startsWith('rzp_test_') || !source.RAZORPAY_KEY_SECRET) {
    throw new Error('Sandbox accepts only Razorpay test credentials');
  }
  if (!source.RAZORPAY_WEBHOOK_SECRET || source.RAZORPAY_WEBHOOK_SECRET.length < 32) {
    throw new Error('Sandbox webhook secret is required');
  }
  if (source.ALLOW_TEST_PAYMENTS !== 'false') throw new Error('Direct payment simulation must be disabled');
  const database = new URL(source.DATABASE_URL || 'invalid:');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !/^\/yatrenzo_sandbox(?:_[a-z0-9]+)?$/.test(database.pathname) ||
      !/^yatrenzo_sandbox(?:_[a-z0-9]+)?$/.test(decodeURIComponent(database.username))) {
    throw new Error('Sandbox requires its own database and database login');
  }
  const direct = new URL(source.DIRECT_URL || source.DATABASE_URL || 'invalid:');
  if (direct.host !== database.host || direct.pathname !== database.pathname || direct.username !== database.username) {
    throw new Error('Sandbox migration connection must target the same isolated database');
  }
}
