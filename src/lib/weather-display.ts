// Display helpers for the live-weather card (GET /weather/live).
//
// The home screen used to source its weather from GET /weather, which reads
// the `WeatherLocation` table. That table is empty in a clean database and
// has no live source that ever populates it (see the note in
// backend/prisma/seed-reference-data.ts), so the card was permanently stuck
// on "not available". The live endpoint returns real Open-Meteo readings for
// the device's own coordinates instead.
//
// Everything here is pure and derived only from fields that endpoint
// actually returns. There is no city name, no AQI and no photo in a live
// reading, so nothing here invents one.

/**
 * The glyph families the card can draw. Kept as a string union rather than
 * an icon component so this module stays renderer-free and testable, and so
 * the icon set can change without touching the mapping rules.
 */
export type WeatherGlyph = 'sun' | 'cloud-sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm';

/**
 * Maps the server's condition string to a glyph.
 *
 * The strings come from `mapWeatherCode()` in
 * backend/src/api/routes/weather.ts, which translates WMO weather codes —
 * matching on those exact phrases keeps this in step with the only producer.
 * An unrecognised condition falls back to the neutral cloud rather than
 * guessing a sunny day.
 */
export function weatherGlyph(condition: string | null | undefined): WeatherGlyph {
  const c = (condition ?? '').toLowerCase();
  if (!c) return 'cloud';
  if (c.includes('thunder')) return 'storm';
  if (c.includes('snow')) return 'snow';
  if (c.includes('fog')) return 'fog';
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
  if (c.includes('overcast') || c.includes('cloudy')) {
    // "Partly Cloudy" keeps the sun; "Overcast" and plain "Cloudy" do not.
    return c.includes('partly') ? 'cloud-sun' : 'cloud';
  }
  if (c.includes('mainly clear')) return 'cloud-sun';
  if (c.includes('clear')) return 'sun';
  return 'cloud';
}

/**
 * Rounds a coordinate to the granularity the server caches at (~1 km, two
 * decimal places — see `weatherCacheKey()` in the weather route).
 *
 * The client uses the same rounding for its React Query key so ordinary GPS
 * jitter does not miss the cache and refetch on every mount, while a real
 * move of more than about a kilometre still does.
 */
export function coarseCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
