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
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
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
  // Prisma connection-pool sizing (docs/REMEDIATION.md Phase 10). Prisma's
  // default is `num_cpus * 2 + 1` per process, which is far too many against
  // a serverless Postgres like Neon once you run more than one instance —
  // the pool exhausts the database's connection budget rather than its own.
  // Size this from (database max connections / instance count) instead.
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().max(100).default(10),
  // Seconds a query waits for a free connection before failing. Prisma's
  // default is 10s; failing fast is better than piling up requests behind a
  // saturated pool.
  DATABASE_POOL_TIMEOUT: z.coerce.number().int().nonnegative().max(120).default(10),
  // Object storage for user-uploaded media (docs/REMEDIATION.md §8.2 —
  // avatar upload). Per the 2026-08-27 decision on credential-dependent
  // features: code the real path, read from env, and throw a clear error
  // at the point of use when unset — never fall back to faking an upload.
  // All five must be set together for uploads to work; any subset left
  // unset just means uploads stay disabled (checked in object-storage.ts,
  // not enforced here, so the server can still boot without them in dev).
  // OBJECT_STORAGE_ENDPOINT is only for an S3-compatible provider that
  // isn't AWS itself (R2, MinIO, B2) — omit it for real AWS S3.
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().min(1).optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  // The base URL a client reads uploaded files back from (the bucket's own
  // public URL, or a CDN in front of it). Required alongside the above.
  OBJECT_STORAGE_PUBLIC_URL_BASE: z.string().url().optional(),

  // Push notifications (docs/REMEDIATION.md §8.18). The Expo push service
  // needs no server credential by default — this is only required once a
  // project enables push security in its Expo dashboard, so it stays
  // optional and push works without it.
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
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
