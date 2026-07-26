import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import prisma from './services/db';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.set('socketio', io);

// In-memory chat store for rooms
const roomMessages = new Map<string, Array<{
  id: string;
  senderName: string;
  senderRole: string;
  content: string;
  timestamp: string;
  mediaType?: 'NONE' | 'IMAGE' | 'VOICE';
}>>();

// Seed initial messages for default room 'trip-1'
roomMessages.set('trip-1', [
  {
    id: 'm-1',
    senderName: 'Vikram Singh',
    senderRole: 'Organizer',
    content: 'Hey team! Welcome to the group chat for the Ranchi-Vrindavan spiritual trip. We will start from Ranchi Junction on 12th August.',
    timestamp: '10:30 AM',
  },
  {
    id: 'm-2',
    senderName: 'Suman Gupta',
    senderRole: 'Tourist',
    content: 'Super excited! Is the train ticket booking included in the budget or do we pay extra?',
    timestamp: '10:32 AM',
  },
  {
    id: 'm-3',
    senderName: 'Vikram Singh',
    senderRole: 'Organizer',
    content: 'Yes, it is included in the base package of ₹8500 per head.',
    timestamp: '10:35 AM',
  },
]);

// Map to track active user coordinates
const activeUserLocations = new Map<string, { latitude: number; longitude: number }>();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  const userId = socket.handshake.query.userId as string;

  if (userId) {
    socket.join(userId);
  }

  // Join a trip chatroom
  socket.on('joinRoom', async (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    
    try {
      const dbMessages = await prisma.message.findMany({
        where: { chatRoomId: roomId },
        include: { sender: { include: { profile: true } } },
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
          mediaType: m.mediaType as any || 'NONE',
        };
      });

      socket.emit('roomHistory', { roomId, messages: history });
    } catch (e) {
      console.warn('Error loading chat history from DB, falling back to cache:', e);
      const history = roomMessages.get(roomId) || [];
      socket.emit('roomHistory', { roomId, messages: history });
    }
  });

  // Handle messages sending
  socket.on('sendMessage', async (data: { chatRoomId: string; senderName: string; senderRole: string; content: string; mediaType?: 'NONE' | 'IMAGE' | 'VOICE'; senderId?: string }) => {
    const roomId = data.chatRoomId || 'default-room';
    
    let senderId = data.senderId;
    if (!senderId) {
      // Find a user matching data.senderName
      const user = await prisma.user.findFirst({
        where: {
          profile: {
            firstName: data.senderName.split(' ')[0],
          }
        }
      });
      senderId = user?.id || (await prisma.user.findFirst())?.id;
    }

    if (senderId) {
      try {
        const savedMsg = await prisma.message.create({
          data: {
            chatRoomId: roomId,
            senderId,
            content: data.content,
            mediaType: data.mediaType || 'NONE',
          }
        });

        const newMsg = {
          id: savedMsg.id,
          senderName: data.senderName || 'Anonymous Traveler',
          senderRole: data.senderRole || 'Tourist',
          content: data.content,
          timestamp: new Date(savedMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mediaType: data.mediaType || 'NONE',
        };

        io.to(roomId).emit('messageReceived', { roomId, message: newMsg });
        io.emit('messageReceived', { roomId, message: newMsg });
      } catch (e) {
        console.warn('Error saving message to DB:', e);
        // Fallback: emit unsaved message to keep chat functional
        const newMsg = {
          id: `msg-${Date.now()}`,
          senderName: data.senderName || 'Anonymous Traveler',
          senderRole: data.senderRole || 'Tourist',
          content: data.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mediaType: data.mediaType || 'NONE',
        };
        io.to(roomId).emit('messageReceived', { roomId, message: newMsg });
        io.emit('messageReceived', { roomId, message: newMsg });
      }
    }
  });

  // Handle Live location updates
  socket.on('updateLocation', (data: { userId: string; latitude: number; longitude: number }) => {
    activeUserLocations.set(data.userId, { latitude: data.latitude, longitude: data.longitude });
    socket.broadcast.emit('locationUpdated', {
      userId: data.userId,
      latitude: data.latitude,
      longitude: data.longitude,
    });
  });

  // Trigger SOS alarm
  socket.on('triggerSOS', (data: { userId?: string; userName?: string; latitude: number; longitude: number }) => {
    console.warn(`[SOS ALERT] User ${data.userName || data.userId || 'Guest'} triggered SOS at: ${data.latitude}, ${data.longitude}`);
    const alert = {
      id: `sos-${Date.now()}`,
      userName: data.userName || `User ${data.userId || 'Guest'}`,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: new Date().toLocaleTimeString(),
      status: 'ACTIVE',
    };

    // Broadcast SOS alert to all active sessions
    io.emit('sosReceived', alert);
  });

  // Resolve SOS alarm
  socket.on('resolveSOS', (data: { id: string }) => {
    io.emit('sosResolved', { id: data.id });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`TravelConnect India server is running on port ${PORT}`);
});
