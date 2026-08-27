/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Integration suites talk to a remote Postgres (Neon in dev, a service
  // container in CI). 20s was too tight once several suites run back to
  // back and cold-start latency stacks up — every suite passes in
  // isolation but the full run went flaky. Testcontainers (Phase 13.2)
  // is the real fix; until then, a generous ceiling keeps the run honest.
  testTimeout: 60000,
  // Cap parallelism so the suites don't exhaust the shared DB's
  // connection budget (part of the same flakiness).
  maxWorkers: 2,
};
