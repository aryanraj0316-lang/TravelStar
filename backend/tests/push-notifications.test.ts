import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { unreadCountFor } from '../src/lib/push';

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
    .send({ name: `Push ${label}`, email, password: 'correcthorsebattery' });
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
