import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Integration tests for saved destinations — the profile screen's
 * "Saved Destinations" list.
 *
 * That list used to read `profile.savedPlaces`, a key that existed only in
 * the client's own UserProfile type. The server's updateProfile schema has
 * no such field, so Zod stripped it on the way in and answered `ok: true`
 * while persisting nothing; nothing in the app could add to the list
 * either, so it was permanently empty and its delete button wrote to a
 * value the server discarded.
 *
 * The most important case here is the last one: `/destinations/saved` must
 * NOT be readable anonymously. The public-GET allowlist matches
 * `/destinations/:id`, which would otherwise treat the literal string
 * "saved" as a destination id and serve one user's private bookmarks to
 * anybody — the same trap `/trips/mine` is guarded against.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdDestinationIds: string[] = [];
let userSeq = 0;

async function registerUser(): Promise<string> {
  userSeq += 1;
  const email = `saved-${runId}-${userSeq}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Saved Tester', email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

async function createDestination(): Promise<string> {
  const destination = await prisma.destination.create({
    data: {
      name: `Saved Fixture ${runId}-${createdDestinationIds.length}`,
      tags: 'Test • Fixture',
      rating: 4.5,
      image: 'https://images.example.com/fixture.jpg',
      rank: 900 + createdDestinationIds.length,
    },
  });
  createdDestinationIds.push(destination.id);
  return destination.id;
}

afterAll(async () => {
  await prisma.destination.deleteMany({ where: { id: { in: createdDestinationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('saved destinations', () => {
  it('saves, lists and removes a destination', async () => {
    const token = await registerUser();
    const destinationId = await createDestination();

    const save = await request(app)
      .put(`/api/v1/destinations/${destinationId}/saved`)
      .set('Authorization', `Bearer ${token}`);
    expect(save.status).toBe(200);
    expect(save.body.data).toMatchObject({ destinationId, saved: true });

    const list = await request(app).get('/api/v1/destinations/saved').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: destinationId });
    // The list carries enough to render a card without a second fetch.
    expect(typeof list.body.data[0].name).toBe('string');
    expect(typeof list.body.data[0].image).toBe('string');

    const remove = await request(app)
      .delete(`/api/v1/destinations/${destinationId}/saved`)
      .set('Authorization', `Bearer ${token}`);
    expect(remove.status).toBe(200);

    const after = await request(app).get('/api/v1/destinations/saved').set('Authorization', `Bearer ${token}`);
    expect(after.body.data).toEqual([]);
  });

  it('is idempotent — saving twice does not duplicate or fail', async () => {
    const token = await registerUser();
    const destinationId = await createDestination();

    const first = await request(app)
      .put(`/api/v1/destinations/${destinationId}/saved`)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .put(`/api/v1/destinations/${destinationId}/saved`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const list = await request(app).get('/api/v1/destinations/saved').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);
  });

  it('removing something that was never saved is not an error', async () => {
    const token = await registerUser();
    const destinationId = await createDestination();
    const res = await request(app)
      .delete(`/api/v1/destinations/${destinationId}/saved`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('404s when saving a destination that does not exist', async () => {
    const token = await registerUser();
    const res = await request(app)
      .put('/api/v1/destinations/00000000-0000-0000-0000-000000000000/saved')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DESTINATION_NOT_FOUND');
  });

  it('keeps one user\'s bookmarks invisible to another', async () => {
    const tokenA = await registerUser();
    const tokenB = await registerUser();
    const destinationId = await createDestination();

    await request(app).put(`/api/v1/destinations/${destinationId}/saved`).set('Authorization', `Bearer ${tokenA}`);

    const listB = await request(app).get('/api/v1/destinations/saved').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.data).toEqual([]);
  });

  it('never serves the saved list to an anonymous caller', async () => {
    // /destinations/:id is a public GET; "saved" must not slip through it.
    const res = await request(app).get('/api/v1/destinations/saved');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('still serves a real destination by id anonymously', async () => {
    // The exclusion above must not have broken the public detail route.
    const destinationId = await createDestination();
    const res = await request(app).get(`/api/v1/destinations/${destinationId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(destinationId);
  });
});
