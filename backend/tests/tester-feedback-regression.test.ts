import express from 'express';
import request from 'supertest';
import prisma from '../src/services/db';
import feedRouter from '../src/api/routes/feed';
import storiesRouter from '../src/api/routes/stories';
import tripsRouter from '../src/api/routes/trips';
import guidesRouter from '../src/api/routes/guides';
import authRouter from '../src/api/routes/auth';
import { updatePrivateProfile } from '../src/services/location-privacy';
jest.mock('../src/services/location-privacy', () => ({ updatePrivateProfile: jest.fn() }));
jest.mock('../src/lib/auth-context', () => ({ requireUserId: () => 'owner', isAdmin: () => false }));

jest.mock('../src/services/db', () => ({ __esModule: true, default: {
  travelStory: { findMany: jest.fn(), findUnique: jest.fn() },
  guideReel: { findMany: jest.fn() },
  review: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  storyView: { findMany: jest.fn(), count: jest.fn() },
  storyLike: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  trip: { findUnique: jest.fn(), update: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
} }));

const app = express();
app.use(express.json());
app.use('/feed', feedRouter);
app.use('/stories', storiesRouter);
app.use('/trips', tripsRouter);
app.use('/guides', guidesRouter);
app.use('/auth', authRouter);

describe('tester feedback: delete a mistaken trip', () => {
  const id = '12345678-1234-4234-8234-123456789012';
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));
  });
  it('only removes an empty trip owned by the caller', async () => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue({ id, creatorId: 'owner', status: 'ACTIVE', _count: { members: 0, requests: 0, bookings: 0, expenses: 0 } });
    expect((await request(app).delete(`/trips/${id}`)).status).toBe(200);
    expect(prisma.trip.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'CANCELLED' } });
  });
  it.each(['members', 'requests', 'bookings', 'expenses', 'inquiryRooms', 'quotes'])('preserves a trip with %s', async (relation) => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue({ id, creatorId: 'owner', status: 'ACTIVE', _count: { [relation]: 1 } });
    expect((await request(app).delete(`/trips/${id}`)).status).toBe(409);
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });
  it('rejects another user and invalid ids', async () => {
    (prisma.trip.findUnique as jest.Mock).mockResolvedValue({ id, creatorId: 'other' });
    expect((await request(app).delete(`/trips/${id}`)).status).toBe(403);
    expect((await request(app).delete('/trips/invalid')).status).toBe(400);
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });
});

describe('tester feedback: story identity and lifetime', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the current author profile in both story listings without exposing the joined user', async () => {
    const createdAt = new Date();
    const story = { id: 'story', authorName: 'Old name', authorAvatar: 'old', createdAt,
      user: { profile: { firstName: 'New', lastName: 'Name', avatarUrl: 'new' } } };
    (prisma.travelStory.findMany as jest.Mock).mockResolvedValue([story]);
    (prisma.guideReel.findMany as jest.Mock).mockResolvedValue([]);
    for (const path of ['/feed', '/stories']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({ authorName: 'New Name', authorAvatar: 'new' });
      expect(response.body.data[0].user).toBeUndefined();
    }
  });

  it('applies a 24-hour cutoff to stories and retains feed pagination', async () => {
    (prisma.travelStory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.guideReel.findMany as jest.Mock).mockResolvedValue([]);
    const cursor = new Date().toISOString();
    const before = Date.now() - 86_400_000;
    await request(app).get('/feed').query({ cursor });
    const args = (prisma.travelStory.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.AND[0].createdAt.lt.toISOString()).toBe(cursor);
    expect(args.where.AND[1].createdAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(args.where.AND[1].createdAt.gt.getTime()).toBeLessThanOrEqual(Date.now() - 86_400_000);
    expect((prisma.guideReel.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ createdAt: { lt: new Date(cursor) } });
  });
});


describe('current identity across existing content', () => {
  const profile = { firstName: 'New', lastName: 'Name', avatarUrl: 'new-avatar' };
  beforeEach(() => jest.clearAllMocks());
  it('uses the current reviewer name on an existing review', async () => {
    (prisma.review.findMany as jest.Mock).mockResolvedValue([{ id: 'review', reviewerName: 'Old Name', reviewer: { profile }, createdAt: new Date() }]);
    const response = await request(app).get('/guides/guide/reviews');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ reviewerName: 'New Name', reviewerAvatar: 'new-avatar' });
  });
  it('uses current identities for people who already viewed a story', async () => {
    (prisma.travelStory.findUnique as jest.Mock).mockResolvedValue({ id: 'story', userId: 'owner', createdAt: new Date() });
    (prisma.storyView.findMany as jest.Mock).mockResolvedValue([{ userId: 'viewer', userName: 'Old Name', userAvatar: 'old', user: { profile }, lastViewedAt: new Date() }]);
    (prisma.storyLike.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.storyView.count as jest.Mock).mockResolvedValue(1);
    (prisma.storyLike.count as jest.Mock).mockResolvedValue(0);
    const response = await request(app).get('/stories/12345678-1234-4234-8234-123456789012/interactions');
    expect(response.status).toBe(200);
    expect(response.body.data.viewers[0]).toMatchObject({ name: 'New Name', avatar: 'new-avatar' });
  });
  it('notifies connected clients only after the profile save succeeds', async () => {
    const emit = jest.fn();
    app.set('socketio', { emit });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'owner', role: 'TOURIST', profile });
    (updatePrivateProfile as jest.Mock).mockResolvedValue(profile);
    const response = await request(app).put('/auth/profile').send({ name: 'New Name' });
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('New Name');
    expect(emit).toHaveBeenCalledWith('profileChanged', { userId: 'owner' });
    emit.mockClear();
    (updatePrivateProfile as jest.Mock).mockRejectedValue(new Error('save failed'));
    expect((await request(app).put('/auth/profile').send({ name: 'Failed Name' })).status).toBe(500);
    expect(emit).not.toHaveBeenCalled();
  });
});
