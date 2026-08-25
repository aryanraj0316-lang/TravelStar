// Tracks consecutive failed logins per email to support progressive lockout.
//
// Redis-backed when REDIS_URL is configured, so lockout state is correct
// across horizontally scaled instances. Falls back to an in-process Map for
// local dev without Redis — losing that fallback on restart fails open to
// "not locked" rather than locking a legitimate user out, which is the safe
// direction for a security control to fail in.

import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const LOCKOUT_SECONDS = LOCKOUT_MS / 1000;

interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

const redis: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
redis?.on('error', (err) => logger.error('[login-attempts] Redis connection error:', err));

const memory = new Map<string, AttemptRecord>();

function key(email: string): string {
  return `login-attempts:${email.trim().toLowerCase()}`;
}

async function readRecord(k: string): Promise<AttemptRecord> {
  if (redis) {
    const raw = await redis.get(k);
    return raw ? (JSON.parse(raw) as AttemptRecord) : { failures: 0, lockedUntil: null };
  }
  return memory.get(k) ?? { failures: 0, lockedUntil: null };
}

async function writeRecord(k: string, rec: AttemptRecord): Promise<void> {
  if (redis) {
    await redis.set(k, JSON.stringify(rec), 'EX', LOCKOUT_SECONDS);
    return;
  }
  memory.set(k, rec);
}

async function deleteRecord(k: string): Promise<void> {
  if (redis) {
    await redis.del(k);
    return;
  }
  memory.delete(k);
}

export async function isLockedOut(email: string): Promise<boolean> {
  const k = key(email);
  const rec = await readRecord(k);
  if (!rec.lockedUntil) return false;
  if (rec.lockedUntil > Date.now()) return true;
  await deleteRecord(k);
  return false;
}

export async function recordFailure(email: string): Promise<void> {
  const k = key(email);
  const rec = await readRecord(k);
  rec.failures += 1;
  if (rec.failures >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.failures = 0;
  }
  await writeRecord(k, rec);
}

export async function recordSuccess(email: string): Promise<void> {
  await deleteRecord(key(email));
}
