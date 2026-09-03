import prisma from '../services/db';
import { logger } from './logger';

// Automated purge job for location data (docs/REMEDIATION.md §12.5 —
// "Data retention policy per data class... location history especially —
// do not keep it indefinitely"). LiveLocation holds one row per user,
// continuously overwritten on every position update (see
// routes/guides.ts's live-status handler) rather than a growing history
// log — but a stale row still sits in the database indefinitely once
// someone stops broadcasting, long past the point it's useful: the map
// already treats anything older than 30 minutes as gone (§8.8). A much
// longer purge window here isn't about the map's own freshness logic, it's
// about not retaining a real person's past whereabouts forever just
// because nothing ever asked the database to forget it.
const LOCATION_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function purgeStaleLiveLocations(retentionMs = LOCATION_RETENTION_MS): Promise<number> {
  const cutoff = new Date(Date.now() - retentionMs);
  const { count } = await prisma.liveLocation.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  if (count > 0) {
    logger.info(`[data-retention] Purged ${count} stale location row(s) older than ${retentionMs}ms.`);
  }
  return count;
}

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // hourly

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function runPurge(): void {
  purgeStaleLiveLocations().catch((e) => logger.warn('[data-retention] Scheduled purge failed:', e));
}

/** Call once at startup. A no-op if already running. */
export function startRetentionScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(runPurge, PURGE_INTERVAL_MS);
  // Don't hold the process open just for this timer — graceful shutdown
  // (server.ts) already stops it explicitly, and a bare `node` process
  // exiting on an empty event loop should not be blocked by a background
  // hourly job with nothing left to purge for.
  intervalHandle.unref();
  runPurge();
}

export function stopRetentionScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
