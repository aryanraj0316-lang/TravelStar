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
  // ── Reach preference (Profile.sosAudienceMode) ──────────────────────
  //
  // Jaipur, and points at known distances from it, so "within 5 km" is
  // checked against real geography rather than a hand-waved delta.
  const JAIPUR = { lat: 26.9124, lng: 75.7873 };
  /** ~2 km north of JAIPUR. */
  const NEAR = { lat: 26.9304, lng: 75.7873 };
  /** ~22 km north of JAIPUR — outside a 5 km radius, inside a 25 km one. */
  const FAR = { lat: 27.1104, lng: 75.7873 };

  async function setLiveLocation(userId: string, at: { lat: number; lng: number }) {
    await prisma.liveLocation.create({
      data: { userId, latitude: at.lat, longitude: at.lng, updatedAt: new Date() },
    });
  }

  it('keeps an alert to the trip group by default, even with someone standing right there', async () => {
    const alerting = await registerAndLogin('default-alerting');
    const bystander = await registerAndLogin('default-bystander');
    await setLiveLocation(bystander.userId, NEAR);

    const audience = await resolveSosAudience(alerting.userId, JAIPUR);

    // TRIP_GROUP is the default: broadcasting your position to strangers is
    // something you opt into, not something a deploy signs you up for.
    expect(audience.reach.mode).toBe('TRIP_GROUP');
    expect(audience.reach.nearbyCount).toBe(0);
    expect(audience.userIds).not.toContain(bystander.userId);
  }, 120_000);

  it('reaches travellers inside the chosen radius and nobody outside it', async () => {
    const alerting = await registerAndLogin('radius-alerting');
    const near = await registerAndLogin('radius-near');
    const far = await registerAndLogin('radius-far');
    await setLiveLocation(near.userId, NEAR);
    await setLiveLocation(far.userId, FAR);

    await prisma.profile.update({
      where: { userId: alerting.userId },
      data: { sosAudienceMode: 'NEARBY', sosRadiusKm: 5 },
    });

    const audience = await resolveSosAudience(alerting.userId, JAIPUR);
    expect(audience.reach.mode).toBe('NEARBY');
    expect(audience.reach.radiusKm).toBe(5);
    expect(audience.userIds).toContain(near.userId);
    // ~22 km away: a bounding box alone would still be deciding this by
    // corners, which is why the circle is checked exactly.
    expect(audience.userIds).not.toContain(far.userId);

    // Widening the radius reaches them, so this is really distance-based
    // and not just "the last person who happened to be inserted".
    await prisma.profile.update({
      where: { userId: alerting.userId },
      data: { sosRadiusKm: 25 },
    });
    const wider = await resolveSosAudience(alerting.userId, JAIPUR);
    expect(wider.userIds).toContain(near.userId);
    expect(wider.userIds).toContain(far.userId);
  }, 120_000);

  it('never reaches someone who turned location sharing off, or whose position is stale', async () => {
    const alerting = await registerAndLogin('privacy-alerting');
    const optedOut = await registerAndLogin('privacy-optedout');
    const stale = await registerAndLogin('privacy-stale');

    await setLiveLocation(optedOut.userId, NEAR);
    await prisma.profile.update({
      where: { userId: optedOut.userId },
      data: { locationSharing: false },
    });

    // Standing in the same place, but the app last reported it hours ago:
    // that is not where they are now, and waking them helps nobody.
    await prisma.liveLocation.create({
      data: {
        userId: stale.userId,
        latitude: NEAR.lat,
        longitude: NEAR.lng,
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });

    await prisma.profile.update({
      where: { userId: alerting.userId },
      data: { sosAudienceMode: 'NEARBY', sosRadiusKm: 25 },
    });

    const audience = await resolveSosAudience(alerting.userId, JAIPUR);
    expect(audience.userIds).not.toContain(optedOut.userId);
    expect(audience.userIds).not.toContain(stale.userId);
  }, 120_000);

  it('falls back to the trip group when NEARBY has no position to search from', async () => {
    const alerting = await registerAndLogin('nopos-alerting');
    const bystander = await registerAndLogin('nopos-bystander');
    await setLiveLocation(bystander.userId, NEAR);
    await prisma.profile.update({
      where: { userId: alerting.userId },
      data: { sosAudienceMode: 'NEARBY', sosRadiusKm: 25 },
    });

    // No coordinates means no circle — the alert still goes out, just to
    // the group, rather than guessing at where the person is.
    const audience = await resolveSosAudience(alerting.userId, null);
    expect(audience.userIds).not.toContain(bystander.userId);
    expect(audience.reach.nearbyCount).toBe(0);
  }, 120_000);

  it('alerts nearby travellers end to end and says truthfully who was reached', async () => {
    const alerting = await registerAndLogin('e2e-alerting');
    const near = await registerAndLogin('e2e-near');
    await setLiveLocation(near.userId, NEAR);
    await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${alerting.token}`)
      .send({ sosAudienceMode: 'NEARBY', sosRadiusKm: 5 });

    const sos = await request(app)
      .post('/api/v1/safety/sos')
      .set('Authorization', `Bearer ${alerting.token}`)
      .send({ latitude: JAIPUR.lat, longitude: JAIPUR.lng });
    expect(sos.status).toBe(201);
    expect(sos.body.data.reach.mode).toBe('NEARBY');
    expect(sos.body.data.reach.radiusKm).toBe(5);
    // Counts are not asserted exactly: this runs against the shared
    // DATABASE_URL, where other suites leave their own fresh positions
    // around Jaipur. What matters is that this traveller was reached and
    // that the confirmation describes the real, wider reach.
    expect(sos.body.data.reach.nearbyCount).toBeGreaterThanOrEqual(1);
    expect(sos.body.data.message).toContain('within 5 km');
    expect(sos.body.data.message).toContain('your trip group');

    // The stranger really is notified, and it survives them being offline.
    const notified = await prisma.notification.findFirst({
      where: { userId: near.userId, type: 'HAZARD' },
    });
    expect(notified).toBeTruthy();
  }, 120_000);

  it('refuses a radius beyond the cap rather than silently widening it', async () => {
    const alerting = await registerAndLogin('cap-alerting');
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${alerting.token}`)
      .send({ sosAudienceMode: 'NEARBY', sosRadiusKm: 500 });
    expect(res.status).toBe(400);

    const profile = await prisma.profile.findUnique({
      where: { userId: alerting.userId },
      select: { sosRadiusKm: true, sosAudienceMode: true },
    });
    expect(profile?.sosRadiusKm).toBe(5);
    expect(profile?.sosAudienceMode).toBe('TRIP_GROUP');
  }, 120_000);
});
