import request from 'supertest';
import app from '../src/app';
import prisma from '../src/services/db';
import { purgeStaleLiveLocations } from '../src/lib/data-retention';

/**
 * Automated location-retention purge (docs/REMEDIATION.md §12.5 —
 * "location history especially — do not keep it indefinitely").
 *
 * Runs against the real configured DATABASE_URL.
 */

const runId = Date.now();
const createdEmails: string[] = [];
const T = 90_000;

async function registerAndLogin(label: string): Promise<{ userId: string; token: string }> {
  const email = `test-retention-${label}-${runId}@travelstar.test`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Retention ${label}`, email, password: 'correcthorsebattery' });
  return { userId: res.body.data.user.id, token: res.body.data.token };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('purgeStaleLiveLocations (§12.5)', () => {
  it('deletes a location row older than the retention window', async () => {
    const user = await registerAndLogin('stale');
    await prisma.liveLocation.create({
      data: {
        userId: user.userId,
        latitude: 26.9124,
        longitude: 75.7873,
        updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h old
      },
    });

    const purged = await purgeStaleLiveLocations(24 * 60 * 60 * 1000);
    expect(purged).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.liveLocation.findMany({ where: { userId: user.userId } });
    expect(remaining).toHaveLength(0);
  }, T);

  it('leaves a fresh location row untouched', async () => {
    const user = await registerAndLogin('fresh');
    await prisma.liveLocation.create({
      data: { userId: user.userId, latitude: 19.076, longitude: 72.8777, updatedAt: new Date() },
    });

    await purgeStaleLiveLocations(24 * 60 * 60 * 1000);

    const remaining = await prisma.liveLocation.findMany({ where: { userId: user.userId } });
    expect(remaining).toHaveLength(1);
  }, T);

  it('respects a custom retention window', async () => {
    const user = await registerAndLogin('custom-window');
    await prisma.liveLocation.create({
      data: {
        userId: user.userId,
        latitude: 19.076,
        longitude: 72.8777,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes old
      },
    });

    // A 5-minute window makes even this recent row stale.
    const purged = await purgeStaleLiveLocations(5 * 60 * 1000);
    expect(purged).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.liveLocation.findMany({ where: { userId: user.userId } });
    expect(remaining).toHaveLength(0);
  }, T);
});
