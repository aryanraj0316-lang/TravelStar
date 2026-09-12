import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { cursorPageQuerySchema } from '../../lib/pagination';
import { sendPushToUsers, unreadCountFor } from '../../lib/push';
import { requireUserId } from '../../lib/auth-context';
import { claimSeatAndJoin, releaseSeatAndLeave } from '../../services/trip-membership';
import { calculateMidwayPrice } from '../../services/midway-pricing';

const router = Router();

function validationError(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the submitted data.', details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
}

// ──────────────────────────────────────────────────────────
//  TRIP LIKES
// ──────────────────────────────────────────────────────────

const likeSchema = z.object({ tripId: z.string().uuid() });

// Toggle like on a trip
router.post('/like', async (req, res) => {
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { tripId } = parsed.data;
  // Identity always comes from the token, never the request body.
  const uid = requireUserId(req);

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
      return res.status(200).json({ ok: true, data: { liked: false, message: 'Trip unliked' } });
    } else {
      // Like
      await prisma.tripLike.create({
        data: { tripId, userId: uid },
      });
      return res.status(201).json({ ok: true, data: { liked: true, message: 'Trip liked' } });
    }
  } catch (err) {
    logger.warn('[Interactions] Like toggle error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to toggle like' } });
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
    return res.status(200).json({ ok: true, data: tripIds });
  } catch (err) {
    logger.warn('[Interactions] Get likes error:', err);
    return res.status(200).json({ ok: true, data: [] });
  }
});

// ──────────────────────────────────────────────────────────
//  JOIN REQUESTS
// ──────────────────────────────────────────────────────────

const joinRequestSchema = z.object({
  tripId: z.string().uuid(),
  midway: z.boolean().default(false),
  fromCity: z.string().trim().min(1).max(200).optional(),
  toCity: z.string().trim().min(1).max(200).optional(),
  // No adjustedPrice field: a client-computed price is never trusted
  // (docs/REMEDIATION.md §8.6) — see calculateMidwayPrice below.
});

// Create a join request
router.post('/join-request', async (req, res) => {
  const parsed = joinRequestSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { tripId, midway, fromCity, toCity } = parsed.data;
  // Identity always comes from the token — a caller cannot file a request as
  // someone else by putting a userId in the body.
  const userId = requireUserId(req);

  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
    }
    if (trip.creatorId === userId) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'You cannot request to join your own trip.' } });
    }

    const existing = await prisma.joinRequest.findUnique({
      where: {
        tripId_userId: { tripId, userId },
      },
    });

    if (existing) {
      return res.status(200).json({ ok: true, data: { ...existing, message: 'Join request already exists' } });
    }

    // Server-authoritative price for a midway join — the client only ever
    // suggests fromCity/toCity, never a price. See §8.6.
    let adjustedPrice: number | null = null;
    if (midway) {
      if (!fromCity || !toCity) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Midway join requires both a starting and an ending city.' } });
      }
      const priced = calculateMidwayPrice(trip.cities, Number(trip.budget), fromCity, toCity);
      if (!priced.ok) {
        return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'The ending city must come after the starting city on this trip\'s route.' } });
      }
      adjustedPrice = priced.adjustedPrice;
    }

    const joinReq = await prisma.joinRequest.create({
      data: {
        tripId,
        userId,
        status: 'PENDING',
        fromCity: midway ? fromCity! : null,
        toCity: midway ? toCity! : null,
        adjustedPrice,
      },
    });

    return res.status(201).json({ ok: true, data: joinReq });
  } catch (err) {
    logger.warn('[Interactions] Join request error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create join request' } });
  }
});

// Get all join requests for a user
router.get('/join-requests', async (req, res) => {
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit.' } });
  }
  const { limit } = parsedQuery.data;

  try {
    const userId = requireUserId(req);

    const requests = await prisma.joinRequest.findMany({
      where: { userId },
      select: { tripId: true, status: true, fromCity: true, toCity: true, adjustedPrice: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.status(200).json({ ok: true, data: requests });
  } catch (err) {
    // This used to answer a database failure with `200 { data: [] }`, which
    // told the client "you have no join requests" — indistinguishable from
    // the truthful empty answer, and enough for a screen to hide a pending
    // request the user really has (docs/REMEDIATION.md §0.3, no silent
    // failures).
    logger.error('[Interactions] Get join requests error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load your join requests.' } });
  }
});

// Cancel/withdraw a join request. Idempotent and seat-safe: if the request
// had already been approved (a seat was consumed, a TripMember row and chat
// membership exist), releaseSeatAndLeave undoes all three inside one
// transaction. If it was still PENDING, this only removes the request row —
// see docs/REMEDIATION.md §8.5.
router.delete('/join-request/:tripId', async (req, res) => {
  const tripId = req.params.tripId;

  try {
    const userId = requireUserId(req);

    const existing = await prisma.joinRequest.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!existing) {
      return res.status(200).json({ ok: true, data: { message: 'Join request cancelled' } });
    }

    const result = await releaseSeatAndLeave(existing.id, null);
    if (!result.ok) {
      return res.status(200).json({ ok: true, data: { message: 'Join request cancelled' } });
    }

    return res.status(200).json({ ok: true, data: { message: 'Join request cancelled' } });
  } catch (err) {
    logger.warn('[Interactions] Cancel join request error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to cancel join request' } });
  }
});

// Get unread notification count
// Kept for older client builds; GET /notifications/unread-count is the
// current path. Both delegate to unreadCountFor, which counts personal
// unread rows *plus* broadcasts this user has no NotificationRead for —
// the raw count here used to miss broadcasts entirely, so a hazard alert
// never bumped the bell badge (§5.8 fixed the list, not this counter).
router.get('/unread-count', async (req, res) => {
  try {
    const count = await unreadCountFor(requireUserId(req));

    return res.status(200).json({ ok: true, data: { count } });
  } catch (err) {
    logger.warn('[Interactions] Unread count error:', err);
    return res.status(200).json({ ok: true, data: { count: 0 } });
  }
});

// Get all incoming join requests for trips created by the logged-in user
router.get('/incoming-requests', async (req, res) => {
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit.' } });
  }

  try {
    const requests = await prisma.joinRequest.findMany({
      take: parsedQuery.data.limit,
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
      const applicantAvatar = r.user.profile?.avatarUrl ?? null;

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

    return res.status(200).json({ ok: true, data: mapped });
  } catch (err) {
    logger.warn('[Interactions] Get incoming requests error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to fetch incoming requests' } });
  }
});

const statusChangeSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

// Update join request status: approve claims a seat through the same
// transactional path as instant-join (docs/REMEDIATION.md §5.4), reject
// releases one if it had already been claimed.
const handleStatusChange = async (req: Request, res: Response) => {
  const parsedParams = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsedParams.success) return validationError(res, parsedParams.error.issues);
  const { id } = parsedParams.data;
  const parsed = statusChangeSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { status } = parsed.data;

  try {
    const tokenUserId = requireUserId(req);

    const request = await prisma.joinRequest.findUnique({
      where: { id },
      include: { trip: true },
    });

    if (!request) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request not found' } });
    }

    if (request.trip.creatorId !== tokenUserId) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden. You are not the creator of this trip.' } });
    }

    if (status === 'APPROVED' && request.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Join request is not pending' } });
    }

    if (status === 'REJECTED') {
      const released = await releaseSeatAndLeave(request.id, 'REJECTED');
      if (!released.ok) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request not found' } });
      }
      const updated = await prisma.joinRequest.findUnique({ where: { id } });
      return res.status(200).json({ ok: true, data: { ...updated, chatRoomId: null } });
    }

    const claim = await claimSeatAndJoin(request.tripId, request.userId, {
      existingJoinRequestId: request.id,
      fromCity: request.fromCity,
      toCity: request.toCity,
      adjustedPrice: request.adjustedPrice ? Number(request.adjustedPrice) : null,
    });

    if (!claim.ok) {
      if (claim.reason === 'TRIP_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
      }
      if (claim.reason === 'BUSY') {
        // See the same branch in trips.ts — never reported as TRIP_FULL.
        res.setHeader('Retry-After', '2');
        return res.status(503).json({
          ok: false,
          error: { code: 'SERVICE_BUSY', message: 'The database is busy. Please approve this request again.' },
        });
      }
      return res.status(409).json({ ok: false, error: { code: 'TRIP_FULL', message: 'No available seats on this trip.' } });
    }

    const targetChatRoomId = claim.chatRoomId;

    // Get applicant details to use their name in the message
    const applicantUser = await prisma.user.findUnique({
      where: { id: request.userId },
      include: { profile: true },
    });
    const applicantName = applicantUser?.profile
      ? `${applicantUser.profile.firstName} ${applicantUser.profile.lastName}`.trim()
      : (applicantUser?.email ? applicantUser.email.split('@')[0] : 'Traveler');

    const systemMsgContent = `${applicantName} has joined the group`;

    if (targetChatRoomId) {
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
          title: 'Join Request Accepted',
          content: `You have been accepted into ${request.trip.name} by the organizer and added to the group chat.`,
          unread: true,
          tripId: request.tripId,
          chatRoomId: targetChatRoomId,
        });
      }
    }

    // Merged single notification: Trip acceptance + Group chat addition
    await prisma.notification.create({
      data: {
        userId: request.userId,
        type: 'TRIP',
        category: 'JOIN_ACCEPTED',
        title: 'Join Request Accepted',
        content: `You have been accepted into ${request.trip.name} by the organizer and added to the group chat.`,
        time: 'Just now',
        unread: true,
        tripId: request.tripId,
        chatRoomId: targetChatRoomId,
      },
    });

    // Real push on top of the feed row above (docs/REMEDIATION.md
    // §8.18 — these used to be in-app-only, so an approved traveller
    // learned about it whenever they next happened to open the app).
    // Awaited but never throwing: sendPushToUsers swallows its own
    // failures, since a push problem must not fail an approval that has
    // already been committed.
    await sendPushToUsers([request.userId], 'TRIP', {
      title: 'Join Request Accepted',
      body: `You have been accepted into ${request.trip.name} by the organizer and added to the group chat.`,
      data: { screen: 'trip', tripId: request.tripId, chatRoomId: targetChatRoomId ?? '' },
      badge: await unreadCountFor(request.userId),
    });

    const updated = await prisma.joinRequest.findUnique({ where: { id: claim.joinRequestId } });
    return res.status(200).json({ ok: true, data: { ...updated, chatRoomId: targetChatRoomId } });
  } catch (err) {
    logger.warn('[Interactions] Update join request status error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update join request status' } });
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
