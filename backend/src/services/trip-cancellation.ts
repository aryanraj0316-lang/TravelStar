import { Decimal } from '@prisma/client/runtime/library';
import type { Server as SocketIOServer } from 'socket.io';
import prisma from './db';
import { logger } from '../lib/logger';
import { releaseSeatAndLeave, SEAT_HOLDING_STATUSES } from './trip-membership';
import { computeFeeSplit, displayName, notifyTraveller, refundOrder } from './trip-payments';
import { sendPushToUsers, unreadCountFor } from '../lib/push';

// Tiered cancellation policy, by time left before the trip starts:
//
//   ≥ 168 h (7+ days)   → refund 95.5%: everything except the 4.5%
//                         non-refundable platform handling fee
//   72 h – < 168 h      → refund 50%
//   < 72 h (or started) → no refund
//
// The organizer keeps whatever is not refunded, less the platform fee.

const HOUR_MS = 60 * 60 * 1000;
export const FULL_REFUND_MIN_HOURS = 168;
export const PARTIAL_REFUND_MIN_HOURS = 72;

export type RefundTier = 'FULL_LESS_FEE' | 'HALF' | 'NONE';

export type RefundQuote = {
  tier: RefundTier;
  /** Share of the amount paid that comes back, 0–100. */
  refundPercent: number;
  refundAmount: Decimal;
  /** Whole hours from `now` to the trip's start (negative once started). */
  hoursBeforeStart: number;
};

/**
 * Pure policy calculation — no I/O, unit tested. `platformFee` is the fee
 * recorded on the order; orders from before the split existed (null) use
 * the same 4.5% computed from the amount.
 */
export function computeRefundQuote(opts: {
  amountPaid: Decimal | number | string;
  platformFee?: Decimal | number | string | null;
  tripStartDate: Date;
  now?: Date;
}): RefundQuote {
  const amount = new Decimal(opts.amountPaid);
  const now = opts.now ?? new Date();
  const hours = (opts.tripStartDate.getTime() - now.getTime()) / HOUR_MS;
  const hoursBeforeStart = Math.floor(hours);

  if (amount.lte(0)) {
    return { tier: 'NONE', refundPercent: 0, refundAmount: new Decimal(0), hoursBeforeStart };
  }
  if (hours >= FULL_REFUND_MIN_HOURS) {
    const fee = opts.platformFee != null ? new Decimal(opts.platformFee) : computeFeeSplit(amount).platformFee;
    const refundAmount = Decimal.max(amount.sub(fee), 0);
    return { tier: 'FULL_LESS_FEE', refundPercent: 95.5, refundAmount, hoursBeforeStart };
  }
  if (hours >= PARTIAL_REFUND_MIN_HOURS) {
    return {
      tier: 'HALF',
      refundPercent: 50,
      refundAmount: amount.div(2).toDecimalPlaces(2, Decimal.ROUND_DOWN),
      hoursBeforeStart,
    };
  }
  return { tier: 'NONE', refundPercent: 0, refundAmount: new Decimal(0), hoursBeforeStart };
}

/** The quote for one traveller's booking, or null if there is nothing to cancel. */
export async function quoteForBooking(tripId: string, userId: string) {
  const jr = await prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId, userId } },
    include: { trip: { select: { startDate: true } }, paymentOrder: true },
  });
  if (!jr) return null;
  const order = jr.paymentOrder?.status === 'CAPTURED' ? jr.paymentOrder : null;
  const quote = computeRefundQuote({
    amountPaid: order?.amount ?? 0,
    platformFee: order?.platformFee ?? null,
    tripStartDate: jr.trip.startDate,
  });
  return { joinRequest: jr, order, quote };
}

export type CancelResult =
  | { ok: true; status: 'CANCELLED' | 'REFUNDED'; refundAmount: string; tier: RefundTier; seatsReleased: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_CANCELLABLE' | 'REFUND_FAILED'; message?: string | undefined };

/**
 * A traveller cancels their own booking. Order matters and every step is
 * idempotent, so a retry after any partial failure converges:
 *   1. refund what the policy allows (refundOrder is double-refund safe);
 *   2. release held seats, remove membership, allocations and group chat,
 *      and close the request as REFUNDED (money returned) or CANCELLED.
 * A request that never held money or seats (PENDING / PAYMENT_PENDING) is
 * simply withdrawn.
 */
export async function cancelBooking(opts: {
  tripId: string;
  userId: string;
  io?: SocketIOServer | null | undefined;
}): Promise<CancelResult> {
  const found = await quoteForBooking(opts.tripId, opts.userId);
  if (!found) return { ok: false, reason: 'NOT_FOUND' };
  const { joinRequest: jr, order, quote } = found;

  if (jr.status === 'PENDING' || jr.status === 'PAYMENT_PENDING') {
    await releaseSeatAndLeave(jr.id, 'CANCELLED');
    await clearOrganizerJoinAlert(jr.id);
    return { ok: true, status: 'CANCELLED', refundAmount: '0.00', tier: 'NONE', seatsReleased: false };
  }
  if (!SEAT_HOLDING_STATUSES.includes(jr.status)) return { ok: false, reason: 'NOT_CANCELLABLE' };

  let refunded = new Decimal(0);
  if (order && quote.refundAmount.gt(0)) {
    const refund = await refundOrder(order.id, quote.refundAmount, `Cancelled ${quote.hoursBeforeStart}h before trip start`);
    if (!refund.ok) {
      return { ok: false, reason: 'REFUND_FAILED', message: refund.message ?? 'The refund could not be processed. Please try again.' };
    }
    refunded = refund.refundedAmount;
  }

  const finalStatus = refunded.gt(0) ? 'REFUNDED' : 'CANCELLED';
  const released = await releaseSeatAndLeave(jr.id, finalStatus);

  await notifyCancellation({
    tripId: opts.tripId,
    userId: opts.userId,
    refunded,
    tier: quote.tier,
    io: opts.io,
  });

  return {
    ok: true,
    status: finalStatus,
    refundAmount: refunded.toFixed(2),
    tier: quote.tier,
    seatsReleased: released.ok && released.released,
  };
}

/**
 * The organizer rejects a request. If it was paid, the traveller is
 * refunded in FULL (they did nothing wrong) to the original method, then
 * the held seats are released.
 */
export async function rejectBooking(joinRequestId: string): Promise<{ ok: true; refundAmount: string } | { ok: false; reason: 'REFUND_FAILED' | 'NOT_FOUND'; message?: string | undefined }> {
  const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
  let refunded = new Decimal(0);
  if (order && order.status === 'CAPTURED') {
    const refund = await refundOrder(order.id, order.amount, 'Rejected by the organizer');
    if (!refund.ok) return { ok: false, reason: 'REFUND_FAILED', message: refund.message };
    refunded = refund.refundedAmount;
  }
  const released = await releaseSeatAndLeave(joinRequestId, 'REJECTED');
  if (!released.ok) return { ok: false, reason: 'NOT_FOUND' };
  return { ok: true, refundAmount: refunded.toFixed(2) };
}

async function clearOrganizerJoinAlert(joinRequestId: string) {
  try {
    await prisma.notification.deleteMany({ where: { joinRequestId, category: 'JOIN_REQUEST' } });
  } catch (err) {
    logger.warn('[TripCancellation] Could not clear organizer alert:', err);
  }
}

async function notifyCancellation(opts: {
  tripId: string;
  userId: string;
  refunded: Decimal;
  tier: RefundTier;
  io?: SocketIOServer | null | undefined;
}) {
  try {
    const [trip, traveller] = await Promise.all([
      prisma.trip.findUnique({ where: { id: opts.tripId }, select: { name: true, creatorId: true } }),
      prisma.user.findUnique({ where: { id: opts.userId }, include: { profile: true } }),
    ]);
    if (!trip) return;
    const refundLine = opts.refunded.gt(0)
      ? `₹${opts.refunded.toFixed(2)} is being refunded to your original payment method.`
      : 'Under the cancellation policy no refund is due for cancellations within 72 hours of departure.';
    await notifyTraveller(opts.userId, {
      title: `Booking cancelled — ${trip.name}`,
      content: refundLine,
      tripId: opts.tripId,
      io: opts.io,
      data: { screen: 'bookings' },
    });

    if (trip.creatorId !== opts.userId) {
      const title = `Booking cancelled — ${trip.name}`;
      const content = `${displayName(traveller)} cancelled their booking. Their seats are available again.`;
      await prisma.notification.create({
        data: { userId: trip.creatorId, type: 'TRIP', title, content, time: 'Just now', unread: true, tripId: opts.tripId },
      });
      opts.io?.to(trip.creatorId).emit('notificationReceived', {
        id: `notif-${Date.now()}`,
        userId: trip.creatorId,
        type: 'TRIP',
        title,
        content,
        unread: true,
        tripId: opts.tripId,
      });
      await sendPushToUsers([trip.creatorId], 'TRIP', {
        title,
        body: content,
        data: { screen: 'group-organizer', tripId: opts.tripId },
        badge: await unreadCountFor(trip.creatorId),
      });
    }
  } catch (err) {
    logger.warn('[TripCancellation] Notifications failed (non-fatal):', err);
  }
}
