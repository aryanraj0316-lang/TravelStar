import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { sendPushToUsers } from '../../lib/push';
import { buildPage, cursorFilter, cursorPageQuerySchema, takeWithLookahead } from '../../lib/pagination';

const router = Router();

/**
 * Guide bookings.
 *
 * Until now nothing in the API could create a Booking row: the model was
 * only ever read (the earnings aggregation in guides.ts, and the
 * `activeGuiding` block on GET /guides/:id/live-status), so a traveller
 * could browse a guide's packages and then had nowhere to go, and a guide's
 * earnings screen could only ever show zero.
 *
 * v1 has no payment provider (payments/wallet were removed — see the note
 * in trips.ts), so this is deliberately a *request → the guide accepts or
 * declines* flow, the same shape as a trip join-request, rather than
 * pretending money moved. `paymentStatus` stays PENDING throughout; nothing
 * here claims a payment was taken.
 */

function toClientBooking(b: {
  id: string;
  userId: string;
  guideProfileId: string | null;
  travelDate: Date;
  bookingDate: Date;
  amount: { toString(): string };
  status: string;
  paymentStatus: string;
}) {
  return {
    id: b.id,
    userId: b.userId,
    guideProfileId: b.guideProfileId,
    travelDate: b.travelDate.toISOString().split('T')[0],
    bookingDate: b.bookingDate.toISOString(),
    // Money crosses the wire as a string (docs/CONVENTIONS.md §3).
    amount: b.amount.toString(),
    status: b.status,
    paymentStatus: b.paymentStatus,
  };
}

const createBookingSchema = z.object({
  packageId: z.string().uuid(),
  travelDate: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'travelDate must be in the future',
  }),
});

// Book a guide package. The price is read from the package server-side and
// never taken from the request body — same rule as the midway-join pricing
// in interactions.ts.
router.post('/', async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please check the booking details.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  const userId = requireUserId(req);
  const { packageId, travelDate } = parsed.data;

  try {
    const pkg = await prisma.guidePackage.findUnique({
      where: { id: packageId },
      include: { guide: { select: { id: true, userId: true, verifiedStatus: true } } },
    });
    if (!pkg) {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'PACKAGE_NOT_FOUND', message: 'That package is no longer available.' } });
    }
    if (pkg.guide.userId === userId) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'You cannot book your own package.' } });
    }

    const booking = await prisma.booking.create({
      data: {
        userId,
        type: 'GUIDE',
        guideProfileId: pkg.guideProfileId,
        travelDate,
        amount: pkg.price,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
    });

    const traveller = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const travellerName = traveller?.profile
      ? `${traveller.profile.firstName} ${traveller.profile.lastName}`.trim()
      : (traveller?.email?.split('@')[0] ?? 'A traveller');

    // NotificationCategory has no BOOKING member yet, and adding one is a
    // schema migration rather than something to smuggle into this change —
    // so this lands as a plain TRIP-type notification, which is what the
    // bell already renders.
    const title = 'New booking request';
    const content = `${travellerName} requested ${pkg.title} for ${booking.travelDate.toISOString().split('T')[0]}.`;
    await prisma.notification.create({
      data: { userId: pkg.guide.userId, type: 'TRIP', title, content, time: 'Just now' },
    });
    await sendPushToUsers([pkg.guide.userId], 'TRIP', {
      title,
      body: content,
      data: { screen: 'bookings', bookingId: booking.id },
    });

    return res.status(201).json({ ok: true, data: toClientBooking(booking) });
  } catch (err) {
    logger.error('[Bookings] Create error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not request this booking.' } });
  }
});

// The caller's own bookings, as the traveller who made them.
router.get('/mine', async (req, res) => {
  const userId = requireUserId(req);
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsedQuery.data;

  try {
    const rows = await prisma.booking.findMany({
      where: { userId, ...cursorFilter(cursor) },
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
      include: { guide: { include: { user: { include: { profile: true } } } } },
    });
    const { items, nextCursor } = buildPage(rows, limit);

    const data = items.map((b) => ({
      ...toClientBooking(b),
      guideName: b.guide?.user?.profile
        ? `${b.guide.user.profile.firstName} ${b.guide.user.profile.lastName}`.trim()
        : 'Guide',
    }));
    return res.status(200).json({ ok: true, data, meta: { cursor: nextCursor } });
  } catch (err) {
    logger.error('[Bookings] List mine error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load your bookings.' } });
  }
});

// Bookings made against the guide profile the caller owns.
router.get('/incoming', async (req, res) => {
  const userId = requireUserId(req);
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsedQuery.data;

  try {
    const guide = await prisma.guideProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!guide) {
      return res.status(404).json({
        ok: false,
        error: { code: 'GUIDE_PROFILE_NOT_FOUND', message: 'No guide profile yet. Apply to become a guide first.' },
      });
    }

    const rows = await prisma.booking.findMany({
      where: { guideProfileId: guide.id, ...cursorFilter(cursor) },
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
      include: { user: { include: { profile: true } } },
    });
    const { items, nextCursor } = buildPage(rows, limit);

    const data = items.map((b) => ({
      ...toClientBooking(b),
      travellerName: b.user?.profile
        ? `${b.user.profile.firstName} ${b.user.profile.lastName}`.trim()
        : (b.user?.email?.split('@')[0] ?? 'Traveller'),
      travellerAvatar: b.user?.profile?.avatarUrl ?? null,
    }));
    return res.status(200).json({ ok: true, data, meta: { cursor: nextCursor } });
  } catch (err) {
    logger.error('[Bookings] List incoming error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load your bookings.' } });
  }
});

const statusSchema = z.object({ status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']) });

/**
 * Move a booking along. Who may do what:
 *  - the guide who owns the profile: CONFIRMED / CANCELLED / COMPLETED
 *  - the traveller who booked: CANCELLED only (they can withdraw, not
 *    confirm their own booking or mark it delivered)
 *  - admins: anything
 * Only a PENDING booking can be confirmed, and a booking that has already
 * been cancelled or completed is terminal.
 */
router.post('/:id/status', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'status must be CONFIRMED, CANCELLED or COMPLETED.' },
    });
  }
  const { id } = req.params;
  const userId = requireUserId(req);
  const { status } = parsed.data;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { guide: { select: { userId: true } } },
    });
    if (!booking) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    }

    const isGuide = booking.guide?.userId === userId;
    const isTraveller = booking.userId === userId;
    if (!isGuide && !isTraveller && !isAdmin(req)) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'This is not your booking.' } });
    }
    if (isTraveller && !isGuide && !isAdmin(req) && status !== 'CANCELLED') {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Only the guide can confirm or complete a booking.' },
      });
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: `This booking is already ${booking.status.toLowerCase()}.` },
      });
    }
    if (status === 'CONFIRMED' && booking.status !== 'PENDING') {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Only a pending booking can be confirmed.' } });
    }
    if (status === 'COMPLETED' && booking.status !== 'CONFIRMED') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'Only a confirmed booking can be marked completed.' },
      });
    }

    const updated = await prisma.booking.update({ where: { id }, data: { status } });

    // Tell whichever side did not make the change.
    const recipientId = isGuide && !isTraveller ? booking.userId : (booking.guide?.userId ?? null);
    if (recipientId) {
      const title =
        status === 'CONFIRMED'
          ? 'Booking confirmed 🎉'
          : status === 'CANCELLED'
            ? 'Booking cancelled'
            : 'Booking completed';
      const content =
        status === 'CONFIRMED'
          ? `Your guide confirmed your booking for ${updated.travelDate.toISOString().split('T')[0]}.`
          : status === 'CANCELLED'
            ? `A booking for ${updated.travelDate.toISOString().split('T')[0]} was cancelled.`
            : `Your booking on ${updated.travelDate.toISOString().split('T')[0]} was marked complete.`;
      await prisma.notification.create({
        data: { userId: recipientId, type: 'TRIP', title, content, time: 'Just now' },
      });
      await sendPushToUsers([recipientId], 'TRIP', {
        title,
        body: content,
        data: { screen: 'bookings', bookingId: updated.id },
      });
    }

    return res.status(200).json({ ok: true, data: toClientBooking(updated) });
  } catch (err) {
    logger.error('[Bookings] Status change error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not update this booking.' } });
  }
});

export default router;
