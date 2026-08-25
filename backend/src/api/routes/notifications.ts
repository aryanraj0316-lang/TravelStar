import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';

const router = Router();

// Helper to execute Prisma queries with retries (useful for Neon cold starts)
async function queryWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      logger.warn(`[Prisma DB Retry] Query failed. Retrying in ${delay}ms... (${retries} left). Error:`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return queryWithRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// Get all notifications
router.get('/', async (req, res) => {
  const tokenUserId = requireUserId(req);
  try {
    const list = await queryWithRetry(() => prisma.notification.findMany({
      where: { userId: tokenUserId },
      orderBy: { createdAt: 'desc' },
    }));
    res.status(200).json({ status: 'success', data: list });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Get notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications' });
  }
});

// Mark all as read
router.post('/read-all', async (req, res) => {
  try {
    const tokenUserId = requireUserId(req);
    // Only this user's own notifications. Broadcasts (userId: null) are
    // deliberately excluded — marking them read here would mark them read for
    // every user. Per-user broadcast read state needs a NotificationRead join
    // table (docs/REMEDIATION.md §5.8, Phase 5).
    await prisma.notification.updateMany({
      where: { unread: true, userId: tokenUserId },
      data: { unread: false },
    });
    res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Read-all notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications read' });
  }
});

// Mark single notification as read
router.post('/:id/read', async (req, res) => {
  const { id } = req.params;
  const userId = requireUserId(req);
  try {
    // Scoped by userId — a caller cannot mark someone else's notification read.
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { unread: false },
    });
    if (result.count === 0) {
      return res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Notification not found.' });
    }
    res.status(200).json({ status: 'success', message: 'Notification marked as read' });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Mark notification read failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notification read' });
  }
});

export default router;
