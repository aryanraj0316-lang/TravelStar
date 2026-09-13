import prisma from './db';

/**
 * Per-message SENT / DELIVERED / SEEN, WhatsApp's rule.
 *
 * For a message sent by S into a room whose other members are R:
 *   SEEN      when every member of R has a read receipt
 *   DELIVERED when every member of R has a delivery receipt
 *   SENT      otherwise
 *
 * In a DM |R| is 1, so this reduces to exactly the familiar one-tick /
 * two-tick / blue-tick behaviour. In a group it is WhatsApp's "all
 * recipients" rule, which is why a group message stays on two grey ticks
 * until the last person opens it.
 *
 * Status is only ever meaningful to the sender, so it is computed for the
 * caller's own messages and left off everyone else's.
 *
 * Counts are compared against the room's member count rather than loading
 * every receipt row — a busy room would otherwise pull thousands of rows to
 * render a tick.
 */

export type MessageStatus = 'SENT' | 'DELIVERED' | 'SEEN';

export async function statusesForOwnMessages(
  chatRoomId: string,
  senderId: string,
  messageIds: string[],
): Promise<Map<string, MessageStatus>> {
  const result = new Map<string, MessageStatus>();
  if (messageIds.length === 0) return result;

  const memberCount = await prisma.chatRoomMember.count({ where: { chatRoomId } });
  // Everyone except the sender is a recipient. A room the sender is alone in
  // has nobody to deliver to, so those messages stay SENT rather than
  // reporting themselves seen by a recipient set that is empty.
  const recipientCount = Math.max(0, memberCount - 1);

  if (recipientCount === 0) {
    for (const id of messageIds) result.set(id, 'SENT');
    return result;
  }

  const [delivered, read] = await Promise.all([
    prisma.messageDeliveryReceipt.groupBy({
      by: ['messageId'],
      where: { messageId: { in: messageIds }, userId: { not: senderId } },
      _count: { messageId: true },
    }),
    prisma.messageReadReceipt.groupBy({
      by: ['messageId'],
      where: { messageId: { in: messageIds }, userId: { not: senderId } },
      _count: { messageId: true },
    }),
  ]);

  const deliveredCounts = new Map(delivered.map((d) => [d.messageId, d._count.messageId]));
  const readCounts = new Map(read.map((r) => [r.messageId, r._count.messageId]));

  for (const id of messageIds) {
    if ((readCounts.get(id) ?? 0) >= recipientCount) result.set(id, 'SEEN');
    else if ((deliveredCounts.get(id) ?? 0) >= recipientCount) result.set(id, 'DELIVERED');
    else result.set(id, 'SENT');
  }

  return result;
}

/**
 * Records that these messages reached this user's device.
 *
 * Skips the user's own messages (a sender does not deliver to themselves)
 * and is idempotent, so the live path and the offline catch-up sweep can
 * both run over the same message without conflicting. Returns the ids that
 * were newly marked, so callers only broadcast a status change when
 * something actually changed.
 */
export async function recordDelivery(
  chatRoomId: string,
  userId: string,
  messageIds?: string[],
): Promise<string[]> {
  const undelivered = await prisma.message.findMany({
    where: {
      chatRoomId,
      senderId: { not: userId },
      ...(messageIds && messageIds.length > 0 ? { id: { in: messageIds } } : {}),
      deliveredTo: { none: { userId } },
    },
    select: { id: true },
    // A device coming back from a long time offline should not turn one
    // sweep into an unbounded write.
    take: 500,
  });

  if (undelivered.length === 0) return [];

  await prisma.messageDeliveryReceipt.createMany({
    data: undelivered.map((m) => ({ messageId: m.id, userId })),
    skipDuplicates: true,
  });

  return undelivered.map((m) => m.id);
}

export interface MessageAudience {
  userId: string;
  name: string;
  avatar: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

/**
 * Who has received and who has read one message — the group analogue of
 * WhatsApp's message info, which is what makes the aggregate "all
 * recipients" rule legible when a group message sits on two grey ticks.
 */
export async function audienceForMessage(messageId: string, senderId: string): Promise<MessageAudience[]> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      chatRoomId: true,
      chatRoom: {
        select: {
          members: {
            where: { userId: { not: senderId } },
            select: { userId: true, user: { select: { email: true, profile: true } } },
          },
        },
      },
      deliveredTo: { select: { userId: true, deliveredAt: true } },
      readBy: { select: { userId: true, readAt: true } },
    },
  });
  if (!message) return [];

  const deliveredAt = new Map(message.deliveredTo.map((d) => [d.userId, d.deliveredAt]));
  const readAt = new Map(message.readBy.map((r) => [r.userId, r.readAt]));

  return message.chatRoom.members.map((m) => ({
    userId: m.userId,
    name: m.user.profile
      ? `${m.user.profile.firstName} ${m.user.profile.lastName || ''}`.trim()
      : (m.user.email?.split('@')[0] ?? 'Member'),
    avatar: m.user.profile?.avatarUrl ?? null,
    deliveredAt: deliveredAt.get(m.userId)?.toISOString() ?? null,
    readAt: readAt.get(m.userId)?.toISOString() ?? null,
  }));
}
