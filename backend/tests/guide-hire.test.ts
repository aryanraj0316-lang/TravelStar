import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { uniqueTestPhone } from './test-phone';

/**
 * Hiring a guide for a trip: date ranges, checkpoint scope, accept/reject,
 * and — the thing most likely to be got wrong — a hire must never consume
 * one of the travelling party's seats. Seats are the group's own capacity
 * (services/trip-membership.ts owns that count); a hired guide is staff,
 * not a member taking someone's place.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdGuideProfileIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-hire-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Hire ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createGuide(label: string): Promise<{ guideProfileId: string; token: string; userId: string }> {
  const account = await registerAndLogin(label);
  const res = await request(app)
    .post('/api/v1/guides/profile')
    .set('Authorization', `Bearer ${account.token}`)
    .send({
      licenseNumber: `LIC-HIRE-${label}-${runId}`,
      experienceYears: 6,
      expertisePlaces: ['Jaipur'],
      languagesSpoken: ['Hindi'],
      hourlyRate: 500,
      dailyRate: 3000,
      availability: {},
    });
  expect(res.status).toBeLessThan(300);
  createdGuideProfileIds.push(res.body.data.id);
  return { guideProfileId: res.body.data.id, token: account.token, userId: account.userId };
}

async function createTrip(token: string, name: string, totalSeats = 4) {
  const startDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + 24 * 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      cities: ['Jaipur', 'Udaipur'],
      startDate,
      endDate,
      budget: 8000,
      totalSeats,
      meetingPoint: 'Jaipur Jn',
      privacy: 'PUBLIC',
      timeline: [
        { city: 'Jaipur', stayDays: 2, activities: '', latitude: 26.9124, longitude: 75.7873 },
        { city: 'Udaipur', stayDays: 2, activities: '', latitude: 24.5854, longitude: 73.7125 },
      ],
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);
  return res.body.data.id as string;
}

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { guideProfileId: { in: createdGuideProfileIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: createdGuideProfileIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Guide hire requests', () => {
  it('hires for a date range without consuming any of the group\'s seats', async () => {
    const organizer = await registerAndLogin('organizer');
    const guide = await createGuide('rangeguide');
    const tripId = await createTrip(organizer.token, `Hire Range Trip ${runId}`, 4);

    const before = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { availableSeats: true, totalSeats: true },
    });
    expect(before?.availableSeats).toBe(4);

    const start = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);

    const hire = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        tripId,
        scope: 'WHOLE_TRIP',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        amount: 12000,
        note: 'Need Hindi + English through the whole route',
      });
    expect(hire.status).toBe(201);
    expect(hire.body.data.scope).toBe('WHOLE_TRIP');
    expect(hire.body.data.endDate).toBe(end.toISOString().split('T')[0]);
    expect(hire.body.data.status).toBe('PENDING');

    // The whole point: staff, not a member. Seat count is untouched.
    const after = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { availableSeats: true, totalSeats: true },
    });
    expect(after?.availableSeats).toBe(before?.availableSeats);
    expect(after?.totalSeats).toBe(before?.totalSeats);
    const members = await prisma.tripMember.count({ where: { tripId } });
    expect(members).toBe(0);

    // The guide accepts, and the request becomes confirmed.
    const accept = await request(app)
      .post(`/api/v1/bookings/${hire.body.data.id}/status`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ status: 'CONFIRMED' });
    expect(accept.status).toBe(200);
    expect(accept.body.data.status).toBe('CONFIRMED');

    const seatsStillFine = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { availableSeats: true },
    });
    expect(seatsStillFine?.availableSeats).toBe(4);
  }, 90_000);

  it('scopes a hire to one checkpoint and refuses a checkpoint from another trip', async () => {
    const organizer = await registerAndLogin('cporganizer');
    const guide = await createGuide('cpguide');
    const tripId = await createTrip(organizer.token, `Checkpoint Hire ${runId}`);
    const otherTripId = await createTrip(organizer.token, `Other Trip ${runId}`);

    const stop = await prisma.tripTimelineStop.findFirst({ where: { tripId }, orderBy: { order: 'asc' } });
    const foreignStop = await prisma.tripTimelineStop.findFirst({ where: { tripId: otherTripId } });
    expect(stop).toBeTruthy();
    expect(foreignStop).toBeTruthy();

    const start = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();

    const ok = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        tripId,
        tripTimelineStopId: stop!.id,
        scope: 'CHECKPOINT',
        startDate: start,
        amount: 3000,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.tripTimelineStopId).toBe(stop!.id);

    const mismatched = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        tripId,
        tripTimelineStopId: foreignStop!.id,
        scope: 'CHECKPOINT',
        startDate: start,
        amount: 3000,
      });
    expect(mismatched.status).toBe(400);
  }, 90_000);

  it('refuses a hire for a trip the caller does not organize', async () => {
    const organizer = await registerAndLogin('realorganizer');
    const outsider = await registerAndLogin('outsider');
    const guide = await createGuide('outsiderguide');
    const tripId = await createTrip(organizer.token, `Not Yours Trip ${runId}`);

    const res = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        tripId,
        scope: 'WHOLE_TRIP',
        startDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 5000,
      });
    expect(res.status).toBe(403);
  }, 90_000);

  it('refuses to double-book a guide already confirmed for overlapping dates', async () => {
    const organizerA = await registerAndLogin('clashA');
    const organizerB = await registerAndLogin('clashB');
    const guide = await createGuide('clashguide');

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 34 * 24 * 60 * 60 * 1000);

    const first = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${organizerA.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        scope: 'CUSTOM_DATES',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        amount: 9000,
      });
    expect(first.status).toBe(201);

    await request(app)
      .post(`/api/v1/bookings/${first.body.data.id}/status`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ status: 'CONFIRMED' });

    // Overlaps the confirmed hire by two days.
    const overlapping = await request(app)
      .post('/api/v1/bookings/hire')
      .set('Authorization', `Bearer ${organizerB.token}`)
      .send({
        guideProfileId: guide.guideProfileId,
        scope: 'CUSTOM_DATES',
        startDate: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 36 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 9000,
      });
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('GUIDE_UNAVAILABLE');
  }, 90_000);
});
