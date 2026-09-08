import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for GET /api/v1/destinations/:id (docs/REMEDIATION.md
 * §8.19). destination-details.tsx previously rendered a hardcoded
 * DESTINATIONS_DATABASE constant keyed by a fabricated numeric id; this
 * route replaces it with the real reference data, keyed by the real
 * database UUID, and must stay publicly browsable with no token (same as
 * GET /destinations and GET /trips/:id already are).
 *
 * Owns its own fixture row rather than reading GET /destinations and
 * grabbing whatever is first — `npm run db:empty` (prisma/empty-db.ts) is a
 * real, documented operational path for this database, and `npm run
 * seed:reference` is a separate, optional step run after it. A test that
 * only passes when the reference seed happens to have been run is testing
 * the seed script, not this route.
 */
describe('GET /api/v1/destinations/:id', () => {
  const runId = Date.now();
  let destinationId: string;

  beforeAll(async () => {
    const destination = await prisma.destination.create({
      data: {
        name: `Test Destination ${runId}`,
        tags: 'Test • Fixture',
        rating: 4.5,
        image: 'https://images.example.com/test.jpg',
        rank: 999,
        description: 'A fixture destination created by this test suite.',
        gallery: ['https://images.example.com/gallery1.jpg'],
        specialties: [{ icon: 'star', title: 'Test specialty', desc: 'A test specialty entry.' }],
      },
    });
    destinationId = destination.id;
  });

  afterAll(async () => {
    await prisma.destination.delete({ where: { id: destinationId } });
    await prisma.$disconnect();
  });

  it('is publicly reachable with no token and returns full detail content', async () => {
    const res = await request(app).get(`/api/v1/destinations/${destinationId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(destinationId);
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
