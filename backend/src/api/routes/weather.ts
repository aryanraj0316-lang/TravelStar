import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';

const router = Router();

const FETCH_TIMEOUT_MS = 5000;

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
}

// Map Open-Meteo WMO weather codes to human-readable conditions
function mapWeatherCode(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 57) return 'Freezing Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snowfall';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 85 && code <= 86) return 'Snow Showers';
  if (code === 95) return 'Thunderstorm';
  if (code >= 96 && code <= 99) return 'Thunderstorm with Hail';
  return 'Unknown';
}

type LiveWeather = { temp: string; condition: string; humidity: string; windSpeed: string };

// Short-lived in-process cache so /weather's background refresh and repeated
// /weather/live calls for the same place don't each hit Open-Meteo
// (docs/REMEDIATION.md §10). Keyed by coordinates rounded to ~1km. This is
// per-instance and that's fine — it's a rate-limit courtesy, not a source
// of truth. A shared Redis cache is the scale-out version.
const weatherCache = new Map<string, { at: number; value: LiveWeather }>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Fetch live weather from Open-Meteo (free, no API key), cached.
async function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.at < WEATHER_CACHE_TTL_MS) return cached.value;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;

    const data = (await response.json()) as OpenMeteoResponse;
    const current = data.current;
    if (!current) return null;

    const value: LiveWeather = {
      temp: `${Math.round(current.temperature_2m)}°C`,
      condition: mapWeatherCode(current.weather_code),
      humidity: `${current.relative_humidity_2m}%`,
      windSpeed: `${Math.round(current.wind_speed_10m)} km/h`,
    };
    weatherCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    logger.warn('[Weather] Open-Meteo fetch failed:', err);
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
    logger.error('[Weather] Live weather error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve live weather' } });
  }
});

export default router;
