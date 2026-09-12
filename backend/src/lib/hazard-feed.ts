import prisma from '../services/db';
import { logger } from './logger';
import type { AlertCategory, AlertSeverity } from '@prisma/client';

const FETCH_TIMEOUT_MS = 10000;

// GDACS (Global Disaster Alert and Coordination System) — free, no API key.
// Originally scoped to flood/cyclone (a traveler deciding whether to take a
// road today) and collapsed both into one FLOOD_RAIN category. Broadened to
// also sync earthquakes and wildfires so the home-screen hazard card has a
// real chance of showing something on a day with no active flood or
// cyclone — each GDACS event type now maps to its own real AlertCategory
// (see GDACS_CATEGORY below) rather than being forced into FLOOD_RAIN or
// left out. Drought (DR) and volcanic activity (VO) are still left out:
// GDACS reports them at a country/region granularity too coarse to tell a
// traveler anything actionable about "today," unlike a discrete flood,
// cyclone, earthquake, or wildfire event.
const GDACS_EVENT_TYPES = ['FL', 'TC', 'EQ', 'WF'] as const;
type GdacsEventType = (typeof GDACS_EVENT_TYPES)[number];

const GDACS_CATEGORY: Record<GdacsEventType, AlertCategory> = {
  FL: 'FLOOD_RAIN',
  TC: 'CYCLONE',
  EQ: 'EARTHQUAKE',
  WF: 'WILDFIRE',
};

const GDACS_KIND_LABEL: Record<GdacsEventType, string> = {
  FL: 'Flood',
  TC: 'Cyclone',
  EQ: 'Earthquake',
  WF: 'Wildfire',
};

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

// Same reasoning as weather.ts's openMeteoBackoffUntil: a rate limit here
// would be on Render's shared outbound IP, not on our (hourly, one-request)
// call volume, so a 429 is worth backing off from rather than retrying on
// the very next scheduled tick.
let gdacsBackoffUntil = 0;
const DEFAULT_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

async function fetchGdacsIndia(): Promise<GdacsProperties[]> {
  if (Date.now() < gdacsBackoffUntil) return [];

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30-day lookback
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${fmt(fromDate)}&toDate=${fmt(toDate)}&country=India`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      const retryAfterSeconds = Number(res.headers.get('retry-after'));
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS)
          : DEFAULT_BACKOFF_MS;
      gdacsBackoffUntil = Date.now() + backoffMs;
      logger.warn(`[hazard-feed] GDACS rate-limited us; backing off ${Math.round(backoffMs / 1000)}s`);
      return [];
    }
    if (!res.ok) return [];
    const data = (await res.json()) as GdacsResponse;
    return (data.features || [])
      .map((f) => f.properties)
      .filter(
        (p) =>
          (GDACS_EVENT_TYPES as readonly string[]).includes(p.eventtype as GdacsEventType) &&
          p.iscurrent === 'true',
      );
  } catch (err) {
    logger.warn('[hazard-feed] GDACS fetch failed:', err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pulls current India flood/cyclone/earthquake/wildfire events from GDACS
 * and syncs them into the Alert table, so the home screen's hazard card
 * reflects a real live feed instead of only whatever an admin has typed in
 * by hand. Rows this function created (id prefixed "gdacs-") that no
 * longer appear in GDACS's current window get deactivated, not deleted —
 * same visibility rule as an admin-authored alert going stale, and it
 * keeps history intact.
 */
export async function syncLiveHazards(): Promise<{ synced: number; deactivated: number }> {
  const events = await fetchGdacsIndia();
  const seenIds = new Set<string>();

  for (const p of events) {
    const id = gdacsAlertId(p);
    seenIds.add(id);
    const eventType = p.eventtype as GdacsEventType;
    const kindLabel = GDACS_KIND_LABEL[eventType];
    const title = p.name?.trim() || `${kindLabel} — ${p.country}`;
    const desc =
      p.htmldescription?.trim() ||
      p.description?.trim() ||
      `${kindLabel} activity reported in ${p.country}.`;
    const severity = mapSeverity(p.alertlevel);

    await prisma.alert.upsert({
      where: { id },
      update: { severity, title, desc, location: p.country, active: true },
      create: {
        id,
        severity,
        title,
        category: GDACS_CATEGORY[eventType],
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
