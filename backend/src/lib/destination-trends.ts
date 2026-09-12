import prisma from '../services/db';
import { logger } from './logger';

// Real, live "trending" for the app's own curated Destination catalogue.
//
// There is no reliable free API for "trending travel destinations this
// season" — that data is normally a paid tourism-analytics product. What
// genuinely is free, keyless, and official is Wikimedia's Pageviews API:
// real public interest in a place, refreshed daily. This uses it to
// re-order the app's existing destination rows by recent page-view volume
// — it can never introduce a destination that isn't already a real,
// curated row with its own real coordinates and image, so a spike in some
// unrelated Wikipedia article can never inject a fabricated destination
// into either carousel that reads `rank`. A destination with no mapped
// article is left at whatever rank it already has, not zeroed out.
const WIKIPEDIA_ARTICLE_BY_DESTINATION: Record<string, string> = {
  Ladakh: 'Ladakh',
  Andaman: 'Andaman_and_Nicobar_Islands',
  Goa: 'Goa',
  Kerala: 'Kerala',
  Manali: 'Manali,_Himachal_Pradesh',
  Varanasi: 'Varanasi',
  Udaipur: 'Udaipur',
  Darjeeling: 'Darjeeling',
};

const FETCH_TIMEOUT_MS = 8000;
const PAGEVIEWS_LOOKBACK_DAYS = 7;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}00`;
}

interface PageviewsResponse {
  items?: { views: number }[];
}

async function fetchRecentPageviews(article: string): Promise<number | null> {
  const end = new Date();
  const start = new Date(end.getTime() - PAGEVIEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${article}/daily/${fmtDate(start)}/${fmtDate(end)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // A descriptive User-Agent is Wikimedia's own etiquette requirement for
    // API callers, not an authentication credential.
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TravelStar/1.0 (https://travelstar.onrender.com)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PageviewsResponse;
    return (data.items ?? []).reduce((sum, item) => sum + item.views, 0);
  } catch (err) {
    logger.warn(`[destination-trends] Pageviews fetch failed for "${article}":`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Re-ranks every Destination this app can map to a Wikipedia article by
 * real recent page-view volume — highest views becomes rank 1, so both
 * GET /destinations and GET /weather/trending (both order by rank asc)
 * surface the same, genuinely live "what's trending" order. Sequential,
 * not parallel: this is a small, once-a-day background job, not a
 * user-facing request, and there is no reason to hit a free public API
 * with a burst of simultaneous calls when one at a time costs nothing.
 */
export async function refreshTrendingRanks(): Promise<{ updated: number }> {
  const destinations = await prisma.destination.findMany({ select: { id: true, name: true } });

  const scored: { id: string; views: number }[] = [];
  for (const d of destinations) {
    const article = WIKIPEDIA_ARTICLE_BY_DESTINATION[d.name];
    if (!article) continue;
    const views = await fetchRecentPageviews(article);
    if (views !== null) scored.push({ id: d.id, views });
  }

  scored.sort((a, b) => b.views - a.views);
  await Promise.all(scored.map((s, i) => prisma.destination.update({ where: { id: s.id }, data: { rank: i + 1 } })));

  if (scored.length > 0) {
    logger.info(`[destination-trends] Refreshed rank for ${scored.length} destination(s) from real Wikipedia pageviews.`);
  }
  return { updated: scored.length };
}

// Pageviews are a daily aggregate upstream — refreshing faster than this
// would not surface any fresher data, only spend more of Wikimedia's free
// API budget for no benefit.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function runRefresh(): void {
  refreshTrendingRanks().catch((e) => logger.warn('[destination-trends] Scheduled refresh failed:', e));
}

/** Call once at startup. A no-op if already running. */
export function startDestinationTrendsScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(runRefresh, REFRESH_INTERVAL_MS);
  // Same reasoning as hazard-feed's scheduler — don't hold the process open
  // just for this timer.
  intervalHandle.unref();
  runRefresh();
}

export function stopDestinationTrendsScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
