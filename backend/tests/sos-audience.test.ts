import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { resolveSosAudience } from '../src/services/sos-audience';

/**
 * An SOS has to reach the people who can actually help, and has to survive
 * being offline.
 *
 * Previously the alert existed only as a socket emit plus an SOSAlert row:
 * nothing was written into the trip's group chat, so anyone who opened the
 * app a few minutes later found no trace of it. sos-audience.ts also stated
 * that a trip's guide could not be resolved at all — true when the only
 * guide signal was a `guideIncluded` boolean, no longer true now that
 * TripTimelineStopGuide links guides to checkpoints.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdTripIds: string[] = [];
const createdGuideProfileIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-sos-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `SOS ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

async function createTripWithCheckpoint(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      cities: ['Jaipur'],
      startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      budget: 5000,
      totalSeats: 5,
      meetingPoint: 'Jaipur Jn',
      privacy: 'PUBLIC',
      timeline: [{ city: 'Jaipur', stayDays: 2, activities: '', latitude: 26.9124, longitude: 75.7873 }],
    });
  expect(res.status).toBe(201);
  createdTripIds.push(res.body.data.id);

  // Creation refuses a past start date, but the audience rule is about a
  // trip already under way — so it is backdated directly once it exists.
  await prisma.trip.update({
    where: { id: res.body.data.id },
    data: { startDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });

  return res.body.data.id;
}

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: createdGuideProfileIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('SOS', () => {
  it('persists the alert into the trip group chat as a real location message', async () => {
    const organizer = await registerAndLogin('organizer');
    const traveller = await registerAndLogin('traveller');
    const tripId = await createTripWithCheckpoint(organizer.token, `SOS Trip ${runId}`);

    const joined = await request(app)
      .post(`/api/v1/trips/${tripId}/join`)
      .set('Authorization', `Bearer ${traveller.token}`);
    expect(joined.status).toBe(200);

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({ latitude: 26.9124, longitude: 75.7873, message: 'Lost near the fort' });
    expect(sos.status).toBe(201);
    expect(sos.body.data.isStale).toBe(false);
    expect(sos.body.data.notifiedCount).toBeGreaterThan(0);

    // The whole point: it is still there for someone who opens the app late.
    const room = await prisma.chatRoom.findUnique({ where: { tripId }, select: { id: true } });
    expect(room).toBeTruthy();

    const messages = await prisma.message.findMany({
      where: { chatRoomId: room!.id, mediaType: 'LOCATION' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.isSystem).toBe(true);
    expect(messages[0]!.latitude).toBeCloseTo(26.9124, 3);
    expect(messages[0]!.longitude).toBeCloseTo(75.7873, 3);
    expect(messages[0]!.content).toContain('Lost near the fort');

    // And the organizer has a notification row, not just a socket emit they
    // may have been offline for.
    const notes = await prisma.notification.count({
      where: { userId: organizer.userId, type: 'HAZARD' },
    });
    expect(notes).toBeGreaterThan(0);
  }, 120_000);

  it('labels a stale position instead of presenting it as a live fix', async () => {
    const organizer = await registerAndLogin('staleorg');
    const traveller = await registerAndLogin('staletraveller');
    const tripId = await createTripWithCheckpoint(organizer.token, `Stale Trip ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${traveller.token}`);

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({
        latitude: 26.9,
        longitude: 75.8,
        isStale: true,
        accuracyMeters: 250,
        capturedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      });
    expect(sos.status).toBe(201);
    expect(sos.body.data.isStale).toBe(true);
    expect(sos.body.data.accuracyMeters).toBe(250);

    const room = await prisma.chatRoom.findUnique({ where: { tripId }, select: { id: true } });
    const msg = await prisma.message.findFirst({
      where: { chatRoomId: room!.id, mediaType: 'LOCATION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(msg!.content).toContain('Last known location');
  }, 120_000);

  it('includes a checkpoint guide, and excludes someone on an unrelated trip', async () => {
    const organizer = await registerAndLogin('audorg');
    const traveller = await registerAndLogin('audtraveller');
    const guideAccount = await registerAndLogin('audguide');
    const decoyOrganizer = await registerAndLogin('decoyorg');

    const tripId = await createTripWithCheckpoint(organizer.token, `Audience Trip ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${traveller.token}`);

    // A decoy on a completely different trip must not be told.
    const decoyTripId = await createTripWithCheckpoint(decoyOrganizer.token, `Decoy Trip ${runId}`);
    expect(decoyTripId).toBeTruthy();

    const guideProfile = await request(app)
      .post('/api/v1/guides/profile')
      .set('Authorization', `Bearer ${guideAccount.token}`)
      .send({
        licenseNumber: `LIC-SOS-${runId}`,
        experienceYears: 3,
        expertisePlaces: ['Jaipur'],
        languagesSpoken: ['Hindi'],
        hourlyRate: 300,
        dailyRate: 2000,
        availability: {},
      });
    expect(guideProfile.status).toBeLessThan(300);
    createdGuideProfileIds.push(guideProfile.body.data.id);

    const stop = await prisma.tripTimelineStop.findFirst({ where: { tripId } });
    const assigned = await request(app)
      .post(`/api/v1/trips/${tripId}/timeline/${stop!.id}/guide`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ guideProfileId: guideProfile.body.data.id });
    expect(assigned.status).toBe(201);

    const audience = await resolveSosAudience(traveller.userId);

    expect(audience.userIds).toContain(organizer.userId);
    expect(audience.userIds).toContain(traveller.userId);
    // This is the one that used to be impossible to resolve.
    expect(audience.userIds).toContain(guideAccount.userId);
    expect(audience.userIds).not.toContain(decoyOrganizer.userId);
    expect(audience.tripIds).toContain(tripId);
    expect(audience.tripIds).not.toContain(decoyTripId);
  }, 120_000);

  it('lets the organizer stand an alert down, but not an unrelated user', async () => {
    const organizer = await registerAndLogin('resolveorg');
    const traveller = await registerAndLogin('resolvetraveller');
    const outsider = await registerAndLogin('resolveoutsider');
    const tripId = await createTripWithCheckpoint(organizer.token, `Resolve Trip ${runId}`);
    await request(app).post(`/api/v1/trips/${tripId}/join`).set('Authorization', `Bearer ${traveller.token}`);

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${traveller.token}`)
      .send({ latitude: 26.9124, longitude: 75.7873 });
    const alertId = sos.body.data.alertId;

    const refused = await request(app)
      .post(`/api/v1/safety/sos/${alertId}/resolve`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(refused.status).toBe(403);

    const allowed = await request(app)
      .post(`/api/v1/safety/sos/${alertId}/resolve`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(allowed.status).toBe(200);

    const alert = await prisma.sOSAlert.findUnique({ where: { id: alertId }, select: { status: true } });
    expect(alert?.status).toBe('RESOLVED');

    // The stand-down is posted into the same chat the alert went to.
    const room = await prisma.chatRoom.findUnique({ where: { tripId }, select: { id: true } });
    const safeMsg = await prisma.message.findFirst({
      where: { chatRoomId: room!.id, isSystem: true, content: { contains: 'Marked safe' } },
    });
    expect(safeMsg).toBeTruthy();
  }, 120_000);
});
