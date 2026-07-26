import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

const getUserIdFromReq = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      return decoded.id || decoded.userId;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Mock Initial Notifications to Seed PostgreSQL on First Run
const seedNotifications = [
  {
    type: 'HAZARD',
    title: 'Landslide Warning — NH-44 Zoji La Pass',
    content: 'Heavy rockfall near Zoji La Pass has blocked NH-44. Traffic temporarily suspended. Alternative route via Kargil-Zanskar advised.',
    time: '14 mins ago',
    unread: true,
  },
  {
    type: 'HAZARD',
    title: 'Heavy Rainfall & Flood Flash Warning',
    content: 'Red Alert issued. River water levels rising near Periyar. Tourist boat rides suspended for 48 hours.',
    time: '42 mins ago',
    unread: true,
  },
  {
    type: 'TRIP',
    title: 'Ranchi → Vrindavan Express',
    content: 'Starts Today • 03:30 PM • Aarav Sharma (Seat 42B)',
    time: 'Starts Today',
    unread: true,
  },
  {
    type: 'SEASONAL',
    title: 'Valley of Flowers, Uttarakhand',
    content: 'Peak Monsoon Bloom (July - August). Over 500 species of wild flowers are in full bloom this week!',
    time: 'July Pick',
    unread: false,
  },
  {
    type: 'SEASONAL',
    title: 'Munnar Tea Plantations, Kerala',
    content: 'Refreshing Rain Season. Experience mist-covered hills, waterfalls in full gush & tea tasting.',
    time: 'Monsoon Heaven',
    unread: false,
  },
];

// Helper to execute Prisma queries with retries (useful for Neon cold starts)
async function queryWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Prisma DB Retry] Query failed. Retrying in ${delay}ms... (${retries} left). Error:`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return queryWithRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// Get all notifications
router.get('/', async (req, res) => {
  try {
    const tokenUserId = getUserIdFromReq(req);

    let list = await queryWithRetry(() => prisma.notification.findMany({
      where: {
        OR: [
          { userId: null },
          ...(tokenUserId ? [{ userId: tokenUserId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }));

    if (list.length === 0) {
      // Seed initially
      await queryWithRetry(() => prisma.notification.createMany({
        data: seedNotifications,
      }));
      list = await queryWithRetry(() => prisma.notification.findMany({
        where: {
          OR: [
            { userId: null },
            ...(tokenUserId ? [{ userId: tokenUserId }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      }));
    }

    res.status(200).json({ status: 'success', data: list });
  } catch (err) {
    console.warn('[Postgres DB Warn] Get notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications' });
  }
});

// Mark all as read
router.post('/read-all', async (req, res) => {
  try {
    const tokenUserId = getUserIdFromReq(req);
    await prisma.notification.updateMany({
      where: {
        unread: true,
        OR: [
          { userId: null },
          ...(tokenUserId ? [{ userId: tokenUserId }] : []),
        ],
      },
      data: { unread: false },
    });
    res.status(200).json({ status: 'success', message: 'All notifications marked as read' });
  } catch (err) {
    console.warn('[Postgres DB Warn] Read-all notifications failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notifications read' });
  }
});

// Mark single notification as read
router.post('/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.notification.update({
      where: { id },
      data: { unread: false },
    });
    res.status(200).json({ status: 'success', message: 'Notification marked as read' });
  } catch (err) {
    console.warn('[Postgres DB Warn] Mark notification read failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to mark notification read' });
  }
});

export default router;
