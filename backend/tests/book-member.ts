import request from 'supertest';
import app from '../src/app';
import { admitAllocatedMember, holdSeatsForRequest } from '../src/services/trip-membership';
import { travellers } from './traveller-details-fixture';

/**
 * Makes `travellerToken`'s user a confirmed member of `tripId` through the
 * real booking flow — consent, payment (via the development payment bypass
 * for paid trips), then the organizer's allocation — for suites that only
 * need a member to exist. (POST /trips/:id/join, which these suites used to
 * call, now refuses: nobody joins without paying and being allocated.)
 *
 * The organizer's allocation step is applied through the service directly
 * so callers don't have to thread the organizer's token through; the HTTP
 * route for it is covered in trip-booking-flow.test.ts.
 *
 * Returns { status, body } like a supertest response: 200 once confirmed,
 * or the failing step's status (e.g. 409 TRIP_FULL).
 */
export async function bookAsMember(
  tripId: string,
  travellerToken: string,
): Promise<{ status: number; body: { ok: boolean; data?: unknown; error?: { code: string } } }> {
  const auth = { Authorization: `Bearer ${travellerToken}` };

  const booked = await request(app)
    .post('/api/v1/interactions/join-request')
    .set(auth)
    .send({ tripId, acceptedTerms: true, travellerDetails: travellers(1) });
  if (booked.status !== 200 && booked.status !== 201) return { status: booked.status, body: booked.body };
  const joinRequest = booked.body.data as { id: string; status: string };

  let token: string | null = null;
  if (joinRequest.status === 'PAYMENT_PENDING') {
    const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth).send({ joinRequestId: joinRequest.id });
    if (paid.status !== 200) return { status: paid.status, body: paid.body };
    token = paid.body.data.verificationToken;
  } else if (joinRequest.status === 'PENDING') {
    const held = await holdSeatsForRequest(joinRequest.id, { fromStatuses: ['PENDING'], toStatus: 'ALLOCATION_PENDING' });
    if (!held.ok) return { status: 409, body: { ok: false, error: { code: held.reason } } };
  } else if (joinRequest.status === 'CONFIRMED') {
    return { status: 200, body: { ok: true, data: joinRequest } };
  }

  const admitted = await admitAllocatedMember({
    joinRequestId: joinRequest.id,
    bookingReferenceToken: token,
    allocations: [{ dayNumber: 1, checkpointName: 'Start', hotelName: 'Test Hotel', roomNumber: '101', vehicleNumber: 'BUS-1', seatNumber: '1' }],
  });
  if (!admitted.ok) return { status: 409, body: { ok: false, error: { code: admitted.reason } } };
  return { status: 200, body: { ok: true, data: { joinRequestId: joinRequest.id, chatRoomId: admitted.chatRoomId } } };
}
