import { io, type Socket } from 'socket.io-client';
import { getHostUrl } from './api';
import { secureStorage } from './secureStorage';
import { logger } from '@/lib/logger';

type MessageListener = (data: { roomId: string; message: any }) => void;
type SOSListener = (data: any) => void;
type LocationListener = (data: any) => void;
type AddedToChatListener = (data: { tripId: string; chatRoomId: string; tripName: string }) => void;
type WalletListener = (data: any) => void;
type NotificationListener = (data: any) => void;

class SocketService {
  private socket: Socket | null = null;

  // Fresh arrays on every connect() — see disconnect(), which used to leave
  // these populated so listeners accumulated across logout/login cycles.
  private messageListeners: MessageListener[] = [];
  private sosListeners: SOSListener[] = [];
  private sosResolvedListeners: SOSListener[] = [];
  private locationListeners: LocationListener[] = [];
  private addedToChatListeners: AddedToChatListener[] = [];
  private walletListeners: WalletListener[] = [];
  private notificationListeners: NotificationListener[] = [];

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
        auth: { token },
      });

      this.socket.on('connect', () => {
      });

      this.socket.on('messageReceived', (data: any) => {
        this.messageListeners.forEach((l) => l(data));
      });

      this.socket.on('addedToChat', (data: any) => {
        this.addedToChatListeners.forEach((l) => l(data));
      });

      this.socket.on('notificationReceived', (data: any) => {
        this.notificationListeners.forEach((l) => l(data));
      });

      this.socket.on('sosReceived', (data: any) => {
        this.sosListeners.forEach((l) => l(data));
      });

      this.socket.on('sosResolved', (data: any) => {
        this.sosResolvedListeners.forEach((l) => l(data));
      });

      this.socket.on('locationUpdated', (data: any) => {
        this.locationListeners.forEach((l) => l(data));
      });

      this.socket.on('walletUpdated', (data: any) => {
        this.walletListeners.forEach((l) => l(data));
      });

      this.socket.on('disconnect', (reason: string) => {
      });

      this.socket.on('connect_error', (err: any) => {
        logger.warn(`[SocketService] Connection notice:`, err?.message || err);
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
    this.walletListeners = [];
    this.notificationListeners = [];
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

  onSOSResolved(listener: SOSListener) {
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

  onWalletUpdated(listener: WalletListener) {
    this.walletListeners.push(listener);
    return () => {
      this.walletListeners = this.walletListeners.filter((l) => l !== listener);
    };
  }

  onNotification(listener: NotificationListener) {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((l) => l !== listener);
    };
  }
}

export const socketService = new SocketService();

