// Offline write queue (REMEDIATION.md §6.3 — "A mutation queue for offline
// writes (join requests, messages, SOS) that flushes on reconnect").
//
// Scope note: only join-request and SOS writes are queued here — both are
// plain REST calls with an obvious "retry the same call" semantics. Chat
// messages are deliberately NOT queued here: they go over the socket, not
// REST, and a correct offline story for them needs the optimistic
// send/sending/sent/failed state machine from §3.7 (not built yet) so a
// queued send can be reconciled against what the server actually persisted.
// Queuing them here now would just be thrown away when §3.7/§8.7 land.
import { safeStorage } from '@/services/storage';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/feedback';
import { ApiError } from '@/services/api';
import { onReconnect } from '@/lib/network-status';

export type QueuedMutationType = 'join-request' | 'sos';

interface QueuedMutation {
  id: string;
  type: QueuedMutationType;
  payload: unknown;
  enqueuedAt: string;
}

type Handler = (payload: unknown) => Promise<void>;

const STORAGE_KEY = 'offlineMutationQueue';
const handlers = new Map<QueuedMutationType, Handler>();
let queue: QueuedMutation[] = [];
let hydrated = false;
let flushing = false;

/** Registered once per type, from AppContext where the real apiService calls live. */
export function registerMutationHandler(type: QueuedMutationType, handler: Handler): void {
  handlers.set(type, handler);
}

async function persist(): Promise<void> {
  await safeStorage.setItem(STORAGE_KEY, JSON.stringify(queue)).catch((e) =>
    logger.warn('[OfflineQueue] Failed to persist queue:', e)
  );
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await safeStorage.getItem(STORAGE_KEY);
    if (raw) queue = JSON.parse(raw);
  } catch (e) {
    logger.warn('[OfflineQueue] Failed to read persisted queue, starting empty:', e);
  }
}

export async function enqueueMutation(type: QueuedMutationType, payload: unknown): Promise<void> {
  await hydrate();
  queue.push({ id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload, enqueuedAt: new Date().toISOString() });
  await persist();
}

/** Attempts every queued item in order. A network-level failure stops the
 * flush (nothing else will succeed either) and leaves the rest queued; a
 * server-rejected item (4xx) is dropped with a toast — retrying it forever
 * would never succeed. */
export async function flushMutationQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await hydrate();
    while (queue.length > 0) {
      const item = queue[0];
      const handler = handlers.get(item.type);
      if (!handler) {
        logger.warn(`[OfflineQueue] No handler registered for "${item.type}", dropping.`);
        queue.shift();
        continue;
      }
      try {
        await handler(item.payload);
        queue.shift();
        await persist();
      } catch (e) {
        if (e instanceof ApiError && e.statusCode !== null) {
          logger.warn(`[OfflineQueue] "${item.type}" was rejected by the server, dropping:`, e);
          toast(`A queued action could not be completed: ${e.message}`, 'error');
          queue.shift();
          await persist();
          continue;
        }
        logger.warn(`[OfflineQueue] "${item.type}" still failing (offline?), will retry on next reconnect:`, e);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function queuedMutationCount(): number {
  return queue.length;
}

/** Call once at app startup. */
export function startMutationQueueAutoFlush(): void {
  hydrate().then(() => {
    if (queue.length > 0) flushMutationQueue().catch((e) => logger.warn('[OfflineQueue] Initial flush failed:', e));
  }).catch((e) => logger.warn('[OfflineQueue] Hydrate on startup failed:', e));

  onReconnect(() => {
    flushMutationQueue().catch((e) => logger.warn('[OfflineQueue] Reconnect flush failed:', e));
  });
}
