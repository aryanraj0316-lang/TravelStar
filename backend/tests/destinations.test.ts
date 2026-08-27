import request from 'supertest';
import app from '../src/app';

/**
 * Integration tests for GET /api/v1/destinations/:id (docs/REMEDIATION.md
 * §8.19). destination-details.tsx previously rendered a hardcoded
 * DESTINATIONS_DATABASE constant keyed by a fabricated numeric id; this
 * route replaces it with the real reference data, keyed by the real
 * database UUID, and must stay publicly browsable with no token (same as
 * GET /destinations and GET /trips/:id already are).
 */
describe('GET /api/v1/destinations/:id', () => {
  it('is publicly reachable with no token and returns full detail content', async () => {
    const list = await request(app).get('/api/v1/destinations');
    expect(list.status).toBe(200);
    const first = list.body.data[0];
    expect(first).toBeTruthy();

    const res = await request(app).get(`/api/v1/destinations/${first.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(first.id);
    expect(typeof res.body.data.description).toBe('string');
    expect(Array.isArray(res.body.data.gallery)).toBe(true);
    expect(Array.isArray(res.body.data.specialties)).toBe(true);
  });

  it('returns 404 for a destination that does not exist', async () => {
    const res = await request(app).get('/api/v1/destinations/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
