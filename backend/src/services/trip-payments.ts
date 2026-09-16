import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import prisma from './db';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { claimSeatAndJoin } from './trip-membership';
import { sendPushToUsers, unreadCountFor } from '../lib/push';
import { Decimal } from '@prisma/client/runtime/library';

// ── Razorpay client (lazy singleton) ──────────────────────────────────────

let _rzpClient: Razorpay | null = null;

/**
 * Returns the Razorpay client, throwing with code SERVICE_UNAVAILABLE when
 * credentials are not configured. Payment endpoints fail fast with a clear
 * error rather than silently accepting a request they cannot fulfil
 * (docs/CONVENTIONS.md §10 — no silent failures).
 */
function razorpayClient(): Razorpay {
  if (_rzpClient) return _rzpClient;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Razorpay credentials not configured'), {
      code: 'SERVICE_UNAVAILABLE',
    });
  }
  _rzpClient = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  return _rzpClient;
}

export function isRazorpayConfigured(): boolean {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

// ── Order creation ─────────────────────────────────────────────────────────

/** Creates a Razorpay order. Razorpay expects amounts in paise. */
async function createRazorpayOrder(amountRupees: Decimal | number) {
  const rzp = razorpayClient();
  const amountPaise = Math.round(Number(amountRupees) * 100);
  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    payment_capture: true,
  });
  return order;
}

/**
 * Idempotent: returns an existing TripPaymentOrder for the given
 * idempotencyKey, or creates a new one with a Razorpay order.
 */
export async function getOrCreatePaymentOrder(opts: {
  joinRequestId: string;
  userId: string;
  amount: Decimal;
  idempotencyKey: string;
}) {
  const { joinRequestId, userId, amount, idempotencyKey } = opts;

  const existing = await prisma.tripPaymentOrder.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const byRequest = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
  if (byRequest && (byRequest.status === 'CREATED' || byRequest.status === 'PENDING')) {
    return byRequest;
  }

  const rzpOrder = await createRazorpayOrder(amount);

  return prisma.tripPaymentOrder.create({
    data: {
      joinRequestId,
      userId,
      amount,
      gateway: 'RAZORPAY',
      razorpayOrderId: rzpOrder.id,
      status: 'CREATED',
      idempotencyKey,
      gatewayDebit: amount,
    },
  });
}

// ── Signature verification ─────────────────────────────────────────────────

/**
 * Verifies a Razorpay payment signature (checkout callback).
 * HMAC-SHA256 over "{orderId}|{paymentId}" with RAZORPAY_KEY_SECRET.
 * https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#step-3-verify-payment-signature
 */
export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = razorpayOrderId + '|' + razorpayPaymentId;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/** Verifies Razorpay webhook signature using RAZORPAY_WEBHOOK_SECRET. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// ── Seat claim after verified payment ─────────────────────────────────────

export type CaptureResult =
  | { ok: true; joinRequestId: string; chatRoomId: string | null }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'ALREADY_CAPTURED' | 'TRIP_FULL' | 'TRIP_NOT_FOUND' | 'BUSY' };

/**
 * Called after payment is verified. Finds the TripPaymentOrder, checks for
 * replay, calls claimSeatAndJoin, marks order CAPTURED, dispatches notifications.
 */
export async function captureAndClaimSeat(opts: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signatureVerified: true;
}): Promise<CaptureResult> {
  const { razorpayOrderId, razorpayPaymentId } = opts;

  const order = await prisma.tripPaymentOrder.findUnique({
    where: { razorpayOrderId },
    include: { joinRequest: { include: { trip: true } } },
  });

  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.status === 'CAPTURED') {
    return { ok: true, joinRequestId: order.joinRequestId, chatRoomId: null };
  }
  if (order.status === 'REFUNDED') {
    return { ok: false, reason: 'ALREADY_CAPTURED' };
  }

  const { joinRequest } = order;

  await prisma.tripPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'PENDING', razorpayPaymentId },
  });

  const claim = await claimSeatAndJoin(joinRequest.tripId, joinRequest.userId, {
    existingJoinRequestId: joinRequest.id,
    fromCity: joinRequest.fromCity,
    toCity: joinRequest.toCity,
    adjustedPrice: joinRequest.adjustedPrice ? Number(joinRequest.adjustedPrice) : null,
    partySize: joinRequest.partySize,
  });

  if (!claim.ok) {
    await prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { status: 'CREATED' } });
    return { ok: false, reason: claim.reason };
  }

  await prisma.tripPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'CAPTURED', razorpayPaymentId },
  });

  await _dispatchJoinNotifications(
    joinRequest.userId, joinRequest.tripId, joinRequest.trip.name, claim.chatRoomId ?? null,
  );

  return { ok: true, joinRequestId: joinRequest.id, chatRoomId: claim.chatRoomId ?? null };
}

// ── Wallet payment ─────────────────────────────────────────────────────────

export type WalletPayResult =
  | { ok: true; joinRequestId: string; chatRoomId: string | null }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'ALREADY_CAPTURED' | 'TRIP_FULL' | 'TRIP_NOT_FOUND' | 'BUSY' };

/**
 * Pays the trip joining fee from the traveller's wallet. The deduction is a
 * single conditional UPDATE (WHERE balance >= amount) so concurrent calls
 * cannot both succeed. An idempotency key on WalletTransaction prevents
 * double-deduction on retry.
 */
export async function payFromWallet(joinRequestId: string, userId: string): Promise<WalletPayResult> {
  let order = await prisma.tripPaymentOrder.findUnique({
    where: { joinRequestId },
    include: { joinRequest: { include: { trip: true } } },
  });

  if (!order) {
    const jr = await prisma.joinRequest.findUnique({
      where: { id: joinRequestId },
      include: { trip: true },
    });
    if (!jr || jr.userId !== userId || jr.status !== 'AWAITING_PAYMENT') {
      return { ok: false, reason: 'ORDER_NOT_FOUND' };
    }
    // Per-person price × partySize — same rule as /initiate and GET /order.
    const perPerson = (jr.adjustedPrice ?? jr.trip.budget) as Decimal;
    const amount = new Decimal(perPerson).mul(jr.partySize);
    order = await prisma.tripPaymentOrder.create({
      data: {
        joinRequestId,
        userId,
        amount,
        gateway: 'WALLET',
        status: 'PENDING',
        idempotencyKey: `wallet-${joinRequestId}-${userId}`,
        walletDebit: amount,
      },
      include: { joinRequest: { include: { trip: true } } },
    });
  }

  if (order.status === 'CAPTURED') {
    return { ok: true, joinRequestId, chatRoomId: null };
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < Number(order.amount)) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  const idempotencyKey = 'wallet-pay-' + order.id + '-' + userId;
  const existingTx = await prisma.walletTransaction.findUnique({ where: { idempotencyKey } });

  if (!existingTx) {
    const deducted = await prisma.$executeRaw`
      UPDATE "Wallet"
         SET balance = balance - ${order.amount}
       WHERE "userId" = ${userId}
         AND balance >= ${order.amount}
    `;
    if (deducted === 0) {
      return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
    }
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: order.amount,
        type: 'PAYMENT',
        remark: 'Trip joining fee for ' + order.joinRequest.trip.name,
        idempotencyKey,
      },
    });
  }

  await prisma.tripPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'PENDING', gateway: 'WALLET', walletDebit: order.amount, gatewayDebit: null },
  });

  const claim = await claimSeatAndJoin(order.joinRequest.tripId, order.joinRequest.userId, {
    existingJoinRequestId: order.joinRequest.id,
    fromCity: order.joinRequest.fromCity,
    toCity: order.joinRequest.toCity,
    adjustedPrice: order.joinRequest.adjustedPrice ? Number(order.joinRequest.adjustedPrice) : null,
    partySize: order.joinRequest.partySize,
  });

  if (!claim.ok) {
    await _refundWalletInternal(
      wallet.id, userId, order.amount,
      'Refund: ' + order.joinRequest.trip.name + ' (join failed)',
    );
    await prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
    return { ok: false, reason: claim.reason };
  }

  await prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { status: 'CAPTURED' } });

  await _dispatchJoinNotifications(
    order.joinRequest.userId, order.joinRequest.tripId,
    order.joinRequest.trip.name, claim.chatRoomId ?? null,
  );

  return { ok: true, joinRequestId, chatRoomId: claim.chatRoomId ?? null };
}

// ── Direct payment capture ─────────────────────────────────────────────────

export type DirectPayResult =
  | { ok: true; joinRequestId: string; chatRoomId: string | null; amount: string }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'ALREADY_CAPTURED' | 'TRIP_FULL' | 'TRIP_NOT_FOUND' | 'BUSY' };

/**
 * Captures the seat fee the traveller has just paid, for the exact amount the
 * trip charges, and seats them.
 *
 * Deliberately not a stored-credit model: there is no balance to fund first
 * and nothing is deducted from anywhere. The amount owed for this join
 * request is recorded as a captured TripPaymentOrder, which is the single row
 * every "money collected" figure in the organizer's portal is computed from
 * (GET /trips/mine/payment-summaries), and which is also the permanent
 * receipt for both sides — orders are never deleted.
 *
 * The Razorpay path (captureAndClaimSeat) ends in exactly the same state, so
 * adding gateway credentials later changes how the money is collected without
 * changing anything downstream of it.
 */
export async function payDirect(joinRequestId: string, userId: string): Promise<DirectPayResult> {
  const jr = await prisma.joinRequest.findUnique({
    where: { id: joinRequestId },
    include: { trip: true, paymentOrder: true },
  });

  if (!jr || jr.userId !== userId) {
    return { ok: false, reason: 'ORDER_NOT_FOUND' };
  }
  if (jr.paymentOrder?.status === 'CAPTURED') {
    return {
      ok: true,
      joinRequestId,
      chatRoomId: null,
      amount: jr.paymentOrder.amount.toString(),
    };
  }
  if (jr.status !== 'AWAITING_PAYMENT') {
    return { ok: false, reason: 'ORDER_NOT_FOUND' };
  }

  // Per-person price × party size — the same rule /initiate, /order and the
  // wallet path use, so a Family Connect join is charged for the whole party.
  const perPerson = (jr.adjustedPrice ?? jr.trip.budget) as Decimal;
  const amount = new Decimal(perPerson).mul(jr.partySize);

  const order =
    jr.paymentOrder ??
    (await prisma.tripPaymentOrder.create({
      data: {
        joinRequestId,
        userId,
        amount,
        gateway: 'DIRECT',
        status: 'PENDING',
        idempotencyKey: `direct-${joinRequestId}-${userId}`,
      },
    }));

  const claim = await claimSeatAndJoin(jr.tripId, jr.userId, {
    existingJoinRequestId: jr.id,
    fromCity: jr.fromCity,
    toCity: jr.toCity,
    adjustedPrice: jr.adjustedPrice ? Number(jr.adjustedPrice) : null,
    partySize: jr.partySize,
  });

  if (!claim.ok) {
    // Nothing was taken, so there is nothing to refund — the order simply
    // never captures and the traveller keeps their money.
    await prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { status: 'CREATED' } });
    return { ok: false, reason: claim.reason };
  }

  await prisma.tripPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'CAPTURED', gateway: 'DIRECT', amount },
  });

  await _dispatchJoinNotifications(
    jr.userId, jr.tripId, jr.trip.name, claim.chatRoomId ?? null,
  );

  return {
    ok: true,
    joinRequestId,
    chatRoomId: claim.chatRoomId ?? null,
    amount: amount.toString(),
  };
}

// ── Refund ─────────────────────────────────────────────────────────────────

/**
 * Refunds a captured trip payment to the traveller's wallet.
 * Called when an organiser rejects after payment, or on trip cancellation.
 * Razorpay gateway refunds are handled manually by the operator for v1;
 * the in-app wallet receives the credit as store credit immediately.
 */
export async function refundToWallet(tripPaymentOrderId: string): Promise<{ ok: boolean }> {
  const order = await prisma.tripPaymentOrder.findUnique({
    where: { id: tripPaymentOrderId },
    include: { joinRequest: { include: { trip: true } } },
  });
  if (!order || order.status === 'REFUNDED') return { ok: true };

  const wallet = await prisma.wallet.upsert({
    where: { userId: order.userId },
    create: { userId: order.userId, balance: 0 },
    update: {},
  });

  const idempotencyKey = 'refund-' + order.id;
  const existing = await prisma.walletTransaction.findUnique({ where: { idempotencyKey } });
  if (!existing) {
    await _refundWalletInternal(
      wallet.id, order.userId, order.amount,
      'Refund: ' + order.joinRequest.trip.name + ' (rejected by organiser)',
      idempotencyKey,
    );
  }

  await prisma.tripPaymentOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
  logger.log('[TripPayments] Refunded ' + order.amount + ' to wallet for user ' + order.userId);
  return { ok: true };
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function _refundWalletInternal(
  walletId: string,
  userId: string,
  amount: Decimal,
  remark: string,
  idempotencyKey?: string,
) {
  await prisma.$executeRaw`UPDATE "Wallet" SET balance = balance + ${amount} WHERE id = ${walletId}`;
  await prisma.walletTransaction.create({
    data: {
      walletId,
      amount,
      type: 'REFUND',
      remark,
      idempotencyKey: idempotencyKey ?? ('refund-auto-' + walletId + '-' + Date.now()),
    },
  });
}

async function _dispatchJoinNotifications(
  userId: string,
  tripId: string,
  tripName: string,
  chatRoomId: string | null,
) {
  try {
    // Both notifications quote the actual figures rather than "payment
    // confirmed", so each side has the receipt in hand without opening
    // anything. The same numbers back the permanent receipt list
    // (GET /trip-payments/receipts), which reads the very same order row.
    const order = await prisma.tripPaymentOrder.findFirst({
      where: { userId, joinRequest: { tripId } },
      orderBy: { updatedAt: 'desc' },
      include: { joinRequest: { include: { trip: true } } },
    });

    const amountLabel = order ? `₹${Number(order.amount).toFixed(2)}` : null;
    const seats = order?.joinRequest.partySize ?? 1;
    const seatLabel = seats > 1 ? `${seats} seats` : '1 seat';
    const paidOn = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const reference = order ? order.id.slice(0, 8).toUpperCase() : null;

    const travellerReceipt = amountLabel
      ? `Receipt · ${tripName}\nAmount paid: ${amountLabel} (${seatLabel})\nDate: ${paidOn}` +
        (reference ? `\nReference: ${reference}` : '') +
        (chatRoomId ? '\nYou have been added to the group chat.' : '')
      : 'Your payment for ' + tripName + ' was confirmed. You are now a member' +
        (chatRoomId ? ' and have been added to the group chat.' : '.');

    await prisma.notification.create({
      data: {
        userId,
        type: 'TRIP',
        category: 'PAYMENT_SUCCESS',
        title: 'Payment Successful — Welcome!',
        content: travellerReceipt,
        time: 'Just now',
        unread: true,
        tripId,
        chatRoomId,
      },
    });

    await sendPushToUsers([userId], 'TRIP', {
      title: 'Payment Successful — Welcome!',
      body: amountLabel
        ? `${amountLabel} paid for ${tripName}. You are now a member.`
        : 'You are now a member of ' + tripName,
      data: { screen: 'trip', tripId, chatRoomId: chatRoomId ?? '' },
      badge: await unreadCountFor(userId),
    });

    // The organizer is the other half of this transaction — it is their trip
    // that just filled a seat and their "Money Collected" that just moved —
    // but only the traveller was ever told. Nothing on the organizer side
    // announced a payment, so a seat silently became paid.
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { creatorId: true },
    });
    const payer = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (trip?.creatorId && trip.creatorId !== userId) {
      const payerName = payer?.profile
        ? `${payer.profile.firstName} ${payer.profile.lastName ?? ''}`.trim()
        : (payer?.email?.split('@')[0] ?? 'A traveller');
      const organizerTitle = 'Payment received — ' + tripName;
      const organizerContent = amountLabel
        ? `Receipt · ${tripName}\nFrom: ${payerName}\nAmount received: ${amountLabel} (${seatLabel})\nDate: ${paidOn}` +
          (reference ? `\nReference: ${reference}` : '') +
          `\nAdded to this trip's collected budget.`
        : `${payerName} has paid for their seat on ${tripName}.`;

      await prisma.notification.create({
        data: {
          userId: trip.creatorId,
          type: 'TRIP',
          category: 'PAYMENT_SUCCESS',
          title: organizerTitle,
          content: organizerContent,
          time: 'Just now',
          unread: true,
          tripId,
        },
      });

      await sendPushToUsers([trip.creatorId], 'TRIP', {
        title: organizerTitle,
        body: amountLabel
          ? `${payerName} paid ${amountLabel} for ${tripName}.`
          : `${payerName} has paid for their seat on ${tripName}.`,
        data: { screen: 'group-organizer', tripId },
        badge: await unreadCountFor(trip.creatorId),
      });
    }
  } catch (err) {
    logger.warn('[TripPayments] Notification dispatch failed (non-fatal):', err);
  }
}
