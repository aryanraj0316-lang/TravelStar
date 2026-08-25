import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireRole } from '../../middleware/auth';

const router = Router();

// Get all active alerts. Reference data is seeded once via
// `npm run seed:reference` (prisma/seed-reference-data.ts), not implicitly
// on read — see docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ ok: true, data: alerts });
  } catch (err) {
    logger.error('[Alerts] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve alerts' } });
  }
});

const createAlertSchema = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'ADVISORY']),
  title: z.string().trim().min(1).max(200),
  category: z.enum(['FLOOD_RAIN', 'LANDSLIDE', 'CLOUDBURST', 'TRAFFIC_RUSH']),
  location: z.string().trim().min(1).max(200),
  time: z.string().trim().min(1).max(100),
  desc: z.string().trim().min(1).max(2000),
  affectedRoute: z.string().trim().max(200).default(''),
  precautions: z.array(z.string().trim().min(1)).max(20).default([]),
  image: z.string().url().max(2000),
});

// Create a new alert (admin only — this is a safety-critical broadcast to
// every user, not something any logged-in account should be able to post).
router.post('/', requireRole(['ADMIN']), async (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the alert details.', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }

  try {
    const alert = await prisma.alert.create({ data: parsed.data });
    res.status(201).json({ ok: true, data: alert });
  } catch (err) {
    logger.error('[Alerts] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create alert' } });
  }
});

export default router;
