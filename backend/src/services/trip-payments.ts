import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { Prisma } from '@prisma/client';
import prisma from './db';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { holdSeatsForRequest } from './trip-membership';
import { sendPushToUsers, unreadCountFor } from '../lib/push';
import { Decimal } from '@prisma/client/runtime/library';
import type { Server as SocketIOServer } from 'socket.io';

// Booking money flow (docs: "payment-gated booking"):
//
//   PAYMENT_PENDING ──pay──► PAYMENT_COMPLETED ──organizer allocates──► CONFIRMED
//                    (seats held, token issued)        (member + group chat)
//
// Payment never makes anyone a member and never adds them to the group chat:
// it holds their seats and issues a verification token. Only the organizer's
// allocation (services/trip-membership.ts admitAllocatedMember) admits them.

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

// ── Pricing, platform fee and tokens ───────────────────────────────────────

/** The platform's non-refundable handling share of every booking. */
export const PLATFORM_FEE_RATE = 0.045;

/**
 * Splits a booking total into the platform's 4.5% fee and the organizer's
 * 95.5% share. Rounded to the paisa, with the organizer share computed as
 * the remainder so the two always add back up to the total exactly.
 */
export function computeFeeSplit(total: Decimal | number | string): {
  platformFee: Decimal;
  organizerAmount: Decimal;
} {
  const amount = new Decimal(total);
  const platformFee = amount.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { platformFee, organizerAmount: amount.sub(platformFee) };
}

/** What a join request owes: per-person price (midway-adjusted or full) × party size. */
export function amountForRequest(jr: { adjustedPrice: Decimal | null; partySize: number }, tripBudget: Decimal): Decimal {
  const perPerson = jr.adjustedPrice ?? tripBudget;
  return new Decimal(perPerson).mul(Math.max(1, jr.partySize));
}

/**
 * A booking verification token, e.g. "TST-8F92A1": 24 bits of CSPRNG
 * output. Uniqueness is enforced by the database (@unique) and a collision
 * is retried by the caller, so the short form stays readable aloud.
 */
export function generateVerificationToken(): string {
  return 'TST-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function isTokenCollision(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } } | undefined;
  return err?.code === 'P2002' && JSON.stringify(err.meta?.target ?? '').includes('verificationToken');
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
 * idempotencyKey, or creates a new one with a Razorpay order. The 4.5% /
 * 95.5% split is fixed on the order at creation.
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
  if (byRequest && byRequest.gateway === 'RAZORPAY' && (byRequest.status === 'CREATED' || byRequest.status === 'PENDING')) {
    return byRequest;
  }

  const rzpOrder = await createRazorpayOrder(amount);
  const split = computeFeeSplit(amount);
  const data = {
    userId,
    amount,
    gateway: 'RAZORPAY',
    razorpayOrderId: rzpOrder.id,
    status: 'CREATED' as const,
    idempotencyKey,
    gatewayDebit: amount,
    walletDebit: null,
    ...split,
  };

  // One order row per join request: a stale FAILED/unpaid row from an
  // earlier attempt (or another method) is reused rather than colliding on
  // the unique joinRequestId.
  return byRequest
    ? prisma.tripPaymentOrder.update({ where: { id: byRequest.id }, data })
    : prisma.tripPaymentOrder.create({ data: { joinRequestId, ...data } });
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

// ── Completing a payment: hold seats + issue token ─────────────────────────

export type PaymentOutcome =
  | { ok: true; joinRequestId: string; verificationToken: string; amount: string; alreadyCompleted?: boolean }
  | {
      ok: false;
      reason:
        | 'ORDER_NOT_FOUND'
        | 'INSUFFICIENT_BALANCE'
        | 'TRIP_FULL'
        | 'TRIP_NOT_FOUND'
        | 'BUSY'
        | 'ALREADY_REFUNDED'
        | 'NOT_PAYABLE';
      /** True when money had moved and was returned in full automatically. */
      refunded?: boolean;
    };

type CompleteResult = { ok: true; token: string } | { ok: false; reason: 'INVALID_STATUS' | 'TRIP_FULL' | 'BUSY' };

/**
 * The single place a payment becomes a booking: in one transaction the join
 * request moves PAYMENT_PENDING → PAYMENT_COMPLETED, its seats leave the
 * trip's availableSeats, and the order is marked CAPTURED with a fresh
 * verification token and its fee split. Retries a (rare) token collision.
 */
async function completePayment(
  orderId: string,
  joinRequestId: string,
  orderData: Prisma.TripPaymentOrderUpdateInput,
): Promise<CompleteResult> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateVerificationToken();
    try {
      const held = await holdSeatsForRequest(joinRequestId, {
        fromStatuses: ['PAYMENT_PENDING'],
        toStatus: 'PAYMENT_COMPLETED',
        extra: async (tx) => {
          await tx.tripPaymentOrder.update({
            where: { id: orderId },
            data: { ...orderData, status: 'CAPTURED', verificationToken: token },
          });
        },
      });
      return held.ok ? { ok: true, token } : held;
    } catch (e) {
      if (isTokenCollision(e)) continue;
      throw e;
    }
  }
  throw new Error('Could not issue a unique verification token');
}

/** Statuses an order may be (re)started from. Never CAPTURED or refunded. */
const RESTARTABLE_ORDER_STATUSES = ['CREATED', 'PENDING', 'FAILED'] as const;

/**
 * If a concurrent call (the verify endpoint and the webhook both deliver a
 * Razorpay payment; a double-tapped Pay button) already completed this
 * order, returns that outcome — so the loser of the race reports success
 * instead of treating the request's new status as "unbookable" and
 * refunding a valid booking.
 */
async function completedByAnotherCall(orderId: string): Promise<PaymentOutcome | null> {
  const fresh = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
  if (fresh?.status === 'CAPTURED' && fresh.verificationToken) {
    return {
      ok: true,
      joinRequestId: fresh.joinRequestId,
      verificationToken: fresh.verificationToken,
      amount: fresh.amount.toString(),
      alreadyCompleted: true,
    };
  }
  if (fresh?.status === 'REFUNDED' || fresh?.status === 'PARTIALLY_REFUNDED') {
    return { ok: false, reason: 'ALREADY_REFUNDED' };
  }
  return null;
}

/**
 * Money has been taken but cannot become a booking (trip filled while the
 * traveller was paying, or the request was withdrawn mid-checkout). The
 * order is recorded as captured — it was — and refunded in full to where
 * it came from, and the request is closed as REFUNDED.
 */
async function refundUnbookablePayment(
  orderId: string,
  joinRequestId: string,
  why: string,
  io?: SocketIOServer | null,
): Promise<boolean> {
  await prisma.tripPaymentOrder.update({ where: { id: orderId }, data: { status: 'CAPTURED' } });
  const order = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return false;
  const refund = await refundOrder(orderId, order.amount, why);
  if (!refund.ok) {
    logger.error('[TripPayments] Automatic refund failed — needs manual refund', { orderId, why, refund });
    return false;
  }
  await prisma.joinRequest.updateMany({
    where: { id: joinRequestId, status: { in: ['PAYMENT_PENDING', 'PENDING'] } },
    data: { status: 'REFUNDED' },
  });
  await notifyTraveller(order.userId, {
    title: 'Payment refunded',
    content: `We could not complete your booking (${why}). ₹${Number(order.amount).toFixed(2)} has been refunded to your original payment method.`,
    io,
  });
  return true;
}

/**
 * Razorpay path — called after the checkout signature (or the webhook's)
 * has been verified. Idempotent: the verify endpoint and the webhook may
 * both deliver the same payment.
 */
export async function captureAndHoldSeat(opts: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signatureVerified: true;
  io?: SocketIOServer | null | undefined;
}): Promise<PaymentOutcome> {
  const { razorpayOrderId, razorpayPaymentId } = opts;

  const order = await prisma.tripPaymentOrder.findUnique({
    where: { razorpayOrderId },
    include: { joinRequest: { include: { trip: true } } },
  });

  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.status === 'CAPTURED' && order.verificationToken) {
    return {
      ok: true,
      joinRequestId: order.joinRequestId,
      verificationToken: order.verificationToken,
      amount: order.amount.toString(),
      alreadyCompleted: true,
    };
  }
  if (order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') {
    return { ok: false, reason: 'ALREADY_REFUNDED' };
  }

  const marked = await prisma.tripPaymentOrder.updateMany({
    where: { id: order.id, status: { in: [...RESTARTABLE_ORDER_STATUSES] } },
    data: { status: 'PENDING', razorpayPaymentId },
  });
  if (marked.count === 0) {
    return (await completedByAnotherCall(order.id)) ?? { ok: false, reason: 'BUSY' };
  }

  const done = await completePayment(order.id, order.joinRequestId, {
    razorpayPaymentId,
    gateway: 'RAZORPAY',
  });

  if (!done.ok) {
    if (done.reason === 'BUSY') return { ok: false, reason: 'BUSY' };
    const settled = await completedByAnotherCall(order.id);
    if (settled) return settled;
    const why = done.reason === 'TRIP_FULL' ? 'the trip filled up while you were paying' : 'the booking was no longer open';
    const refunded = await refundUnbookablePayment(order.id, order.joinRequestId, why, opts.io);
    return { ok: false, reason: done.reason === 'TRIP_FULL' ? 'TRIP_FULL' : 'NOT_PAYABLE', refunded };
  }

  await dispatchPaymentCompletedNotifications(order.id, opts.io);
  return { ok: true, joinRequestId: order.joinRequestId, verificationToken: done.token, amount: order.amount.toString() };
}

/**
 * Creates the order row for a join request, or re-points the existing one
 * at this payment method — but only while it is still restartable. Returns
 * null when the existing order has already been captured or refunded
 * (a concurrent payment won), so a captured order is never knocked back to
 * PENDING.
 */
async function upsertRestartableOrder(
  existingOrderId: string | null,
  data: Omit<Prisma.TripPaymentOrderUncheckedCreateInput, 'id'>,
) {
  let existingId = existingOrderId;
  if (!existingId) {
    try {
      return await prisma.tripPaymentOrder.create({ data });
    } catch (e) {
      // A concurrent call (double-tapped Pay) created this request's order
      // first — joinRequestId is unique. Adopt theirs instead of failing.
      if ((e as { code?: string }).code !== 'P2002') throw e;
      const theirs = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId: data.joinRequestId } });
      if (!theirs) throw e;
      existingId = theirs.id;
    }
  }
  const update: Partial<typeof data> = { ...data };
  delete update.joinRequestId;
  delete update.idempotencyKey;
  const moved = await prisma.tripPaymentOrder.updateMany({
    where: { id: existingId, status: { in: [...RESTARTABLE_ORDER_STATUSES] } },
    data: update,
  });
  return moved.count === 0 ? null : prisma.tripPaymentOrder.findUnique({ where: { id: existingId } });
}

// ── Wallet payment ─────────────────────────────────────────────────────────

/**
 * Pays the booking from the traveller's wallet. The deduction is a single
 * conditional UPDATE (WHERE balance >= amount) so concurrent calls cannot
 * both succeed, and an idempotency key on WalletTransaction prevents a
 * double deduction on retry.
 */
export async function payFromWallet(
  joinRequestId: string,
  userId: string,
  io?: SocketIOServer | null | undefined,
): Promise<PaymentOutcome> {
  const jr = await prisma.joinRequest.findUnique({
    where: { id: joinRequestId },
    include: { trip: true, paymentOrder: true },
  });
  if (!jr || jr.userId !== userId) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  const existing = jr.paymentOrder;
  if (existing?.status === 'CAPTURED' && existing.verificationToken) {
    return { ok: true, joinRequestId, verificationToken: existing.verificationToken, amount: existing.amount.toString(), alreadyCompleted: true };
  }
  if (jr.status !== 'PAYMENT_PENDING') return { ok: false, reason: 'NOT_PAYABLE' };

  const amount = amountForRequest(jr, jr.trip.budget);
  const split = computeFeeSplit(amount);
  const orderData = {
    userId,
    amount,
    gateway: 'WALLET',
    status: 'PENDING' as const,
    walletDebit: amount,
    gatewayDebit: null,
    razorpayOrderId: null,
    ...split,
  };
  const order = await upsertRestartableOrder(existing?.id ?? null, {
    joinRequestId,
    idempotencyKey: `wallet-${joinRequestId}-${userId}`,
    ...orderData,
  });
  if (!order) {
    const current = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
    return (current && (await completedByAnotherCall(current.id))) ?? { ok: false, reason: 'BUSY' };
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || new Decimal(wallet.balance).lt(amount)) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  const idempotencyKey = 'wallet-pay-' + order.id + '-' + userId;
  const existingTx = await prisma.walletTransaction.findUnique({ where: { idempotencyKey } });
  if (!existingTx) {
    const deducted = await prisma.$executeRaw`
      UPDATE "Wallet"
         SET balance = balance - ${amount}
       WHERE "userId" = ${userId}
         AND balance >= ${amount}
    `;
    if (deducted === 0) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'PAYMENT',
        remark: 'Trip booking for ' + jr.trip.name,
        idempotencyKey,
      },
    });
  }

  const done = await completePayment(order.id, joinRequestId, { gateway: 'WALLET' });
  if (!done.ok) {
    if (done.reason === 'BUSY') return { ok: false, reason: 'BUSY' };
    const settled = await completedByAnotherCall(order.id);
    if (settled) return settled;
    const why = done.reason === 'TRIP_FULL' ? 'the trip is full' : 'the booking was no longer open';
    const refunded = await refundUnbookablePayment(order.id, joinRequestId, why, io);
    return { ok: false, reason: done.reason === 'TRIP_FULL' ? 'TRIP_FULL' : 'NOT_PAYABLE', refunded };
  }

  await dispatchPaymentCompletedNotifications(order.id, io);
  return { ok: true, joinRequestId, verificationToken: done.token, amount: amount.toString() };
}

// ── TEST-ONLY payment bypass ───────────────────────────────────────────────

/**
 * ⚠️ DEVELOPMENT BYPASS — REMOVE BEFORE LAUNCH (with POST /trip-payments/pay
 * and the app's "Skip payment (testing)" button).
 *
 * Kept at the product owner's request so every test does not need a real
 * payment. No money moves, but everything downstream is the real flow:
 * the order is CAPTURED with its fee split, seats are held, a verification
 * token is issued and both sides are notified — so the organizer
 * allocation, Trip Pass, group chat and cancellation paths are exercised
 * exactly as after a real payment. Orders it creates carry gateway
 * 'DIRECT', and refunds on them move no money.
 */
export async function payDirect(
  joinRequestId: string,
  userId: string,
  io?: SocketIOServer | null | undefined,
): Promise<PaymentOutcome> {
  const jr = await prisma.joinRequest.findUnique({
    where: { id: joinRequestId },
    include: { trip: true, paymentOrder: true },
  });
  if (!jr || jr.userId !== userId) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  const existing = jr.paymentOrder;
  if (existing?.status === 'CAPTURED' && existing.verificationToken) {
    return { ok: true, joinRequestId, verificationToken: existing.verificationToken, amount: existing.amount.toString(), alreadyCompleted: true };
  }
  if (jr.status !== 'PAYMENT_PENDING') return { ok: false, reason: 'NOT_PAYABLE' };

  const amount = amountForRequest(jr, jr.trip.budget);
  const orderData = {
    userId,
    amount,
    gateway: 'DIRECT',
    status: 'PENDING' as const,
    walletDebit: null,
    gatewayDebit: null,
    razorpayOrderId: null,
    ...computeFeeSplit(amount),
  };
  const order = await upsertRestartableOrder(existing?.id ?? null, {
    joinRequestId,
    idempotencyKey: `direct-${joinRequestId}-${userId}`,
    ...orderData,
  });
  if (!order) {
    const current = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId } });
    return (current && (await completedByAnotherCall(current.id))) ?? { ok: false, reason: 'BUSY' };
  }

  const done = await completePayment(order.id, joinRequestId, { gateway: 'DIRECT' });
  if (!done.ok) {
    const settled = await completedByAnotherCall(order.id);
    if (settled) return settled;
    // Nothing was taken, so there is nothing to refund.
    await prisma.tripPaymentOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'CREATED' } });
    if (done.reason === 'BUSY') return { ok: false, reason: 'BUSY' };
    return { ok: false, reason: done.reason === 'TRIP_FULL' ? 'TRIP_FULL' : 'NOT_PAYABLE' };
  }

  await dispatchPaymentCompletedNotifications(order.id, io);
  return { ok: true, joinRequestId, verificationToken: done.token, amount: amount.toString() };
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export type RefundResult =
  | { ok: true; refundedAmount: Decimal; alreadyRefunded: boolean }
  | { ok: false; reason: 'NOT_REFUNDABLE' | 'GATEWAY_ERROR'; message?: string };

/**
 * Refunds `amount` of a captured order back to where it came from:
 *   RAZORPAY → Razorpay refund API, to the card/UPI/account used.
 *   WALLET   → credited back to the in-app wallet.
 *   DIRECT   → test bypass; no money was taken, so none is sent.
 *
 * Double-refund safe: the order is moved off CAPTURED by a conditional
 * update BEFORE any money moves, so a second concurrent call matches no
 * row and reports alreadyRefunded. If the gateway call then fails, the
 * order is put back to CAPTURED and the failure returned, so the caller
 * can retry and nothing is half-done.
 */
export async function refundOrder(orderId: string, requested: Decimal, reason: string): Promise<RefundResult> {
  const order = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, reason: 'NOT_REFUNDABLE' };
  if (order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') {
    return { ok: true, refundedAmount: new Decimal(order.refundedAmount ?? 0), alreadyRefunded: true };
  }
  if (order.status !== 'CAPTURED') return { ok: false, reason: 'NOT_REFUNDABLE' };

  const amount = Decimal.min(new Decimal(requested), order.amount).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  if (amount.lte(0)) return { ok: true, refundedAmount: new Decimal(0), alreadyRefunded: false };

  const status = amount.gte(order.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  const claimed = await prisma.tripPaymentOrder.updateMany({
    where: { id: orderId, status: 'CAPTURED' },
    data: { status, refundedAmount: amount, refundedAt: new Date() },
  });
  if (claimed.count === 0) {
    const now = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
    return { ok: true, refundedAmount: new Decimal(now?.refundedAmount ?? 0), alreadyRefunded: true };
  }

  try {
    if (order.gateway === 'RAZORPAY') {
      if (!order.razorpayPaymentId) throw new Error('Order has no Razorpay payment id');
      const refund = await razorpayClient().payments.refund(order.razorpayPaymentId, {
        amount: Math.round(Number(amount) * 100),
        speed: 'normal',
        notes: { reason: reason.slice(0, 250), joinRequestId: order.joinRequestId },
      });
      await prisma.tripPaymentOrder.update({ where: { id: orderId }, data: { razorpayRefundId: refund.id } });
    } else if (order.gateway === 'WALLET') {
      const wallet = await prisma.wallet.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId, balance: 0 },
        update: {},
      });
      const idempotencyKey = 'refund-' + order.id;
      const already = await prisma.walletTransaction.findUnique({ where: { idempotencyKey } });
      if (!already) {
        await prisma.$transaction([
          prisma.$executeRaw`UPDATE "Wallet" SET balance = balance + ${amount} WHERE id = ${wallet.id}`,
          prisma.walletTransaction.create({
            data: { walletId: wallet.id, amount, type: 'REFUND', remark: 'Refund: ' + reason, idempotencyKey },
          }),
        ]);
      }
    } else {
      logger.log(`[TripPayments] Test-bypass order ${orderId}: refund of ${amount} recorded, no money moved`);
    }
  } catch (err) {
    await prisma.tripPaymentOrder.updateMany({
      where: { id: orderId, status },
      data: { status: 'CAPTURED', refundedAmount: null, refundedAt: null },
    });
    logger.error('[TripPayments] Refund failed; order restored to CAPTURED', { orderId, err });
    return { ok: false, reason: 'GATEWAY_ERROR', message: err instanceof Error ? err.message : String(err) };
  }

  logger.log(`[TripPayments] Refunded ${amount} (${order.gateway}) on order ${orderId}: ${reason}`);
  return { ok: true, refundedAmount: amount, alreadyRefunded: false };
}

// ── Notifications ──────────────────────────────────────────────────────────

export function displayName(u: { email: string | null; profile: { firstName: string; lastName: string | null } | null } | null): string {
  return u?.profile
    ? `${u.profile.firstName} ${u.profile.lastName ?? ''}`.trim()
    : (u?.email?.split('@')[0] ?? 'Traveller');
}

async function notifyTraveller(
  userId: string,
  opts: {
    title: string;
    content: string;
    tripId?: string | undefined;
    io?: SocketIOServer | null | undefined;
    data?: Record<string, string> | undefined;
    category?: 'PAYMENT_SUCCESS' | 'JOIN_ACCEPTED' | undefined;
  },
) {
  try {
    const created = await prisma.notification.create({
      data: {
        userId,
        type: 'TRIP',
        category: opts.category ?? 'PAYMENT_SUCCESS',
        title: opts.title,
        content: opts.content,
        time: 'Just now',
        unread: true,
        tripId: opts.tripId ?? null,
      },
    });
    opts.io?.to(userId).emit('notificationReceived', {
      id: created.id,
      userId,
      type: 'TRIP',
      category: created.category,
      title: opts.title,
      content: opts.content,
      unread: true,
      tripId: opts.tripId,
    });
    await sendPushToUsers([userId], 'TRIP', {
      title: opts.title,
      body: opts.content.split('\n')[0] ?? opts.content,
      data: opts.data ?? (opts.tripId ? { screen: 'trip-pass', tripId: opts.tripId } : {}),
      badge: await unreadCountFor(userId),
    });
  } catch (err) {
    logger.warn('[TripPayments] Notification failed (non-fatal):', err);
  }
}

/**
 * After payment: the traveller gets a receipt carrying their verification
 * token; the organizer is told a seat is paid for and must be allocated,
 * with the same token to check against. Nobody is added to any chat here.
 */
async function dispatchPaymentCompletedNotifications(orderId: string, io?: SocketIOServer | null) {
  try {
    const order = await prisma.tripPaymentOrder.findUnique({
      where: { id: orderId },
      include: {
        user: { include: { profile: true } },
        joinRequest: { include: { trip: { select: { id: true, name: true, creatorId: true } } } },
      },
    });
    if (!order || !order.verificationToken) return;
    const trip = order.joinRequest.trip;
    const amountLabel = `₹${Number(order.amount).toFixed(2)}`;
    const seats = order.joinRequest.partySize;
    const seatLabel = seats > 1 ? `${seats} seats` : '1 seat';

    await notifyTraveller(order.userId, {
      title: `Payment verified — ${trip.name}`,
      content:
        `Booking token: ${order.verificationToken}\nAmount paid: ${amountLabel} (${seatLabel})\n` +
        'The organizer will verify your token and assign your seat and hotel rooms shortly.',
      tripId: trip.id,
      io,
    });

    if (trip.creatorId === order.userId) return;
    const title = `Payment received — ${trip.name}`;
    const organizerShare = order.organizerAmount ? `₹${Number(order.organizerAmount).toFixed(2)}` : amountLabel;
    // Paying is the traveller's request to join, so their contact details
    // reach the organizer with it. The full profile (with emergency
    // contacts) is under Chats & Approvals → Approvals → View info.
    const contactLine = [order.user.phoneNumber, order.user.email].filter(Boolean).join(' · ');
    const content =
      `${displayName(order.user)} paid ${amountLabel} (${seatLabel}). Token: ${order.verificationToken}\n` +
      (contactLine ? `Contact: ${contactLine}\n` : '') +
      `Your share after the 4.5% platform fee: ${organizerShare}.\n` +
      'Verify the token and assign their seat and rooms to confirm the booking, or decline it for a full refund.';
    const created = await prisma.notification.create({
      data: {
        userId: trip.creatorId,
        type: 'TRIP',
        category: 'PAYMENT_SUCCESS',
        title,
        content,
        time: 'Just now',
        unread: true,
        tripId: trip.id,
        joinRequestId: order.joinRequestId,
      },
    });
    io?.to(trip.creatorId).emit('notificationReceived', {
      id: created.id,
      userId: trip.creatorId,
      type: 'TRIP',
      category: 'PAYMENT_SUCCESS',
      title,
      content,
      unread: true,
      tripId: trip.id,
      joinRequestId: order.joinRequestId,
    });
    await sendPushToUsers([trip.creatorId], 'TRIP', {
      title,
      body: `${displayName(order.user)} paid — token ${order.verificationToken}. Allocate their seat & rooms.`,
      data: { screen: 'group-organizer', tripId: trip.id, tab: 'chat', subTab: 'approvals' },
      badge: await unreadCountFor(trip.creatorId),
    });
  } catch (err) {
    logger.warn('[TripPayments] Payment notifications failed (non-fatal):', err);
  }
}

/**
 * The "[Traveler] has joined the trip!" line in a trip's group chat, posted
 * once the organizer has allocated them. Same system flag and live event as
 * every other join announcement, so all clients render it identically.
 */
export async function announceMemberJoined(opts: {
  chatRoomId: string;
  userId: string;
  tripId: string;
  io?: SocketIOServer | null | undefined;
}): Promise<void> {
  const { chatRoomId, userId, tripId, io } = opts;

  const [member, trip] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } }),
  ]);
  const content = `${displayName(member)} has joined the trip!`;

  const saved = await prisma.message.create({
    data: {
      chatRoomId,
      // Attributed to the organizer, matching interactions.ts; isSystem is
      // what every client actually renders on.
      senderId: trip?.creatorId ?? userId,
      content,
      mediaType: 'NONE',
      isSystem: true,
    },
  });

  io?.to(chatRoomId).emit('messageReceived', {
    roomId: chatRoomId,
    message: {
      id: saved.id,
      senderName: 'System',
      senderRole: 'SYSTEM',
      content,
      timestamp: saved.createdAt.toISOString(),
      createdAt: saved.createdAt.toISOString(),
      mediaType: 'NONE',
      isSystem: true,
    },
  });
}

export { notifyTraveller };
