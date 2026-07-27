import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

const getUserIdFromReq = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      return decoded.id || decoded.userId;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// 1. Get list of all chat rooms for current user
router.get('/', async (req, res) => {
  const tokenUserId = getUserIdFromReq(req);
  if (!tokenUserId) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

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
      };
    }));

    return res.status(200).json({ status: 'success', data: rooms });
  } catch (err) {
    console.warn('[Chats] Get chat rooms list error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat rooms' });
  }
});

// 2. Get chat room details by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tokenUserId = getUserIdFromReq(req);
  if (!tokenUserId) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
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
    console.warn('[Chats] Get chat room details error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat room details' });
  }
});

// 3. Get message history by chat room ID
router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const tokenUserId = getUserIdFromReq(req);
  if (!tokenUserId) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    const dbMessages = await prisma.message.findMany({
      where: { chatRoomId: id },
      include: {
        sender: {
          include: { profile: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    });

    const history = dbMessages.map((m) => {
      const name = m.sender?.profile
        ? `${m.sender.profile.firstName} ${m.sender.profile.lastName}`.trim()
        : (m.sender?.email ? m.sender.email.split('@')[0] : 'System');
      const role = m.sender?.role || 'Tourist';
      return {
        id: m.id,
        senderName: name,
        senderRole: role,
        content: m.content || '',
        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mediaType: m.mediaType || 'NONE',
      };
    });

    return res.status(200).json({ status: 'success', data: history });
  } catch (err) {
    console.warn('[Chats] Get message history error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve chat messages' });
  }
});

export default router;
