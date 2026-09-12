import request from 'supertest';
import app from '../src/app';

/**
 * GET /api/v1/weather/trending — live weather + air quality for this app's
 * curated Destination catalogue. There is no reliable free API for
 * "trending this season", so this reuses the one real, non-fabricated
 * definition of "trending places" already in the app (the same rows the
 * home screen's Trending Destinations carousel reads), rather than
 * inventing a second concept or faking a live-trends feed.
 *
 * The success path (real fields, real values) is not pinned here — it
 * makes real outbound calls to OpenWeatherMap per destination, so pinning
 * it would make this suite depend on a third party's uptime, exactly like
 * weather-live.test.ts already reasons for GET /weather/live.
 */
describe('GET /api/v1/weather/trending', () => {
  it('is publicly reachable with no token', async () => {
    const res = await request(app).get('/api/v1/weather/trending');
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('every returned entry has real, non-empty, formatted fields', async () => {
    const res = await request(app).get('/api/v1/weather/trending');
    expect(res.status).toBe(200);

    for (const entry of res.body.data) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      // Every field is pre-formatted server-side, matching GET /weather/live's
      // contract — the client renders these verbatim.
      expect(entry.temp).toMatch(/°C$/);
      expect(typeof entry.condition).toBe('string');
      expect(entry.humidity).toMatch(/%$/);
      expect(entry.windSpeed).toMatch(/km\/h$/);
      // aqi is null when the air-pollution call failed, never a fabricated
      // label — but when present it must be one of the five real tiers.
      if (entry.aqi !== null) {
        expect(['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor']).toContain(entry.aqi);
      }
    }
  });

  it('never includes a destination whose weather could not be fetched', async () => {
    // A destination with no coordinate-table entry, or a genuine live-fetch
    // failure, is left out entirely rather than shown with invented numbers
    // — this is the one thing that's actually pinned regardless of upstream
    // availability: the response never contains a null/placeholder reading.
    const res = await request(app).get('/api/v1/weather/trending');
    for (const entry of res.body.data) {
      expect(entry.temp).not.toBeNull();
      expect(entry.condition).not.toBeNull();
    }
  });
});
