import type { Prisma } from '@prisma/client';
import prisma from './db';
import { removeUserLocation } from '../lib/presence-store';
import { logger } from '../lib/logger';

function clearPresence(userId: string) {
  // Redis availability must never prevent revoking database consent. Readers
  // still require locationSharing; stale cache entries also have a five-minute TTL.
  void removeUserLocation(userId).catch(() => logger.warn('[privacy] Presence cleanup deferred to cache expiry'));
}

// Every ordinary-location writer and the settings route take this same row
// lock. A delayed GPS update cannot republish a position after consent ends.
export async function withLocationLock<T>(
  userId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "userId" = ${userId} FOR UPDATE`;
    return action(tx);
  });
}

export async function updatePrivateProfile(userId: string, data: Prisma.ProfileUpdateInput) {
  return withLocationLock(userId, async (tx) => {
    const result = await tx.profile.update({
      where: { userId },
      data: {
        ...data,
        ...(data.locationSharing === false ? { guideLocationActive: false } : {}),
      },
    });
    if (data.locationSharing === false) {
      await tx.liveLocation.deleteMany({ where: { userId } });
      clearPresence(userId);
    }
    return result;
  });
}

export async function setGuideBroadcast(userId: string, active: boolean) {
  return withLocationLock(userId, async (tx) => {
    const profile = await tx.profile.findUnique({ where: { userId } });
    if (!profile || (active && !profile.locationSharing)) return false;
    await tx.profile.update({ where: { userId }, data: { guideLocationActive: active } });
    if (!active) {
      await tx.liveLocation.deleteMany({ where: { userId } });
      clearPresence(userId);
    }
    return true;
  });
}

export async function writeGuideLocation(userId: string, latitude: number, longitude: number) {
  return withLocationLock(userId, async (tx) => {
    const profile = await tx.profile.findUnique({ where: { userId } });
    if (!profile?.locationSharing || !profile.guideLocationActive) return null;
    await tx.liveLocation.deleteMany({ where: { userId } });
    return tx.liveLocation.create({ data: { userId, latitude, longitude } });
  });
}
