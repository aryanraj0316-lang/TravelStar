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

// ──────────────────────────────────────────────────────────
//  TRIP LIKES
// ──────────────────────────────────────────────────────────

// Toggle like on a trip
router.post('/like', async (req, res) => {
  const { tripId, userId } = req.body;
  const tokenUserId = getUserIdFromReq(req);
  const uid = tokenUserId || userId || 'default-user';

  if (!tripId) {
    return res.status(400).json({ status: 'error', message: 'tripId is required' });
  }

  try {
    // Check if already liked
    const existing = await prisma.tripLike.findUnique({
      where: {
        tripId_userId: { tripId, userId: uid },
      },
    });

    if (existing) {
      // Unlike
      await prisma.tripLike.delete({ where: { id: existing.id } });
      return res.status(200).json({ status: 'success', liked: false, message: 'Trip unliked' });
    } else {
      // Like
      await prisma.tripLike.create({
        data: { tripId, userId: uid },
      });
      return res.status(201).json({ status: 'success', liked: true, message: 'Trip liked' });
    }
  } catch (err) {
    console.warn('[Interactions] Like toggle error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to toggle like' });
  }
});

// Get all trip IDs liked by a user
router.get('/likes', async (req, res) => {
  const tokenUserId = getUserIdFromReq(req);
  const userId = tokenUserId || (req.query.userId as string) || 'default-user';

  try {
    const likes = await prisma.tripLike.findMany({
      where: { userId },
      select: { tripId: true },
      orderBy: { createdAt: 'desc' },
    });

    const tripIds = likes.map((l) => l.tripId);
    return res.status(200).json({ status: 'success', data: tripIds });
  } catch (err) {
    console.warn('[Interactions] Get likes error:', err);
    return res.status(200).json({ status: 'success', data: [] });
  }
});

// ──────────────────────────────────────────────────────────
//  JOIN REQUESTS
// ──────────────────────────────────────────────────────────

// Create a join request
router.post('/join-request', async (req, res) => {
  const { tripId, userId, midway, fromCity, toCity, adjustedPrice } = req.body;

  if (!tripId) {
    return res.status(400).json({ status: 'error', message: 'tripId is required' });
  }

  try {
    // Get or create the user
    let user = null;
    const tokenUserId = getUserIdFromReq(req);
    if (tokenUserId) {
      user = await prisma.user.findUnique({ where: { id: tokenUserId } });
    }
    if (!user) {
      user = await prisma.user.findFirst({
        where: userId ? { id: userId } : undefined,
      });
    }
    if (!user) {
      user = await prisma.user.findFirst();
    }

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'No user found' });
    }

    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip && trip.creatorId === user.id) {
      return res.status(400).json({ status: 'error', message: 'You cannot request to join your own trip.' });
    }

    // Upsert join request
    const existing = await prisma.joinRequest.findUnique({
      where: {
        tripId_userId: { tripId, userId: user.id },
      },
    });

    if (existing) {
      return res.status(200).json({ status: 'success', data: existing, message: 'Join request already exists' });
    }

    const joinReq = await prisma.joinRequest.create({
      data: {
        tripId,
        userId: user.id,
        status: 'PENDING',
        fromCity: midway ? fromCity : null,
        toCity: midway ? toCity : null,
        adjustedPrice: adjustedPrice || null,
      },
    });

    return res.status(201).json({ status: 'success', data: joinReq });
  } catch (err) {
    console.warn('[Interactions] Join request error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create join request' });
  }
});

// Get all join requests for a user
router.get('/join-requests', async (req, res) => {
  try {
    let user = null;
    const tokenUserId = getUserIdFromReq(req);
    if (tokenUserId) {
      user = await prisma.user.findUnique({ where: { id: tokenUserId } });
    }
    if (!user) {
      user = await prisma.user.findFirst();
    }
    if (!user) {
      return res.status(200).json({ status: 'success', data: [] });
    }

    const requests = await prisma.joinRequest.findMany({
      where: { userId: user.id },
      select: { tripId: true, status: true, fromCity: true, toCity: true, adjustedPrice: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ status: 'success', data: requests });
  } catch (err) {
    console.warn('[Interactions] Get join requests error:', err);
    return res.status(200).json({ status: 'success', data: [] });
  }
});

// Cancel a join request
router.delete('/join-request/:tripId', async (req, res) => {
  const { tripId } = req.params;

  try {
    let user = null;
    const tokenUserId = getUserIdFromReq(req);
    if (tokenUserId) {
      user = await prisma.user.findUnique({ where: { id: tokenUserId } });
    }
    if (!user) {
      user = await prisma.user.findFirst();
    }
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    await prisma.joinRequest.deleteMany({
      where: { tripId, userId: user.id },
    });

    return res.status(200).json({ status: 'success', message: 'Join request cancelled' });
  } catch (err) {
    console.warn('[Interactions] Cancel join request error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to cancel join request' });
  }
});

// Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { unread: true },
    });

    return res.status(200).json({ status: 'success', data: { count } });
  } catch (err) {
    console.warn('[Interactions] Unread count error:', err);
    return res.status(200).json({ status: 'success', data: { count: 0 } });
  }
});

export default router;
