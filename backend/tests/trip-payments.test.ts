import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';
import { travellers } from './traveller-details-fixture';

const runId = Date.now();
let seq = 0;

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `pay-test-${runId}-${seq}@travelstar.test`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Trip Payments & pay-first booking flow (CONVENTIONS.md §3, REMEDIATION.md §5.5/§5.6)', () => {
  let organizer: { token: string; userId: string };
  let freeTripId: string;
  let paidTripId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    organizer = await registerUser('Paid Trip Organizer');
    createdUserIds.push(organizer.userId);

    // Create a free trip (budget = 0)
    const freeTrip = await prisma.trip.create({
      data: {
        creatorId: organizer.userId,
        name: 'Free Weekend Trek',
        description: 'Trek in the mountains',
        category: 'ADVENTURE',
        cities: ['Triund'],
        startDate: new Date(Date.now() + 10 * 864e5),
        endDate: new Date(Date.now() + 12 * 864e5),
        durationDays: 2,
        budget: 0,
        totalSeats: 5,
        availableSeats: 5,
        meetingPoint: 'Dharamshala Main Square',
        privacy: 'PUBLIC',
      },
    });
    freeTripId = freeTrip.id;

    // Create a paid trip (budget = 1500)
    const paidTrip = await prisma.trip.create({
      data: {
        creatorId: organizer.userId,
        name: 'Paid Himalayan Expedition',
        description: 'Expedition in the Himalayas',
        category: 'ADVENTURE',
        cities: ['Manali', 'Solang'],
        startDate: new Date(Date.now() + 20 * 864e5),
        endDate: new Date(Date.now() + 25 * 864e5),
        durationDays: 5,
        budget: 1500,
        totalSeats: 4,
        availableSeats: 4,
        meetingPoint: 'Manali Mall Road',
        privacy: 'PUBLIC',
      },
    });
    paidTripId = paidTrip.id;
  });

  afterAll(async () => {
    const tripIds = [freeTripId, paidTripId].filter(Boolean);

    await prisma.tripPaymentOrder.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.walletTransaction.deleteMany({
      where: { wallet: { userId: { in: createdUserIds } } },
    });
    await prisma.wallet.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    if (tripIds.length > 0) {
      await prisma.tripMember.deleteMany({
        where: { tripId: { in: tripIds } },
      });
      await prisma.joinRequest.deleteMany({
        where: { tripId: { in: tripIds } },
      });
      await prisma.trip.deleteMany({
        where: { id: { in: tripIds } },
      });
    }
  });

  it('1. Free trip: approval reserves the seat, and only the organizer\'s allocation admits the traveller to the group', async () => {
    const traveler = await registerUser('Free Traveler');
    createdUserIds.push(traveler.userId);

    const reqRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: freeTripId, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('PENDING');
    expect(reqRes.body.data.termsAcceptedAt).toBeTruthy();
    const joinReqId = reqRes.body.data.id;

    const approveRes = await request(app)
      .post(`/api/v1/interactions/join-request/${joinReqId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('ALLOCATION_PENDING');
    expect(approveRes.body.data.chatRoomId).toBeNull();

    // Seat held, but not a member and not in the chat yet.
    expect((await prisma.trip.findUnique({ where: { id: freeTripId } }))?.availableSeats).toBe(4);
    expect(await prisma.tripMember.count({ where: { tripId: freeTripId, userId: traveler.userId } })).toBe(0);

    const allocated = await request(app)
      .post(`/api/v1/trips/${freeTripId}/approve-and-allocate`)
      .set(auth(organizer.token))
      .send({
        joinRequestId: joinReqId,
        allocations: [
          { dayNumber: 1, checkpointName: 'Triund', hotelName: 'Camp 1', roomNumber: 'Tent B-12', vehicleNumber: 'HP-01-1234', seatNumber: '4' },
        ],
      });
    expect(allocated.status).toBe(200);
    expect(allocated.body.data.status).toBe('CONFIRMED');
    expect(allocated.body.data.chatRoomId).toBeTruthy();

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: freeTripId, userId: traveler.userId } },
      include: { allocations: true },
    });
    expect(member).toBeTruthy();
    expect(member!.allocations).toHaveLength(1);
    expect(member!.allocations[0]!.roomNumber).toBe('Tent B-12');
    // Seat count unchanged by allocation — it was taken at approval.
    expect((await prisma.trip.findUnique({ where: { id: freeTripId } }))?.availableSeats).toBe(4);
  });

  it('2. Paid trip: booking goes straight to payment — no organizer approval first, and no organizer alert until it is paid', async () => {
    const traveler = await registerUser('Paid Traveler 1');
    createdUserIds.push(traveler.userId);

    const reqRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: paidTripId, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.status).toBe('PAYMENT_PENDING');

    expect(
      await prisma.notification.count({ where: { userId: organizer.userId, tripId: paidTripId, joinRequestId: reqRes.body.data.id } }),
    ).toBe(0);

    // The order preview carries the 4.5% / 95.5% split.
    const order = await request(app).get(`/api/v1/trip-payments/order/${reqRes.body.data.id}`).set(auth(traveler.token));
    expect(order.status).toBe(200);
    expect(order.body.data.amount).toBe('1500');
    expect(order.body.data.platformFee).toBe('67.5');
    expect(order.body.data.organizerAmount).toBe('1432.5');
    expect(order.body.data.verificationToken).toBeNull();

    // Withdraw so this test does not hold anything for the others.
    await request(app).delete(`/api/v1/interactions/join-request/${paidTripId}`).set(auth(traveler.token));
  });

  it('3. Wallet payment fails with 422 if balance is insufficient', async () => {
    const traveler = await registerUser('Poor Traveler');
    createdUserIds.push(traveler.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        travellerDetails: travellers(1),
        tripId: paidTripId,
        userId: traveler.userId,
        status: 'PAYMENT_PENDING',
      },
    });

    // Ensure traveler wallet balance is 0
    await prisma.wallet.upsert({
      where: { userId: traveler.userId },
      create: { userId: traveler.userId, balance: 0 },
      update: { balance: 0 },
    });

    const res = await request(app)
      .post('/api/v1/trip-payments/wallet-pay')
      .set(auth(traveler.token))
      .send({ joinRequestId: jr.id });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('4. Wallet payment deducts the balance, holds the seat, issues a token — and does NOT make the traveller a member', async () => {
    const traveler = await registerUser('Rich Traveler');
    createdUserIds.push(traveler.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        travellerDetails: travellers(1),
        tripId: paidTripId,
        userId: traveler.userId,
        status: 'PAYMENT_PENDING',
      },
    });

    await prisma.wallet.upsert({
      where: { userId: traveler.userId },
      create: { userId: traveler.userId, balance: 3000 },
      update: { balance: 3000 },
    });
    const seatsBefore = (await prisma.trip.findUnique({ where: { id: paidTripId } }))!.availableSeats;

    const res = await request(app)
      .post('/api/v1/trip-payments/wallet-pay')
      .set(auth(traveler.token))
      .send({ joinRequestId: jr.id });

    expect(res.status).toBe(200);
    expect(res.body.data.joinRequestId).toBe(jr.id);
    expect(res.body.data.verificationToken).toMatch(/^TST-[0-9A-F]{6}$/);
    expect(res.body.data.chatRoomId).toBeNull();

    const wallet = await prisma.wallet.findUnique({ where: { userId: traveler.userId } });
    expect(Number(wallet?.balance)).toBe(1500);

    const updatedJr = await prisma.joinRequest.findUnique({ where: { id: jr.id } });
    expect(updatedJr?.status).toBe('PAYMENT_COMPLETED');
    expect((await prisma.trip.findUnique({ where: { id: paidTripId } }))!.availableSeats).toBe(seatsBefore - 1);
    expect(await prisma.tripMember.count({ where: { tripId: paidTripId, userId: traveler.userId } })).toBe(0);

    const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId: jr.id } });
    expect(order?.status).toBe('CAPTURED');
    expect(order?.gateway).toBe('WALLET');
    expect(order?.verificationToken).toBe(res.body.data.verificationToken);
    expect(Number(order?.platformFee)).toBe(67.5);
    expect(Number(order?.organizerAmount)).toBe(1432.5);
  });

  it('7. End-to-end: book → pay → organizer verifies the token and allocates → member, Trip Pass, group chat', async () => {
    const traveler = await registerUser('E2E Payer');
    createdUserIds.push(traveler.userId);

    const asked = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: paidTripId, acceptedTerms: true, travellerDetails: travellers(1) });
    expect(asked.status).toBe(201);
    const joinRequestId = asked.body.data.id;

    const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth(traveler.token)).send({ joinRequestId });
    expect(paid.status).toBe(200);
    const token = paid.body.data.verificationToken as string;

    // Both sides are told, with the token.
    const travellerNotif = await prisma.notification.findFirst({
      where: { userId: traveler.userId, category: 'PAYMENT_SUCCESS', tripId: paidTripId },
      orderBy: { createdAt: 'desc' },
    });
    expect(travellerNotif!.content).toContain(token);
    const organizerNotif = await prisma.notification.findFirst({
      where: { userId: organizer.userId, category: 'PAYMENT_SUCCESS', tripId: paidTripId, joinRequestId },
    });
    expect(organizerNotif!.title).toContain('Payment received');
    expect(organizerNotif!.content).toContain(token);

    // The organizer's queue lists the paid traveller.
    const pending = await request(app).get(`/api/v1/trips/${paidTripId}/pending-allocations`).set(auth(organizer.token));
    expect(pending.status).toBe(200);
    const row = pending.body.data.travellers.find((t: { joinRequestId: string }) => t.joinRequestId === joinRequestId);
    expect(row.status).toBe('PAYMENT_COMPLETED');
    expect(row.verificationToken).toBe(token);
    // ...with the traveller details shown on Verify & Allocate.
    expect(row.travellerDetails[0].fullName).toBe('Test Traveller');
    // Not visible to anyone but the organizer.
    expect(
      (await request(app).get(`/api/v1/trips/${paidTripId}/pending-allocations`).set(auth(traveler.token))).status,
    ).toBe(403);

    // A wrong token is refused; the right one verifies.
    const wrong = await request(app)
      .post(`/api/v1/trips/${paidTripId}/verify-token`)
      .set(auth(organizer.token))
      .send({ joinRequestId, verificationToken: 'TST-000000' });
    expect(wrong.status).toBe(422);
    const verified = await request(app)
      .post(`/api/v1/trips/${paidTripId}/verify-token`)
      .set(auth(organizer.token))
      .send({ joinRequestId, verificationToken: token.toLowerCase() });
    expect(verified.status).toBe(200);
    expect((await prisma.joinRequest.findUnique({ where: { id: joinRequestId } }))?.status).toBe('ALLOCATION_PENDING');

    // Still no chat before allocation.
    const pass0 = await request(app).get(`/api/v1/trips/${paidTripId}/my-booking`).set(auth(traveler.token));
    expect(pass0.body.data.status).toBe('ALLOCATION_PENDING');
    expect(pass0.body.data.chatRoomId).toBeNull();

    const allocations = [
      { dayNumber: 1, checkpointName: 'Manali', hotelName: 'Hotel Snow View', roomNumber: 'Room 304', vehicleNumber: 'HP-01-TA-1234 (Volvo AC)', seatNumber: 'Seat 14 (Window)', assemblyTime: '06:30 AM at Hotel Lobby' },
      { dayNumber: 3, checkpointName: 'Solang', hotelName: 'Camp 1', roomNumber: 'Tent B-12', vehicleNumber: 'HP-01-TA-1234', seatNumber: 'Seat 14' },
    ];
    const badToken = await request(app)
      .post(`/api/v1/trips/${paidTripId}/approve-and-allocate`)
      .set(auth(organizer.token))
      .send({ joinRequestId, verificationToken: 'TST-FFFFFF', allocations });
    expect(badToken.status).toBe(422);

    const confirmed = await request(app)
      .post(`/api/v1/trips/${paidTripId}/approve-and-allocate`)
      .set(auth(organizer.token))
      .send({ joinRequestId, verificationToken: token, allocations });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    const chatRoomId = confirmed.body.data.chatRoomId as string;
    expect(chatRoomId).toBeTruthy();

    expect(await prisma.chatRoomMember.count({ where: { chatRoomId, userId: traveler.userId } })).toBe(1);
    const joinedLine = await prisma.message.findFirst({ where: { chatRoomId, isSystem: true }, orderBy: { createdAt: 'desc' } });
    expect(joinedLine!.content).toBe('E2E Payer has joined the trip!');
    const confirmNotif = await prisma.notification.findFirst({
      where: { userId: traveler.userId, category: 'JOIN_ACCEPTED', tripId: paidTripId },
    });
    expect(confirmNotif!.content).toContain('is confirmed');

    // The Trip Pass.
    const pass = await request(app).get(`/api/v1/trips/${paidTripId}/my-booking`).set(auth(traveler.token));
    expect(pass.status).toBe(200);
    expect(pass.body.data.status).toBe('CONFIRMED');
    expect(pass.body.data.bookingReferenceToken).toBe(token);
    expect(pass.body.data.chatRoomId).toBe(chatRoomId);
    expect(pass.body.data.allocations.map((a: { roomNumber: string }) => a.roomNumber)).toEqual(['Room 304', 'Tent B-12']);

    // A second allocation for the same booking is refused.
    const again = await request(app)
      .post(`/api/v1/trips/${paidTripId}/approve-and-allocate`)
      .set(auth(organizer.token))
      .send({ joinRequestId, verificationToken: token, allocations });
    expect(again.status).toBe(409);

    // Money shows in the organizer's figures, split.
    const summaries = await request(app).get('/api/v1/trips/mine/payment-summaries').set(auth(organizer.token));
    const paidSummary = summaries.body.data.find((s: { tripId: string }) => s.tripId === paidTripId);
    expect(Number(paidSummary.collected)).toBeGreaterThanOrEqual(1500);
    expect(Number(paidSummary.organizerShare)).toBeGreaterThanOrEqual(1432.5);
  }, 120_000);

  it('8. Receipts on both sides carry the token and the fee split', async () => {
    const traveler = await registerUser('Direct Payer');
    createdUserIds.push(traveler.userId);

    const asked = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: paidTripId, acceptedTerms: true, travellerDetails: travellers(1) });
    const joinRequestId = asked.body.data.id;
    const paid = await request(app).post('/api/v1/trip-payments/pay').set(auth(traveler.token)).send({ joinRequestId });
    expect(paid.status).toBe(200);
    expect(Number(paid.body.data.amount)).toBe(1500);

    const travellerReceipts = await request(app).get('/api/v1/trip-payments/receipts').set(auth(traveler.token));
    const mine = travellerReceipts.body.data.find(
      (r: { tripId: string; direction: string }) => r.tripId === paidTripId && r.direction === 'PAID',
    );
    expect(Number(mine.amount)).toBe(1500);
    expect(mine.verificationToken).toBe(paid.body.data.verificationToken);
    expect(Number(mine.platformFee)).toBe(67.5);
    expect(mine.counterpartyRole).toBe('Organizer');

    const organizerReceipts = await request(app).get('/api/v1/trip-payments/receipts').set(auth(organizer.token));
    const received = organizerReceipts.body.data.find(
      (r: { direction: string; counterpartyName: string }) => r.direction === 'RECEIVED' && r.counterpartyName === 'Direct Payer',
    );
    expect(Number(received.organizerAmount)).toBe(1432.5);

    // Cancel (trip is 20 days out → 95.5% back) so the seat is free again.
    const cancelled = await request(app).post(`/api/v1/trips/${paidTripId}/cancel-booking`).set(auth(traveler.token));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.refundAmount).toBe('1432.50');
  }, 120_000);

  it('5. Signature mismatch on verify endpoint returns 400 INVALID_SIGNATURE', async () => {
    const traveler = await registerUser('Sig Test Traveler');
    createdUserIds.push(traveler.userId);

    const res = await request(app)
      .post('/api/v1/trip-payments/verify')
      .set(auth(traveler.token))
      .send({
        razorpayOrderId: 'order_fake_123',
        razorpayPaymentId: 'pay_fake_456',
        razorpaySignature: 'invalid_deadbeef_signature',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('6. Organizer rejection of a paid booking refunds the full amount to the original method (wallet)', async () => {
    const applicant = await registerUser('Refund Traveler');
    createdUserIds.push(applicant.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        travellerDetails: travellers(1),
        tripId: paidTripId,
        userId: applicant.userId,
        status: 'PAYMENT_PENDING',
      },
    });

    // Give applicant 2000
    await prisma.wallet.upsert({
      where: { userId: applicant.userId },
      create: { userId: applicant.userId, balance: 2000 },
      update: { balance: 2000 },
    });

    // Pay from wallet
    const payRes = await request(app)
      .post('/api/v1/trip-payments/wallet-pay')
      .set(auth(applicant.token))
      .send({ joinRequestId: jr.id });
    expect(payRes.status).toBe(200);

    let wallet = await prisma.wallet.findUnique({ where: { userId: applicant.userId } });
    expect(Number(wallet?.balance)).toBe(500);

    // Now organizer rejects this request
    const rejectRes = await request(app)
      .post(`/api/v1/interactions/join-request/${jr.id}/status`)
      .set(auth(organizer.token))
      .send({ status: 'REJECTED' });
    expect(rejectRes.status).toBe(200);

    // Wallet balance should be refunded: 500 + 1500 = 2000
    wallet = await prisma.wallet.findUnique({ where: { userId: applicant.userId } });
    expect(Number(wallet?.balance)).toBe(2000);

    // TripPaymentOrder should be REFUNDED
    const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId: jr.id } });
    expect(order?.status).toBe('REFUNDED');

    // The traveller is told it was declined and where their money went.
    const declined = await prisma.notification.findFirst({
      where: { userId: applicant.userId, joinRequestId: jr.id, title: { startsWith: 'Booking declined' } },
    });
    expect(declined?.content).toContain('₹1500.00');
    expect(declined?.content).toContain('wallet');
    expect(declined?.unread).toBe(true);

    // Declining again is refused — no second refund, no second notice.
    const again = await request(app)
      .post(`/api/v1/interactions/join-request/${jr.id}/status`)
      .set(auth(organizer.token))
      .send({ status: 'REJECTED' });
    expect(again.status).toBe(400);
    wallet = await prisma.wallet.findUnique({ where: { userId: applicant.userId } });
    expect(Number(wallet?.balance)).toBe(2000);
  });

  it('7. Paying sends the traveller details form to the organizer', async () => {
    const payer = await registerUser('Contact Traveler');
    createdUserIds.push(payer.userId);

    const jr = await prisma.joinRequest.create({
      data: { tripId: paidTripId, userId: payer.userId, status: 'PAYMENT_PENDING', travellerDetails: travellers(1) },
    });

    // Before paying: nothing is shared.
    const before = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    expect(before.body.data.find((r: { id: string }) => r.id === jr.id)?.travellerDetails).toBeNull();

    await prisma.wallet.upsert({
      where: { userId: payer.userId },
      create: { userId: payer.userId, balance: 2000 },
      update: { balance: 2000 },
    });
    const payRes = await request(app)
      .post('/api/v1/trip-payments/wallet-pay')
      .set(auth(payer.token))
      .send({ joinRequestId: jr.id });
    expect(payRes.status).toBe(200);

    // After paying: the form the traveller filled in (not their profile).
    const after = await request(app).get('/api/v1/interactions/incoming-requests').set(auth(organizer.token));
    const row = after.body.data.find((r: { id: string }) => r.id === jr.id);
    expect(row.travellerDetails[0].fullName).toBe('Test Traveller');
    expect(row.contact).toBeUndefined();

    // ...and the organizer's "Payment received" alert carries it too, with the token.
    const alert = await prisma.notification.findFirst({
      where: { userId: organizer.userId, joinRequestId: jr.id, category: 'PAYMENT_SUCCESS' },
    });
    expect(alert?.content).toContain(payRes.body.data.verificationToken);
    expect(alert?.content).toContain('Phone: 9876543210');
    expect(alert?.content).toContain('ID: Passport P1234567');
  });
});
