import { Router } from 'express';
import { z } from 'zod';
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

const createDestinationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tags: z.string().trim().min(1).max(300).default('Travel • Explore'),
  rating: z.number().min(0).max(5).default(4.5),
  image: z.string().url().max(2000),
  rank: z.number().int().min(0).default(0),
});

// Create a new destination (admin or customer post — visible to all)
router.post('/', async (req, res) => {
  const parsed = createDestinationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: 'Please check the destination details.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const destination = await prisma.destination.create({ data: parsed.data });
    res.status(201).json({ status: 'success', data: destination });
  } catch (err) {
    logger.warn('[Destinations] Create error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create destination' });
  }
});

export default router;
