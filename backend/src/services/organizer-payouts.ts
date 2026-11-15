// Organizer payouts through Razorpay Route.
//
// Each organizer links their bank account once. That creates a Razorpay
// "linked account" for them. When a booking on their trip is confirmed
// (the organizer verifies the token and allocates the seat), their share of
// the payment (95.5%) is transferred from the payment to that linked
// account, held until the trip starts, and then released by Razorpay to
// their bank automatically. The platform keeps its 4.5% fee.
//
// Holding until the trip starts means a cancellation refund before then can
// still be taken back from the organizer's share (reverseForRefund).
//
// Bookings paid before the organizer linked a bank wait as AWAITING_ACCOUNT
// and are sent the moment the account is linked (sweepAwaitingPayouts).
//
// Only Razorpay-gateway payments are transferred. Wallet payments (money
// already held by the platform from earlier refunds) are marked MANUAL, and
// test-bypass bookings move no money at all (NOT_APPLICABLE).
import { Decimal } from '@prisma/client/runtime/library';
import prisma from './db';
import { logger } from '../lib/logger';
import { razorpayClient } from './trip-payments';

export const PAYOUT_STATUSES = [
  'NOT_APPLICABLE',
  'AWAITING_ACCOUNT',
  'PROCESSING',
  'ON_HOLD',
  'REVERSED',
  'PARTIALLY_REVERSED',
  'FAILED',
  'MANUAL',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

const toPaise = (rupees: Decimal | number | string) => Math.round(Number(rupees) * 100);

function errorMessage(err: unknown): string {
  const e = err as { error?: { description?: string }; message?: string } | undefined;
  return e?.error?.description ?? e?.message ?? String(err);
}

// ── Linked account (the organizer's bank) ─────────────────────────────────

export type PayoutAccountInput = {
  legalName: string;
  pan: string;
  email: string;
  phone: string;
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
};

const maskPan = (pan: string) => `${pan.slice(0, 2)}XXXXX${pan.slice(-3)}`;

/**
 * Creates the organizer's Razorpay linked account with their bank as the
 * settlement account (Razorpay's one-step Route onboarding for
 * individuals), then sends any payouts that were waiting for it.
 */
export async function createPayoutAccount(userId: string, input: PayoutAccountInput) {
  const existing = await prisma.organizerPayoutAccount.findUnique({ where: { userId } });
  if (existing) return { ok: false as const, reason: 'ALREADY_LINKED' as const };

  const body = {
    type: 'route',
    tnc_accepted: true,
    reference_id: `org_${userId}`,
    legal_business_name: input.legalName,
    business_type: 'individual',
    email: input.email,
    phone: input.phone,
    legal_info: { pan: input.pan },
    notes: { userId },
    settlement_accounts: [
      {
        method: 'bank_account',
        bank_account: {
          account_number: input.accountNumber,
          beneficiary_name: input.beneficiaryName,
          code_type: 'ifsc',
          code: input.ifsc,
          currency: 'INR',
          is_default: true,
        },
      },
    ],
  };

  let account: {
    id: string;
    product_config?: {
      id?: string;
      activation_status?: string;
      active_configuration?: { settlement_accounts?: { verification_status?: string }[] };
    };
  };
  try {
    // The SDK's typings predate the one-step body; it is the same
    // POST /v2/accounts call.
    account = (await razorpayClient().accounts.create(body as never)) as unknown as typeof account;
  } catch (err) {
    logger.warn('[Payouts] Linked account creation failed', { userId, err: errorMessage(err) });
    return { ok: false as const, reason: 'GATEWAY_ERROR' as const, message: errorMessage(err) };
  }

  const product = account.product_config;
  const saved = await prisma.organizerPayoutAccount.create({
    data: {
      userId,
      razorpayAccountId: account.id,
      razorpayProductId: product?.id ?? null,
      legalName: input.legalName,
      panMasked: maskPan(input.pan),
      email: input.email,
      phone: input.phone,
      beneficiaryName: input.beneficiaryName,
      bankAccountLast4: input.accountNumber.slice(-4),
      ifsc: input.ifsc,
      activationStatus: product?.activation_status ?? 'created',
      bankVerification: product?.active_configuration?.settlement_accounts?.[0]?.verification_status ?? 'pending',
    },
  });

  await sweepAwaitingPayouts(userId);
  return { ok: true as const, account: saved };
}

/** Re-reads the account's status from Razorpay (bank check, activation). */
export async function refreshPayoutAccount(userId: string) {
  const acc = await prisma.organizerPayoutAccount.findUnique({ where: { userId } });
  if (!acc || !acc.razorpayProductId) return acc;
  if (acc.activationStatus === 'activated' && acc.bankVerification === 'verified') return acc;
  try {
    const product = (await razorpayClient().products.fetch(acc.razorpayAccountId, acc.razorpayProductId)) as unknown as {
      activation_status?: string;
      active_configuration?: { settlement_accounts?: { verification_status?: string }[] };
    };
    return await prisma.organizerPayoutAccount.update({
      where: { id: acc.id },
      data: {
        activationStatus: product.activation_status ?? acc.activationStatus,
        bankVerification: product.active_configuration?.settlement_accounts?.[0]?.verification_status ?? acc.bankVerification,
      },
    });
  } catch (err) {
    logger.warn('[Payouts] Could not refresh linked account status', { userId, err: errorMessage(err) });
    return acc;
  }
}

// ── Transfers ─────────────────────────────────────────────────────────────

/**
 * Sends the organizer's share of a confirmed booking to their linked
 * account, held until the trip starts. Safe to call more than once: only an
 * order with no transfer yet is claimed.
 */
/** Orders whose organizer share may still be (partly) owed. */
const PAYABLE_ORDER_STATUSES = ['CAPTURED', 'PARTIALLY_REFUNDED'] as const;

export async function transferForOrder(orderId: string): Promise<PayoutStatus | null> {
  const order = await prisma.tripPaymentOrder.findUnique({
    where: { id: orderId },
    include: { joinRequest: { include: { trip: { select: { creatorId: true, startDate: true, id: true } } } } },
  });
  if (!order || !(PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return null;
  // The organizer's share, less anything already taken back for a refund
  // (a cancellation while the payout waited for a bank account).
  const share = new Decimal(order.payoutAmount ?? order.organizerAmount ?? order.amount);
  const owed = share.sub(order.payoutReversedAmount ?? 0);

  if (order.gateway !== 'RAZORPAY' || !order.razorpayPaymentId) {
    const status: PayoutStatus = order.gateway === 'WALLET' ? 'MANUAL' : 'NOT_APPLICABLE';
    await prisma.tripPaymentOrder.updateMany({ where: { id: orderId, payoutStatus: null }, data: { payoutStatus: status, payoutAmount: share } });
    return status;
  }
  if (owed.lte(0)) {
    await prisma.tripPaymentOrder.updateMany({
      where: { id: orderId, razorpayTransferId: null },
      data: { payoutStatus: 'NOT_APPLICABLE', payoutAmount: share },
    });
    return 'NOT_APPLICABLE';
  }

  const trip = order.joinRequest.trip;
  const account = await prisma.organizerPayoutAccount.findUnique({ where: { userId: trip.creatorId } });
  if (!account) {
    await prisma.tripPaymentOrder.updateMany({
      where: { id: orderId, payoutStatus: null },
      data: { payoutStatus: 'AWAITING_ACCOUNT', payoutAmount: share },
    });
    return 'AWAITING_ACCOUNT';
  }

  // Claim the order so a retry (or the sweep) cannot transfer it twice.
  const claimed = await prisma.tripPaymentOrder.updateMany({
    where: {
      id: orderId,
      razorpayTransferId: null,
      OR: [{ payoutStatus: null }, { payoutStatus: { in: ['AWAITING_ACCOUNT', 'FAILED'] } }],
    },
    data: { payoutStatus: 'PROCESSING', payoutAmount: share, payoutError: null },
  });
  if (claimed.count === 0) return null;

  // Held until the trip starts; a trip already under way is released at once.
  const holdUntil = trip.startDate.getTime() > Date.now() + 60_000 ? trip.startDate : null;
  try {
    const res = await razorpayClient().payments.transfer(order.razorpayPaymentId, {
      transfers: [
        {
          account: account.razorpayAccountId,
          amount: toPaise(owed),
          currency: 'INR',
          on_hold: holdUntil ? 1 : 0,
          ...(holdUntil ? { on_hold_until: Math.floor(holdUntil.getTime() / 1000) } : {}),
          notes: { joinRequestId: order.joinRequestId, tripId: trip.id },
        },
      ],
    });
    const transfer = res.items[0];
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutStatus: 'ON_HOLD', razorpayTransferId: transfer?.id ?? null, payoutHoldUntil: holdUntil ?? new Date() },
    });
    return 'ON_HOLD';
  } catch (err) {
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutStatus: 'FAILED', payoutError: errorMessage(err).slice(0, 500) },
    });
    logger.error('[Payouts] Transfer failed', { orderId, err: errorMessage(err) });
    return 'FAILED';
  }
}

/**
 * Sends every payout that was waiting for this organizer to link a bank.
 * Includes bookings cancelled since they were confirmed: whatever was not
 * refunded to the traveller is still the organizer's. (A payout status is
 * only ever set once the organizer confirmed the booking.)
 */
export async function sweepAwaitingPayouts(organizerId: string): Promise<void> {
  const waiting = await prisma.tripPaymentOrder.findMany({
    where: {
      status: { in: [...PAYABLE_ORDER_STATUSES] },
      payoutStatus: { in: ['AWAITING_ACCOUNT', 'FAILED'] },
      joinRequest: { trip: { creatorId: organizerId } },
    },
    select: { id: true },
  });
  for (const o of waiting) {
    await transferForOrder(o.id).catch((err) => logger.warn('[Payouts] Sweep transfer failed', { orderId: o.id, err }));
  }
}

/**
 * Before refunding a traveller, takes the refund back out of the
 * organizer's share, so the platform does not pay it from its own fee. The
 * platform's 4.5% is never part of the transfer, so at most the
 * transferred amount is reversed. A payout that never left (awaiting a bank)
 * is simply reduced.
 */
/** What reverseForRefund took back, and the payout fields as they were. */
export type Reversal = {
  kind: 'NONE' | 'BOOKKEEPING' | 'TRANSFER';
  amount: Decimal;
  before: { payoutStatus: string | null; payoutReversedAmount: Decimal | null; razorpayTransferId: string | null };
};
export const NO_REVERSAL: Reversal = {
  kind: 'NONE',
  amount: new Decimal(0),
  before: { payoutStatus: null, payoutReversedAmount: null, razorpayTransferId: null },
};

export async function reverseForRefund(orderId: string, refundAmount: Decimal): Promise<Reversal> {
  const order = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
  if (!order || !order.payoutStatus || refundAmount.lte(0)) return NO_REVERSAL;
  const before = {
    payoutStatus: order.payoutStatus,
    payoutReversedAmount: order.payoutReversedAmount,
    razorpayTransferId: order.razorpayTransferId,
  };
  const share = new Decimal(order.payoutAmount ?? 0);
  const alreadyReversed = new Decimal(order.payoutReversedAmount ?? 0);
  const remaining = share.sub(alreadyReversed);
  if (remaining.lte(0)) return NO_REVERSAL;
  const reverse = Decimal.min(refundAmount, remaining);
  const totalReversed = alreadyReversed.add(reverse);
  const fully = totalReversed.gte(share);

  if (order.payoutStatus === 'AWAITING_ACCOUNT' || order.payoutStatus === 'MANUAL') {
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutReversedAmount: totalReversed, ...(fully ? { payoutStatus: 'NOT_APPLICABLE' } : {}) },
    });
    return { kind: 'BOOKKEEPING', amount: reverse, before };
  }
  if (!order.razorpayTransferId) return NO_REVERSAL;

  try {
    await razorpayClient().transfers.reverse(order.razorpayTransferId, { amount: toPaise(reverse) });
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutReversedAmount: totalReversed, payoutStatus: fully ? 'REVERSED' : 'PARTIALLY_REVERSED' },
    });
    return { kind: 'TRANSFER', amount: reverse, before };
  } catch (err) {
    // Already released to the organizer's bank: the refund still goes
    // ahead (the traveller is owed it) and is recovered from the organizer
    // by hand.
    logger.error('[Payouts] Transfer reversal failed — recover from organizer manually', {
      orderId,
      amount: reverse.toString(),
      err: errorMessage(err),
    });
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutError: `Reversal of ₹${reverse.toFixed(2)} failed: ${errorMessage(err)}`.slice(0, 500) },
    });
    return NO_REVERSAL;
  }
}

/**
 * The refund that a reversal was made for then failed, so the booking still
 * stands and the organizer is owed their share again.
 *
 * A payout that never left (waiting for a bank) just gets its bookkeeping
 * back. A held transfer cannot be "un-reversed", so whatever is left of it is
 * reversed too and the full share goes out again as one fresh transfer, held
 * until the trip starts as before. If Razorpay refuses, the payout is marked
 * FAILED (retried the next time the sweep runs) and logged for a person.
 */
export async function restorePayoutAfterFailedRefund(orderId: string, reversal: Reversal): Promise<void> {
  if (reversal.kind === 'NONE') return;
  const { before } = reversal;

  if (reversal.kind === 'BOOKKEEPING') {
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutStatus: before.payoutStatus, payoutReversedAmount: before.payoutReversedAmount },
    });
    return;
  }

  const order = await prisma.tripPaymentOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  const share = new Decimal(order.payoutAmount ?? 0);
  const leftOnOld = share.sub(order.payoutReversedAmount ?? 0);
  try {
    if (leftOnOld.gt(0) && before.razorpayTransferId) {
      await razorpayClient().transfers.reverse(before.razorpayTransferId, { amount: toPaise(leftOnOld) });
    }
    // Back to "owed, not sent": transferForOrder sends it again.
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: {
        payoutStatus: 'FAILED',
        razorpayTransferId: null,
        payoutReversedAmount: before.payoutReversedAmount,
        payoutError: 'Re-sending after a failed refund',
      },
    });
  } catch (err) {
    logger.error('[Payouts] Could not consolidate the organizer transfer after a failed refund — fix by hand', {
      orderId,
      err: errorMessage(err),
    });
    await prisma.tripPaymentOrder.update({
      where: { id: orderId },
      data: { payoutError: `Refund failed after ₹${reversal.amount.toFixed(2)} was reversed; re-send by hand: ${errorMessage(err)}`.slice(0, 500) },
    });
    return;
  }
  await transferForOrder(orderId);
}
