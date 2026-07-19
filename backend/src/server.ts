import http from 'http';
import { Server } from 'socket.io';
import app from './app';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Map to track active user coordinates
const activeUserLocations = new Map<string, { latitude: number; longitude: number }>();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  const userId = socket.handshake.query.userId as string;

  if (userId) {
    socket.join(userId);
  }

  // Join a trip chatroom
  socket.on('joinRoom', (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Handle messages sending
  socket.on('sendMessage', (data: { chatRoomId: string; senderId: string; content: string }) => {
    // Broadcast message to everyone in the room
    io.to(data.chatRoomId).emit('messageReceived', {
      id: `msg-${Date.now()}`,
      senderId: data.senderId,
      content: data.content,
      timestamp: new Date(),
    });
  });

  // Handle Live location updates
  socket.on('updateLocation', (data: { userId: string; latitude: number; longitude: number }) => {
    activeUserLocations.set(data.userId, { latitude: data.latitude, longitude: data.longitude });
    // Broadcast updated position to nearby users
    socket.broadcast.emit('locationUpdated', {
      userId: data.userId,
      latitude: data.latitude,
      longitude: data.longitude,
    });
  });

  // Trigger SOS alarm
  socket.on('triggerSOS', (data: { userId: string; latitude: number; longitude: number }) => {
    console.warn(`[SOS ALERT] User ${data.userId} triggered SOS at coordinates: ${data.latitude}, ${data.longitude}`);
    // Broadcast SOS alert to all active sessions (police/guides and nearby travelers)
    io.emit('sosReceived', {
      alertId: `sos-${Date.now()}`,
      userId: data.userId,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: new Date(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`TravelConnect India server is running on port ${PORT}`);
});
