import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Story media: a story can carry a video asset, not just a cover image.
 *
 * Before this, TravelStory had only `coverImg`, so a video picked in the
 * composer was uploaded through the base64 image path and stored as a
 * "cover image" that no client could render — the slide came up blank.
 * `mediaUrl` + `mediaType` carry the real asset, and `coverImg` stays the
 * poster frame (and the image itself on rows that predate this).
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdStoryIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-storyvideo-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Story ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.travelStory.deleteMany({ where: { id: { in: createdStoryIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Story video media', () => {
  it('stores and returns a video story with its poster frame', async () => {
    const author = await registerAndLogin('author');

    const res = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: `Video Story ${runId}`,
        content: 'A clip from the road',
        mediaUrl: 'https://cdn.example.test/story-clip.mp4',
        mediaType: 'VIDEO',
        coverImg: 'https://cdn.example.test/story-poster.jpg',
        location: 'Manali',
      });

    expect(res.status).toBe(201);
    createdStoryIds.push(res.body.data.id);

    expect(res.body.data.mediaType).toBe('VIDEO');
    expect(res.body.data.mediaUrl).toBe('https://cdn.example.test/story-clip.mp4');
    expect(res.body.data.coverImg).toBe('https://cdn.example.test/story-poster.jpg');
    // A story carrying a video is a reel regardless of what the client sent.
    expect(res.body.data.hasReel).toBe(true);

    const list = await request(app).get('/api/v1/stories');
    expect(list.status).toBe(200);
    const mine = (list.body.data as { id: string; mediaUrl: string | null; mediaType: string }[]).find(
      (s) => s.id === res.body.data.id,
    );
    expect(mine?.mediaUrl).toBe('https://cdn.example.test/story-clip.mp4');
    expect(mine?.mediaType).toBe('VIDEO');
  }, 30_000);

  it('defaults to an image story when no media type is sent', async () => {
    const author = await registerAndLogin('legacy');

    const res = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: `Image Story ${runId}`,
        content: 'Just a photo',
        coverImg: 'https://cdn.example.test/photo.jpg',
        location: 'Goa',
      });

    expect(res.status).toBe(201);
    createdStoryIds.push(res.body.data.id);
    expect(res.body.data.mediaType).toBe('IMAGE');
    expect(res.body.data.hasReel).toBe(false);
  }, 30_000);

  it('rejects a media type it does not support', async () => {
    const author = await registerAndLogin('badtype');

    const res = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: 'Bad', content: '', mediaType: 'AUDIO', location: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  }, 30_000);
});
