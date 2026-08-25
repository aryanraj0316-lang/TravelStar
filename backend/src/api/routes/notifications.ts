import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';

const router = Router();

const idParamSchema = z.object({ id: z.string().uuid() });

// Retries only make sense for a transient connection failure (e.g. a Neon
// cold start) — a bad query fails the same way every time, so retrying it
// just makes the caller wait ~10s longer for the same error. Prisma tags
// connection-level failures with these error codes.
const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return typeof code === 'string' && RETRYABLE_PRISMA_CODES.has(code);
}

async function queryWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isRetryable(err)) {
      logger.warn(`[Prisma DB Retry] Connection error. Retrying in ${delay}ms... (${retries} left).`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return queryWithRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// Get all notifications — personal ones plus every broadcast, with the
// broadcast's `unread` flag computed per-caller from NotificationRead
// instead of the shared row (docs/REMEDIATION.md §5.8).
router.get('/', async (req, res) => {
  const tokenUserId = requireUserId(req);
  try {
    const [personal, broadcasts, reads] = await queryWithRetry(() =>
      Promise.all([
        prisma.notification.findMany({ where: { userId: tokenUserId }, orderBy: { createdAt: 'desc' } }),
        prisma.notification.findMany({ where: { userId: null }, orderBy: { createdAt: 'desc' } }),
        prisma.notificationRead.findMany({ where: { userId: tokenUserId }, select: { notificationId: true } }),
      ])
    );

    const readIds = new Set(reads.map((r) => r.notificationId));
    const mappedBroadcasts = broadcasts.map((n) => ({ ...n, unread: !readIds.has(n.id) }));

    const list = [...personal, ...mappedBroadcasts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    res.status(200).json({ status: 'success', data: list });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Get notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications' });
  }
});

// Mark all as read: personal notifications flip their own `unread` column;
// broadcasts get a NotificationRead row per broadcast for this caller only,
// so it never affects what any other user sees.
router.post('/read-all', async (req, res) => {
  try {
    const tokenUserId = requireUserId(req);

    const broadcasts = await prisma.notification.findMany({
      where: { userId: null },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.notification.updateMany({
        where: { unread: true, userId: tokenUserId },
        data: { unread: false },
      }),
      prisma.notificationRead.createMany({
        data: broadcasts.map((b) => ({ notificationId: b.id, userId: tokenUserId })),
        skipDuplicates: true,
      }),
    ]);

    res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Read-all notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications read' });
  }
});

// Mark single notification as read — the caller's own personal notification,
// or a per-caller read receipt on a broadcast.
router.post('/:id/read', async (req, res) => {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ status: 'error', code: 'VALIDATION_FAILED', message: 'Invalid notification id.' });
  }
  const { id } = parsedParams.data;
  const userId = requireUserId(req);
  try {
    const notification = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!notification) {
      return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Notification not found.' });
    }

    if (notification.userId === null) {
      await prisma.notificationRead.upsert({
        where: { notificationId_userId: { notificationId: id, userId } },
        create: { notificationId: id, userId },
        update: {},
      });
      return res.status(200).json({ status: 'success', message: 'Notification marked as read' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'Not your notification.' });
    }

    await prisma.notification.update({ where: { id }, data: { unread: false } });
    res.status(200).json({ status: 'success', message: 'Notification marked as read' });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Mark notification read failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notification read' });
  }
});

export default router;
