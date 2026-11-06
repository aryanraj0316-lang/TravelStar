import path from 'path';
import fs from 'fs/promises';
import prisma from './db';
import { removeUserLocation } from '../lib/presence-store';

export function localMediaFilename(url: string | null): string | null {
  if (!url) return null;
  try {
    const name = new URL(url).pathname.match(/^\/uploads\/([a-zA-Z0-9.-]+)$/)?.[1];
    return name?.startsWith('story-') ? name : null;
  } catch {
    return null;
  }
}

export async function eraseAccount(userId: string) {
  // Capture legacy disk filenames BEFORE deleting their only attribution.
  // New uploads include the owner even if never attached to a story.
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const stories = await tx.travelStory.findMany({ where: { userId }, select: { mediaUrl: true, coverImg: true } });
      const ownedTrips = await tx.trip.findMany({ where: { creatorId: userId }, select: { id: true } });
      const tripIds = ownedTrips.map((t) => t.id);
      const requests = await tx.joinRequest.findMany({ where: { userId }, select: { id: true, tripId: true } });
      const requestedTripIds = requests.map((r) => r.tripId);
      const roomRows = await tx.chatRoom.findMany({
        where: {
          OR: [
            { tripId: { in: [...tripIds, ...requestedTripIds] } },
            { inquiryTripId: { in: tripIds } },
            { inquiryUserId: userId },
            { dmUserAId: userId },
            { dmUserBId: userId },
            { members: { some: { userId } } },
          ],
        },
        select: { id: true, inquiryUserId: true, dmUserAId: true, dmUserBId: true },
      });
      const roomIds = roomRows.map((r) => r.id);
      const personalRoomIds = roomRows
        .filter((r) => [r.inquiryUserId, r.dmUserAId, r.dmUserBId].includes(userId))
        .map((r) => r.id);
      const candidates = [
        ...new Set(
          stories
            .flatMap((s) => [s.mediaUrl, s.coverImg])
            .flatMap((url) => {
              const filename = localMediaFilename(url);
              return filename ? [filename] : [];
            }),
        ),
      ];
      const files: string[] = [];
      for (const filename of candidates) {
        const owner = filename.match(/^story-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i)?.[1];
        if (owner && owner !== userId) continue;
        // Legacy files had no owner in their names; preserve a file still
        // referenced by somebody else's story rather than erasing their media.
        if (
          !owner &&
          (await tx.travelStory.count({
            where: {
              userId: { not: userId },
              OR: [
                { mediaUrl: { endsWith: `/uploads/${filename}` } },
                { coverImg: { endsWith: `/uploads/${filename}` } },
              ],
            },
          }))
        )
          continue;
        files.push(filename);
      }
      await tx.mediaErasureJob.create({
        data: { ownerId: userId, localFiles: files, finishAfter: new Date(Date.now() + 10 * 60_000) },
      });
      await tx.storyLike.deleteMany({ where: { userId } });
      await tx.storyView.deleteMany({ where: { userId } });
      await tx.travelStory.deleteMany({ where: { userId } });
      await tx.review.deleteMany({ where: { reviewerId: userId } });
      await tx.mapPin.deleteMany({ where: { targetId: userId, type: { in: ['GUIDE', 'TOURIST'] } } });
      await tx.notification.deleteMany({
        where: {
          OR: [
            { userId },
            { subjectUserId: userId },
            { subjectUserId: null, title: { startsWith: 'Booking cancelled' }, tripId: { in: requestedTripIds } },
            { joinRequestId: { in: requests.map((r) => r.id) } },
            { tripId: { in: tripIds } },
            { chatRoomId: { in: personalRoomIds } },
          ],
        },
      });
      // Old system announcements copied traveller names into organizer-authored
      // messages without recording the subject. Clear these announcements in
      // affected rooms, rather than leaving identifying snapshots behind.
      await tx.message.deleteMany({
        where: {
          OR: [{ subjectUserId: userId }, { isSystem: true, subjectUserId: null, chatRoomId: { in: roomIds } }],
        },
      });
      await tx.callLog.deleteMany({ where: { OR: [{ initiatorId: userId }, { receiverId: userId }] } });
      await tx.adminLog.deleteMany({ where: { adminId: userId } });
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.booking.deleteMany({ where: { OR: [{ userId }, { guide: { userId } }, { tripId: { in: tripIds } }] } });
      await tx.chatRoom.deleteMany({
        where: { OR: [{ tripId: { in: tripIds } }, { inquiryTripId: { in: tripIds } }] },
      });
      await tx.group.deleteMany({ where: { creatorId: userId } });
      await tx.trip.deleteMany({ where: { creatorId: userId } });
      await tx.user.delete({ where: { id: userId } });
      return { filesQueued: true };
    },
    { timeout: 30_000 },
  );
}

export async function eraseLocalMedia(userId: string, legacyFiles: string[]) {
  await removeUserLocation(userId);
  const root = path.resolve(process.cwd(), 'uploads');
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  const targets = new Set([...legacyFiles, ...entries.filter((n) => n.startsWith(`story-${userId}-`))]);
  for (const name of targets) {
    if (!/^story-[a-zA-Z0-9.-]+$/.test(name) || path.basename(name) !== name) throw new Error('Unsafe media path');
    const owner = name.match(/^story-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i)?.[1];
    if (owner && owner !== userId) continue;
    await fs.rm(path.join(root, name), { force: true });
  }
}
