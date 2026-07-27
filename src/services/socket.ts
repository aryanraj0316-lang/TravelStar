// @ts-ignore
import { io, Socket } from 'socket.io-client/dist/socket.io.js';
import { getHostUrl } from './api';

type MessageListener = (data: { roomId: string; message: any }) => void;
type SOSListener = (data: any) => void;
type LocationListener = (data: any) => void;
type AddedToChatListener = (data: { tripId: string; chatRoomId: string; tripName: string }) => void;
type WalletListener = (data: any) => void;

class SocketService {
  private socket: any = null;
  private messageListeners: MessageListener[] = [];
  private sosListeners: SOSListener[] = [];
  private sosResolvedListeners: SOSListener[] = [];
  private locationListeners: LocationListener[] = [];
  private addedToChatListeners: AddedToChatListener[] = [];
  private walletListeners: WalletListener[] = [];

  connect() {
    if (this.socket && this.socket.connected) return;

    try {
      const serverUrl = getHostUrl();
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
      });

      this.socket.on('messageReceived', (data: any) => {
        this.messageListeners.forEach((l) => l(data));
      });

      this.socket.on('addedToChat', (data: any) => {
        this.addedToChatListeners.forEach((l) => l(data));
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
        console.warn(`[SocketService] Connection notice:`, err?.message || err);
      });
    } catch (e) {
      console.warn('[SocketService] Error initializing Socket.io client:', e);
    }
  }

  joinRoom(roomId: string) {
    if (this.socket) {
      this.socket.emit('joinRoom', roomId);
    }
  }

  sendMessage(chatRoomId: string, senderName: string, senderRole: string, content: string, mediaType: string = 'NONE') {
    if (this.socket) {
      this.socket.emit('sendMessage', {
        chatRoomId,
        senderName,
        senderRole,
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

  updateLocation(userId: string, latitude: number, longitude: number) {
    if (this.socket) {
      this.socket.emit('updateLocation', {
        userId,
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
}

export const socketService = new SocketService();

