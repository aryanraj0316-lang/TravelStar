import { io, type Socket } from 'socket.io-client';
import { clearTokens, getHostUrl, refreshAccessToken } from './api';
import { eventBus } from './event-bus';
import { secureStorage } from './secureStorage';
import { logger } from '@/lib/logger';
import type { Message, SOSAlert } from '@/store/AppContext';
import type { NotificationCategory } from '@/types/api';

type MessageListener = (data: { roomId: string; message: Message }) => void;
type SOSListener = (data: SOSAlert) => void;
type SOSResolvedListener = (data: { id: string }) => void;
type LocationListener = (data: { userId: string; tripId: string; latitude: number; longitude: number }) => void;
type AddedToChatListener = (data: { tripId: string; chatRoomId: string; tripName: string }) => void;
type NotificationListener = (data: {
  id?: string;
  userId?: string | null;
  type?: string;
  title?: string;
  content?: string;
  unread?: boolean;
  tripId?: string | null;
  chatRoomId?: string | null;
  category?: NotificationCategory | null;
}) => void;
type TypingListener = (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;

class SocketService {
  private socket: Socket | null = null;

  // Fresh arrays on every connect() — see disconnect(), which used to leave
  // these populated so listeners accumulated across logout/login cycles.
  private messageListeners: MessageListener[] = [];
  private sosListeners: SOSListener[] = [];
  private sosResolvedListeners: SOSResolvedListener[] = [];
  private locationListeners: LocationListener[] = [];
  private addedToChatListeners: AddedToChatListener[] = [];
  private notificationListeners: NotificationListener[] = [];
  private typingListeners: TypingListener[] = [];

  async connect() {
    if (this.socket && this.socket.connected) return;

    try {
      const token = await secureStorage.getItem('accessToken').catch(() => null);
      if (!token) {
        logger.warn('[SocketService] No access token — skipping connect.');
        return;
      }

      const serverUrl = getHostUrl();
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        // The server verifies this JWT in its io.use() middleware — identity
        // is never taken from a client-suppliable query param.
        //
        // A function, not a static `{ token }` object: the access token has
        // a 15-minute TTL, and requestEnvelope() in api.ts silently refreshes
        // it on the REST side when it expires. A static object here would
        // keep resending the token captured at the original connect() call
        // on every reconnection attempt, forever — this re-reads whatever is
        // currently in storage each time socket.io (re)connects, so a
        // reconnect after the REST flow has already refreshed picks up the
        // new token instead of retrying with the dead one.
        auth: (cb) => {
          secureStorage
            .getItem('accessToken')
            .then((current) => cb({ token: current }))
            .catch(() => cb({ token: null }));
        },
      });

      this.socket.on('connect', () => {});

      this.socket.on('messageReceived', (data: { roomId: string; message: Message }) => {
        this.messageListeners.forEach((l) => l(data));
      });

      this.socket.on('addedToChat', (data: { tripId: string; chatRoomId: string; tripName: string }) => {
        this.addedToChatListeners.forEach((l) => l(data));
      });

      this.socket.on('notificationReceived', (data: Parameters<NotificationListener>[0]) => {
        this.notificationListeners.forEach((l) => l(data));
      });

      this.socket.on('userTyping', (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => {
        this.typingListeners.forEach((l) => l(data));
      });

      this.socket.on('sosReceived', (data: SOSAlert) => {
        this.sosListeners.forEach((l) => l(data));
      });

      this.socket.on('sosResolved', (data: { id: string }) => {
        this.sosResolvedListeners.forEach((l) => l(data));
      });

      this.socket.on('locationUpdated', (data: { userId: string; tripId: string; latitude: number; longitude: number }) => {
        this.locationListeners.forEach((l) => l(data));
      });

      this.socket.on('disconnect', (reason: string) => {});

      this.socket.on('connect_error', (err: Error) => {
        logger.warn(`[SocketService] Connection notice:`, err?.message || err);
        // The server's socketAuthMiddleware rejects with this exact message
        // for a missing/invalid/expired token. Refresh proactively instead
        // of waiting on some unrelated REST call to notice — the socket may
        // be the only thing talking to the server right now (e.g. idle in a
        // chat). socket.io's own reconnection backoff (reconnection: true
        // above) will retry on its normal schedule regardless; this just
        // gives the next attempt a real token to pick up via the auth
        // callback, rather than retrying the same dead one for 10 attempts.
        if (err?.message === 'UNAUTHORIZED') {
          void refreshAccessToken().then((newToken) => {
            if (newToken) return;
            // Refresh itself failed — the session is dead (an expired
            // refresh token, or an account removed since the token was
            // issued), not just the access token. Retrying can never fix
            // that, so without this the socket reconnects every ~1s with
            // the same dead token and logs this same warning forever, with
            // nothing telling the user they need to sign in again. Mirrors
            // api.ts's REST 401 handler, which already does exactly this
            // for the same condition.
            void clearTokens();
            eventBus.emit('sessionExpired', undefined);
          });
        }
      });
    } catch (e) {
      logger.warn('[SocketService] Error initializing Socket.io client:', e);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.messageListeners = [];
    this.sosListeners = [];
    this.sosResolvedListeners = [];
    this.locationListeners = [];
    this.addedToChatListeners = [];
    this.notificationListeners = [];
    this.typingListeners = [];
  }

  joinRoom(roomId: string, onJoined?: (ok: boolean) => void) {
    if (this.socket) {
      this.socket.emit('joinRoom', roomId, onJoined);
    } else {
      onJoined?.(false);
    }
  }

  // senderName/senderRole are no longer sent: the server derives both from
  // the verified sender (socket.data.userId → their real profile), never
  // from client-supplied display fields.
  sendMessage(chatRoomId: string, content: string, mediaType: string = 'NONE') {
    if (this.socket) {
      this.socket.emit('sendMessage', {
        chatRoomId,
        content,
        mediaType,
      });
    }
  }

  triggerSOS(userName: string, latitude: number, longitude: number) {
    if (this.socket) {
      this.socket.emit('triggerSOS', {
        userName,
        latitude,
        longitude,
      });
    }
  }

  resolveSOS(id: string) {
    if (this.socket) {
      this.socket.emit('resolveSOS', { id });
    }
  }

  // Server scopes this to the given trip's members and gates it on the
  // caller's Profile.locationSharing — see backend/src/server.ts. Not called
  // from any screen yet; live location sharing is a Phase 8 feature, but the
  // server-side authorization holds regardless of whether a client uses it.
  updateLocation(tripId: string, latitude: number, longitude: number) {
    if (this.socket) {
      this.socket.emit('updateLocation', {
        tripId,
        latitude,
        longitude,
      });
    }
  }

  // docs/REMEDIATION.md §8.7 — replaces chat.tsx's fake, timer-driven
  // "typing indicator simulation". The server derives the sender's real
  // name and re-checks room membership; this just forwards intent.
  setTyping(chatRoomId: string, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit('typing', { chatRoomId, isTyping });
    }
  }

  onMessage(listener: MessageListener) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  onSOS(listener: SOSListener) {
    this.sosListeners.push(listener);
    return () => {
      this.sosListeners = this.sosListeners.filter((l) => l !== listener);
    };
  }

  onSOSResolved(listener: SOSResolvedListener) {
    this.sosResolvedListeners.push(listener);
    return () => {
      this.sosResolvedListeners = this.sosResolvedListeners.filter((l) => l !== listener);
    };
  }

  onLocation(listener: LocationListener) {
    this.locationListeners.push(listener);
    return () => {
      this.locationListeners = this.locationListeners.filter((l) => l !== listener);
    };
  }

  onAddedToChat(listener: AddedToChatListener) {
    this.addedToChatListeners.push(listener);
    return () => {
      this.addedToChatListeners = this.addedToChatListeners.filter((l) => l !== listener);
    };
  }

  onNotification(listener: NotificationListener) {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((l) => l !== listener);
    };
  }

  onUserTyping(listener: TypingListener) {
    this.typingListeners.push(listener);
    return () => {
      this.typingListeners = this.typingListeners.filter((l) => l !== listener);
    };
  }
}

export const socketService = new SocketService();
