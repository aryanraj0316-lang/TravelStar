import { Router } from 'express';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';

const router = Router();

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
  userId: string
): Promise<boolean> {
  const membership = await prisma.chatRoomMember.findUnique({
    where: { chatRoomId_userId: { chatRoomId, userId } },
  });
  if (!membership) {
    res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN',
      message: 'You are not a member of this chat room.',
    });
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
                  include: { profile: true }
                }
              }
            }
          }
        }
      }
    });

    const rooms = await Promise.all(memberships.map(async (m) => {
      const room = m.chatRoom;
      const trip = room.trip;
      const lastMsg = room.messages[0];
      const lastMsgPreview = lastMsg
        ? `${lastMsg.sender?.profile?.firstName || 'User'}: ${lastMsg.content || ''}`
        : 'System: Welcome to the group chat! Start planning together.';

      const unreadCount = await prisma.message.count({
        where: {
          chatRoomId: room.id,
          senderId: { not: tokenUserId },
          createdAt: { gte: m.joinedAt },
          readBy: {
            none: {
              userId: tokenUserId
            }
          }
        }
      });

      const sortDate = lastMsg?.createdAt || room.createdAt;

      return {
        id: room.id,
        tripId: trip?.id || null,
        name: room.name || trip?.name || 'Group Chat',
        avatar: trip?.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&q=80',
        type: 'GROUP',
        latestMessage: lastMsgPreview,
        latestTime: lastMsg
          ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Just Now',
        unread: unreadCount > 0,
        unreadCount: unreadCount,
        badge: 'Member',
        lastMessageAt: sortDate.toISOString(),
      };
    }));

    rooms.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return res.status(200).json({ status: 'success', data: rooms });
  } catch (err) {
    logger.warn('[Chats] Get chat rooms list error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat rooms' });
  }
});

// 2. Get chat room details by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id!, tokenUserId))) return;

    const room = await prisma.chatRoom.findUnique({
      where: { id },
      include: {
        trip: true,
        members: {
          include: {
            user: {
              include: { profile: true }
            }
          }
        }
      }
    });

    if (!room) {
      return res.status(404).json({ status: 'error', message: 'Chat room not found' });
    }

    const membersList = room.members.map((m) => ({
      id: m.user.id,
      name: m.user.profile
        ? `${m.user.profile.firstName} ${m.user.profile.lastName}`.trim()
        : (m.user.email ? m.user.email.split('@')[0] : 'Member'),
      avatar: m.user.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      role: m.user.id === room.trip?.creatorId ? 'Organizer' : 'Member',
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        id: room.id,
        tripId: room.trip?.id || null,
        name: room.name || room.trip?.name || 'Group Chat',
        avatar: room.trip?.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&q=80',
        members: membersList,
      }
    });
  } catch (err) {
    logger.warn('[Chats] Get chat room details error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat room details' });
  }
});

// 3. Get message history by chat room ID
router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id!, tokenUserId))) return;

    const dbMessages = await prisma.message.findMany({
      where: { chatRoomId: id },
      include: {
        sender: {
          include: { profile: true }
        },
        chatRoom: {
          include: { trip: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    });

    const history = dbMessages.map((m) => {
      let name = 'System';
      let role = 'SYSTEM';

      if (!m.isSystem) {
        name = m.sender?.profile
          ? `${m.sender.profile.firstName} ${m.sender.profile.lastName}`.trim()
          : (m.sender?.email ? (m.sender.email.split('@')[0] ?? 'Member') : 'Member');
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
      };
    });

    return res.status(200).json({ status: 'success', data: history });
  } catch (err) {
    logger.warn('[Chats] Get message history error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat messages' });
  }
});

// 4. Mark all messages in a chat room as read for the current user
router.post('/:id/read', async (req, res) => {
  const { id } = req.params;
  const tokenUserId = requireUserId(req);

  try {
    if (!(await assertChatRoomMember(res, id!, tokenUserId))) return;

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
          })
        )
      );
    }

    return res.status(200).json({ status: 'success', message: 'Messages marked as read' });
  } catch (err) {
    logger.warn('[Chats] Mark messages read error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to mark messages as read' });
  }
});

export default router;
