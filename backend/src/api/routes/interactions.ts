import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';

const router = Router();

// ──────────────────────────────────────────────────────────
//  TRIP LIKES
// ──────────────────────────────────────────────────────────

// Toggle like on a trip
router.post('/like', async (req, res) => {
  const { tripId } = req.body;
  // Identity always comes from the token, never the request body.
  const uid = requireUserId(req);

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
    logger.warn('[Interactions] Like toggle error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to toggle like' });
  }
});

// Get all trip IDs liked by a user
router.get('/likes', async (req, res) => {
  const userId = requireUserId(req);

  try {
    const likes = await prisma.tripLike.findMany({
      where: { userId },
      select: { tripId: true },
      orderBy: { createdAt: 'desc' },
    });

    const tripIds = likes.map((l) => l.tripId);
    return res.status(200).json({ status: 'success', data: tripIds });
  } catch (err) {
    logger.warn('[Interactions] Get likes error:', err);
    return res.status(200).json({ status: 'success', data: [] });
  }
});

// ──────────────────────────────────────────────────────────
//  JOIN REQUESTS
// ──────────────────────────────────────────────────────────

// Create a join request
router.post('/join-request', async (req, res) => {
  const { tripId, midway, fromCity, toCity, adjustedPrice } = req.body;
  // Identity always comes from the token — a caller cannot file a request as
  // someone else by putting a userId in the body.
  const userId = requireUserId(req);

  if (!tripId) {
    return res.status(400).json({ status: 'error', message: 'tripId is required' });
  }

  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      return res.status(404).json({ status: 'error', code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
    }
    if (trip.creatorId === userId) {
      return res.status(400).json({ status: 'error', message: 'You cannot request to join your own trip.' });
    }

    const existing = await prisma.joinRequest.findUnique({
      where: {
        tripId_userId: { tripId, userId },
      },
    });

    if (existing) {
      return res.status(200).json({ status: 'success', data: existing, message: 'Join request already exists' });
    }

    const joinReq = await prisma.joinRequest.create({
      data: {
        tripId,
        userId,
        status: 'PENDING',
        fromCity: midway ? fromCity : null,
        toCity: midway ? toCity : null,
        adjustedPrice: adjustedPrice || null,
      },
    });

    return res.status(201).json({ status: 'success', data: joinReq });
  } catch (err) {
    logger.warn('[Interactions] Join request error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create join request' });
  }
});

// Get all join requests for a user
router.get('/join-requests', async (req, res) => {
  try {
    const userId = requireUserId(req);

    const requests = await prisma.joinRequest.findMany({
      where: { userId },
      select: { tripId: true, status: true, fromCity: true, toCity: true, adjustedPrice: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ status: 'success', data: requests });
  } catch (err) {
    logger.warn('[Interactions] Get join requests error:', err);
    return res.status(200).json({ status: 'success', data: [] });
  }
});

// Cancel a join request
router.delete('/join-request/:tripId', async (req, res) => {
  const { tripId } = req.params;

  try {
    const userId = requireUserId(req);

    // Scoped to the caller's own request — cannot cancel someone else's.
    await prisma.joinRequest.deleteMany({
      where: { tripId, userId },
    });

    return res.status(200).json({ status: 'success', message: 'Join request cancelled' });
  } catch (err) {
    logger.warn('[Interactions] Cancel join request error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to cancel join request' });
  }
});

// Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { unread: true, userId: requireUserId(req) },
    });

    return res.status(200).json({ status: 'success', data: { count } });
  } catch (err) {
    logger.warn('[Interactions] Unread count error:', err);
    return res.status(200).json({ status: 'success', data: { count: 0 } });
  }
});

// Get all incoming join requests for trips created by the logged-in user
router.get('/incoming-requests', async (req, res) => {
  try {
    const requests = await prisma.joinRequest.findMany({
      where: {
        trip: {
          creatorId: requireUserId(req),
        },
      },
      include: {
        trip: true,
        user: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = requests.map((r) => {
      const applicantName = r.user.profile
        ? `${r.user.profile.firstName} ${r.user.profile.lastName}`.trim()
        : (r.user.email ? r.user.email.split('@')[0] : 'Traveler');
      const applicantAvatar = r.user.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

      return {
        id: r.id,
        tripId: r.tripId,
        tripName: r.trip.name,
        userId: r.userId,
        applicantName,
        applicantAvatar,
        status: r.status,
        fromCity: r.fromCity,
        toCity: r.toCity,
        adjustedPrice: r.adjustedPrice,
        createdAt: r.createdAt,
      };
    });

    return res.status(200).json({ status: 'success', data: mapped });
  } catch (err) {
    logger.warn('[Interactions] Get incoming requests error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch incoming requests' });
  }
});

// Update join request status helper
const handleStatusChange = async (req: any, res: any) => {
  const { id } = req.params;
  const { status } = req.body; // 'APPROVED' or 'REJECTED'

  if (!status || (status !== 'APPROVED' && status !== 'REJECTED')) {
    return res.status(400).json({ status: 'error', message: 'Invalid status. Must be APPROVED or REJECTED.' });
  }

  try {
    const tokenUserId = requireUserId(req);

    const request = await prisma.joinRequest.findUnique({
      where: { id },
      include: { trip: true },
    });

    if (!request) {
      return res.status(404).json({ status: 'error', message: 'Join request not found' });
    }

    if (request.trip.creatorId !== tokenUserId) {
      return res.status(403).json({ status: 'error', message: 'Forbidden. You are not the creator of this trip.' });
    }

    if (status === 'APPROVED' && request.status !== 'PENDING') {
      return res.status(400).json({ status: 'error', message: 'Join request is not pending' });
    }

    let targetChatRoomId: string | null = null;

    const updated = await prisma.joinRequest.update({
      where: { id },
      data: { status },
    });

    if (status === 'APPROVED') {
      await prisma.tripMember.upsert({
        where: {
          tripId_userId: {
            tripId: request.tripId,
            userId: request.userId,
          },
        },
        create: {
          tripId: request.tripId,
          userId: request.userId,
          role: 'MEMBER',
        },
        update: {},
      });

      if (request.trip.availableSeats > 0) {
        await prisma.trip.update({
          where: { id: request.tripId },
          data: {
            availableSeats: {
              decrement: 1,
            },
          },
        });
      }

      // Find chat room associated with trip
      let chatRoom = await prisma.chatRoom.findUnique({
        where: { tripId: request.tripId }
      });

      if (!chatRoom) {
        chatRoom = await prisma.chatRoom.create({
          data: {
            isGroup: true,
            name: request.trip.name,
            tripId: request.tripId,
          },
        });
        await prisma.chatRoomMember.create({
          data: {
            chatRoomId: chatRoom.id,
            userId: request.trip.creatorId,
          },
        });
      }
      targetChatRoomId = chatRoom.id;

      await prisma.chatRoomMember.upsert({
        where: {
          chatRoomId_userId: {
            chatRoomId: targetChatRoomId,
            userId: request.userId,
          },
        },
        create: {
          chatRoomId: targetChatRoomId,
          userId: request.userId,
        },
        update: {},
      });

      // Get applicant details to use their name in the message
      const applicantUser = await prisma.user.findUnique({
        where: { id: request.userId },
        include: { profile: true },
      });
      const applicantName = applicantUser?.profile
        ? `${applicantUser.profile.firstName} ${applicantUser.profile.lastName}`.trim()
        : (applicantUser?.email ? applicantUser.email.split('@')[0] : 'Traveler');

      const systemMsgContent = `${applicantName} has joined the group`;

      // Save system message to database
      await prisma.message.create({
        data: {
          chatRoomId: targetChatRoomId,
          senderId: request.trip.creatorId,
          content: systemMsgContent,
          mediaType: 'NONE',
          isSystem: true,
        },
      });

      // Emit new message event to all active socket connections
      const io = req.app.get('socketio');
      if (io) {
        io.to(targetChatRoomId).emit('messageReceived', {
          roomId: targetChatRoomId,
          message: {
            id: `sys-${Date.now()}`,
            senderName: 'System',
            senderRole: 'SYSTEM',
            content: systemMsgContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mediaType: 'NONE',
          }
        });

        // Emit addedToChat live socket event to user's personal room
        io.to(request.userId).emit('addedToChat', {
          tripId: request.tripId,
          chatRoomId: targetChatRoomId,
          tripName: request.trip.name,
        });

        // Emit live notificationReceived event to user's personal room
        io.to(request.userId).emit('notificationReceived', {
          id: `notif-${Date.now()}`,
          userId: request.userId,
          type: 'TRIP',
          category: 'JOIN_ACCEPTED',
          title: 'Join Request Accepted 🎉',
          content: `Your request to join ${request.trip.name} has been accepted!`,
          unread: true,
          tripId: request.tripId,
          chatRoomId: targetChatRoomId,
        });
      }

      // 1. JOIN_ACCEPTED notification
      await prisma.notification.create({
        data: {
          userId: request.userId,
          type: 'TRIP',
          category: 'JOIN_ACCEPTED',
          title: 'Join Request Accepted 🎉',
          content: `Your request to join ${request.trip.name} has been accepted!`,
          time: 'Just now',
          unread: true,
          tripId: request.tripId,
          chatRoomId: targetChatRoomId,
        },
      });

      // 2. CHAT_ADDED notification
      await prisma.notification.create({
        data: {
          userId: request.userId,
          type: 'TRIP',
          category: 'CHAT_ADDED',
          title: 'Added to Group Chat 💬',
          content: `You've been added to the ${request.trip.name} group chat`,
          time: 'Just now',
          unread: true,
          chatRoomId: targetChatRoomId,
          tripId: request.tripId,
        },
      });
    }

    return res.status(200).json({ status: 'success', data: updated, chatRoomId: targetChatRoomId });
  } catch (err) {
    logger.warn('[Interactions] Update join request status error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update join request status' });
  }
};

// Update status endpoint
router.post('/join-request/:id/status', async (req, res) => {
  return handleStatusChange(req, res);
});

// Approve endpoint
router.post('/join-request/:id/approve', async (req, res) => {
  req.body.status = 'APPROVED';
  return handleStatusChange(req, res);
});

export default router;
