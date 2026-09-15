import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

const runId = Date.now();
let seq = 0;

async function registerUser(label: string): Promise<{ token: string; userId: string }> {
  seq += 1;
  const email = `pay-test-${runId}-${seq}@travelstar.test`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: label, email, password: 'correcthorsebattery' });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, userId: res.body.data.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Trip Payments & Payment-Gated Join Flow (CONVENTIONS.md §3, REMEDIATION.md §5.5/§5.6)', () => {
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

  it('1. Free trip (budget=0) skips payment and approves instantly', async () => {
    const traveler = await registerUser('Free Traveler');
    createdUserIds.push(traveler.userId);

    // Traveler requests to join free trip
    const reqRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: freeTripId, message: 'Can I join the free trek?' });
    expect(reqRes.status).toBe(201);
    const joinReqId = reqRes.body.data.id;

    // Organizer approves
    const approveRes = await request(app)
      .post(`/api/v1/interactions/join-request/${joinReqId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'APPROVED' });

    expect(approveRes.status).toBe(200);
    // Instant approval: status is APPROVED immediately
    expect(approveRes.body.data.status).toBe('APPROVED');
    expect(approveRes.body.data.chatRoomId).toBeTruthy();

    // Verify seat was claimed
    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: freeTripId, userId: traveler.userId } },
    });
    expect(member).toBeTruthy();
  });

  it('2. Paid trip approval transitions request to AWAITING_PAYMENT when gateway configured, or keeps flow consistent', async () => {
    const traveler = await registerUser('Paid Traveler 1');
    createdUserIds.push(traveler.userId);

    // Traveler applies to paid trip
    const reqRes = await request(app)
      .post('/api/v1/interactions/join-request')
      .set(auth(traveler.token))
      .send({ tripId: paidTripId, message: 'Excited for the expedition!' });
    expect(reqRes.status).toBe(201);
    const joinReqId = reqRes.body.data.id;

    // Organizer approves
    const approveRes = await request(app)
      .post(`/api/v1/interactions/join-request/${joinReqId}/status`)
      .set(auth(organizer.token))
      .send({ status: 'APPROVED' });

    expect(approveRes.status).toBe(200);
    const status = approveRes.body.data.status;
    expect(['AWAITING_PAYMENT', 'APPROVED']).toContain(status);

    // "Please complete payment" is only actionable if the notification says
    // which request to pay for. Without joinRequestId stored on the row, the
    // tap had nowhere to go once the original socket payload was gone, and
    // the traveller was left to find the trip themselves.
    if (status === 'AWAITING_PAYMENT') {
      const notif = await prisma.notification.findFirst({
        where: { userId: traveler.userId, category: 'PAYMENT_REQUIRED', tripId: paidTripId },
        orderBy: { createdAt: 'desc' },
      });
      expect(notif).toBeTruthy();
      expect(notif!.joinRequestId).toBe(joinReqId);
    }
  });

  it('3. Wallet payment fails with 422 if balance is insufficient', async () => {
    const traveler = await registerUser('Poor Traveler');
    createdUserIds.push(traveler.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        tripId: paidTripId,
        userId: traveler.userId,
        status: 'AWAITING_PAYMENT',
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

  it('4. Wallet payment atomically deducts balance, claims seat, and transitions order to CAPTURED', async () => {
    const traveler = await registerUser('Rich Traveler');
    createdUserIds.push(traveler.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        tripId: paidTripId,
        userId: traveler.userId,
        status: 'AWAITING_PAYMENT',
      },
    });

    // Credit traveler wallet with ₹3000
    await prisma.wallet.upsert({
      where: { userId: traveler.userId },
      create: { userId: traveler.userId, balance: 3000 },
      update: { balance: 3000 },
    });

    const res = await request(app)
      .post('/api/v1/trip-payments/wallet-pay')
      .set(auth(traveler.token))
      .send({ joinRequestId: jr.id });

    expect(res.status).toBe(200);
    expect(res.body.data.joinRequestId).toBe(jr.id);

    // Verify wallet balance: 3000 - 1500 = 1500
    const wallet = await prisma.wallet.findUnique({ where: { userId: traveler.userId } });
    expect(Number(wallet?.balance)).toBe(1500);

    // Verify join request status updated to APPROVED
    const updatedJr = await prisma.joinRequest.findUnique({ where: { id: jr.id } });
    expect(updatedJr?.status).toBe('APPROVED');

    // Verify trip payment order is CAPTURED
    const order = await prisma.tripPaymentOrder.findUnique({ where: { joinRequestId: jr.id } });
    expect(order?.status).toBe('CAPTURED');
    expect(order?.gateway).toBe('WALLET');
  });

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

  it('6. Rejection of a captured payment refunds amount to wallet', async () => {
    const applicant = await registerUser('Refund Traveler');
    createdUserIds.push(applicant.userId);

    const jr = await prisma.joinRequest.create({
      data: {
        tripId: paidTripId,
        userId: applicant.userId,
        status: 'AWAITING_PAYMENT',
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
  });
});
