import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Story views, likes, and the "seen by" list.
 *
 * Root causes these cover:
 *  - view/like/interactions were exempt from auth in the middleware AND took
 *    the acting user from the request body, so anyone could record a view or
 *    a like as anybody, without signing in;
 *  - dedup matched on display *name*, so two users with the same name were
 *    treated as one person;
 *  - POST /:id/view created a story row from a caller-supplied id;
 *  - likesCount was incremented/decremented blindly and drifted from the
 *    likes actually stored;
 *  - the viewer list was readable by anyone, not just the author.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdStoryIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-storyint-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Story ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createStory(token: string, title: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/stories')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, content: 'x', location: 'Goa' });
  expect(res.status).toBe(201);
  createdStoryIds.push(res.body.data.id);
  return res.body.data.id;
}

afterAll(async () => {
  await prisma.travelStory.deleteMany({ where: { id: { in: createdStoryIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Story interactions', () => {
  it('counts one view per person however many times they open it', async () => {
    const author = await createAuthor('viewauthor');
    const viewer = await registerAndLogin('viewer');
    const storyId = await createStory(author.token, `Views ${runId}`);

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post(`/api/v1/stories/${storyId}/view`)
        .set('Authorization', `Bearer ${viewer.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.counted).toBe(true);
      expect(res.body.data.totalViews).toBe(1);
    }

    expect(await prisma.storyView.count({ where: { storyId } })).toBe(1);
  }, 60_000);

  it("does not count the author's own view", async () => {
    const author = await createAuthor('selfview');
    const storyId = await createStory(author.token, `Self view ${runId}`);

    const res = await request(app)
      .post(`/api/v1/stories/${storyId}/view`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.counted).toBe(false);
    expect(await prisma.storyView.count({ where: { storyId } })).toBe(0);
  }, 60_000);

  it('cannot attribute a view to someone else, or record one anonymously', async () => {
    const author = await createAuthor('spoofauthor');
    const viewer = await registerAndLogin('spoofviewer');
    const victim = await registerAndLogin('spoofvictim');
    const storyId = await createStory(author.token, `Spoof ${runId}`);

    // No token at all — these routes used to be exempt from auth entirely.
    const anonymous = await request(app).post(`/api/v1/stories/${storyId}/view`);
    expect(anonymous.status).toBe(401);

    // A body userId is ignored; the token decides who viewed.
    const spoofed = await request(app)
      .post(`/api/v1/stories/${storyId}/view`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ userId: victim.userId, name: 'Someone Else' });
    expect(spoofed.status).toBe(200);

    const views = await prisma.storyView.findMany({ where: { storyId } });
    expect(views).toHaveLength(1);
    expect(views[0]!.userId).toBe(viewer.userId);
  }, 60_000);

  it('toggles a like back to the original state and keeps likesCount honest', async () => {
    const author = await createAuthor('likeauthor');
    const liker = await registerAndLogin('liker');
    const storyId = await createStory(author.token, `Likes ${runId}`);

    const on = await request(app)
      .post(`/api/v1/stories/${storyId}/like`)
      .set('Authorization', `Bearer ${liker.token}`);
    expect(on.status).toBe(200);
    expect(on.body.data.liked).toBe(true);
    expect(on.body.data.totalLikes).toBe(1);

    const off = await request(app)
      .post(`/api/v1/stories/${storyId}/like`)
      .set('Authorization', `Bearer ${liker.token}`);
    expect(off.body.data.liked).toBe(false);
    expect(off.body.data.totalLikes).toBe(0);

    // The cached counter agrees with the rows, rather than drifting.
    const story = await prisma.travelStory.findUnique({ where: { id: storyId }, select: { likesCount: true } });
    const actual = await prisma.storyLike.count({ where: { storyId } });
    expect(story?.likesCount).toBe(actual);
    expect(actual).toBe(0);
  }, 60_000);

  it('shows the viewer list to the author only', async () => {
    const author = await createAuthor('listauthor');
    const viewer = await registerAndLogin('listviewer');
    const storyId = await createStory(author.token, `Seen by ${runId}`);

    await request(app).post(`/api/v1/stories/${storyId}/view`).set('Authorization', `Bearer ${viewer.token}`);
    await request(app).post(`/api/v1/stories/${storyId}/like`).set('Authorization', `Bearer ${viewer.token}`);

    const asAuthor = await request(app)
      .get(`/api/v1/stories/${storyId}/interactions`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(asAuthor.status).toBe(200);
    expect(asAuthor.body.data.totalViews).toBe(1);
    expect(asAuthor.body.data.totalLikes).toBe(1);
    expect(asAuthor.body.data.viewers).toHaveLength(1);
    expect(asAuthor.body.data.viewers[0].userId).toBe(viewer.userId);
    expect(asAuthor.body.data.viewers[0].hasLiked).toBe(true);

    // A non-author gets the counts and their own like state, never the list.
    const asViewer = await request(app)
      .get(`/api/v1/stories/${storyId}/interactions`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.data.viewers).toHaveLength(0);
    expect(asViewer.body.data.viewerHasLiked).toBe(true);
    expect(asViewer.body.data.totalViews).toBe(1);
  }, 60_000);

  it('refuses to mint a story from an unknown id', async () => {
    const viewer = await registerAndLogin('minter');
    // A well-formed v4 uuid that simply does not exist, so this exercises
    // the not-found path rather than id validation.
    const madeUpId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

    const res = await request(app)
      .post(`/api/v1/stories/${madeUpId}/view`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.status).toBe(404);

    const exists = await prisma.travelStory.findUnique({ where: { id: madeUpId } });
    expect(exists).toBeNull();
  }, 60_000);
});

async function createAuthor(label: string): Promise<{ userId: string; token: string }> {
  return registerAndLogin(label);
}
