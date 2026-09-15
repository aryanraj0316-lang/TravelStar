import type { Server as SocketIOServer } from 'socket.io';
import prisma from './db';
import { logger } from '../lib/logger';
import { sendPushToUsers, unreadCountFor } from '../lib/push';

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
 * Both moments that create something for the organizer to answer come
 * through here — the thread being opened, and each subsequent message from
 * the traveller — so the wording, the category, and the deep link stay in
 * one place rather than drifting between the REST route and the socket
 * server.
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
  io?: SocketIOServer | null;
}): Promise<void> {
  const { tripId, tripName, organizerId, chatRoomId, travellerName, preview, io } = opts;

  const title = `New enquiry — ${tripName}`;
  const content = preview
    ? `${travellerName}: ${preview}`
    : `${travellerName} has a question about ${tripName}.`;

  try {
    const notification = await prisma.notification.create({
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
