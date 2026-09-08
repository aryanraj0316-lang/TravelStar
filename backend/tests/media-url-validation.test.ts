import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Every URL field that other people will load must reject device-local and
 * inline schemes.
 *
 * `z.string().url()` delegates to the URL constructor, which accepts
 * `file:`, `blob:`, `data:` and `javascript:`. That is not academic: while
 * object storage was unconfigured, the profile screen caught the upload
 * failure and fell back to the image picker's raw `file:///…/cache/x.jpeg`
 * path, which sailed through validation and was stored as the user's
 * avatar. It rendered only on the phone that picked it and was permanently
 * broken for everyone else, including that same user on another device.
 *
 * `javascript:` is in here for a different reason — it is an XSS payload the
 * moment any surface renders one of these values into an anchor.
 */

const runId = Date.now();
const createdEmails: string[] = [];
let seq = 0;

async function registerUser(): Promise<string> {
  seq += 1;
  const email = `mediaurl-${runId}-${seq}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Media URL Tester', email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

const REJECTED = [
  ['a device-local file path', 'file:///data/user/0/com.travelstar.app/cache/ImagePicker/x.jpeg'],
  ['a blob URL', 'blob:http://localhost:8081/8f9c1f2e-1b3a-4c5d'],
  ['an inline data URI', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'],
  ['a javascript: payload', 'javascript:alert(document.cookie)'],
  ['a plain non-URL string', 'not-a-url-at-all'],
] as const;

describe('avatar URL validation', () => {
  it.each(REJECTED)('rejects %s', async (_label, url) => {
    const token = await registerUser();
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatar: url });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('accepts a real https URL and stores it', async () => {
    const token = await registerUser();
    const url = 'https://cdn.example.com/avatars/real.jpg';
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatar: url });
    expect(res.status).toBe(200);

    const profile = await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.body.data.avatar).toBe(url);
  });

  it('rejects a device-local trip cover image too', async () => {
    // Same class of bug, different surface: the create-trip screen also
    // picks a photo and could fall back to the raw picker uri.
    const token = await registerUser();
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Cover URL Test ${runId}`,
        cities: ['Delhi', 'Agra'],
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString(),
        budget: 5000,
        totalSeats: 4,
        meetingPoint: 'Delhi',
        privacy: 'PUBLIC',
        coverImage: 'file:///data/user/0/com.travelstar.app/cache/cover.jpg',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
