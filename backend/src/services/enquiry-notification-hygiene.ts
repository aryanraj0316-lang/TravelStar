import prisma from './db';
import { logger } from '../lib/logger';

/**
 * A TRIP_ENQUIRY notification means exactly one thing: "a traveller is
 * waiting on you in this enquiry thread." So it may only exist while the
 * organizer still has an unread message in that thread — the moment they
 * have read it, by any route at all, the notification is meaningless.
 *
 * That invariant has to be enforced on read, not only on dismiss, because
 * the notification is written by a fire-and-forget call in the socket
 * `sendMessage` handler while the organizer's own client is concurrently
 * marking the room read. Whichever of the two lands second used to win:
 * when it was the notification, the organizer was left with an unread
 * alert for a message already open on their screen, and nothing would ever
 * clear it again — they had already opened the thread, so opening it again
 * was the only thing that could, which is exactly the "it comes back every
 * time I refresh, and the dot never goes out" behaviour.
 *
 * Pruning here instead makes the list and the badge self-healing: a row
 * that loses the race is deleted the next time either is computed.
 */
export async function pruneReadEnquiryNotifications(userId: string): Promise<void> {
  try {
    const rows = await prisma.notification.findMany({
      where: { userId, unread: true, category: 'TRIP_ENQUIRY', chatRoomId: { not: null } },
      select: { id: true, chatRoomId: true },
    });
    if (rows.length === 0) return;

    const roomIds = [...new Set(rows.map((r) => r.chatRoomId as string))];

    const [incoming, pending] = await Promise.all([
      // Threads the traveller has actually said something in. A thread that
      // was opened but never written in still has a standing "someone has
      // an enquiry" nudge to make, so it must not be pruned for having
      // nothing unread — there is nothing in it to read yet.
      prisma.message.findMany({
        where: { chatRoomId: { in: roomIds }, senderId: { not: userId }, isSystem: false },
        select: { chatRoomId: true },
        distinct: ['chatRoomId'],
      }),
      // Threads where something addressed to this user is genuinely still
      // unread — the same definition GET /chats counts with, minus the
      // per-membership joinedAt cutoff, which cannot apply to an enquiry
      // thread (both people are members from the moment it is created).
      prisma.message.findMany({
        where: {
          chatRoomId: { in: roomIds },
          senderId: { not: userId },
          isSystem: false,
          readBy: { none: { userId } },
        },
        select: { chatRoomId: true },
        distinct: ['chatRoomId'],
      }),
    ]);
    const hasSomethingToRead = new Set(incoming.map((m) => m.chatRoomId));
    const stillWaiting = new Set(pending.map((m) => m.chatRoomId));

    const staleIds = rows
      .filter((r) => {
        const roomId = r.chatRoomId as string;
        return hasSomethingToRead.has(roomId) && !stillWaiting.has(roomId);
      })
      .map((r) => r.id);
    if (staleIds.length === 0) return;

    await prisma.notification.deleteMany({ where: { id: { in: staleIds } } });
  } catch (err) {
    // Hygiene must never fail the request it is piggybacking on — a stale
    // row shown once is better than a notifications page that 500s.
    logger.warn('[TripEnquiry] Failed to prune read enquiry notifications:', err);
  }
}

/**
 * Whether this organizer still has an unread message waiting in that
 * enquiry thread. Used before writing a notification about it, so one is
 * never created for a thread the organizer has already caught up on.
 */
export async function organizerHasUnreadInEnquiry(
  organizerId: string,
  chatRoomId: string
): Promise<boolean> {
  const waiting = await prisma.message.count({
    where: {
      chatRoomId,
      senderId: { not: organizerId },
      isSystem: false,
      readBy: { none: { userId: organizerId } },
    },
  });
  return waiting > 0;
}
