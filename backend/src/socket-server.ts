import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { z } from 'zod';
import prisma from './services/db';
import { logger } from './lib/logger';
import { env } from './config/env';
import { socketAuthMiddleware, getSocketUserId } from './lib/socket-auth';
import { getSosAudienceUserIds } from './services/sos-audience';

// Bounded, TTL-pruned presence cache. This is per-process — correct for a
// single instance, and deliberately not the final answer: multi-instance
// deployments need this in Redis with the Socket.io Redis adapter so rooms
// and presence span processes (docs/REMEDIATION.md §3.8), which is Phase 11
// work once there is an actual load-balanced deployment to build it against.
// What this fixes now is the unbounded-growth memory leak: every entry has a
// timestamp and stale ones are pruned on each write.
const LOCATION_TTL_MS = 5 * 60 * 1000;
const activeUserLocations = new Map<
  string,
  { latitude: number; longitude: number; updatedAt: number }
>();

function pruneStaleLocations() {
  const cutoff = Date.now() - LOCATION_TTL_MS;
  for (const [userId, loc] of activeUserLocations) {
    if (loc.updatedAt < cutoff) activeUserLocations.delete(userId);
  }
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
    },
  });

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

        const newMsg = {
          id: savedMsg.id,
          senderId: userId,
          senderName,
          senderRole,
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

        pruneStaleLocations();
        activeUserLocations.set(userId, { latitude, longitude, updatedAt: Date.now() });

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
