import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { sendPushToUsers } from '../../lib/push';
import { admitAllocatedMember, holdSeatsForRequest } from '../../services/trip-membership';
import { amountForRequest, announceMemberJoined, displayName } from '../../services/trip-payments';
import { cancelBooking, computeRefundQuote } from '../../services/trip-cancellation';

// Mounted at /api/v1/trips alongside trips.ts.
//
// Organizer side:  pending-allocations → verify-token → approve-and-allocate
// Traveller side:  my-booking (Trip Pass) → cancellation-quote → cancel-booking
const router = Router();

const tripParams = z.object({ tripId: z.string().uuid() });

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

function validation(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({
    ok: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

/** Loads the trip and confirms the caller organizes it. */
async function organizerTrip(req: Request, res: Response) {
  const params = tripParams.safeParse(req.params);
  if (!params.success) {
    validation(res, params.error.issues);
    return null;
  }
  const userId = requireUserId(req);
  const trip = await prisma.trip.findUnique({
    where: { id: params.data.tripId },
    select: { id: true, name: true, creatorId: true, startDate: true, budget: true },
  });
  if (!trip) {
    fail(res, 404, 'TRIP_NOT_FOUND', 'Trip not found.');
    return null;
  }
  if (trip.creatorId !== userId) {
    fail(res, 403, 'FORBIDDEN', "Only this trip's organizer can do this.");
    return null;
  }
  return trip;
}

const normalizeToken = (t: string) => t.trim().toUpperCase();

// ── GET /trips/:tripId/pending-allocations ────────────────────────────────
// Everyone the organizer still has to allocate: paid bookings (with their
// verification token) and approved free-trip requests, plus the trip's
// stops and itinerary days the allocation form is built from.
router.get('/:tripId/pending-allocations', async (req, res) => {
  const trip = await organizerTrip(req, res);
  if (!trip) return;

  try {
    const [requests, stops, days] = await Promise.all([
      prisma.joinRequest.findMany({
        where: { tripId: trip.id, status: { in: ['PAYMENT_COMPLETED', 'ALLOCATION_PENDING'] } },
        orderBy: { updatedAt: 'asc' },
        include: { user: { include: { profile: true } }, paymentOrder: true },
      }),
      prisma.tripTimelineStop.findMany({
        where: { tripId: trip.id },
        orderBy: { order: 'asc' },
        select: { id: true, order: true, city: true, stayDays: true, transitMode: true },
      }),
      prisma.tripItineraryDay.findMany({
        where: { tripId: trip.id },
        orderBy: { day: 'asc' },
        select: { day: true, title: true },
      }),
    ]);

    const data = {
      trip: { id: trip.id, name: trip.name, startDate: trip.startDate.toISOString() },
      stops,
      itineraryDays: days,
      travellers: requests.map((r) => ({
        joinRequestId: r.id,
        userId: r.userId,
        name: displayName(r.user),
        avatarUrl: r.user.profile?.avatarUrl ?? null,
        status: r.status,
        partySize: r.partySize,
        fromCity: r.fromCity,
        toCity: r.toCity,
        // The payment token the organizer checks the traveller against
        // (also in the organizer's payment notification). Null for free trips.
        verificationToken: r.paymentOrder?.verificationToken ?? null,
        requiresToken: !!r.paymentOrder?.verificationToken,
        tokenVerified: !!r.paymentOrder?.isVerifiedByOrganizer || r.status === 'ALLOCATION_PENDING',
        amountPaid: r.paymentOrder?.status === 'CAPTURED' ? r.paymentOrder.amount.toString() : null,
        organizerAmount: r.paymentOrder?.organizerAmount?.toString() ?? null,
        paidAt: r.paymentOrder?.status === 'CAPTURED' ? r.paymentOrder.updatedAt.toISOString() : null,
      })),
    };
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    logger.error('[TripBookings] pending-allocations failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not load bookings awaiting allocation.');
  }
});

const verifyTokenSchema = z.object({
  joinRequestId: z.string().uuid(),
  verificationToken: z.string().trim().min(4).max(32),
});

// ── POST /trips/:tripId/verify-token ──────────────────────────────────────
// The organizer checks the token the traveller quotes against the one
// issued at payment. A match moves the booking to ALLOCATION_PENDING.
router.post('/:tripId/verify-token', async (req, res) => {
  const trip = await organizerTrip(req, res);
  if (!trip) return;
  const body = verifyTokenSchema.safeParse(req.body);
  if (!body.success) return validation(res, body.error.issues);

  const jr = await prisma.joinRequest.findUnique({
    where: { id: body.data.joinRequestId },
    include: { paymentOrder: true },
  });
  if (!jr || jr.tripId !== trip.id) return fail(res, 404, 'NOT_FOUND', 'Booking not found on this trip.');
  const order = jr.paymentOrder;
  if (!order?.verificationToken || order.status !== 'CAPTURED') {
    return fail(res, 409, 'NOT_PAID', 'This booking has no captured payment to verify.');
  }
  if (normalizeToken(body.data.verificationToken) !== order.verificationToken) {
    return fail(res, 422, 'TOKEN_MISMATCH', 'That token does not match this booking.');
  }

  await prisma.$transaction([
    prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { isVerifiedByOrganizer: true, verifiedAt: new Date() } }),
    prisma.joinRequest.updateMany({
      where: { id: jr.id, status: 'PAYMENT_COMPLETED' },
      data: { status: 'ALLOCATION_PENDING' },
    }),
  ]);
  return res.status(200).json({ ok: true, data: { joinRequestId: jr.id, status: 'ALLOCATION_PENDING', verified: true } });
});

const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? v : undefined));

const allocateSchema = z.object({
  joinRequestId: z.string().uuid(),
  // Required for paid bookings; free-trip requests have none.
  verificationToken: z.string().trim().min(4).max(32).optional(),
  allocations: z
    .array(
      z.object({
        tripTimelineStopId: z.string().uuid().optional(),
        dayNumber: z.number().int().positive().max(366),
        checkpointName: z.string().trim().min(1).max(200),
        hotelName: z.string().trim().min(1).max(200),
        roomNumber: z.string().trim().min(1).max(100),
        transitType: z.string().trim().min(1).max(40).default('BUS'),
        vehicleNumber: z.string().trim().min(1).max(100),
        seatNumber: z.string().trim().min(1).max(100),
        assemblyTime: optionalText,
        notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : undefined)),
      }),
    )
    .min(1)
    .max(120),
});

// ── POST /trips/:tripId/approve-and-allocate ──────────────────────────────
// Confirms a booking: checks the payment token, writes every per-stop
// allocation, makes the traveller a member and only then adds them to the
// group chat, announces them there and sends them their Trip Pass.
router.post('/:tripId/approve-and-allocate', async (req, res) => {
  const trip = await organizerTrip(req, res);
  if (!trip) return;
  const body = allocateSchema.safeParse(req.body);
  if (!body.success) return validation(res, body.error.issues);
  const { joinRequestId, verificationToken, allocations } = body.data;

  try {
    const jr = await prisma.joinRequest.findUnique({
      where: { id: joinRequestId },
      include: { paymentOrder: true, trip: { select: { budget: true } } },
    });
    if (!jr || jr.tripId !== trip.id) return fail(res, 404, 'NOT_FOUND', 'Booking not found on this trip.');

    const order = jr.paymentOrder;
    const isPaid = amountForRequest(jr, jr.trip.budget).gt(0);

    if (isPaid) {
      // Never allocate a paid seat without a captured payment and its token.
      if (!order || order.status !== 'CAPTURED' || !order.verificationToken) {
        return fail(res, 409, 'NOT_PAID', 'This booking has not been paid.');
      }
      if (!verificationToken || normalizeToken(verificationToken) !== order.verificationToken) {
        return fail(res, 422, 'TOKEN_MISMATCH', 'The verification token does not match this booking.');
      }
    } else if (jr.status === 'PENDING') {
      // A free-trip request allocated straight from PENDING: hold its seats
      // first, exactly as an approval would.
      const held = await holdSeatsForRequest(jr.id, { fromStatuses: ['PENDING'], toStatus: 'ALLOCATION_PENDING' });
      if (!held.ok) {
        if (held.reason === 'TRIP_FULL') return fail(res, 409, 'TRIP_FULL', 'No available seats on this trip.');
        if (held.reason === 'BUSY') return fail(res, 503, 'SERVICE_BUSY', 'Please try again.');
        return fail(res, 409, 'INVALID_STATUS', 'This booking is not awaiting allocation.');
      }
    }

    // Stop ids must belong to this trip.
    const stopIds = [...new Set(allocations.map((a) => a.tripTimelineStopId).filter((v): v is string => !!v))];
    if (stopIds.length) {
      const count = await prisma.tripTimelineStop.count({ where: { id: { in: stopIds }, tripId: trip.id } });
      if (count !== stopIds.length) return fail(res, 400, 'VALIDATION_FAILED', 'A checkpoint does not belong to this trip.');
    }

    const admitted = await admitAllocatedMember({
      joinRequestId: jr.id,
      bookingReferenceToken: order?.verificationToken ?? null,
      allocations: allocations.map((a) => ({
        tripTimelineStopId: a.tripTimelineStopId ?? null,
        dayNumber: a.dayNumber,
        checkpointName: a.checkpointName,
        hotelName: a.hotelName,
        roomNumber: a.roomNumber,
        transitType: a.transitType,
        vehicleNumber: a.vehicleNumber,
        seatNumber: a.seatNumber,
        assemblyTime: a.assemblyTime ?? null,
        notes: a.notes ?? null,
      })),
    });
    if (!admitted.ok) {
      return admitted.reason === 'ALREADY_MEMBER'
        ? fail(res, 409, 'ALREADY_CONFIRMED', 'This traveller is already confirmed on the trip.')
        : fail(res, 409, 'INVALID_STATUS', 'This booking is not awaiting allocation (it may have been cancelled).');
    }

    const io = req.app.get('socketio');
    const chatRoomId = admitted.chatRoomId;
    if (chatRoomId) {
      await announceMemberJoined({ chatRoomId, userId: jr.userId, tripId: trip.id, io }).catch((err) =>
        logger.warn('[TripBookings] Join announcement failed (non-fatal):', err),
      );
      io?.to(jr.userId).emit('addedToChat', { tripId: trip.id, chatRoomId, tripName: trip.name });
    }

    const title = `Booking confirmed — ${trip.name}`;
    const content = `Your booking for ${trip.name} is confirmed! Check your seat/room passes and join the group chat.`;
    try {
      // No chatRoomId on the stored row: GET /notifications prunes any
      // chat-linked alert whose room has no unread messages, which would
      // delete this confirmation the first time the feed loaded. The room
      // id travels on the live event and the push instead.
      const created = await prisma.notification.create({
        data: { userId: jr.userId, type: 'TRIP', category: 'JOIN_ACCEPTED', title, content, time: 'Just now', unread: true, tripId: trip.id },
      });
      io?.to(jr.userId).emit('notificationReceived', {
        id: created.id,
        userId: jr.userId,
        type: 'TRIP',
        category: 'JOIN_ACCEPTED',
        title,
        content,
        unread: true,
        tripId: trip.id,
        chatRoomId,
      });
      await sendPushToUsers([jr.userId], 'TRIP', {
        title,
        body: content,
        data: { screen: 'trip-pass', tripId: trip.id, chatRoomId: chatRoomId ?? '' },
      });
    } catch (err) {
      logger.warn('[TripBookings] Confirmation notification failed (non-fatal):', err);
    }

    // The organizer's "Payment received" alert (with the booking token) has
    // done its job once the booking is confirmed: it is marked read, and
    // stays in their notification history.
    await prisma.notification
      .updateMany({
        where: { userId: trip.creatorId, joinRequestId: jr.id, category: 'PAYMENT_SUCCESS', unread: true },
        data: { unread: false },
      })
      .catch((err) => logger.warn('[TripBookings] Failed to clear payment alert:', err));

    return res.status(200).json({
      ok: true,
      data: { joinRequestId: jr.id, status: 'CONFIRMED', tripMemberId: admitted.tripMemberId, chatRoomId },
    });
  } catch (err) {
    logger.error('[TripBookings] approve-and-allocate failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not confirm this booking.');
  }
});

// ── GET /trips/:tripId/my-booking ─────────────────────────────────────────
// The traveller's own booking: status, token, receipt figures, the Trip
// Pass allocations once confirmed, group chat access, and the refund the
// cancellation policy would give right now.
router.get('/:tripId/my-booking', async (req, res) => {
  const params = tripParams.safeParse(req.params);
  if (!params.success) return validation(res, params.error.issues);
  const userId = requireUserId(req);

  try {
    const jr = await prisma.joinRequest.findUnique({
      where: { tripId_userId: { tripId: params.data.tripId, userId } },
      include: {
        paymentOrder: true,
        trip: { select: { id: true, name: true, startDate: true, endDate: true, meetingPoint: true, budget: true, chatRoom: { select: { id: true } } } },
      },
    });
    if (!jr) return fail(res, 404, 'NOT_FOUND', 'You have no booking on this trip.');

    const member =
      jr.status === 'CONFIRMED'
        ? await prisma.tripMember.findUnique({
            where: { tripId_userId: { tripId: jr.tripId, userId } },
            include: { allocations: { orderBy: [{ dayNumber: 'asc' }, { createdAt: 'asc' }] } },
          })
        : null;

    const order = jr.paymentOrder;
    const captured = order?.status === 'CAPTURED' ? order : null;
    const quote = computeRefundQuote({
      amountPaid: captured?.amount ?? 0,
      platformFee: captured?.platformFee ?? null,
      tripStartDate: jr.trip.startDate,
    });

    return res.status(200).json({
      ok: true,
      data: {
        joinRequestId: jr.id,
        status: jr.status,
        partySize: jr.partySize,
        trip: {
          id: jr.trip.id,
          name: jr.trip.name,
          startDate: jr.trip.startDate.toISOString(),
          endDate: jr.trip.endDate.toISOString(),
          meetingPoint: jr.trip.meetingPoint,
        },
        payment: order
          ? {
              amount: order.amount.toString(),
              platformFee: order.platformFee?.toString() ?? null,
              organizerAmount: order.organizerAmount?.toString() ?? null,
              status: order.status,
              gateway: order.gateway,
              verificationToken: order.verificationToken,
              paidAt: order.status === 'CREATED' || order.status === 'PENDING' ? null : order.updatedAt.toISOString(),
              refundedAmount: order.refundedAmount?.toString() ?? null,
            }
          : null,
        amountDue: jr.status === 'PAYMENT_PENDING' ? amountForRequest(jr, jr.trip.budget).toString() : null,
        bookingReferenceToken: member?.bookingReferenceToken ?? order?.verificationToken ?? null,
        allocations: (member?.allocations ?? []).map((a) => ({
          id: a.id,
          dayNumber: a.dayNumber,
          checkpointName: a.checkpointName,
          hotelName: a.hotelName,
          roomNumber: a.roomNumber,
          transitType: a.transitType,
          vehicleNumber: a.vehicleNumber,
          seatNumber: a.seatNumber,
          assemblyTime: a.assemblyTime,
          notes: a.notes,
        })),
        // Group chat only unlocks once confirmed.
        chatRoomId: jr.status === 'CONFIRMED' ? (jr.trip.chatRoom?.id ?? null) : null,
        cancellation: {
          tier: quote.tier,
          refundPercent: quote.refundPercent,
          refundAmount: quote.refundAmount.toFixed(2),
          hoursBeforeStart: quote.hoursBeforeStart,
        },
      },
    });
  } catch (err) {
    logger.error('[TripBookings] my-booking failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not load your booking.');
  }
});

// ── POST /trips/:tripId/cancel-booking ────────────────────────────────────
router.post('/:tripId/cancel-booking', async (req, res) => {
  const params = tripParams.safeParse(req.params);
  if (!params.success) return validation(res, params.error.issues);
  const userId = requireUserId(req);

  try {
    const result = await cancelBooking({ tripId: params.data.tripId, userId, io: req.app.get('socketio') });
    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') return fail(res, 404, 'NOT_FOUND', 'You have no booking on this trip.');
      if (result.reason === 'REFUND_FAILED') {
        return fail(res, 502, 'REFUND_FAILED', result.message ?? 'The refund could not be processed. Nothing was cancelled — please try again.');
      }
      return fail(res, 409, 'NOT_CANCELLABLE', 'This booking cannot be cancelled.');
    }
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    logger.error('[TripBookings] cancel-booking failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not cancel your booking.');
  }
});

export default router;
