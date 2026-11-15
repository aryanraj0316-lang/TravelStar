// The organizer's payout wallet: link a bank account (a Razorpay Route
// linked account) and see where each booking's money is.
//
//   GET  /payouts/account   — linked bank (masked) and its status, or null
//   POST /payouts/account   — link a bank account (one-time)
//   GET  /payouts/earnings  — totals and every paid booking on their trips
import { Router } from 'express';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../services/db';
import { requireUserId } from '../../lib/auth-context';
import { logger } from '../../lib/logger';
import { isRazorpayConfigured, displayName } from '../../services/trip-payments';
import { createPayoutAccount, refreshPayoutAccount } from '../../services/organizer-payouts';

const router = Router();

function fail(res: import('express').Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

function accountView(a: Awaited<ReturnType<typeof refreshPayoutAccount>>) {
  if (!a) return null;
  return {
    legalName: a.legalName,
    panMasked: a.panMasked,
    beneficiaryName: a.beneficiaryName,
    bankAccountLast4: a.bankAccountLast4,
    ifsc: a.ifsc,
    activationStatus: a.activationStatus,
    bankVerification: a.bankVerification,
    linkedAt: a.createdAt.toISOString(),
  };
}

router.get('/account', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const acc = await refreshPayoutAccount(userId);
    return res.status(200).json({ ok: true, data: { account: accountView(acc), payoutsAvailable: isRazorpayConfigured() } });
  } catch (err) {
    logger.error('[Payouts] get account failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not load your payout account.');
  }
});

const accountSchema = z.object({
  legalName: z.string().trim().min(4, 'Enter your full name as on PAN').max(200),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    // Individual PAN: the 4th character is P.
    .regex(/^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/, 'Enter a valid personal PAN'),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91)?[6-9][0-9]{9}$/, 'Enter a valid 10-digit mobile number'),
  beneficiaryName: z.string().trim().min(3).max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{9,18}$/, 'Enter a valid bank account number'),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
});

router.post('/account', async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: parsed.error.issues[0]?.message ?? 'Please check the details.',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (!isRazorpayConfigured()) return fail(res, 503, 'SERVICE_UNAVAILABLE', 'Payouts are not available yet. Please try again later.');
  const userId = requireUserId(req);

  // Only organizers (anyone who has created a trip) receive payouts.
  const organizes = await prisma.trip.count({ where: { creatorId: userId } });
  if (organizes === 0) return fail(res, 403, 'NOT_ORGANIZER', 'Create a trip first to receive payouts.');

  const phone = parsed.data.phone.startsWith('+91') ? parsed.data.phone : `+91${parsed.data.phone}`;
  try {
    const result = await createPayoutAccount(userId, { ...parsed.data, phone });
    if (!result.ok) {
      if (result.reason === 'ALREADY_LINKED') {
        return fail(res, 409, 'ALREADY_LINKED', 'A bank account is already linked. Contact support to change it.');
      }
      return fail(res, 422, 'GATEWAY_ERROR', result.message ?? 'Razorpay could not link this account.');
    }
    return res.status(201).json({ ok: true, data: { account: accountView(result.account) } });
  } catch (err) {
    logger.error('[Payouts] link account failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not link your bank account.');
  }
});

router.get('/earnings', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const orders = await prisma.tripPaymentOrder.findMany({
      where: {
        status: { in: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
        joinRequest: { trip: { creatorId: userId } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { include: { profile: true } },
        joinRequest: { select: { status: true, partySize: true, trip: { select: { id: true, name: true, startDate: true } } } },
      },
    });

    const zero = () => new Decimal(0);
    const totals = { onHold: zero(), released: zero(), awaitingAccount: zero(), awaitingConfirmation: zero(), reversed: zero(), manual: zero() };
    const now = Date.now();

    const items = orders.map((o) => {
      const share = new Decimal(o.payoutAmount ?? o.organizerAmount ?? o.amount);
      const reversed = new Decimal(o.payoutReversedAmount ?? 0);
      const net = Decimal.max(0, share.sub(reversed));
      // Razorpay releases a held transfer on its own at payoutHoldUntil.
      let state: string;
      if (o.payoutStatus === null) state = o.status === 'CAPTURED' ? 'AWAITING_CONFIRMATION' : 'REFUNDED';
      else if (o.payoutStatus === 'ON_HOLD' || o.payoutStatus === 'PARTIALLY_REVERSED')
        state = o.payoutHoldUntil && o.payoutHoldUntil.getTime() <= now ? 'RELEASED' : 'ON_HOLD';
      else state = o.payoutStatus;

      if (state === 'ON_HOLD') totals.onHold = totals.onHold.add(net);
      else if (state === 'RELEASED') totals.released = totals.released.add(net);
      else if (state === 'AWAITING_ACCOUNT') totals.awaitingAccount = totals.awaitingAccount.add(net);
      else if (state === 'AWAITING_CONFIRMATION') totals.awaitingConfirmation = totals.awaitingConfirmation.add(share);
      else if (state === 'MANUAL') totals.manual = totals.manual.add(net);
      totals.reversed = totals.reversed.add(reversed);

      return {
        orderId: o.id,
        tripId: o.joinRequest.trip.id,
        tripName: o.joinRequest.trip.name,
        travellerName: displayName(o.user),
        seats: o.joinRequest.partySize,
        amountPaid: o.amount.toString(),
        yourShare: share.toFixed(2),
        reversed: reversed.toFixed(2),
        net: net.toFixed(2),
        state,
        releaseOn: o.payoutHoldUntil?.toISOString() ?? null,
        paidAt: o.createdAt.toISOString(),
        error: o.payoutError,
      };
    });

    return res.status(200).json({
      ok: true,
      data: {
        totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)])),
        items,
      },
    });
  } catch (err) {
    logger.error('[Payouts] earnings failed:', err);
    return fail(res, 500, 'INTERNAL', 'Could not load your earnings.');
  }
});

export default router;
