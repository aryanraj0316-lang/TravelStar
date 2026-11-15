import express from 'express';
import request from 'supertest';
import prisma from '../src/services/db';
import { contentSafety } from '../src/middleware/content-safety';
import { filterSocial } from '../src/services/content-safety';
import feedRouter from '../src/api/routes/feed';

jest.mock('../src/services/db', () => ({ __esModule: true, default: {
  userBlock: { findMany: jest.fn().mockResolvedValue([]) },
  hiddenContent: { findMany: jest.fn().mockResolvedValue([]) },
  userSafetyStatus: { findMany: jest.fn().mockResolvedValue([]) },
  travelStory: { findMany: jest.fn() },
  guideReel: { findMany: jest.fn().mockResolvedValue([]) },
} }));

test('another phone receives a fresh story with a usable expiry timestamp through safety middleware', async () => {
  const createdAt = new Date();
  (prisma.travelStory.findMany as jest.Mock).mockResolvedValue([{
    id: 'published-story', userId: 'another-user', createdAt,
    title: 'Shared story', mediaType: 'IMAGE', mediaUrl: 'https://example.com/story.jpg',
    user: { profile: { firstName: 'Author', lastName: '', avatarUrl: null } },
  }]);
  const app = express();
  app.use(contentSafety);
  app.use('/feed', feedRouter);
  const response = await request(app).get('/feed');
  expect(response.status).toBe(200);
  expect(response.body.data[0].createdAt).toBe(createdAt.toISOString());
  // This is the receiving app's 24-hour visibility check.
  expect(response.body.data.filter((story: { createdAt: string }) =>
    Date.parse(story.createdAt) > Date.now() - 86_400_000)).toHaveLength(1);
});

test('nested dates survive while hidden and blocked content stays filtered', () => {
  const createdAt = new Date('2026-11-15T18:00:00.000Z');
  const result = filterSocial({ items: [
    { id: 'visible', createdAt, nested: { updatedAt: createdAt } },
    { id: 'hidden', createdAt },
    { id: 'blocked-story', userId: 'blocked', createdAt },
  ] }, { users: new Set(['blocked']), content: new Set(['hidden']) });
  expect(JSON.parse(JSON.stringify(result))).toEqual({ items: [{
    id: 'visible', createdAt: createdAt.toISOString(), nested: { updatedAt: createdAt.toISOString() },
  }] });
});
