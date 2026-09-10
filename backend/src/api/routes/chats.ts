import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { ObjectStorageNotConfiguredError, createChatMediaUploadUrl } from '../../lib/object-storage';

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
  const membership = await prisma.chatRoomMember.findUnique({
    where: { chatRoomId_userId: { chatRoomId, userId } },
  });
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
    const memberships = await prisma.chatRoomMember.findMany({
      where: { userId: tokenUserId },
      include: {
        chatRoom: {
          include: {
            trip: true,
            members: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
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
      const lastMsg = room.messages[0];
      const lastMsgPreview = lastMsg
        ? `${lastMsg.sender?.profile?.firstName || 'User'}: ${lastMsg.content || ''}`
        : 'System: Welcome to the group chat! Start planning together.';

      const unreadCount = unreadCountByRoom.get(room.id) ?? 0;
      const sortDate = lastMsg?.createdAt || room.createdAt;

      return {
        id: room.id,
        tripId: trip?.id || null,
        name: room.name || trip?.name || 'Group Chat',
        avatar: trip?.coverImage ?? null,
        type: 'GROUP',
        latestMessage: lastMsgPreview,
        latestTime: lastMsg
          ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Just Now',
        unread: unreadCount > 0,
        unreadCount,
        badge: 'Member',
        lastMessageAt: sortDate.toISOString(),
      };
    });

    rooms.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return res.status(200).json({ ok: true, data: rooms });
  } catch (err) {
    logger.warn('[Chats] Get chat rooms list error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve chat rooms' } });
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

    const membersList = room.members.map((m) => ({
      id: m.user.id,
      name: m.user.profile
        ? `${m.user.profile.firstName} ${m.user.profile.lastName}`.trim()
        : m.user.email
          ? m.user.email.split('@')[0]
          : 'Member',
      avatar: m.user.profile?.avatarUrl ?? null,
      role: m.user.id === room.trip?.creatorId ? 'Organizer' : 'Member',
    }));

    return res.status(200).json({
      ok: true,
      data: {
        id: room.id,
        tripId: room.trip?.id || null,
        name: room.name || room.trip?.name || 'Group Chat',
        avatar: room.trip?.coverImage ?? null,
        members: membersList,
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
          include: { trip: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = dbMessages.length > take;
    const page = hasMore ? dbMessages.slice(0, take) : dbMessages;

    const history = page
      .map((m) => {
        let name = 'System';
        let role = 'SYSTEM';

        if (!m.isSystem) {
          name = m.sender?.profile
            ? `${m.sender.profile.firstName} ${m.sender.profile.lastName}`.trim()
            : m.sender?.email
              ? (m.sender.email.split('@')[0] ?? 'Member')
              : 'Member';
          role = m.senderId === m.chatRoom?.trip?.creatorId ? 'Organizer' : 'Tourist';
        }

        return {
          id: m.id,
          senderId: m.senderId,
          senderName: name,
          senderRole: role,
          content: m.content || '',
          timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mediaType: m.mediaType || 'NONE',
          createdAt: m.createdAt,
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

    return res.status(200).json({ ok: true, data: { message: 'Messages marked as read' } });
  } catch (err) {
    logger.warn('[Chats] Mark messages read error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to mark messages as read' } });
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
