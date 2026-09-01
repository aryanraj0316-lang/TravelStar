export interface InAppNotif {
  id: string;
  title: string;
  content: string;
  chatRoomId?: string;
  tripId?: string;
  category?: string;
}

interface EventMap {
  toggleNavbar: boolean;
  focusTripOnMap: string;
  inAppNotification: InAppNotif;
  tabChanged: string;
  sessionExpired: undefined;
}

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

class EventBus {
  // Stored untyped internally (TS can't verify a mapped-type-indexed-by-K
  // store across separate on()/emit() calls); on()/emit()'s public
  // signatures are what keep every call site type-safe.
  private listeners = new Map<keyof EventMap, ((data: unknown) => void)[]>();

  on<K extends keyof EventMap>(event: K, callback: Listener<K>) {
    const cb = callback as (data: unknown) => void;
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
    return () => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== cb));
    };
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

export const eventBus = new EventBus();
