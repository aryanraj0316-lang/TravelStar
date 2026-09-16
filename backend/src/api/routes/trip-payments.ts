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
  captureAndClaimSeat,
  payFromWallet,
  payDirect,
} from '../../services/trip-payments';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

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

  if (joinRequest.status !== 'AWAITING_PAYMENT') {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_STATUS', message: `Join request is in status '${joinRequest.status}', expected 'AWAITING_PAYMENT'` },
    });
  }

  // adjustedPrice/budget are per-person; a Family Connect request with
  // familyMemberCount > 0 owes for the whole party (partySize), not just
  // the requester. Multiplied as a Decimal, not a floating-point number, to
  // keep the same money precision the rest of this file relies on.
  const perPerson = (joinRequest.adjustedPrice ?? joinRequest.trip.budget) as Decimal;
  const amount = new Decimal(perPerson).mul(joinRequest.partySize);
  if (!amount || amount.lte(0)) {
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

  const result = await captureAndClaimSeat({
    razorpayOrderId,
    razorpayPaymentId,
    signatureVerified: true,
    io: req.app.get('socketio'),
  });

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Payment order not found' } });
    }
    if (result.reason === 'TRIP_FULL') {
      return res.status(409).json({ ok: false, error: { code: 'TRIP_FULL', message: 'Trip is full' } });
    }
    if (result.reason === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    }
    if (result.reason === 'BUSY') {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ ok: false, error: { code: 'SERVICE_BUSY', message: 'Service busy, please retry' } });
    }
    return res.status(400).json({ ok: false, error: { code: 'PAYMENT_FAILED', message: result.reason } });
  }

  return res.status(200).json({
    ok: true,
    data: {
      joinRequestId: result.joinRequestId,
      chatRoomId: result.chatRoomId,
    },
  });
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

  if (!result.ok) {
    if (result.reason === 'INSUFFICIENT_BALANCE') {
      return res.status(422).json({
        ok: false,
        error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' },
      });
    }
    if (result.reason === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request or order not found' } });
    }
    if (result.reason === 'TRIP_FULL') {
      return res.status(409).json({ ok: false, error: { code: 'TRIP_FULL', message: 'Trip is full' } });
    }
    if (result.reason === 'BUSY') {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ ok: false, error: { code: 'SERVICE_BUSY', message: 'Service busy, please retry' } });
    }
    return res.status(400).json({ ok: false, error: { code: 'PAYMENT_FAILED', message: result.reason } });
  }

  return res.status(200).json({
    ok: true,
    data: {
      joinRequestId: result.joinRequestId,
      chatRoomId: result.chatRoomId,
    },
  });
});

// ── POST /trip-payments/pay ───────────────────────────────────────────────
// Captures the seat fee the traveller has paid, for the exact amount this
// trip charges, and seats them. No stored balance is involved: the captured
// order IS the money — every "collected" figure in the organizer's portal is
// summed from these rows, and they are never deleted, so they double as the
// permanent receipt for both sides (GET /trip-payments/receipts below).
const directPaySchema = z.object({
  joinRequestId: z.string().uuid(),
});

router.post('/pay', async (req: Request, res: Response) => {
  const parsed = directPaySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);

  const { joinRequestId } = parsed.data;
  const userId = requireUserId(req);

  const result = await payDirect(joinRequestId, userId, req.app.get('socketio'));

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'NOT_FOUND', message: 'Join request not found, or it is not awaiting payment.' } });
    }
    if (result.reason === 'TRIP_FULL') {
      return res.status(409).json({ ok: false, error: { code: 'TRIP_FULL', message: 'Trip is full' } });
    }
    if (result.reason === 'BUSY') {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ ok: false, error: { code: 'SERVICE_BUSY', message: 'Service busy, please retry' } });
    }
    return res.status(400).json({ ok: false, error: { code: 'PAYMENT_FAILED', message: result.reason } });
  }

  return res.status(200).json({
    ok: true,
    data: {
      joinRequestId: result.joinRequestId,
      chatRoomId: result.chatRoomId,
      amount: result.amount,
    },
  });
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
        status: 'CAPTURED',
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
  // exists yet, so a family join previews the whole party's fee, not just
  // one person's.
  const perPerson = (joinRequest.adjustedPrice ?? joinRequest.trip.budget) as Decimal;
  const amount = perPerson ? new Decimal(perPerson).mul(joinRequest.partySize) : null;

  return res.status(200).json({
    ok: true,
    data: {
      id: order?.id ?? '',
      joinRequestId,
      userId: joinRequest.userId,
      amount: order ? order.amount.toString() : amount ? amount.toString() : '0.00',
      status: order?.status ?? (joinRequest.status === 'APPROVED' ? 'CAPTURED' : 'PENDING'),
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
      await captureAndClaimSeat({
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
