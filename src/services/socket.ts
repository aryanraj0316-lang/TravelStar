import { io, type Socket } from 'socket.io-client';
import { clearTokens, getHostUrl, refreshSession } from './api';
import { eventBus } from './event-bus';
import { secureStorage } from './secureStorage';
import { logger } from '@/lib/logger';
import type { Message, SOSAlert } from '@/store/AppContext';
import type { NotificationCategory } from '@/types/api';

type MessageListener = (data: {
  roomId: string;
  message: Message;
  /** Set when this room is a pre-join enquiry thread. */
  inquiryTripId?: string | null;
  /** The enquiry's trip organizer — compare against the viewer's own id to
   *  tell whether *this* client is the organizer's side of the thread. */
  inquiryOrganizerId?: string | null;
}) => void;
type SOSListener = (data: SOSAlert) => void;
type SOSResolvedListener = (data: {
  id: string;
  userId?: string;
  userName?: string;
  resolverName?: string;
  resolutionNote?: string | null;
}) => void;
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
  /** Set on PAYMENT_REQUIRED — what the payment screen needs to open. */
  joinRequestId?: string | null;
  category?: NotificationCategory | null;
}) => void;
type NotificationReadListener = (data: { chatRoomId?: string }) => void;
type TypingListener = (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;
/** Who is connected right now — a snapshot on connect, then deltas. */
type PresenceListener = (data: { userIds: string[] } | { userId: string; online: boolean }) => void;

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
  private notificationReadListeners: NotificationReadListener[] = [];
  private typingListeners: TypingListener[] = [];
  private presenceListeners: PresenceListener[] = [];

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

      this.socket.on(
        'messageReceived',
        (data: {
          roomId: string;
          message: Message;
          inquiryTripId?: string | null;
          inquiryOrganizerId?: string | null;
        }) => {
          this.messageListeners.forEach((l) => l(data));
        },
      );

      this.socket.on('addedToChat', (data: { tripId: string; chatRoomId: string; tripName: string }) => {
        this.addedToChatListeners.forEach((l) => l(data));
      });

      this.socket.on('notificationReceived', (data: Parameters<NotificationListener>[0]) => {
        this.notificationListeners.forEach((l) => l(data));
      });

      this.socket.on('notificationRead', (data: { chatRoomId?: string }) => {
        this.notificationReadListeners.forEach((l) => l(data));
      });

      this.socket.on('userTyping', (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => {
        this.typingListeners.forEach((l) => l(data));
      });

      this.socket.on('presenceSnapshot', (data: { userIds: string[] }) => {
        this.presenceListeners.forEach((l) => l(data));
      });

      this.socket.on('presenceChanged', (data: { userId: string; online: boolean }) => {
        this.presenceListeners.forEach((l) => l(data));
      });

      this.socket.on('sosReceived', (data: SOSAlert) => {
        this.sosListeners.forEach((l) => l(data));
      });

      this.socket.on('sosResolved', (data: { id: string; userId?: string; userName?: string; resolverName?: string; resolutionNote?: string | null }) => {
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
          void refreshSession().then((outcome) => {
            // Only a refused refresh token ends the session; being offline
            // or hitting a cold server just means try again later.
            if (!('rejected' in outcome)) return;
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
    this.notificationReadListeners = [];
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
  sendMessage(
    chatRoomId: string,
    content: string,
    mediaType: string = 'NONE',
    mediaUrl?: string | null,
    coords?: { latitude: number; longitude: number } | null,
  ) {
    if (this.socket) {
      this.socket.emit('sendMessage', {
        chatRoomId,
        content,
        mediaType,
        mediaUrl: mediaUrl || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
    }
  }

  triggerSOS(userName: string, latitude: number, longitude: number, message?: string | null) {
    if (this.socket) {
      this.socket.emit('triggerSOS', {
        userName,
        latitude,
        longitude,
        message: message ?? null,
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

  /**
   * Tell the server these messages reached this device. Called the moment a
   * message arrives live, and again as a sweep when the app comes back to
   * the foreground so anything that landed while offline is marked once the
   * device really has it.
   */
  markDelivered(chatRoomId: string, messageIds?: string[]) {
    if (this.socket) {
      this.socket.emit('markDelivered', { chatRoomId, ...(messageIds ? { messageIds } : {}) });
    }
  }

  onMessage(listener: MessageListener) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  /** Tick updates for the sender's own bubbles, batched per room by the server. */
  onMessageStatus(listener: (e: { roomId: string; messageIds: string[]; userId: string; kind: 'DELIVERED' | 'SEEN' }) => void) {
    const onDelivered = (p: { roomId: string; messageIds: string[]; userId: string }) =>
      listener({ ...p, kind: 'DELIVERED' as const });
    const onRead = (p: { roomId: string; messageIds: string[]; userId: string }) =>
      listener({ ...p, kind: 'SEEN' as const });
    this.socket?.on('messageDelivered', onDelivered);
    this.socket?.on('messageRead', onRead);
    return () => {
      this.socket?.off('messageDelivered', onDelivered);
      this.socket?.off('messageRead', onRead);
    };
  }

  /** A message was deleted by its sender — remove it from every open view of the room. */
  onMessageDeleted(listener: (e: { roomId: string; messageId: string }) => void) {
    this.socket?.on('messageDeleted', listener);
    return () => {
      this.socket?.off('messageDeleted', listener);
    };
  }

  /** The server rejected a message send — the socket layer's own failure feedback, not a delivery-status tick. */
  onSendMessageError(listener: (e: { message: string }) => void) {
    this.socket?.on('sendMessageError', listener);
    return () => {
      this.socket?.off('sendMessageError', listener);
    };
  }

  /** Joining a chat room's socket channel was refused (not a member, or the room lookup failed). */
  onRoomJoinError(listener: (e: { roomId: string; message: string }) => void) {
    this.socket?.on('roomJoinError', listener);
    return () => {
      this.socket?.off('roomJoinError', listener);
    };
  }

  /** Resolving an SOS alert over the socket was refused. */
  onResolveSOSError(listener: (e: { message: string }) => void) {
    this.socket?.on('resolveSOSError', listener);
    return () => {
      this.socket?.off('resolveSOSError', listener);
    };
  }

  /** A guide booking's status changed — fired at both the traveller and the guide, whichever one did not make the change. */
  onBookingStatusChanged(
    listener: (e: { bookingId: string; status: string; guideProfileId: string | null; tripId: string | null }) => void,
  ) {
    this.socket?.on('bookingStatusChanged', listener);
    return () => {
      this.socket?.off('bookingStatusChanged', listener);
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

  onNotificationRead(listener: NotificationReadListener) {
    this.notificationReadListeners.push(listener);
    return () => {
      this.notificationReadListeners = this.notificationReadListeners.filter((l) => l !== listener);
    };
  }

  onUserTyping(listener: TypingListener) {
    this.typingListeners.push(listener);
    return () => {
      this.typingListeners = this.typingListeners.filter((l) => l !== listener);
    };
  }

  onPresence(listener: PresenceListener) {
    this.presenceListeners.push(listener);
    return () => {
      this.presenceListeners = this.presenceListeners.filter((l) => l !== listener);
    };
  }
}

export const socketService = new SocketService();
