import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

interface Location {
  latitude: number;
  longitude: number;
  updatedAt: number;
}

const TTL_SECONDS = 5 * 60;

// Redis-backed when REDIS_URL is configured (required for a horizontally
// scaled deployment — see docs/REMEDIATION.md §3.8). Falls back to a
// per-process, TTL-pruned Map for local development so `npm run dev` works
// without standing up Redis. The fallback is explicitly single-instance and
// lost on restart; it is not a substitute for Redis in production.
const redis: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
redis?.on('error', (err) => logger.error('[presence-store] Redis connection error:', err));

const memory = new Map<string, Location>();

function pruneMemory(): void {
  const cutoff = Date.now() - TTL_SECONDS * 1000;
  for (const [userId, loc] of memory) {
    if (loc.updatedAt < cutoff) memory.delete(userId);
  }
}

function key(userId: string): string {
  return `presence:location:${userId}`;
}

export async function setUserLocation(
  userId: string,
  loc: { latitude: number; longitude: number }
): Promise<void> {
  const value: Location = { ...loc, updatedAt: Date.now() };
  if (redis) {
    await redis.set(key(userId), JSON.stringify(value), 'EX', TTL_SECONDS);
    return;
  }
  pruneMemory();
  memory.set(userId, value);
}

export async function getUserLocation(userId: string): Promise<Location | null> {
  if (redis) {
    const raw = await redis.get(key(userId));
    return raw ? (JSON.parse(raw) as Location) : null;
  }
  pruneMemory();
  return memory.get(userId) ?? null;
}

export function isPresenceBackedByRedis(): boolean {
  return redis !== null;
}
