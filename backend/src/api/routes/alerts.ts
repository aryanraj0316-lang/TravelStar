import { Router } from 'express';
import { z } from 'zod';
import { remoteMediaUrl } from '../../lib/validators';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireRole } from '../../middleware/auth';
import { buildPage, cursorFilter, cursorPageQuerySchema, takeWithLookahead } from '../../lib/pagination';

const router = Router();

// Get all active alerts. Reference data is seeded once via
// `npm run seed:reference` (prisma/seed-reference-data.ts), not implicitly
// on read — see docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  const parsed = cursorPageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsed.data;

  try {
    const rows = await prisma.alert.findMany({
      where: { active: true, ...cursorFilter(cursor) },
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
    });
    const { items, nextCursor } = buildPage(rows, limit);
    res.status(200).json({ ok: true, data: items, meta: { cursor: nextCursor } });
  } catch (err) {
    logger.error('[Alerts] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve alerts' } });
  }
});

const createAlertSchema = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'ADVISORY']),
  title: z.string().trim().min(1).max(200),
  category: z.enum(['FLOOD_RAIN', 'LANDSLIDE', 'CLOUDBURST', 'TRAFFIC_RUSH', 'CYCLONE', 'EARTHQUAKE', 'WILDFIRE']),
  location: z.string().trim().min(1).max(200),
  time: z.string().trim().min(1).max(100),
  desc: z.string().trim().min(1).max(2000),
  affectedRoute: z.string().trim().max(200).default(''),
  precautions: z.array(z.string().trim().min(1)).max(20).default([]),
  image: remoteMediaUrl,
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

    // Home already surfaces live alerts as a tag above Stories. Creating a
    // broadcast Notification (or push) here duplicated that same event in
    // the Notifications tab.

    res.status(201).json({ ok: true, data: { ...alert, pushed: 0 } });
  } catch (err) {
    logger.error('[Alerts] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create alert' } });
  }
});

export default router;
