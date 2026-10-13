import { spawn } from 'node:child_process';
import path from 'node:path';
import { logger } from './logger';

// Applies pending Prisma migrations when the server boots, before it starts
// accepting requests.
//
// Why this exists: nothing in the deploy pipeline ran `prisma migrate
// deploy` against production. The paid-booking release shipped code that
// reads JoinRequest.termsAcceptedAt (and other new columns) to a database
// that never received them, so every booking failed with "Failed to create
// join request" — and every other query touching join requests, members or
// payment orders failed the same way. The code and its schema must arrive
// together; running the migrations here guarantees that on any host,
// whatever its dashboard is (or isn't) configured to do.
//
// Safety:
// - `migrate deploy` only applies migrations not yet recorded, in order, and
//   holds a Postgres advisory lock, so concurrent instances serialise.
// - It never throws or blocks boot indefinitely: a failure is logged loudly
//   and the server starts anyway (no worse than before), with a timeout.
// - A migration left FAILED by an interrupted earlier attempt (P3009) blocks
//   every later deploy. For migrations written to be re-runnable (listed in
//   RERUNNABLE_MIGRATIONS — every statement guarded), it is marked rolled
//   back and applied again; anything else is left for a human.

const RERUNNABLE_MIGRATIONS = new Set(['20261011090000_paid_booking_allocation_flow']);
const TIMEOUT_MS = 120_000;

function prismaCli(): string {
  return require.resolve('prisma/build/index.js');
}

function schemaPath(): string {
  // dist/lib/auto-migrate.js and src/lib/auto-migrate.ts both sit two levels
  // below the backend root.
  return path.resolve(__dirname, '..', '..', 'prisma', 'schema.prisma');
}

/**
 * The schema's `directUrl` must be set for the CLI. Hosts that only define
 * DATABASE_URL get it derived: Neon's pooled hostnames carry "-pooler",
 * which migrations must bypass (they need a session-level advisory lock).
 */
export function migrationEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  if (!env.DIRECT_URL && env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      url.hostname = url.hostname.replace('-pooler.', '.');
      url.searchParams.delete('pgbouncer');
      env.DIRECT_URL = url.toString();
    } catch {
      env.DIRECT_URL = env.DATABASE_URL;
    }
  }
  return env;
}

function runPrisma(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(process.execPath, [prismaCli(), ...args, '--schema', schemaPath()], { env });
    const timer = setTimeout(() => {
      output += '\n[auto-migrate] timed out';
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 1, output: output + String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

/** Names of migrations Prisma reports as failed in a P3009 error. */
export function failedMigrationsIn(output: string): string[] {
  if (!output.includes('P3009')) return [];
  return [...output.matchAll(/The `([^`]+)` migration started at/g)].map((m) => m[1]!).filter(Boolean);
}

export async function applyPendingMigrations(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force && (process.env.NODE_ENV === 'test' || process.env.AUTO_MIGRATE === 'false')) return true;
  if (!process.env.DATABASE_URL) return false;

  const env = migrationEnv(process.env);
  try {
    let result = await runPrisma(['migrate', 'deploy'], env);

    if (result.code !== 0) {
      const failed = failedMigrationsIn(result.output);
      const recoverable = failed.length > 0 && failed.every((name) => RERUNNABLE_MIGRATIONS.has(name));
      if (recoverable) {
        logger.warn(`[auto-migrate] Re-running interrupted migration(s): ${failed.join(', ')}`);
        for (const name of failed) {
          await runPrisma(['migrate', 'resolve', '--rolled-back', name], env);
        }
        result = await runPrisma(['migrate', 'deploy'], env);
      }
    }

    if (result.code === 0) {
      const applied = [...result.output.matchAll(/Applying migration `([^`]+)`/g)].map((m) => m[1]);
      logger.info(applied.length ? `[auto-migrate] Applied: ${applied.join(', ')}` : '[auto-migrate] Database schema is up to date');
      return true;
    }
    logger.error(`[auto-migrate] prisma migrate deploy FAILED — the database is behind the code:\n${result.output}`);
    return false;
  } catch (e) {
    logger.error('[auto-migrate] Could not run migrations:', e);
    return false;
  }
}
