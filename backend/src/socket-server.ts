import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { z } from 'zod';
import prisma from './services/db';
import { logger } from './lib/logger';
import { env } from './config/env';
import { socketAuthMiddleware, getSocketUserId } from './lib/socket-auth';
import { getSosAudienceUserIds } from './services/sos-audience';
import { setUserLocation } from './lib/presence-store';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
    },
  });

  // Without this, rooms and `io.to(userId).emit(...)` only reach sockets
  // connected to *this* process — a second instance behind a load balancer
  // would silently drop half of every broadcast. REDIS_URL is required for
  // any horizontally scaled deployment (docs/REMEDIATION.md §3.8); a single
  // dev instance runs fine without it.
  if (env.REDIS_URL) {
    const pubClient = new Redis(env.REDIS_URL);
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => logger.error('[socket-adapter] Redis pub error:', err));
    subClient.on('error', (err) => logger.error('[socket-adapter] Redis sub error:', err));
    io.adapter(createAdapter(pubClient, subClient));
  } else {
    logger.warn('[socket-server] REDIS_URL not set — running single-instance (no cross-instance room fan-out).');
  }

  async function emitToUsers(userIds: string[], event: string, payload: unknown) {
    userIds.forEach((userId) => io.to(userId).emit(event, payload));
  }

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const userId = getSocketUserId(socket);
    void socket.join(userId);

    // Join a trip chatroom — only if the caller is actually a member. Message
    // history is not sent over the socket: the client loads it via the
    // paginated REST endpoint (GET /chats/:id/messages) and uses the socket
    // only for live deltas from here on, per docs/REMEDIATION.md §3.5.
    //
    // Accepts an optional ack callback so a caller (including tests) can know
    // the join actually completed, instead of guessing with a fixed delay
    // before sending the first message.
    socket.on('joinRoom', async (roomId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof roomId !== 'string' || !roomId) {
        ack?.(false);
        return;
      }

      try {
        const membership = await prisma.chatRoomMember.findUnique({
          where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
        });
        if (!membership) {
          socket.emit('roomJoinError', { roomId, message: 'You are not a member of this chat room.' });
          ack?.(false);
          return;
        }
        await socket.join(roomId);
        ack?.(true);
      } catch (e) {
        logger.error('[Socket] joinRoom membership check failed:', e);
        socket.emit('roomJoinError', { roomId, message: 'Could not join room.' });
        ack?.(false);
      }
    });

    const sendMessageSchema = z.object({
      chatRoomId: z.string().min(1),
      content: z.string().min(1).max(4000),
      mediaType: z.enum(['NONE', 'IMAGE', 'VOICE']).optional(),
    });

    socket.on('sendMessage', async (raw: unknown) => {
      const parsed = sendMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const { chatRoomId, content, mediaType } = parsed.data;

      try {
        // Never accept sender identity from the payload — the socket's own
        // verified identity is the only source of truth.
        const membership = await prisma.chatRoomMember.findUnique({
          where: { chatRoomId_userId: { chatRoomId, userId } },
        });
        if (!membership) {
          socket.emit('sendMessageError', { message: 'You are not a member of this chat room.' });
          return;
        }

        const [savedMsg, sender, chatRoom] = await Promise.all([
          prisma.message.create({
            data: { chatRoomId, senderId: userId, content, mediaType: mediaType || 'NONE' },
          }),
          prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
          prisma.chatRoom.findUnique({ where: { id: chatRoomId }, include: { trip: true } }),
        ]);

        const senderName = sender?.profile
          ? `${sender.profile.firstName} ${sender.profile.lastName}`.trim()
          : (sender?.email?.split('@')[0] ?? 'Member');
        const senderRole = userId === chatRoom?.trip?.creatorId ? 'Organizer' : 'Tourist';
        const senderAvatar = sender?.profile?.avatarUrl ?? null;

        const newMsg = {
          id: savedMsg.id,
          senderId: userId,
          senderName,
          senderRole,
          senderAvatar,
          avatar: senderAvatar,
          content: savedMsg.content,
          timestamp: new Date(savedMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mediaType: savedMsg.mediaType || 'NONE',
        };

        io.to(chatRoomId).emit('messageReceived', { roomId: chatRoomId, message: newMsg });
      } catch (e) {
        logger.error('[Socket] sendMessage failed:', e);
        socket.emit('sendMessageError', { message: 'Failed to send message.' });
      }
    });

    // docs/REMEDIATION.md §8.7 — chat.tsx's typing indicator was a
    // "Typing indicator simulation" (the code's own comment): a
    // setTimeout that showed a hardcoded name ('Aditya'/'Suman', not even
    // a real member of the room) "typing" on a fixed schedule, completely
    // disconnected from whether anyone was actually typing. Same
    // membership check and identity-from-socket pattern as sendMessage —
    // never trust a client-supplied name, and never broadcast to a room
    // the caller isn't in.
    const typingSchema = z.object({
      chatRoomId: z.string().min(1),
      isTyping: z.boolean(),
    });

    socket.on('typing', async (raw: unknown) => {
      const parsed = typingSchema.safeParse(raw);
      if (!parsed.success) return;
      const { chatRoomId, isTyping } = parsed.data;

      try {
        const membership = await prisma.chatRoomMember.findUnique({
          where: { chatRoomId_userId: { chatRoomId, userId } },
        });
        if (!membership) return; // Not a member — nothing to broadcast to.

        const sender = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
        const senderName = sender?.profile
          ? `${sender.profile.firstName} ${sender.profile.lastName}`.trim()
          : (sender?.email?.split('@')[0] ?? 'Member');
        const userAvatar = sender?.profile?.avatarUrl ?? null;

        // `socket.to()`, not `io.to()` — excludes the sender's own socket,
        // so a client never has to filter out its own typing echo.
        socket.to(chatRoomId).emit('userTyping', { roomId: chatRoomId, userId, userName: senderName, userAvatar, isTyping });
      } catch (e) {
        logger.error('[Socket] typing failed:', e);
      }
    });

    const updateLocationSchema = z.object({
      tripId: z.string().min(1),
      latitude: z.number(),
      longitude: z.number(),
    });

    socket.on('updateLocation', async (raw: unknown) => {
      const parsed = updateLocationSchema.safeParse(raw);
      if (!parsed.success) return;
      const { tripId, latitude, longitude } = parsed.data;

      try {
        const [profile, membership] = await Promise.all([
          prisma.profile.findUnique({ where: { userId }, select: { locationSharing: true } }),
          prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } }),
        ]);

        if (!profile?.locationSharing) return; // Consent toggle off — emit nothing.
        if (!membership) return; // Not a member of this trip — nothing to broadcast to.

        await setUserLocation(userId, { latitude, longitude });

        const members = await prisma.tripMember.findMany({ where: { tripId }, select: { userId: true } });
        const recipientIds = members.map((m) => m.userId).filter((id) => id !== userId);
        await emitToUsers(recipientIds, 'locationUpdated', { userId, tripId, latitude, longitude });
      } catch (e) {
        logger.error('[Socket] updateLocation failed:', e);
      }
    });

    const sosSchema = z.object({
      userName: z.string().optional(),
      latitude: z.number(),
      longitude: z.number(),
    });

    // Trigger SOS — persist to DB and notify only the scoped audience (see
    // services/sos-audience.ts), never everyone. This mirrors POST /safety/sos.
    socket.on('triggerSOS', async (raw: unknown) => {
      const parsed = sosSchema.safeParse(raw);
      if (!parsed.success) return;
      const { userName, latitude, longitude } = parsed.data;

      try {
        const dbAlert = await prisma.sOSAlert.create({
          data: { userId, latitude, longitude },
        });

        const alert = {
          id: dbAlert.id,
          userName: userName || `User ${userId.slice(0, 8)}`,
          latitude,
          longitude,
          timestamp: new Date().toLocaleTimeString(),
          status: 'ACTIVE',
        };

        const audience = await getSosAudienceUserIds(userId);
        await emitToUsers(audience, 'sosReceived', alert);
      } catch (e) {
        logger.error('[Socket] triggerSOS failed:', e);
      }
    });

    // Resolve SOS — only the alert owner or an admin, mirroring
    // POST /safety/sos/:id/resolve. Notified to the same scoped audience that
    // received the original alert.
    socket.on('resolveSOS', async (raw: unknown) => {
      const parsed = z.object({ id: z.string().min(1) }).safeParse(raw);
      if (!parsed.success) return;
      const { id } = parsed.data;

      try {
        const alert = await prisma.sOSAlert.findUnique({ where: { id }, select: { userId: true } });
        if (!alert) return;

        const isOwner = alert.userId === userId;
        const isAdmin = (socket.data as { role?: string }).role === 'ADMIN';
        if (!isOwner && !isAdmin) {
          socket.emit('resolveSOSError', { message: 'Not authorised to resolve this alert.' });
          return;
        }

        await prisma.sOSAlert.update({ where: { id }, data: { status: 'RESOLVED' } });

        const audience = await getSosAudienceUserIds(alert.userId);
        await emitToUsers(audience, 'sosResolved', { id });
      } catch (e) {
        logger.error('[Socket] resolveSOS failed:', e);
      }
    });
  });

  return io;
}
