import { Router } from 'express';
import prisma from '../../services/db';

const router = Router();

// Default seed data for weather locations (with coordinates for Open-Meteo)
const SEED_WEATHER = [
  { name: 'New Delhi', place: 'India Gate', temp: '32°C', condition: 'Partly Sunny', aqi: 'Good AQI • 42', humidity: '48%', image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80', latitude: 28.6139, longitude: 77.2090 },
  { name: 'Agra', place: 'Taj Mahal', temp: '34°C', condition: 'Sunny & Clear', aqi: 'Moderate AQI • 58', humidity: '42%', image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=80', latitude: 27.1767, longitude: 78.0081 },
  { name: 'Jaipur', place: 'Hawa Mahal', temp: '35°C', condition: 'Warm & Sunny', aqi: 'Moderate AQI • 65', humidity: '35%', image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Srinagar', place: 'Dal Lake', temp: '21°C', condition: 'Pleasant Breeze', aqi: 'Excellent AQI • 18', humidity: '60%', image: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=500&q=80', latitude: 34.0837, longitude: 74.7973 },
  { name: 'Varanasi', place: 'Kashi Ghats', temp: '30°C', condition: 'Clear Sky', aqi: 'Good AQI • 45', humidity: '52%', image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80', latitude: 25.3176, longitude: 83.0168 },
  { name: 'Munnar', place: 'Tea Gardens', temp: '22°C', condition: 'Mist & Clouds', aqi: 'Pure AQI • 12', humidity: '75%', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&q=80', latitude: 10.0889, longitude: 77.0595 },
  { name: 'Mumbai', place: 'Gateway of India', temp: '29°C', condition: 'Sea Breeze', aqi: 'Moderate AQI • 55', humidity: '70%', image: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=500&q=80', latitude: 19.0760, longitude: 72.8777 },
  { name: 'Leh-Ladakh', place: 'Pangong Tso', temp: '14°C', condition: 'Chilly & Sunny', aqi: 'Pure AQI • 10', humidity: '25%', image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80', latitude: 34.1526, longitude: 77.5771 },
  { name: 'Goa', place: 'Baga Beach', temp: '31°C', condition: 'Tropical Sun', aqi: 'Good AQI • 35', humidity: '68%', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80', latitude: 15.2993, longitude: 74.1240 },
  { name: 'Shimla', place: 'The Ridge', temp: '18°C', condition: 'Cool Mountain Air', aqi: 'Excellent AQI • 15', humidity: '55%', image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=500&q=80', latitude: 31.1048, longitude: 77.1734 },
  { name: 'Rishikesh', place: 'Laxman Jhula', temp: '26°C', condition: 'Pleasant & Calm', aqi: 'Good AQI • 28', humidity: '50%', image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=500&q=80', latitude: 30.0869, longitude: 78.2676 },
  { name: 'Udaipur', place: 'Lake Pichola', temp: '33°C', condition: 'Sunny Horizon', aqi: 'Moderate AQI • 48', humidity: '38%', image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=500&q=80', latitude: 24.5854, longitude: 73.7125 },
];

let seeded = false;

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
    console.warn('[Weather] Open-Meteo fetch failed:', err);
    return null;
  }
}

// GET /weather — All weather locations with staleness-based live refresh
router.get('/', async (req, res) => {
  try {
    let locations = await prisma.weatherLocation.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (locations.length === 0 && !seeded) {
      seeded = true;
      await prisma.weatherLocation.createMany({ data: SEED_WEATHER });
      locations = await prisma.weatherLocation.findMany({
        orderBy: { createdAt: 'asc' },
      });
    }

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
    console.warn('[Weather] DB error, returning seed data:', err);
    const fallback = SEED_WEATHER.map((w, i) => ({ id: `weather-${i + 1}`, ...w, lastFetchedAt: new Date().toISOString(), createdAt: new Date().toISOString() }));
    res.status(200).json({ status: 'success', data: fallback });
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
    console.error('[Weather] Live weather error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve live weather' });
  }
});

export default router;
