import { Router } from 'express';
import { z } from 'zod';
import { NotificationCategory } from '@prisma/client';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { ObjectStorageNotConfiguredError, createChatMediaUploadUrl } from '../../lib/object-storage';
import { audienceForMessage, recordDelivery, statusesForOwnMessages } from '../../services/message-status';

const router = Router();

const roomIdParamSchema = z.object({ id: z.string().uuid() });
const messagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Asserts the caller is a member of the given chat room. Every route below
 * that reads or writes a specific room's data must call this first — without
 * it, any authenticated user (not just an unauthenticated one) could read or
 * mark-read any chat room's messages by guessing its id. This mirrors the
 * membership check the socket layer enforces in backend/src/socket-server.ts
 * (docs/REMEDIATION.md §3.2) for the REST path.
 */
async function assertChatRoomMember(
  res: { status: (c: number) => { json: (b: unknown) => unknown } },
  chatRoomId: string,
  userId: string,
): Promise<boolean> {
  let membership = await prisma.chatRoomMember.findUnique({
    where: { chatRoomId_userId: { chatRoomId, userId } },
  });
  if (!membership) {
    // Check if user is trip creator or confirmed member of the associated trip
    const room = await prisma.chatRoom.findUnique({
      where: { id: chatRoomId },
      include: { trip: { include: { members: true } } },
    });
    if (
      room?.trip &&
      // A TripMember row only exists once a seat was actually claimed
      // (see services/trip-membership.ts), so its presence IS confirmation —
      // there is no `status` field on it to check.
      (room.trip.creatorId === userId || room.trip.members.some((m) => m.userId === userId))
    ) {
      membership = await prisma.chatRoomMember.upsert({
        where: { chatRoomId_userId: { chatRoomId, userId } },
        create: { chatRoomId, userId },
        update: {},
      });
    }
  }
  if (!membership) {
    res
      .status(403)
      .json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this chat room.' } });
    return false;
  }
  return true;
}

// 1. Get list of all chat rooms for current user
router.get('/', async (req, res) => {
  const tokenUserId = requireUserId(req);

  try {
    // Ensure all trips where user is creator or confirmed member have a ChatRoom & ChatRoomMember
    const userTrips = await prisma.trip.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [{ creatorId: tokenUserId }, { members: { some: { userId: tokenUserId } } }],
      },
      include: { chatRoom: true },
    });
    for (const trip of userTrips) {
      let roomId = trip.chatRoom?.id;
      if (!roomId) {
        const newRoom = await prisma.chatRoom.create({
          data: { isGroup: true, name: trip.name, tripId: trip.id },
        });
        roomId = newRoom.id;
      }
      await prisma.chatRoomMember.upsert({
        where: { chatRoomId_userId: { chatRoomId: roomId, userId: tokenUserId } },
        create: { chatRoomId: roomId, userId: tokenUserId },
        update: {},
      });
    }

    const memberships = await prisma.chatRoomMember.findMany({
      where: { userId: tokenUserId },
      include: {
        chatRoom: {
          include: {
            trip: true,
            inquiryTrip: { select: { id: true, name: true, creatorId: true } },
            members: {
              include: {
                user: {
                  include: { profile: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                sender: {
                  include: { profile: true },
                },
              },
            },
          },
        },
      },
    });

    // Single query for unread counts across every room instead of one
    // `count()` per room (docs/REMEDIATION.md §5.9) — the per-room
    // `createdAt >= joinedAt` cutoff still varies per membership, so the
    // grouping happens in memory over this one result set.
    const roomIds = memberships.map((m) => m.chatRoomId);
    const unreadCandidates = roomIds.length
      ? await prisma.message.findMany({
          where: {
            chatRoomId: { in: roomIds },
            senderId: { not: tokenUserId },
            isSystem: false,
            readBy: { none: { userId: tokenUserId } },
          },
          select: { id: true, chatRoomId: true, createdAt: true },
        })
      : [];
    const joinedAtByRoom = new Map(memberships.map((m) => [m.chatRoomId, m.joinedAt]));
    const unreadCountByRoom = new Map<string, number>();
    for (const msg of unreadCandidates) {
      const joinedAt = joinedAtByRoom.get(msg.chatRoomId);
      if (joinedAt && msg.createdAt < joinedAt) continue;
      unreadCountByRoom.set(msg.chatRoomId, (unreadCountByRoom.get(msg.chatRoomId) ?? 0) + 1);
    }

    const rooms = memberships.map((m) => {
      const room = m.chatRoom;
      const trip = room.trip;
      const otherMember = !room.isGroup ? room.members.find((mb) => mb.userId !== tokenUserId) : null;
      const otherName = otherMember?.user?.profile
        ? `${otherMember.user.profile.firstName} ${otherMember.user.profile.lastName}`.trim()
        : otherMember?.user?.email
          ? otherMember.user.email.split('@')[0]
          : null;
      const otherAvatar = otherMember?.user?.profile?.avatarUrl ?? null;

      // An enquiry thread is labelled with the trip it is about, so it does
      // not sit in the inbox as a bare DM with no context.
      const roomName = room.inquiryTrip
        ? (otherName ? otherName + ' · ' + room.inquiryTrip.name : 'Enquiry · ' + room.inquiryTrip.name)
        : (room.name || otherName || trip?.name || (room.isGroup ? 'Group Chat' : 'Direct Chat'));
      const roomAvatar = (!room.isGroup && otherAvatar) ? otherAvatar : (trip?.coverImage ?? otherAvatar ?? null);
      // An enquiry is a one-to-one conversation between a traveller and an
      // organizer, so it belongs under Direct Messages. Every non-group room
      // used to be typed 'GUIDE' regardless, which filed enquiries under
      // Guides as though the organizer were a hired guide — and left the
      // client's own 'DMS' filter permanently empty, since nothing ever
      // returned 'DM'.
      const roomType = room.isGroup ? 'GROUP' : (room.inquiryTripId || room.dmUserAId) ? 'DM' : 'GUIDE';

      const displayMsg = room.messages[0];
      const isMe = displayMsg?.senderId === tokenUserId;
      let lastMsgPreview = '';
      if (displayMsg) {
        let displayContent = displayMsg.content || '';
        if (displayMsg.mediaType === 'IMAGE') {
          displayContent = displayContent && !displayContent.includes('📷') ? displayContent : 'Photo';
        } else if (displayMsg.mediaType === 'LOCATION') {
          displayContent = displayContent || 'Location shared';
        } else if (displayMsg.mediaType === 'VOICE') {
          displayContent = 'Voice note';
        }

        if (displayMsg.isSystem) {
          lastMsgPreview = displayContent;
        } else if (isMe) {
          lastMsgPreview = `You: ${displayContent}`;
        } else if (room.isGroup) {
          const senderName =
            displayMsg.sender?.profile?.firstName ||
            displayMsg.sender?.email?.split('@')[0] ||
            'Member';
          lastMsgPreview = `${senderName}: ${displayContent}`;
        } else {
          lastMsgPreview = displayContent;
        }
      }

      const unreadCount = unreadCountByRoom.get(room.id) ?? 0;
      const sortDate = room.messages[0]?.createdAt || room.createdAt;

      return {
        id: room.id,
        tripId: trip?.id || null,
        name: roomName,
        avatar: roomAvatar,
        type: roomType,
        latestMessage: lastMsgPreview,
        // A real ISO timestamp always — the room's own creation time when
        // there is no message yet, never the literal string 'Just Now',
        // which is not a parseable date and broke every client-side
        // date formatter that touched an empty room.
        latestTime: (displayMsg?.createdAt ?? room.createdAt).toISOString(),
        unread: unreadCount > 0,
        unreadCount,
        badge: room.isGroup
          ? (trip?.creatorId === tokenUserId ? 'Organizer' : 'Member')
          : 'Direct',
        lastMessageAt: sortDate.toISOString(),
        // This user's own membership row — `m` is always their own, since
        // `memberships` was fetched by `userId: tokenUserId` above.
        muted: m.muted,
        inquiryTripId: room.inquiryTripId,
        inquiryTripName: room.inquiryTrip?.name ?? null,
        // True only for the organizer's own side of a pre-join enquiry
        // thread — that side belongs solely in the organizer portal's
        // Chats & Approvals tab, never the general chat inbox. The
        // traveller's side of the same thread has this false, since to
        // them it is just a DM.
        isMyOrganizerInquiry: !!(room.inquiryTripId && room.inquiryTrip?.creatorId === tokenUserId),
      };
    });

    rooms.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return res.status(200).json({ ok: true, data: rooms });
  } catch (err) {
    logger.warn('[Chats] Get chat rooms list error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve chat rooms' } });
  }
});

/**
 * Open (or reopen) the enquiry thread between this traveller and a trip's
 * organizer.
 *
 * Deliberately not gated on join state: the point is to ask questions
 * *before* requesting a seat, which is when someone most needs an answer.
 * Idempotent — the (inquiryTripId, inquiryUserId) unique index means
 * tapping "Ask the organizer" twice returns the same thread rather than
 * spawning a second one the organizer would have to reconcile.
 */
router.post('/inquiry', async (req, res) => {
  const parsed = z.object({ tripId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid trip id.' } });
  }
  const { tripId } = parsed.data;
  const tokenUserId = requireUserId(req);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, name: true, creatorId: true },
    });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
    }
    if (trip.creatorId === tokenUserId) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'SELF_INQUIRY', message: 'This is your own trip.' } });
    }

    const existing = await prisma.chatRoom.findUnique({
      where: { inquiryTripId_inquiryUserId: { inquiryTripId: tripId, inquiryUserId: tokenUserId } },
      select: { id: true },
    });
    if (existing) {
      return res.status(200).json({ ok: true, data: { chatRoomId: existing.id, tripId, tripName: trip.name } });
    }

    const room = await prisma.chatRoom.create({
      data: {
        isGroup: false,
        name: null,
        inquiryTripId: tripId,
        inquiryUserId: tokenUserId,
        members: { create: [{ userId: tokenUserId }, { userId: trip.creatorId }] },
      },
      select: { id: true },
    });

    return res.status(201).json({ ok: true, data: { chatRoomId: room.id, tripId, tripName: trip.name } });
  } catch (err) {
    logger.warn('[Chats] Create inquiry error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to open the enquiry.' } });
  }
});

/**
 * Open (or reopen) a plain 1:1 direct-message thread with another user.
 *
 * dmUserAId/dmUserBId are stored sorted (smaller id first) so the unique
 * index catches the thread regardless of which of the two users opens it
 * first — without the sort, (A,B) and (B,A) would each create a room.
 */
router.post('/dm', async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid user id.' } });
  }
  const { userId: otherUserId } = parsed.data;
  const tokenUserId = requireUserId(req);

  if (otherUserId === tokenUserId) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'SELF_DM', message: 'You cannot direct message yourself.' } });
  }

  try {
    const otherUser = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
    if (!otherUser) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
    }

    const [dmUserAId, dmUserBId] = [tokenUserId, otherUserId].sort() as [string, string];

    const existing = await prisma.chatRoom.findUnique({
      where: { dmUserAId_dmUserBId: { dmUserAId, dmUserBId } },
      select: { id: true },
    });
    if (existing) {
      return res.status(200).json({ ok: true, data: { chatRoomId: existing.id } });
    }

    const room = await prisma.chatRoom.create({
      data: {
        isGroup: false,
        name: null,
        dmUserAId,
        dmUserBId,
        members: { create: [{ userId: tokenUserId }, { userId: otherUserId }] },
      },
      select: { id: true },
    });

    return res.status(201).json({ ok: true, data: { chatRoomId: room.id } });
  } catch (err) {
    logger.warn('[Chats] Create DM error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to open the direct message.' } });
  }
});

// 2. Get chat room details by ID
router.get('/:id', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const { id } = parsedParams.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const room = await prisma.chatRoom.findUnique({
      where: { id },
      include: {
        trip: true,
        inquiryTrip: true,
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Chat room not found' } });
    }

    const tripObj = room.trip || room.inquiryTrip;
    const organizerId = tripObj?.creatorId;

    const membersList = room.members.map((m) => ({
      id: m.user.id,
      name: m.user.profile
        ? `${m.user.profile.firstName} ${m.user.profile.lastName}`.trim()
        : m.user.email
          ? m.user.email.split('@')[0]
          : 'Member',
      avatar: m.user.profile?.avatarUrl ?? null,
      role: m.user.id === organizerId ? 'Organizer' : 'Member',
    }));

    const otherMember = !room.isGroup ? room.members.find((m) => m.user.id !== tokenUserId) : null;
    const otherName = otherMember?.user?.profile
      ? `${otherMember.user.profile.firstName} ${otherMember.user.profile.lastName}`.trim()
      : otherMember?.user?.email
        ? otherMember.user.email.split('@')[0]
        : null;
    const roomName = room.name || (room.inquiryTrip ? (otherName ? `${otherName} · ${room.inquiryTrip.name}` : `Enquiry · ${room.inquiryTrip.name}`) : (otherName || room.trip?.name || (room.isGroup ? 'Group Chat' : 'Direct Chat')));
    const roomAvatar = (!room.isGroup && otherMember?.user?.profile?.avatarUrl)
      ? otherMember.user.profile.avatarUrl
      : (tripObj?.coverImage ?? otherMember?.user?.profile?.avatarUrl ?? null);

    const selfMembership = room.members.find((m) => m.user.id === tokenUserId);

    return res.status(200).json({
      ok: true,
      data: {
        id: room.id,
        tripId: tripObj?.id || null,
        name: roomName,
        avatar: roomAvatar,
        type: room.isGroup ? 'GROUP' : (room.inquiryTripId || room.dmUserAId) ? 'DM' : 'GUIDE',
        members: membersList,
        muted: selfMembership?.muted ?? false,
        // The same two fields GET /chats reports. A client that meets a room
        // through this endpoint first — a deep link into a thread its inbox
        // has not listed yet — would otherwise have no way to tell an
        // enquiry it is the organizer of from an ordinary DM, and would file
        // it in the chat inbox, which is exactly where it must never appear.
        inquiryTripId: room.inquiryTripId,
        isMyOrganizerInquiry: !!(room.inquiryTripId && room.inquiryTrip?.creatorId === tokenUserId),
      },
    });
  } catch (err) {
    logger.warn('[Chats] Get chat room details error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve chat room details' } });
  }
});

// 3. Get message history by chat room ID — cursor-paginated, newest page
// first (docs/REMEDIATION.md §5.9). `cursor` is the id of the oldest message
// already loaded by the caller; omit it for the first page.
router.get('/:id/messages', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  const parsedQuery = messagesQuerySchema.safeParse(req.query);
  if (!parsedParams.success || !parsedQuery.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid request.' } });
  }
  const { id } = parsedParams.data;
  const { cursor, take } = parsedQuery.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const dbMessages = await prisma.message.findMany({
      where: { chatRoomId: id },
      include: {
        sender: {
          include: { profile: true },
        },
        chatRoom: {
          include: { trip: true, inquiryTrip: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = dbMessages.length > take;
    const page = hasMore ? dbMessages.slice(0, take) : dbMessages;

    // Ticks are only meaningful to the person who sent the message, so this
    // is computed for the caller's own messages and left off everyone
    // else's — see services/message-status.ts.
    const ownMessageIds = page.filter((m) => m.senderId === tokenUserId && !m.isSystem).map((m) => m.id);
    const statuses = await statusesForOwnMessages(id, tokenUserId, ownMessageIds);

    const history = page
      .map((m) => {
        let name = 'System';
        let role = 'SYSTEM';
        let avatar: string | null = null;

        if (!m.isSystem) {
          name = m.sender?.profile
            ? `${m.sender.profile.firstName} ${m.sender.profile.lastName}`.trim()
            : m.sender?.email
              ? (m.sender.email.split('@')[0] ?? 'Member')
              : 'Member';
          const tripCreatorId = m.chatRoom?.trip?.creatorId || m.chatRoom?.inquiryTrip?.creatorId;
          role = m.senderId === tripCreatorId ? 'Organizer' : 'Tourist';
          avatar = m.sender?.profile?.avatarUrl ?? null;
        }

        return {
          id: m.id,
          senderId: m.senderId,
          senderName: name,
          senderRole: role,
          senderAvatar: avatar,
          avatar: avatar,
          content: m.content || '',
          timestamp: m.createdAt.toISOString(),
          createdAt: m.createdAt.toISOString(),
          mediaType: m.mediaType || 'NONE',
          mediaUrl: m.mediaUrl || null,
          // Set only on LOCATION messages — a shared pin's coordinates.
          latitude: m.latitude,
          longitude: m.longitude,
          status: statuses.get(m.id) ?? null,
        };
      })
      .reverse(); // chronological order for display

    return res
      .status(200)
      .json({ ok: true, data: history, meta: { cursor: hasMore ? (page[0]?.id ?? undefined) : undefined } });
  } catch (err) {
    logger.warn('[Chats] Get message history error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve chat messages' } });
  }
});

// 4. Mark all messages in a chat room as read for the current user
router.post('/:id/read', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const { id } = parsedParams.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const messagesToRead = await prisma.message.findMany({
      where: {
        chatRoomId: id,
        senderId: { not: tokenUserId },
        isSystem: false,
        readBy: {
          none: {
            userId: tokenUserId,
          },
        },
      },
      select: { id: true },
    });

    if (messagesToRead.length > 0) {
      await prisma.$transaction(
        messagesToRead.map((m) =>
          prisma.messageReadReceipt.upsert({
            where: {
              messageId_userId: {
                messageId: m.id,
                userId: tokenUserId,
              },
            },
            create: {
              messageId: m.id,
              userId: tokenUserId,
            },
            update: {},
          }),
        ),
      );
    }

    // Dismiss / clear any notification for this chat room once opened / marked read
    const room = await prisma.chatRoom.findUnique({
      where: { id },
      select: { id: true, tripId: true, inquiryTripId: true },
    }).catch(() => null);

    const roomIdsToClear = [id];
    if (room?.id) roomIdsToClear.push(room.id);
    if (room?.tripId) roomIdsToClear.push(room.tripId, `room-${room.tripId}`);
    if (room?.inquiryTripId) roomIdsToClear.push(room.inquiryTripId, `room-${room.inquiryTripId}`);

    const tripIdsToClear: string[] = [];
    if (room?.tripId) tripIdsToClear.push(room.tripId);
    if (room?.inquiryTripId) tripIdsToClear.push(room.inquiryTripId);

    await prisma.notification.deleteMany({
      where: {
        userId: tokenUserId,
        OR: [
          { chatRoomId: { in: roomIdsToClear } },
          ...(tripIdsToClear.length > 0
            ? [{
                tripId: { in: tripIdsToClear },
                category: {
                  in: [
                    NotificationCategory.TRIP_ENQUIRY,
                    NotificationCategory.JOIN_ACCEPTED,
                    NotificationCategory.CHAT_ADDED,
                  ],
                },
              }]
            : []),
        ],
      },
    }).catch((err) => {
      logger.warn('[Chats] Failed to clear notifications for chat room:', err);
    });

    // Mark broadcast notifications as read for this user
    const broadcasts = await prisma.notification.findMany({
      where: {
        userId: null,
        OR: [
          { chatRoomId: { in: roomIdsToClear } },
          ...(tripIdsToClear.length > 0 ? [{ tripId: { in: tripIdsToClear } }] : []),
        ],
      },
      select: { id: true },
    }).catch(() => []);

    if (broadcasts && broadcasts.length > 0) {
      await prisma.notificationRead.createMany({
        data: broadcasts.map((b) => ({ notificationId: b.id, userId: tokenUserId })),
        skipDuplicates: true,
      }).catch(() => {});
    }

    const io = req.app.get('socketio');

    // Notify user's personal socket room to refresh notifications badge immediately
    io?.to(tokenUserId).emit('notificationRead', { chatRoomId: id });

    // One batched event, not one per message: opening a room with 200
    // unread would otherwise fan out 200 socket emits to update ticks.
    if (messagesToRead.length > 0) {
      io?.to(id).emit('messageRead', {
        roomId: id,
        messageIds: messagesToRead.map((m) => m.id),
        userId: tokenUserId,
      });
    }

    return res.status(200).json({ ok: true, data: { message: 'Messages marked as read' } });
  } catch (err) {
    logger.warn('[Chats] Mark messages read error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to mark messages as read' } });
  }
});

/**
 * Catch-up sweep across every room the caller is in.
 *
 * The per-room sweep below only runs when a room is opened, so a message
 * sitting in a room the user never visits stayed undelivered indefinitely
 * and its sender's ticks never advanced. This runs on app foreground, which
 * is the moment the device genuinely has everything.
 */
router.post('/delivered', async (req, res) => {
  const tokenUserId = requireUserId(req);

  try {
    const memberships = await prisma.chatRoomMember.findMany({
      where: { userId: tokenUserId },
      select: { chatRoomId: true },
    });

    const io = req.app.get('socketio');
    let total = 0;

    for (const { chatRoomId } of memberships) {
      const newlyDelivered = await recordDelivery(chatRoomId, tokenUserId);
      if (newlyDelivered.length === 0) continue;
      total += newlyDelivered.length;
      io?.to(chatRoomId).emit('messageDelivered', {
        roomId: chatRoomId,
        messageIds: newlyDelivered,
        userId: tokenUserId,
      });
    }

    return res.status(200).json({ ok: true, data: { delivered: total, rooms: memberships.length } });
  } catch (err) {
    logger.warn('[Chats] Delivery sweep error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to sweep deliveries' } });
  }
});

/**
 * Catch-up delivery sweep for one room, when it is opened. Idempotent.
 */
router.post('/:id/delivered', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const { id } = parsedParams.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const newlyDelivered = await recordDelivery(id, tokenUserId);
    if (newlyDelivered.length > 0) {
      const io = req.app.get('socketio');
      io?.to(id).emit('messageDelivered', { roomId: id, messageIds: newlyDelivered, userId: tokenUserId });
    }

    return res.status(200).json({ ok: true, data: { delivered: newlyDelivered.length } });
  } catch (err) {
    logger.warn('[Chats] Mark delivered error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to mark messages delivered' } });
  }
});

/**
 * Who has received and who has read one message. Sender-only: this is the
 * group analogue of WhatsApp's message info, and it is their message.
 */
router.get('/:id/messages/:messageId/info', async (req, res) => {
  const parsed = z
    .object({ id: z.string().uuid(), messageId: z.string().uuid() })
    .safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid ids.' } });
  }
  const { id, messageId } = parsed.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatRoomId: true },
    });
    if (!message || message.chatRoomId !== id) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Message not found.' } });
    }
    if (message.senderId !== tokenUserId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'You can only see info for your own messages.' } });
    }

    const audience = await audienceForMessage(messageId, tokenUserId);
    return res.status(200).json({ ok: true, data: audience });
  } catch (err) {
    logger.warn('[Chats] Message info error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load message info' } });
  }
});

// Sender-only, hard delete — this app has no "edited"/"deleted" placeholder
// concept for messages (no soft-delete column exists), so a deleted message
// is simply gone, for everyone, including its read/delivery receipts
// (cascaded by the schema). The client used to only ever remove a message
// from its own local state, which left it fully intact in the database and
// on every other participant's screen — deleting it locally deleted nothing.
router.delete('/:id/messages/:messageId', async (req, res) => {
  const parsed = z
    .object({ id: z.string().uuid(), messageId: z.string().uuid() })
    .safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid ids.' } });
  }
  const { id, messageId } = parsed.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, chatRoomId: true, isSystem: true },
    });
    if (!message || message.chatRoomId !== id) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Message not found.' } });
    }
    if (message.isSystem || message.senderId !== tokenUserId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'You can only delete your own messages.' } });
    }

    await prisma.message.delete({ where: { id: messageId } });

    const io = req.app.get('socketio');
    io?.to(id).emit('messageDeleted', { roomId: id, messageId });

    return res.status(200).json({ ok: true, data: { messageId } });
  } catch (err) {
    logger.warn('[Chats] Delete message error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to delete message' } });
  }
});

const muteBodySchema = z.object({ muted: z.boolean() });

// Real per-room notification mute, backed by ChatRoomMember.muted — the
// chat "Settings" panel's only actual setting today. Each user mutes only
// their own membership row; it has no effect on anyone else in the room.
router.post('/:id/mute', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const parsedBody = muteBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid mute value.' } });
  }
  const { id } = parsedParams.data;
  const { muted } = parsedBody.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    await prisma.chatRoomMember.update({
      where: { chatRoomId_userId: { chatRoomId: id, userId: tokenUserId } },
      data: { muted },
    });

    return res.status(200).json({ ok: true, data: { muted } });
  } catch (err) {
    logger.warn('[Chats] Mute chat room error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update mute setting' } });
  }
});

// docs/REMEDIATION.md §8.7 — chat.tsx's "Leave Group" button only ever
// called `setInboxRooms((prev) => prev.filter(...))`: a pure client-side
// list-hide with no backend call. The user was still a real
// ChatRoomMember row, so the "left" group would simply reappear the next
// time the inbox refetched from the server. Removing the caller's own
// membership row is a real leave; leaving is not restricted to
// non-organizers — a trip's organizer can leave its group chat like
// anyone else (they keep organizing the trip itself; TripMember is a
// separate model from ChatRoomMember).
// Delete a chat room (direct chat deletion or leave group chat)
router.delete('/:id', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const { id } = parsedParams.data;
  const tokenUserId = requireUserId(req);

  try {
    const membership = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId: id, userId: tokenUserId } },
      include: { chatRoom: true },
    });

    if (!membership) {
      const room = await prisma.chatRoom.findUnique({ where: { id } });
      if (!room) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Chat room not found' } });
      }
      return res.status(200).json({ ok: true, data: { message: 'Chat removed.' } });
    }

    if (!membership.chatRoom.isGroup) {
      await prisma.chatRoom.delete({ where: { id } });
    } else {
      await prisma.chatRoomMember.delete({
        where: { chatRoomId_userId: { chatRoomId: id, userId: tokenUserId } },
      });
    }

    return res.status(200).json({ ok: true, data: { message: 'Chat deleted.' } });
  } catch (err) {
    logger.error('[Chats] Delete chat error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not delete chat.' } });
  }
});

router.delete('/:id/members/me', async (req, res) => {
  const parsedParams = roomIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid chat room id.' } });
  }
  const { id } = parsedParams.data;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id, tokenUserId))) return;

    await prisma.chatRoomMember.delete({
      where: { chatRoomId_userId: { chatRoomId: id, userId: tokenUserId } },
    });

    return res.status(200).json({ ok: true, data: { message: 'Left the chat room.' } });
  } catch (err) {
    logger.error('[Chats] Leave room error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not leave the chat room.' } });
  }
});

// docs/REMEDIATION.md §8.7 — hands back a presigned PUT so the client can
// upload a chat photo straight to object storage and send the resulting
// public URL, instead of sending its own device-local file:// URI (which
// resolved for nobody but the sender). Same contract as the avatar, trip
// cover and guide media endpoints: a real error when storage is not
// configured, never a fake success.
const chatMediaUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

router.post('/media-upload-url', async (req, res) => {
  const parsed = chatMediaUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'contentType must be image/jpeg, image/png or image/webp.' },
    });
  }

  try {
    const userId = requireUserId(req);
    const { uploadUrl, publicUrl } = await createChatMediaUploadUrl(userId, parsed.data.contentType);
    return res.status(200).json({ ok: true, data: { uploadUrl, publicUrl } });
  } catch (err) {
    if (err instanceof ObjectStorageNotConfiguredError) {
      return res.status(503).json({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo sharing is not available right now.' },
      });
    }
    logger.error('[Chats] Media upload URL failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not start the upload.' } });
  }
});

export default router;
