import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { sendPushToUsers, unreadCountFor } from '../src/lib/push';
import { uniqueTestPhone } from './test-phone';

/**
 * Integration tests for device-token registration, per-category push
 * preferences, and the unread/badge count (docs/REMEDIATION.md §8.18).
 *
 * The `pushNotifications` profile toggle used to do nothing at all: there
 * was no device-token table, no endpoint to register one, and
 * `expo-notifications` was not even a dependency — the switch wrote a
 * boolean nobody read. These cover the real endpoints behind it.
 *
 * No test here contacts the Expo push service: delivery needs a real
 * device token minted against an EAS project, which this environment has
 * none of. What is covered is everything on our side of that boundary.
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const createdNotificationIds: string[] = [];

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-push-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Push ${label}`, email, phoneNumber: uniqueTestPhone(), password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

function expoToken(suffix: string): string {
  return `ExponentPushToken[test-${runId}-${suffix}]`;
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('POST /api/v1/notifications/device-token', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/device-token')
      .send({ token: expoToken('unauth'), platform: 'ios' });
    expect(res.status).toBe(401);
  });

  it('rejects a token that is not an Expo push token', async () => {
    const user = await registerAndLogin('badtoken');
    const res = await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token: 'not-a-push-token', platform: 'ios' });
    expect(res.status).toBe(400);
  });

  it('stores the token and upserts rather than duplicating on re-registration', async () => {
    const user = await registerAndLogin('upsert');
    const token = expoToken('upsert');

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/v1/notifications/device-token')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ token, platform: 'android' });
      expect(res.status).toBe(200);
    }

    const rows = await prisma.deviceToken.findMany({ where: { userId: user.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe(token);
  });

  it('reassigns a device that signs in as someone else instead of duplicating it', async () => {
    const first = await registerAndLogin('handover-a');
    const second = await registerAndLogin('handover-b');
    const token = expoToken('handover');

    await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ token, platform: 'ios' });
    await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${second.token}`)
      .send({ token, platform: 'ios' });

    // Otherwise a shared phone keeps pushing the previous user's alerts.
    expect(await prisma.deviceToken.count({ where: { userId: first.userId } })).toBe(0);
    expect(await prisma.deviceToken.count({ where: { userId: second.userId } })).toBe(1);
  });

  it('unregisters only the caller\'s own device', async () => {
    const owner = await registerAndLogin('unreg-owner');
    const other = await registerAndLogin('unreg-other');
    const token = expoToken('unreg');

    await request(app)
      .post('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ token, platform: 'ios' });

    // Someone else's delete must not touch it.
    await request(app)
      .delete('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ token });
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);

    const res = await request(app)
      .delete('/api/v1/notifications/device-token')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ token });
    expect(res.status).toBe(200);
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(0);
  });
});

describe('GET/PUT /api/v1/notifications/preferences', () => {
  it('defaults every category to on', async () => {
    const user = await registerAndLogin('prefs-default');
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      pushNotifications: true,
      pushTripUpdates: true,
      pushHazardAlerts: true,
      pushSeasonal: true,
    });
  });

  it('persists a single category opt-out without touching the others', async () => {
    const user = await registerAndLogin('prefs-persist');
    const put = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ pushSeasonal: false });
    expect(put.status).toBe(200);

    const get = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`);
    expect(get.body.data).toEqual({
      pushNotifications: true,
      pushTripUpdates: true,
      pushHazardAlerts: true,
      pushSeasonal: false,
    });
  });

  it('rejects an empty body', async () => {
    const user = await registerAndLogin('prefs-empty');
    const res = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('counts unread broadcasts, not just personal rows', async () => {
    const user = await registerAndLogin('badge');

    const before = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${user.token}`);
    expect(before.status).toBe(200);
    const baseline = before.body.data.count as number;

    const personal = await prisma.notification.create({
      data: { userId: user.userId, type: 'TRIP', title: 'Personal', content: 'x', time: 'Just now' },
    });
    const broadcast = await prisma.notification.create({
      data: { userId: null, type: 'HAZARD', title: 'Broadcast', content: 'x', time: 'Just now' },
    });
    createdNotificationIds.push(personal.id, broadcast.id);

    const after = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${user.token}`);
    // The old counter looked only at rows with this userId, so the
    // broadcast never moved the badge at all.
    expect(after.body.data.count).toBe(baseline + 2);

    // Reading the broadcast decrements it for this user only.
    await request(app)
      .post(`/api/v1/notifications/${broadcast.id}/read`)
      .set('Authorization', `Bearer ${user.token}`);
    const read = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${user.token}`);
    expect(read.body.data.count).toBe(baseline + 1);

    // The legacy /interactions path now reports the same number.
    const legacy = await request(app)
      .get('/api/v1/interactions/unread-count')
      .set('Authorization', `Bearer ${user.token}`);
    expect(legacy.body.data.count).toBe(baseline + 1);
    expect(await unreadCountFor(user.userId)).toBe(baseline + 1);
  });
});

describe('the badge counts exactly what the Notifications page shows', () => {
  it('shows and counts a notification that merely mentions an emergency', async () => {
    const user = await registerAndLogin('badge-mention');
    const before = await unreadCountFor(user.userId);
    // Not an SOS — the app used to hide this while the server counted it,
    // so the icon badge stayed lit for something nobody could open.
    const mention = await prisma.notification.create({
      data: { userId: user.userId, type: 'TRIP', title: 'Packing list', content: 'Carry a small emergency kit.', time: 'Just now' },
    });
    createdNotificationIds.push(mention.id);
    expect(await unreadCountFor(user.userId)).toBe(before + 1);

    const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${user.token}`);
    expect((list.body.data as { id: string }[]).some((n) => n.id === mention.id)).toBe(true);
  });

  it('does not count a leftover SOS row it does not show', async () => {
    const user = await registerAndLogin('badge-sos');
    const before = await unreadCountFor(user.userId);
    const sos = await prisma.notification.create({
      data: { userId: user.userId, type: 'HAZARD', title: 'Emergency alert — A traveller', content: 'x', time: 'Just now' },
    });
    createdNotificationIds.push(sos.id);
    expect(await unreadCountFor(user.userId)).toBe(before);

    const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${user.token}`);
    expect((list.body.data as { id: string }[]).some((n) => n.id === sos.id)).toBe(false);
  });

  it('does not count a broadcast sent before the user signed up', async () => {
    const user = await registerAndLogin('badge-joined');
    const baseline = await unreadCountFor(user.userId);

    // Dated a day before this account existed: it shows as already read
    // and never lights their badge.
    const old = await prisma.notification.create({
      data: {
        userId: null,
        type: 'HAZARD',
        title: 'Old broadcast',
        content: 'x',
        time: 'Yesterday',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    createdNotificationIds.push(old.id);
    expect(await unreadCountFor(user.userId)).toBe(baseline);

    // One sent after they joined still counts.
    const fresh = await prisma.notification.create({
      data: { userId: null, type: 'HAZARD', title: 'New broadcast', content: 'x', time: 'Just now' },
    });
    createdNotificationIds.push(fresh.id);
    expect(await unreadCountFor(user.userId)).toBe(baseline + 1);
  });
});

describe('every push carries its own recipient badge', () => {
  it('sends each recipient their own unread count and notification id', async () => {
    const busy = await registerAndLogin('push-busy');
    const quiet = await registerAndLogin('push-quiet');
    for (const [u, suffix] of [[busy, 'busy'], [quiet, 'quiet']] as const) {
      const reg = await request(app)
        .post('/api/v1/notifications/device-token')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ token: expoToken(suffix), platform: 'android' });
      expect(reg.status).toBeLessThan(300);
    }

    // `busy` already has two unread; both get the new announcement.
    const earlier = await prisma.notification.createManyAndReturn({
      data: [1, 2].map((i) => ({ userId: busy.userId, type: 'TRIP' as const, title: `Earlier ${i}`, content: 'x', time: 'Just now' })),
    });
    const title = `Departure moved ${runId}`;
    const rows = await prisma.notification.createManyAndReturn({
      data: [busy, quiet].map((u) => ({ userId: u.userId, type: 'TRIP' as const, title, content: 'x', time: 'Just now' })),
    });
    createdNotificationIds.push(...earlier.map((r) => r.id), ...rows.map((r) => r.id));

    // Capture what goes to the Expo push service instead of sending it.
    const sentBodies: Array<Array<{ to: string; badge: number; data: Record<string, string> }>> = [];
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const batch = JSON.parse(String(init?.body));
      sentBodies.push(batch);
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
    });
    try {
      await sendPushToUsers([busy.userId, quiet.userId], 'TRIP', { title, body: 'x', data: { screen: 'trip' } });
    } finally {
      fetchSpy.mockRestore();
    }

    const sent = sentBodies.flat();
    const toBusy = sent.find((m) => m.to === expoToken('busy'));
    const toQuiet = sent.find((m) => m.to === expoToken('quiet'));
    // iOS reads `badge`; the Android patch reads `unreadCount`.
    expect(toBusy?.badge).toBe(3);
    expect(toBusy?.data.unreadCount).toBe('3');
    expect(toQuiet?.badge).toBe(1);
    expect(toQuiet?.data.unreadCount).toBe('1');
    // Each carries the id of that recipient's own row, so tapping it marks
    // exactly that notification read; the caller's own data is kept.
    expect(toBusy?.data.notificationId).toBe(rows.find((r) => r.userId === busy.userId)?.id);
    expect(toQuiet?.data.notificationId).toBe(rows.find((r) => r.userId === quiet.userId)?.id);
    expect(toBusy?.data.screen).toBe('trip');
  });

  it('reports what is unread by id and title for tidying the phone tray', async () => {
    const user = await registerAndLogin('push-summary');
    const row = await prisma.notification.create({
      data: { userId: user.userId, type: 'TRIP', title: `Summary ${runId}`, content: 'x', time: 'Just now' },
    });
    createdNotificationIds.push(row.id);

    const res = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${user.token}`);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.ids).toContain(row.id);
    expect(res.body.data.titles).toContain(`Summary ${runId}`);

    await request(app).post(`/api/v1/notifications/${row.id}/read`).set('Authorization', `Bearer ${user.token}`);
    const after = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${user.token}`);
    expect(after.body.data.ids ?? []).not.toContain(row.id);
  });
});

describe('reading a notification keeps it in the list', () => {
  it('clears the blue dot but does not delete it', async () => {
    const user = await registerAndLogin('keep-read');
    const personal = await prisma.notification.create({
      data: { userId: user.userId, type: 'TRIP', title: 'Kept after reading', content: 'x', time: 'Just now' },
    });
    createdNotificationIds.push(personal.id);

    const read = await request(app)
      .post(`/api/v1/notifications/${personal.id}/read`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(read.status).toBe(200);

    const row = await prisma.notification.findUnique({ where: { id: personal.id } });
    expect(row?.unread).toBe(false);

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${user.token}`);
    const listed = (list.body.data as { id: string; unread: boolean }[]).find((n) => n.id === personal.id);
    expect(listed).toBeDefined();
    expect(listed?.unread).toBe(false);
  });
});
