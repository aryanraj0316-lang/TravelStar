import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env';

interface SocketAuthData {
  userId: string;
  role: string;
}

/**
 * Socket.io middleware: verifies the JWT sent as `socket.handshake.auth.token`
 * (the same access token used for HTTP requests) and rejects the connection
 * otherwise. Room membership must always be derived from `socket.data`, set
 * here from the verified token — never from `socket.handshake.query`, which
 * is client-supplied and unauthenticated.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token) {
    next(new Error('UNAUTHORIZED'));
    return;
  }

  jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
    if (err || !decoded || typeof decoded === 'string') {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    const userId: string | undefined = decoded.id || decoded.userId;
    if (!userId) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    const data: SocketAuthData = { userId, role: decoded.role };
    socket.data = data;
    next();
  });
}

export function getSocketUserId(socket: Socket): string {
  return (socket.data as SocketAuthData).userId;
}
