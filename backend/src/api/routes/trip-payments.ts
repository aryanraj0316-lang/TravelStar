import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { requireUserId } from '../../lib/auth-context';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import {
  isRazorpayConfigured,
  getOrCreatePaymentOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  captureAndHoldSeat,
  payFromWallet,
  payDirect,
  amountForRequest,
  computeFeeSplit,
  type PaymentOutcome,
} from '../../services/trip-payments';

const router = Router();

/**
 * One response shape for every way of paying (Razorpay verify, wallet,
 * test bypass). Success carries the verification token the receipt screen
 * shows; the traveller is NOT a member yet — the organizer allocates next.
 */
function sendPaymentOutcome(res: Response, result: PaymentOutcome) {
  if (result.ok) {
    return res.status(200).json({
      ok: true,
      data: {
        joinRequestId: result.joinRequestId,
        verificationToken: result.verificationToken,
        amount: result.amount,
        status: 'PAYMENT_COMPLETED',
        // Kept for older clients, which navigate to the chat when present.
        // Chat access now only follows the organizer's allocation.
        chatRoomId: null,
      },
    });
  }
  switch (result.reason) {
    case 'ORDER_NOT_FOUND':
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Booking or payment order not found.' } });
    case 'INSUFFICIENT_BALANCE':
      return res.status(422).json({ ok: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' } });
    case 'TRIP_FULL':
      return res.status(409).json({
        ok: false,
        error: {
          code: 'TRIP_FULL',
          message: result.refunded
            ? 'The trip filled up while you were paying. Your payment has been refunded in full.'
            : 'Trip is full',
        },
      });
    case 'TRIP_NOT_FOUND':
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    case 'BUSY':
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ ok: false, error: { code: 'SERVICE_BUSY', message: 'Service busy, please retry' } });
    case 'ALREADY_REFUNDED':
      return res.status(409).json({ ok: false, error: { code: 'ALREADY_REFUNDED', message: 'This payment has already been refunded.' } });
    case 'NOT_PAYABLE':
    default:
      return res.status(409).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: result.refunded
            ? 'This booking is no longer open. Your payment has been refunded in full.'
            : 'This booking is not awaiting payment.',
        },
      });
  }
}

function validationError(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({
    ok: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    },
  });
}

// ── POST /trip-payments/initiate ──────────────────────────────────────────
const initiateSchema = z.object({
  joinRequestId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
});

router.post('/initiate', async (req: Request, res: Response) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { joinRequestId, idempotencyKey } = parsed.data;
  const userId = requireUserId(req);

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: joinRequestId },
    include: { trip: true },
  });

  if (!joinRequest) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request not found' } });
  }

  if (joinRequest.userId !== userId) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
  }

  if (joinRequest.status !== 'PAYMENT_PENDING') {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_STATUS', message: `Booking is in status '${joinRequest.status}', expected 'PAYMENT_PENDING'` },
    });
  }

  // Refuse before any money moves when the party can no longer fit. The
  // authoritative check is still the seat hold at capture (a trip can fill
  // during checkout; that payment is refunded automatically).
  if (joinRequest.trip.availableSeats < joinRequest.partySize) {
    return res.status(409).json({
      ok: false,
      error: { code: 'TRIP_FULL', message: `Only ${joinRequest.trip.availableSeats} seat(s) left — not enough for a party of ${joinRequest.partySize}.` },
    });
  }

  // adjustedPrice/budget are per-person; a Family Connect party owes for
  // everyone (partySize). Decimal arithmetic throughout.
  const amount = amountForRequest(joinRequest, joinRequest.trip.budget);
  if (amount.lte(0)) {
    return res.status(400).json({
      ok: false,
      error: { code: 'NO_PAYMENT_REQUIRED', message: 'Trip has no fee; payment is not required' },
    });
  }

  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Razorpay gateway is not configured' },
    });
  }

  try {
    const order = await getOrCreatePaymentOrder({
      joinRequestId,
      userId,
      amount,
      idempotencyKey,
    });

    return res.status(200).json({
      ok: true,
      data: {
        orderId: order.razorpayOrderId,
        amount: order.amount.toString(),
        platformFee: order.platformFee?.toString() ?? null,
        organizerAmount: order.organizerAmount?.toString() ?? null,
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err: any) {
    logger.warn('[TripPayments] Initiate order failed:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL', message: err.message || 'Failed to initiate payment' },
    });
  }
});

// ── POST /trip-payments/verify ────────────────────────────────────────────
const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

router.post('/verify', async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  const valid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!valid) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_SIGNATURE', message: 'Razorpay signature verification failed' },
    });
  }

  const result = await captureAndHoldSeat({
    razorpayOrderId,
    razorpayPaymentId,
    signatureVerified: true,
    io: req.app.get('socketio'),
  });

  return sendPaymentOutcome(res, result);
});

// ── POST /trip-payments/wallet-pay ────────────────────────────────────────
const walletPaySchema = z.object({
  joinRequestId: z.string().uuid(),
});

router.post('/wallet-pay', async (req: Request, res: Response) => {
  const parsed = walletPaySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { joinRequestId } = parsed.data;
  const userId = requireUserId(req);

  const result = await payFromWallet(joinRequestId, userId, req.app.get('socketio'));
  return sendPaymentOutcome(res, result);
});

// ── POST /trip-payments/pay ───────────────────────────────────────────────
// ⚠️ DEVELOPMENT BYPASS — REMOVE BEFORE LAUNCH. Completes a booking with no
// money moving (the app's "Skip payment (testing)" button), running the
// real post-payment flow: fee split, seat hold, verification token,
// notifications. See payDirect in services/trip-payments.ts.
const directPaySchema = z.object({
  joinRequestId: z.string().uuid(),
});

router.post('/pay', async (req: Request, res: Response) => {
  const parsed = directPaySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { joinRequestId } = parsed.data;
  const userId = requireUserId(req);

  const result = await payDirect(joinRequestId, userId, req.app.get('socketio'));
  return sendPaymentOutcome(res, result);
});

// ── GET /trip-payments/receipts ───────────────────────────────────────────
// Every payment this user was a party to, kept for good: the ones they paid
// as a traveller, and the ones they received as the organizer of the trip.
// Read straight off TripPaymentOrder, so a receipt cannot drift from the
// money it records, and nothing extra has to be written when a payment lands.
router.get('/receipts', async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  try {
    const orders = await prisma.tripPaymentOrder.findMany({
      where: {
        // Refunded orders stay on the list: the payment happened, and the
        // refund line is part of the same receipt.
        status: { in: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
        OR: [{ userId }, { joinRequest: { trip: { creatorId: userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { include: { profile: true } },
        joinRequest: {
          include: {
            trip: {
              select: {
                id: true,
                name: true,
                creatorId: true,
                startDate: true,
                cities: true,
                creator: { include: { profile: true } },
              },
            },
          },
        },
      },
    });

    const nameOf = (u: { email: string | null; profile: { firstName: string; lastName: string | null } | null } | null) =>
      u?.profile ? `${u.profile.firstName} ${u.profile.lastName ?? ''}`.trim() : (u?.email?.split('@')[0] ?? 'Traveller');

    const data = orders.map((o) => {
      const trip = o.joinRequest.trip;
      const paidByMe = o.userId === userId;
      return {
        id: o.id,
        reference: o.id.slice(0, 8).toUpperCase(),
        // 'PAID' = money this user sent; 'RECEIVED' = money their trip took in.
        direction: paidByMe ? 'PAID' : 'RECEIVED',
        amount: o.amount.toString(),
        // Fee split. Null on orders from before the split existed, which
        // went to the organizer in full.
        platformFee: o.platformFee?.toString() ?? null,
        organizerAmount: o.organizerAmount?.toString() ?? null,
        verificationToken: o.verificationToken,
        status: o.status,
        refundedAmount: o.refundedAmount?.toString() ?? null,
        refundedAt: o.refundedAt?.toISOString() ?? null,
        bookingStatus: o.joinRequest.status,
        gateway: o.gateway,
        seats: o.joinRequest.partySize,
        paidAt: o.updatedAt.toISOString(),
        tripId: trip.id,
        tripName: trip.name,
        tripStartDate: trip.startDate.toISOString(),
        tripCities: trip.cities,
        counterpartyName: paidByMe ? nameOf(trip.creator) : nameOf(o.user),
        counterpartyRole: paidByMe ? 'Organizer' : 'Traveller',
      };
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    logger.warn('[TripPayments] Receipts list failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load receipts' } });
  }
});

// ── GET /trip-payments/order/:joinRequestId ───────────────────────────────
router.get('/order/:joinRequestId', async (req: Request, res: Response) => {
  const parsed = z.object({ joinRequestId: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { joinRequestId } = parsed.data;
  const userId = requireUserId(req);

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: joinRequestId },
    include: { trip: true, paymentOrder: true },
  });

  if (!joinRequest) {
    return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request not found' } });
  }

  // Caller must be requester or trip creator
  if (joinRequest.userId !== userId && joinRequest.trip.creatorId !== userId) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
  }

  const order = joinRequest.paymentOrder;
  // Same per-person × partySize rule as /initiate — shown before an order
  // exists, so a family booking previews the whole party's fee.
  const amount = amountForRequest(joinRequest, joinRequest.trip.budget);
  const split = order?.platformFee ? { platformFee: order.platformFee, organizerAmount: order.organizerAmount } : computeFeeSplit(amount);
  const paidStatuses = ['PAYMENT_COMPLETED', 'ALLOCATION_PENDING', 'CONFIRMED'];

  return res.status(200).json({
    ok: true,
    data: {
      id: order?.id ?? '',
      joinRequestId,
      userId: joinRequest.userId,
      amount: order ? order.amount.toString() : amount.toString(),
      platformFee: split.platformFee?.toString() ?? null,
      organizerAmount: split.organizerAmount?.toString() ?? null,
      // Only shown to the traveller and the trip's organizer (checked above).
      verificationToken: order?.verificationToken ?? null,
      status: order?.status ?? (paidStatuses.includes(joinRequest.status) ? 'CAPTURED' : 'PENDING'),
      tripId: joinRequest.tripId,
      partySize: joinRequest.partySize,
      gateway: order?.gateway ?? 'RAZORPAY',
      razorpayOrderId: order?.razorpayOrderId ?? null,
      walletDebit: order?.walletDebit ? order.walletDebit.toString() : null,
      gatewayDebit: order?.gatewayDebit ? order.gatewayDebit.toString() : null,
      tripName: joinRequest.trip.name,
      joinRequestStatus: joinRequest.status,
    },
  });
});

// ── POST /trip-payments/webhook (HMAC Auth, no JWT) ───────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  if (!signature) {
    return res.status(400).json({ ok: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing x-razorpay-signature header' } });
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return res.status(400).json({ ok: false, error: { code: 'NO_RAW_BODY', message: 'Raw body required for HMAC verification' } });
  }

  const valid = verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' } });
  }

  const event = req.body?.event;
  const paymentEntity = req.body?.payload?.payment?.entity;

  logger.log(`[TripPayments Webhook] Event: ${event}`, paymentEntity?.id);

  if (event === 'payment.captured' && paymentEntity) {
    const rzpOrderId = paymentEntity.order_id;
    const rzpPaymentId = paymentEntity.id;
    if (rzpOrderId && rzpPaymentId) {
      await captureAndHoldSeat({
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        signatureVerified: true,
        io: req.app.get('socketio'),
      });
    }
  } else if (event === 'payment.failed' && paymentEntity) {
    const rzpOrderId = paymentEntity.order_id;
    if (rzpOrderId) {
      await prisma.tripPaymentOrder.updateMany({
        where: { razorpayOrderId: rzpOrderId, status: { not: 'CAPTURED' } },
        data: { status: 'FAILED' },
      });
    }
  }

  return res.status(200).json({ ok: true });
});

export default router;
