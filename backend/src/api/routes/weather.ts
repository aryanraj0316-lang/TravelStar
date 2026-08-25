import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';

const router = Router();

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

// Fetch live weather from Open-Meteo (free, no API key)
async function fetchLiveWeather(lat: number, lon: number): Promise<{ temp: string; condition: string; humidity: string; windSpeed: string } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data: any = await response.json();
    const current = data.current;
    if (!current) return null;

    return {
      temp: `${Math.round(current.temperature_2m)}°C`,
      condition: mapWeatherCode(current.weather_code),
      humidity: `${current.relative_humidity_2m}%`,
      windSpeed: `${Math.round(current.wind_speed_10m)} km/h`,
    };
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

    // Fire refreshes in background (don't block response on first load)
    Promise.allSettled(refreshPromises).catch(() => {});

    // Return current data (may include slightly stale data on first load)
    res.status(200).json({ status: 'success', data: locations });
  } catch (err) {
    logger.error('[Weather] DB error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve weather locations' });
  }
});

// GET /weather/live — Live weather at specific coordinates (for guide's current position)
router.get('/live', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ status: 'error', message: 'lat and lon query parameters required' });
  }

  try {
    const live = await fetchLiveWeather(lat, lon);
    if (!live) {
      return res.status(502).json({ status: 'error', message: 'Unable to fetch live weather data' });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        latitude: lat,
        longitude: lon,
        ...live,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('[Weather] Live weather error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve live weather' });
  }
});

export default router;
