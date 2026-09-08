import request from 'supertest';
import app from '../src/app';

/**
 * Integration tests for GET /api/v1/weather/live — the endpoint the home
 * screen's weather card now reads.
 *
 * The card used to source from GET /weather (the `WeatherLocation` table),
 * which is empty in a clean database and has no live source that ever
 * populates it (see backend/prisma/seed-reference-data.ts), so it was
 * permanently stuck on "not available". These tests pin the two properties
 * the client depends on: the route is publicly browsable with no token
 * (the app is browse-before-login), and it validates its coordinates rather
 * than passing junk upstream to Open-Meteo.
 *
 * The success path deliberately is not asserted here: it makes a real
 * outbound call to Open-Meteo, so pinning it would make this suite depend
 * on a third party's uptime. The client renders <ScreenError> for any
 * non-200 from this route, which is the branch that matters.
 */
describe('GET /api/v1/weather/live', () => {
  it('is publicly reachable with no token', async () => {
    const res = await request(app).get('/api/v1/weather/live?lat=28.61&lon=77.21');
    // 200 with a reading, or 502 when Open-Meteo is unreachable. Never 401:
    // a logged-out visitor must be able to see local weather.
    expect(res.status).not.toBe(401);
    expect([200, 502]).toContain(res.status);
  });

  it('rejects missing coordinates with a 400, not a guess', async () => {
    const res = await request(app).get('/api/v1/weather/live');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects out-of-range coordinates', async () => {
    const res = await request(app).get('/api/v1/weather/live?lat=999&lon=77.21');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects non-numeric coordinates', async () => {
    const res = await request(app).get('/api/v1/weather/live?lat=north&lon=east');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns a display-formatted reading when upstream answers', async () => {
    const res = await request(app).get('/api/v1/weather/live?lat=28.61&lon=77.21');
    if (res.status !== 200) return; // upstream unreachable — covered above

    const data = res.body.data;
    // Every field is pre-formatted server-side, matching the LiveWeather type
    // in src/types/api.ts. The client renders these strings verbatim; it does
    // not append its own units.
    expect(typeof data.temp).toBe('string');
    expect(data.temp).toMatch(/°C$/);
    expect(typeof data.condition).toBe('string');
    expect(data.humidity).toMatch(/%$/);
    expect(data.windSpeed).toMatch(/km\/h$/);
    expect(typeof data.fetchedAt).toBe('string');
  });
});
