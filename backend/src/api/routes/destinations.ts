import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { requireUserId } from '../../lib/auth-context';
import { cacheDelete, cached } from '../../lib/cache';
import { logger } from '../../lib/logger';

const router = Router();

// Destinations are reference data: seeded out of band, read on nearly every
// screen, and changed rarely. Cache the whole list rather than hitting
// Postgres for it on every app launch (docs/REMEDIATION.md §10). The TTL is
// short enough that a POST is visible quickly even without the explicit
// invalidation below.
const DESTINATIONS_CACHE_KEY = 'destinations:all';
const DESTINATIONS_CACHE_TTL_SECONDS = 600;

// Get all destinations. Reference data is seeded once via
// `npm run seed:reference` (prisma/seed-reference-data.ts), not implicitly
// on read — see docs/REMEDIATION.md §4.9.
router.get('/', async (req, res) => {
  try {
    const destinations = await cached(DESTINATIONS_CACHE_KEY, DESTINATIONS_CACHE_TTL_SECONDS, () =>
      prisma.destination.findMany({ orderBy: { rank: 'asc' } })
    );
    res.setHeader('Cache-Control', 'public, max-age=600'); // reference data (docs §10)
    res.status(200).json({ ok: true, data: destinations });
  } catch (err) {
    logger.error('[Destinations] DB error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve destinations' } });
  }
});

// ── Saved destinations ──────────────────────────────────────────────────
//
// The profile screen's "Saved Destinations" list. It used to read
// `profile.savedPlaces`, a key that existed only in the client's own
// UserProfile type — the server's updateProfile schema never had it, so Zod
// stripped it and returned `ok: true` while persisting nothing. Nothing in
// the app could add to the list either, so it was permanently empty and its
// delete button wrote to a value the server discarded.
//
// These three routes are all authenticated: a bookmark list is private to
// the user who made it, unlike the destination catalogue itself.

// Declared before `/:id` on purpose — Express matches in order, and
// `/destinations/saved` would otherwise be read as a destination whose id
// is the literal string "saved".
router.get('/saved', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const saved = await prisma.savedDestination.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { destination: true },
    });
    return res.status(200).json({
      ok: true,
      data: saved.map((row) => ({
        id: row.destination.id,
        name: row.destination.name,
        tags: row.destination.tags,
        rating: row.destination.rating,
        image: row.destination.image,
        savedAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error('[Destinations] List saved error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load your saved destinations' } });
  }
});

router.put('/:id/saved', async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  try {
    const destination = await prisma.destination.findUnique({ where: { id }, select: { id: true } });
    if (!destination) {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'DESTINATION_NOT_FOUND', message: 'Destination not found' } });
    }
    // Idempotent: saving something already saved is a success, not a 409.
    // The unique index makes the upsert the whole concurrency story.
    await prisma.savedDestination.upsert({
      where: { userId_destinationId: { userId, destinationId: id } },
      create: { userId, destinationId: id },
      update: {},
    });
    return res.status(200).json({ ok: true, data: { destinationId: id, saved: true } });
  } catch (err) {
    logger.error('[Destinations] Save error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to save the destination' } });
  }
});

router.delete('/:id/saved', async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  try {
    // deleteMany, not delete: removing a bookmark that is already gone is
    // the outcome the caller asked for, not a 404 to handle.
    await prisma.savedDestination.deleteMany({ where: { userId, destinationId: id } });
    return res.status(200).json({ ok: true, data: { destinationId: id, saved: false } });
  } catch (err) {
    logger.error('[Destinations] Unsave error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to remove the saved destination' } });
  }
});

// Get one destination's full detail content (docs/REMEDIATION.md §8.19 —
// destination-details.tsx previously rendered a hardcoded client-side
// DESTINATIONS_DATABASE constant keyed by a fabricated numeric id instead
// of this real one).
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const destination = await prisma.destination.findUnique({ where: { id } });
    if (!destination) {
      return res.status(404).json({ ok: false, error: { code: 'DESTINATION_NOT_FOUND', message: 'Destination not found' } });
    }
    return res.status(200).json({ ok: true, data: destination });
  } catch (err) {
    logger.error('[Destinations] Get by id error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve destination' } });
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
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the destination details.', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }

  try {
    const destination = await prisma.destination.create({ data: parsed.data });
    // Drop the list cache so the new destination shows up immediately rather
    // than up to a TTL later.
    await cacheDelete(DESTINATIONS_CACHE_KEY);
    res.status(201).json({ ok: true, data: destination });
  } catch (err) {
    logger.warn('[Destinations] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create destination' } });
  }
});

export default router;
