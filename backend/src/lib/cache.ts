import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// A tiny read-through cache for third-party and reference data
// (docs/REMEDIATION.md Phase 10 — "Redis caching for weather and
// destinations").
//
// Redis-backed when REDIS_URL is configured, so every instance behind the
// load balancer shares one entry and an upstream provider sees one request
// per TTL rather than one per instance. Falls back to a per-process,
// TTL-pruned Map so `npm run dev` and the test suite work without standing
// up Redis — the fallback is explicitly single-instance and lost on restart.
//
// The cache is never a source of truth: every failure path here degrades to
// "cache miss" and lets the caller do the real work. A Redis outage must not
// turn into an API outage.

const redis: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
redis?.on('error', (err) => logger.error('[cache] Redis connection error:', err));

interface Entry {
  value: string;
  expiresAt: number;
}

const memory = new Map<string, Entry>();
// Bound the fallback map so a wide key space (per-coordinate weather, say)
// cannot grow it without limit in a long-lived process.
const MEMORY_MAX_ENTRIES = 500;

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(k);
  }
  // Still over budget after dropping the expired ones: evict oldest-inserted
  // first (Map preserves insertion order).
  while (memory.size > MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next();
    if (oldest.done) break;
    memory.delete(oldest.value);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (redis) {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  } catch (err) {
    logger.warn('[cache] read failed, treating as a miss', { key, err });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    if (redis) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
    pruneMemory();
    memory.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
  } catch (err) {
    logger.warn('[cache] write failed, continuing uncached', { key, err });
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    if (redis) {
      await redis.del(key);
      return;
    }
    memory.delete(key);
  } catch (err) {
    logger.warn('[cache] delete failed, entry will expire on its TTL', { key, err });
  }
}

/**
 * Read-through helper: return the cached value, or call `produce` and cache
 * whatever it returns. A `null` result is deliberately NOT cached — the
 * callers use `null` to mean "the upstream call failed", and caching a
 * failure for the full TTL would turn a blip into minutes of degradation.
 */
export async function cached<T>(key: string, ttlSeconds: number, produce: () => Promise<T | null>): Promise<T | null> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await produce();
  if (value !== null) await cacheSet(key, value, ttlSeconds);
  return value;
}

export function isCacheBackedByRedis(): boolean {
  return redis !== null;
}

/** Test/shutdown hook — drops the Redis connection so the process can exit. */
export async function closeCache(): Promise<void> {
  memory.clear();
  if (redis) await redis.quit();
}
