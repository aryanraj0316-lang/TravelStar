import prisma from '../services/db';
import { logger } from './logger';
import type { AlertSeverity } from '@prisma/client';

const FETCH_TIMEOUT_MS = 10000;

// GDACS (Global Disaster Alert and Coordination System) — free, no API key.
// It also reports earthquakes, drought and wildfire (EQ/DR/WF) and
// volcanoes (VO), but AlertCategory only has four India-route-hazard
// values (prisma/schema.prisma) built for a traveler deciding whether to
// take a road today, not a general disaster monitor — those event types
// are deliberately left out rather than forced into a category that would
// mislead someone reading the hazard card.
const GDACS_EVENT_TYPES = ['FL', 'TC'] as const; // Flood, Tropical Cyclone
type GdacsEventType = (typeof GDACS_EVENT_TYPES)[number];

interface GdacsProperties {
  eventtype: string;
  eventid: number;
  episodeid: number;
  name: string;
  description: string;
  htmldescription?: string;
  icon: string;
  iconoverall: string;
  alertlevel: 'Green' | 'Orange' | 'Red';
  iscurrent: string;
  country: string;
  fromdate: string;
  todate: string;
}

interface GdacsResponse {
  features: { properties: GdacsProperties }[];
}

function mapSeverity(alertlevel: string): AlertSeverity {
  if (alertlevel === 'Red') return 'CRITICAL';
  if (alertlevel === 'Orange') return 'WARNING';
  return 'ADVISORY';
}

const GDACS_ID_PREFIX = 'gdacs-';

function gdacsAlertId(p: GdacsProperties): string {
  return `${GDACS_ID_PREFIX}${p.eventtype}-${p.eventid}-${p.episodeid}`;
}

// TEMPORARY DIAGNOSTIC — remove once the real fetch failure is confirmed on
// Render. This runs on a background timer with no request/response cycle of
// its own, so this is the only way to see what actually happened on the
// last attempt.
let lastGdacsFetchError: string | null = null;

export function getLastGdacsFetchError(): string | null {
  return lastGdacsFetchError;
}

async function fetchGdacsIndia(): Promise<GdacsProperties[]> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30-day lookback
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${fmt(fromDate)}&toDate=${fmt(toDate)}&country=India`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      lastGdacsFetchError = `GDACS responded ${res.status} ${res.statusText}`;
      return [];
    }
    const data = (await res.json()) as GdacsResponse;
    lastGdacsFetchError = null;
    return (data.features || [])
      .map((f) => f.properties)
      .filter(
        (p) =>
          (GDACS_EVENT_TYPES as readonly string[]).includes(p.eventtype as GdacsEventType) &&
          p.iscurrent === 'true',
      );
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` (cause: ${String(err.cause)})` : '';
    lastGdacsFetchError = err instanceof Error ? `${err.name}: ${err.message}${cause}` : String(err);
    logger.warn('[hazard-feed] GDACS fetch failed:', err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pulls current India flood/cyclone events from GDACS and syncs them into
 * the Alert table, so the home screen's hazard card reflects a real live
 * feed instead of only whatever an admin has typed in by hand. Rows this
 * function created (id prefixed "gdacs-") that no longer appear in GDACS's
 * current window get deactivated, not deleted — same visibility rule as
 * an admin-authored alert going stale, and it keeps history intact.
 */
export async function syncLiveHazards(): Promise<{ synced: number; deactivated: number }> {
  const events = await fetchGdacsIndia();
  const seenIds = new Set<string>();

  for (const p of events) {
    const id = gdacsAlertId(p);
    seenIds.add(id);
    const kindLabel = p.eventtype === 'TC' ? 'Cyclone' : 'Flood';
    const title = p.name?.trim() || `${kindLabel} — ${p.country}`;
    const desc =
      p.htmldescription?.trim() ||
      p.description?.trim() ||
      `${kindLabel === 'Cyclone' ? 'Tropical cyclone' : 'Flood'} activity reported in ${p.country}.`;
    const severity = mapSeverity(p.alertlevel);

    await prisma.alert.upsert({
      where: { id },
      update: { severity, title, desc, location: p.country, active: true },
      create: {
        id,
        severity,
        title,
        category: 'FLOOD_RAIN',
        location: p.country,
        time: new Date(p.fromdate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        desc,
        affectedRoute: '',
        precautions: [],
        image: p.iconoverall || p.icon,
      },
    });
  }

  const existing = await prisma.alert.findMany({
    where: { id: { startsWith: GDACS_ID_PREFIX }, active: true },
    select: { id: true },
  });
  const staleIds = existing.map((a) => a.id).filter((id) => !seenIds.has(id));
  if (staleIds.length > 0) {
    await prisma.alert.updateMany({ where: { id: { in: staleIds } }, data: { active: false } });
  }

  if (events.length > 0 || staleIds.length > 0) {
    logger.info(`[hazard-feed] Synced ${events.length} live GDACS alert(s), deactivated ${staleIds.length} stale.`);
  }

  return { synced: events.length, deactivated: staleIds.length };
}

// GDACS itself doesn't update sub-hourly, so polling more often than this
// would only spend rate-limit budget for no fresher data.
const HAZARD_POLL_INTERVAL_MS = 60 * 60 * 1000; // hourly

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function runSync(): void {
  syncLiveHazards().catch((e) => logger.warn('[hazard-feed] Scheduled sync failed:', e));
}

/** Call once at startup. A no-op if already running. */
export function startHazardFeedScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(runSync, HAZARD_POLL_INTERVAL_MS);
  // Same reasoning as data-retention's scheduler — don't hold the process
  // open just for this timer.
  intervalHandle.unref();
  runSync();
}

export function stopHazardFeedScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
