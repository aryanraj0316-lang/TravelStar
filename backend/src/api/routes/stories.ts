import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';

const router = Router();

// Get all stories. Reference data is seeded once via `npm run seed:reference`
// (prisma/seed-reference-data.ts), not implicitly on read — see
// docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  try {
    const stories = await prisma.travelStory.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ ok: true, data: stories });
  } catch (err) {
    logger.error('[Stories] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve stories' } });
  }
});

const createStorySchema = z.object({
  title: z.string().trim().min(1).max(200).default('My Travel Story'),
  content: z.string().trim().max(5000).default(''),
  coverImg: z.string().url().max(2000).optional(),
  location: z.string().trim().min(1).max(200).default('India'),
  hasReel: z.boolean().default(false),
});

// Create new story (customer post — visible to all users). Author identity
// comes from the token, never the request body — a caller cannot post as
// someone else.
router.post('/', async (req, res) => {
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the story details.', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }

  const userId = requireUserId(req);

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const authorName = user?.profile
      ? `${user.profile.firstName} ${user.profile.lastName || ''}`.trim()
      : (user?.email ? (user.email.split('@')[0] ?? 'Traveler') : 'Traveler');
    const authorAvatar = user?.profile?.avatarUrl
      || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

    const { title, content, coverImg, location, hasReel } = parsed.data;
    const story = await prisma.travelStory.create({
      data: {
        title,
        content,
        coverImg: coverImg || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
        authorName,
        authorAvatar,
        likesCount: 0,
        location,
        hasReel,
      },
    });
    res.status(201).json({ ok: true, data: story });
  } catch (err) {
    logger.warn('[Stories] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create story' } });
  }
});

// Like a story
router.post('/:id/like', async (req, res) => {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid story id.' } });
  }
  try {
    const story = await prisma.travelStory.update({
      where: { id: parsedParams.data.id },
      data: { likesCount: { increment: 1 } },
    });
    res.status(200).json({ ok: true, data: story });
  } catch (err) {
    logger.warn('[Stories] Like error:', err);
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Story not found' } });
  }
});

export default router;
