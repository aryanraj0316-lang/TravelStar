import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 bytes'),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:8081,http://localhost:19006')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),
  // Optional: without it, sockets run single-instance (in-memory presence,
  // no cross-instance room fan-out) — fine for local dev, not for a
  // horizontally-scaled deployment. See docs/REMEDIATION.md §3.8.
  REDIS_URL: z.string().min(1).optional(),
  // Optional observability (docs/REMEDIATION.md Phase 11). When SENTRY_DSN
  // is set AND `@sentry/node` is installed, errors are reported to Sentry
  // with PII scrubbing; otherwise error reporting is a no-op. LOG_LEVEL
  // controls the structured logger's floor.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  RELEASE_VERSION: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] Invalid environment configuration:');
    // eslint-disable-next-line no-console
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
