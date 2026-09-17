import type { Server as SocketIOServer } from 'socket.io';
import prisma from './db';
import { logger } from '../lib/logger';
import { sendPushToUsers, unreadCountFor } from '../lib/push';
import { organizerHasUnreadInEnquiry } from './enquiry-notification-hygiene';

/**
 * Tells a trip's organizer that a traveller is waiting on them in that
 * trip's enquiry thread.
 *
 * A pre-join question opens a ChatRoom carrying `inquiryTripId`, which the
 * organizer portal's Chats & Approvals section is built to list — but
 * nothing ever told the organizer the thread existed. The room was created
 * and the message stored silently, so unless the organizer happened to open
 * that tab and scroll, a traveller asking "is there still room?" waited on
 * an answer that was never coming.
 *
 * When a traveller sends a question in an enquiry thread, this tells the
 * organizer with push and in-app notifications so they can answer promptly.
 */
export async function notifyTripEnquiry(opts: {
  tripId: string;
  tripName: string;
  organizerId: string;
  chatRoomId: string;
  /** Display name of the traveller asking. */
  travellerName: string;
  /** The message body, when this is a message rather than the thread opening. */
  preview?: string | null;
  /**
   * What produced this nudge. A 'MESSAGE' is only worth telling the
   * organizer about while they still have it unread — see the read-state
   * gate below. 'THREAD_OPENED' has no message to have read yet.
   */
  trigger?: 'MESSAGE' | 'THREAD_OPENED';
  io?: SocketIOServer | null;
}): Promise<void> {
  const { tripId, tripName, organizerId, chatRoomId, travellerName, preview, io } = opts;
  const trigger = opts.trigger ?? 'MESSAGE';

  const title = `New enquiry — ${tripName}`;
  const content = `${travellerName} has an enquiry about ${tripName}.`;

  try {
    // This runs fire-and-forget from the socket `sendMessage` handler, so
    // it can land *after* the organizer's own client has already marked
    // the room read — which is precisely what left them staring at an
    // alert for a message that was open on their screen, with nothing left
    // that would ever clear it. If they are already caught up, there is
    // nothing to nudge them about: drop any row for this thread instead.
    if (trigger === 'MESSAGE' && !(await organizerHasUnreadInEnquiry(organizerId, chatRoomId))) {
      await prisma.notification.deleteMany({
        where: { userId: organizerId, category: 'TRIP_ENQUIRY', chatRoomId },
      });
      return;
    }

    const recentNotification = await prisma.notification.findFirst({
      where: {
        userId: organizerId,
        category: 'TRIP_ENQUIRY',
        chatRoomId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    let notification;
    if (recentNotification) {
      notification = await prisma.notification.update({
        where: { id: recentNotification.id },
        data: { title, content, unread: true },
      });
    } else {
      notification = await prisma.notification.create({
        data: {
          userId: organizerId,
          type: 'TRIP',
          category: 'TRIP_ENQUIRY',
          title,
          content,
          time: 'Just now',
          tripId,
          chatRoomId,
        },
      });
    }

    // The other half of the same race: the organizer's read receipt can
    // land while the write above is in flight. Re-checking here means the
    // row cannot outlive their having read the thread in either ordering,
    // and they get no push or banner for something already read.
    if (trigger === 'MESSAGE' && !(await organizerHasUnreadInEnquiry(organizerId, chatRoomId))) {
      await prisma.notification.deleteMany({
        where: { userId: organizerId, category: 'TRIP_ENQUIRY', chatRoomId },
      });
      return;
    }

    io?.to(organizerId).emit('notificationReceived', {
      id: notification.id,
      userId: organizerId,
      type: 'TRIP',
      category: 'TRIP_ENQUIRY',
      title,
      content,
      unread: true,
      tripId,
      chatRoomId,
    });

    await sendPushToUsers([organizerId], 'TRIP', {
      title,
      body: content,
      // Deep-links into the organizer portal's own enquiry list rather than
      // the generic chat inbox — this is a trip the organizer is running,
      // and answering it usually means approving or declining a join
      // request in the same place.
      data: { screen: 'group-organizer', tripId, chatRoomId },
      badge: await unreadCountFor(organizerId),
    });
  } catch (err) {
    // Never fail the enquiry itself over its notification — the thread and
    // the message are the real product, this is the nudge on top.
    logger.warn('[TripEnquiry] Failed to notify organizer:', err);
  }
}
