import { Decimal } from '@prisma/client/runtime/library';
import { computeFeeSplit, generateVerificationToken, PLATFORM_FEE_RATE } from '../src/services/trip-payments';
import { computeRefundQuote } from '../src/services/trip-cancellation';

// Pure money rules — no database.

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-01T00:00:00Z');
const startIn = (hours: number) => new Date(now.getTime() + hours * HOUR);

describe('platform fee split (4.5% / 95.5%)', () => {
  it('splits a round amount exactly', () => {
    const { platformFee, organizerAmount } = computeFeeSplit(1500);
    expect(platformFee.toString()).toBe('67.5');
    expect(organizerAmount.toString()).toBe('1432.5');
  });

  it('rounds the fee to the paisa and gives the organizer the exact remainder', () => {
    const total = new Decimal('999.99');
    const { platformFee, organizerAmount } = computeFeeSplit(total);
    expect(platformFee.toString()).toBe('45'); // 44.99955 → 45.00
    expect(platformFee.add(organizerAmount).equals(total)).toBe(true);
  });

  it('uses a 4.5% rate', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.045);
  });
});

describe('verification token', () => {
  it('looks like TST-XXXXXX in upper-case hex', () => {
    for (let i = 0; i < 50; i += 1) expect(generateVerificationToken()).toMatch(/^TST-[0-9A-F]{6}$/);
  });
});

describe('tiered refund policy', () => {
  const paid = { amountPaid: 1500, platformFee: 67.5 };

  it('refunds 95.5% (all but the platform fee) at 7 days or more', () => {
    const q = computeRefundQuote({ ...paid, tripStartDate: startIn(168), now });
    expect(q.tier).toBe('FULL_LESS_FEE');
    expect(q.refundAmount.toString()).toBe('1432.5');
    expect(q.refundPercent).toBe(95.5);
  });

  it('refunds 50% from 72 hours up to just under 7 days', () => {
    expect(computeRefundQuote({ ...paid, tripStartDate: startIn(167.9), now }).tier).toBe('HALF');
    const q = computeRefundQuote({ ...paid, tripStartDate: startIn(72), now });
    expect(q.tier).toBe('HALF');
    expect(q.refundAmount.toString()).toBe('750');
  });

  it('refunds nothing inside 72 hours, or once the trip has started', () => {
    expect(computeRefundQuote({ ...paid, tripStartDate: startIn(71.99), now }).refundAmount.toString()).toBe('0');
    expect(computeRefundQuote({ ...paid, tripStartDate: startIn(-5), now }).tier).toBe('NONE');
  });

  it('computes the 4.5% fee for orders from before the split was recorded', () => {
    const q = computeRefundQuote({ amountPaid: 1000, platformFee: null, tripStartDate: startIn(500), now });
    expect(q.refundAmount.toString()).toBe('955');
  });

  it('never refunds on an unpaid booking', () => {
    expect(computeRefundQuote({ amountPaid: 0, tripStartDate: startIn(500), now }).refundAmount.toString()).toBe('0');
  });

  it('rounds a half refund down to the paisa', () => {
    expect(computeRefundQuote({ amountPaid: '100.01', platformFee: '4.50', tripStartDate: startIn(100), now }).refundAmount.toString()).toBe('50');
  });
});
