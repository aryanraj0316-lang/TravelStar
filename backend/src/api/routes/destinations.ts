import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';

const router = Router();

// Get all destinations. Reference data is seeded once via
// `npm run seed:reference` (prisma/seed-reference-data.ts), not implicitly
// on read — see docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  try {
    const destinations = await prisma.destination.findMany({
      orderBy: { rank: 'asc' },
    });
    res.status(200).json({ status: 'success', data: destinations });
  } catch (err) {
    logger.error('[Destinations] DB error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve destinations' });
  }
});

// Create a new destination (admin or customer post — visible to all)
router.post('/', async (req, res) => {
  const { name, tags, rating, image, rank } = req.body;
  try {
    const destination = await prisma.destination.create({
      data: {
        name: name || 'New Destination',
        tags: tags || 'Travel • Explore',
        rating: parseFloat(rating) || 4.5,
        image: image || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
        rank: parseInt(rank) || 0,
      },
    });
    res.status(201).json({ status: 'success', data: destination });
  } catch (err) {
    logger.warn('[Destinations] Create error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create destination' });
  }
});

export default router;
