import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';

const router = Router();

// Get all stories. Reference data is seeded once via `npm run seed:reference`
// (prisma/seed-reference-data.ts), not implicitly on read — see
// docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  try {
    const stories = await prisma.travelStory.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ status: 'success', data: stories });
  } catch (err) {
    logger.error('[Stories] DB error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve stories' });
  }
});

// Create new story (customer post — visible to all users)
router.post('/', async (req, res) => {
  const { title, content, coverImg, authorName, authorAvatar, location, hasReel } = req.body;
  try {
    const story = await prisma.travelStory.create({
      data: {
        title: title || 'My Travel Story',
        content: content || '',
        coverImg: coverImg || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
        authorName: authorName || 'Traveler',
        authorAvatar: authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        likesCount: 0,
        location: location || 'India',
        hasReel: Boolean(hasReel),
      },
    });
    res.status(201).json({ status: 'success', data: story });
  } catch (err) {
    logger.warn('[Stories] Create error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create story' });
  }
});

// Like a story
router.post('/:id/like', async (req, res) => {
  const { id } = req.params;
  try {
    const story = await prisma.travelStory.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
    });
    res.status(200).json({ status: 'success', data: story });
  } catch (err) {
    logger.warn('[Stories] Like error:', err);
    res.status(404).json({ status: 'error', message: 'Story not found' });
  }
});

export default router;
