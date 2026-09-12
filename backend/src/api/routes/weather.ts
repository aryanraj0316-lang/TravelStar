import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { cached } from '../../lib/cache';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import { coordsForCity } from '../../lib/india-city-coords';

const router = Router();

const FETCH_TIMEOUT_MS = 5000;

interface OpenWeatherMapResponse {
  main?: { temp: number; humidity: number };
  wind?: { speed: number };
  weather?: { main: string; description: string }[];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

type LiveWeather = { temp: string; condition: string; humidity: string; windSpeed: string };

// Cache TTL for a live reading. Weather does not move fast enough for a
// shorter window to buy anything, and a request budget — even a generous
// one — is a courtesy we should not spend one call per instance per call
// (docs/REMEDIATION.md §10). Keys round coordinates to ~1km so a moving
// guide doesn't miss the cache on every GPS jitter.
const WEATHER_CACHE_TTL_SECONDS = 10 * 60;

function weatherCacheKey(lat: number, lon: number): string {
  return `weather:live:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// Fetch live weather from OpenWeatherMap, cached — shared across instances
// when REDIS_URL is set, per-process otherwise.
function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeather | null> {
  return cached(weatherCacheKey(lat, lon), WEATHER_CACHE_TTL_SECONDS, () => fetchLiveWeatherUncached(lat, lon));
}

// Was Open-Meteo (free, keyless) until its rate limit — scoped to *caller
// IP*, not to any account of ours — turned into a real, sustained outage:
// on a host with a shared outbound IP, that limit is shared with every
// other tenant's traffic too, not just this app's own. A key-gated provider
// scopes the limit to this app's own account instead, which a shared IP
// cannot exhaust on our behalf.
//
// Still worth backing off on 429/401 rather than retrying immediately —
// this is a generous free tier (1M calls/month), but a misconfigured key or
// a genuine burst is still a real operating condition, not one to hammer
// through. Global (not per-coordinate, unlike the per-location cache above)
// since any such limit is on the account making the call, not on which
// coordinates it asked about.
let backoffUntil = 0;
const DEFAULT_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

class WeatherNotConfiguredError extends Error {
  constructor() {
    super('OPENWEATHERMAP_API_KEY is not set.');
    this.name = 'WeatherNotConfiguredError';
  }
}

async function fetchLiveWeatherUncached(lat: number, lon: number): Promise<LiveWeather | null> {
  if (!env.OPENWEATHERMAP_API_KEY) throw new WeatherNotConfiguredError();
  if (Date.now() < backoffUntil) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${env.OPENWEATHERMAP_API_KEY}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401) {
      // A freshly created OpenWeatherMap key can take up to ~2 hours to
      // activate — this is a documented, expected transient state right
      // after signup, not necessarily a wrong or revoked key.
      logger.warn('[Weather] OpenWeatherMap returned 401 — a new key can take up to 2h to activate.');
      return null;
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS)
          : DEFAULT_BACKOFF_MS;
      backoffUntil = Date.now() + backoffMs;
      logger.warn(`[Weather] OpenWeatherMap rate-limited us; backing off ${Math.round(backoffMs / 1000)}s`);
      return null;
    }
    if (!response.ok) return null;

    const data = (await response.json()) as OpenWeatherMapResponse;
    if (!data.main || !data.wind) return null;

    const description = data.weather?.[0]?.description;
    return {
      temp: `${Math.round(data.main.temp)}°C`,
      condition: description ? titleCase(description) : (data.weather?.[0]?.main ?? 'Unknown'),
      humidity: `${data.main.humidity}%`,
      // OpenWeatherMap's `units=metric` gives wind speed in m/s, not km/h.
      windSpeed: `${Math.round(data.wind.speed * 3.6)} km/h`,
    };
  } catch (err) {
    logger.warn('[Weather] OpenWeatherMap fetch failed:', err);
    return null;
  }
}

interface AirPollutionResponse {
  list?: { main: { aqi: number } }[];
}

const AQI_LABELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'] as const;

const AQI_CACHE_TTL_SECONDS = 10 * 60;

function aqiCacheKey(lat: number, lon: number): string {
  return `weather:aqi:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// Same reasoning as fetchLiveWeather's backoff — a separate tracker since
// this is a different OpenWeatherMap endpoint with its own limit.
let aqiBackoffUntil = 0;

function fetchAirQuality(lat: number, lon: number): Promise<string | null> {
  return cached(aqiCacheKey(lat, lon), AQI_CACHE_TTL_SECONDS, () => fetchAirQualityUncached(lat, lon));
}

async function fetchAirQualityUncached(lat: number, lon: number): Promise<string | null> {
  if (!env.OPENWEATHERMAP_API_KEY) return null;
  if (Date.now() < aqiBackoffUntil) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${env.OPENWEATHERMAP_API_KEY}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS)
          : DEFAULT_BACKOFF_MS;
      aqiBackoffUntil = Date.now() + backoffMs;
      logger.warn(`[Weather] OpenWeatherMap air-pollution rate-limited us; backing off ${Math.round(backoffMs / 1000)}s`);
      return null;
    }
    if (!response.ok) {
      logger.warn(`[Weather] OpenWeatherMap air-pollution responded ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as AirPollutionResponse;
    const aqi = data.list?.[0]?.main.aqi;
    if (!aqi || aqi < 1 || aqi > 5) return null;

    return AQI_LABELS[aqi - 1] ?? null;
  } catch (err) {
    logger.warn('[Weather] OpenWeatherMap air-pollution fetch failed:', err);
    return null;
  }
}

// GET /weather — All weather locations with staleness-based live refresh
router.get('/', async (req, res) => {
  try {
    const locations = await prisma.weatherLocation.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Refresh stale locations (older than 30 minutes) with live data
    const STALE_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    const refreshPromises = locations
      .filter((loc) => loc.latitude && loc.longitude && (now - new Date(loc.lastFetchedAt).getTime() > STALE_MS))
      .slice(0, 3) // Limit concurrent refreshes to avoid rate limiting
      .map(async (loc) => {
        const live = await fetchLiveWeather(loc.latitude!, loc.longitude!);
        if (live) {
          return prisma.weatherLocation.update({
            where: { id: loc.id },
            data: {
              temp: live.temp,
              condition: live.condition,
              humidity: live.humidity,
              lastFetchedAt: new Date(),
            },
          });
        }
        return null;
      });

    // Fire refreshes in the background — never block the response on a
    // third-party call. Each promise already handles its own errors
    // (fetchLiveWeather catches; the update is best-effort), so allSettled
    // here cannot reject — no `.catch(() => {})` (banned, docs §0.3).
    void Promise.allSettled(refreshPromises);

    // Reference-ish data — let clients/CDN cache briefly (docs §10).
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ ok: true, data: locations });
  } catch (err) {
    logger.error('[Weather] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve weather locations' } });
  }
});

const liveWeatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

// GET /weather/live — Live weather at specific coordinates (for guide's current position)
router.get('/live', async (req, res) => {
  const parsed = liveWeatherQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Valid lat and lon query parameters are required.' } });
  }
  const { lat, lon } = parsed.data;

  try {
    const live = await fetchLiveWeather(lat, lon);
    if (!live) {
      return res.status(502).json({ ok: false, error: { code: 'INTERNAL', message: 'Unable to fetch live weather data' } });
    }

    return res.status(200).json({ ok: true, data: {
        latitude: lat,
        longitude: lon,
        ...live,
        fetchedAt: new Date().toISOString(),
      } });
  } catch (err) {
    if (err instanceof WeatherNotConfiguredError) {
      return res
        .status(503)
        .json({ ok: false, error: { code: 'WEATHER_UNAVAILABLE', message: 'Live weather is not available right now.' } });
    }
    logger.error('[Weather] Live weather error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve live weather' } });
  }
});

// GET /weather/trending — Live weather + air quality for this app's
// curated destination catalogue (the same `Destination` rows the home
// screen's Trending Destinations carousel already reads, ordered by the
// same `rank`). There is no reliable free API for "what's trending this
// season" — that data is normally a paid tourism-analytics product — so
// this reuses the one real, non-fabricated definition of "trending
// places" already in the app, rather than inventing a second one or
// faking a live-internet-trends feed. A destination whose name has no
// entry in the coordinate table, or whose live weather/AQI genuinely
// fails, is left out of the response rather than shown with invented
// numbers — the client's empty state covers the all-fail case.
router.get('/trending', async (req, res) => {
  try {
    const destinations = await prisma.destination.findMany({ orderBy: { rank: 'asc' } });

    const withCoords = destinations
      .map((d) => ({ destination: d, coords: coordsForCity(d.name) }))
      .filter((d): d is { destination: (typeof destinations)[number]; coords: { lat: number; lng: number } } => {
        if (!d.coords) logger.warn(`[Weather] No coordinates for trending destination "${d.destination.name}"`);
        return d.coords !== null;
      });

    const results = await Promise.all(
      withCoords.map(async ({ destination, coords }) => {
        const [live, aqi] = await Promise.all([
          fetchLiveWeather(coords.lat, coords.lng),
          fetchAirQuality(coords.lat, coords.lng),
        ]);
        if (!live) return null;
        return {
          id: destination.id,
          name: destination.name,
          tags: destination.tags,
          image: destination.image,
          ...live,
          aqi,
        };
      }),
    );

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ ok: true, data: results.filter((r) => r !== null) });
  } catch (err) {
    logger.error('[Weather] Trending weather error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve trending weather' } });
  }
});

export default router;
