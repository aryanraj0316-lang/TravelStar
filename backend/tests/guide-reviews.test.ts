import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';

/**
 * Guide reviews have to be earned.
 *
 * Review used to carry only a free-text `reviewerName`, bound to no account
 * and no engagement — so anyone could rate any guide any number of times
 * without ever having travelled with them, and GuideProfile.rating was
 * never derived from anything. A review is now tied to the reviewer's
 * account and to a specific concluded engagement, and the headline rating
 * is recomputed from the reviews themselves.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdGuideProfileIds: string[] = [];
const createdBookingIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-review-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Review ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createGuide(label: string): Promise<{ guideProfileId: string; token: string; userId: string }> {
  const account = await registerAndLogin(label);
  const res = await request(app)
    .post('/api/v1/guides/profile')
    .set('Authorization', `Bearer ${account.token}`)
    .send({
      licenseNumber: `LIC-REV-${label}-${runId}`,
      experienceYears: 4,
      expertisePlaces: ['Jaipur'],
      languagesSpoken: ['Hindi'],
      hourlyRate: 400,
      dailyRate: 2500,
      availability: {},
    });
  expect(res.status).toBeLessThan(300);
  createdGuideProfileIds.push(res.body.data.id);
  return { guideProfileId: res.body.data.id, token: account.token, userId: account.userId };
}

afterAll(async () => {
  await prisma.review.deleteMany({ where: { guideProfileId: { in: createdGuideProfileIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: createdGuideProfileIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Guide reviews', () => {
  it('refuses a review from someone with no engagement with the guide', async () => {
    const guide = await createGuide('nostranger');
    const stranger = await registerAndLogin('stranger');

    const trip = await prisma.trip.create({
      data: {
        creatorId: stranger.userId,
        name: `Unrelated Trip ${runId}`,
        description: '',
        cities: ['Jaipur'],
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        durationDays: 5,
        budget: 1000,
        availableSeats: 4,
        totalSeats: 4,
        meetingPoint: 'Jaipur Jn',
      },
    });
    createdTripIds.push(trip.id);

    const res = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ rating: 5, comment: 'Never met them', tripId: trip.id });

    // The guide was never assigned to this trip.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_ENGAGEMENT');

    const count = await prisma.review.count({ where: { guideProfileId: guide.guideProfileId } });
    expect(count).toBe(0);
  }, 60_000);

  it('refuses a review before the booking has concluded, and accepts it after', async () => {
    const guide = await createGuide('booking');
    const traveller = await registerAndLogin('traveller');

    // A confirmed booking whose travel date is still ahead.
    const upcoming = await prisma.booking.create({
      data: {
        userId: traveller.userId,
        type: 'GUIDE',
        guideProfileId: guide.guideProfileId,
        travelDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        amount: 2500,
        status: 'CONFIRMED',
      },
    });
    createdBookingIds.push(upcoming.id);

    const tooEarly = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({ rating: 5, comment: 'Looking forward to it', bookingId: upcoming.id });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.code).toBe('NOT_CONCLUDED');

    // Once the travel date has passed, the same booking is reviewable.
    await prisma.booking.update({
      where: { id: upcoming.id },
      data: { travelDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });

    const accepted = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({ rating: 4, comment: 'Knew every corner of the old city', bookingId: upcoming.id });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.guideAverageRating).toBe(4);

    // The headline rating is derived, not asserted by the client.
    const profile = await prisma.guideProfile.findUnique({
      where: { id: guide.guideProfileId },
      select: { rating: true },
    });
    expect(profile?.rating).toBe(4);

    // The same engagement cannot be reviewed twice.
    const duplicate = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({ rating: 1, comment: 'Changed my mind', bookingId: upcoming.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_REVIEWED');

    // And it shows up in the public review list.
    const list = await request(app).get(`/api/v1/guides/${guide.guideProfileId}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].rating).toBe(4);
    expect(list.body.data[0].comment).toBe('Knew every corner of the old city');
  }, 60_000);

  it("refuses to let someone review another traveller's booking", async () => {
    const guide = await createGuide('notyours');
    const traveller = await registerAndLogin('owner');
    const outsider = await registerAndLogin('outsider');

    const booking = await prisma.booking.create({
      data: {
        userId: traveller.userId,
        type: 'GUIDE',
        guideProfileId: guide.guideProfileId,
        travelDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        amount: 2500,
        status: 'COMPLETED',
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ rating: 1, comment: 'Was not me', bookingId: booking.id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  }, 60_000);

  it('refuses to let a guide review themselves', async () => {
    const guide = await createGuide('self');

    const booking = await prisma.booking.create({
      data: {
        userId: guide.userId,
        type: 'GUIDE',
        guideProfileId: guide.guideProfileId,
        travelDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        amount: 2500,
        status: 'COMPLETED',
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .post(`/api/v1/guides/${guide.guideProfileId}/reviews`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ rating: 5, comment: 'I am excellent', bookingId: booking.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_REVIEW');
  }, 60_000);

  it('reports what the caller is eligible to review', async () => {
    const guide = await createGuide('eligible');
    const traveller = await registerAndLogin('eligibletraveller');

    const booking = await prisma.booking.create({
      data: {
        userId: traveller.userId,
        type: 'GUIDE',
        guideProfileId: guide.guideProfileId,
        travelDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        amount: 2500,
        status: 'COMPLETED',
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .get(`/api/v1/guides/${guide.guideProfileId}/reviews/eligibility`)
      .set('Authorization', `Bearer ${traveller.token}`);
    expect(res.status).toBe(200);

    const engagements = res.body.data as { kind: string; id: string; alreadyReviewed: boolean }[];
    expect(engagements).toHaveLength(1);
    expect(engagements[0]!.kind).toBe('BOOKING');
    expect(engagements[0]!.id).toBe(booking.id);
    expect(engagements[0]!.alreadyReviewed).toBe(false);
  }, 60_000);
});
