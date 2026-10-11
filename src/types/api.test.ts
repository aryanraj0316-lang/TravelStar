import { ACTIVE_BOOKING_STATUSES, normalizeJoinRequestStatus, SEAT_HOLDING_STATUSES } from './api';

// A pre-migration status that matched no booking state made the booking
// panel fall back to "not booked" and offer "Proceed to Payment" again for a
// booking that already existed — one half of the payment loop.
describe('normalizeJoinRequestStatus', () => {
  it('maps the pre-migration names onto the current ones', () => {
    expect(normalizeJoinRequestStatus('AWAITING_PAYMENT')).toBe('PAYMENT_PENDING');
    expect(normalizeJoinRequestStatus('APPROVED')).toBe('CONFIRMED');
  });

  it('leaves current statuses untouched', () => {
    for (const s of ['PENDING', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'ALLOCATION_PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(normalizeJoinRequestStatus(s)).toBe(s);
    }
  });

  it('treats a mapped legacy status as a live booking, never as "not booked"', () => {
    expect(ACTIVE_BOOKING_STATUSES).toContain(normalizeJoinRequestStatus('AWAITING_PAYMENT'));
    expect(SEAT_HOLDING_STATUSES).toContain(normalizeJoinRequestStatus('APPROVED'));
  });
});
