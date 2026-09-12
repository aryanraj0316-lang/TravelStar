import { safeStorage } from '@/services/storage';
import type { Money } from '@/lib/money';
import { logger } from '@/lib/logger';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push';
import { toast, errorToastMessage } from '@/lib/feedback';
import { enqueueMutation, registerMutationHandler } from '@/lib/offline-mutation-queue';
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiService, clearTokens, ApiError, type CreateTripInput } from '../services/api';
import { socketService } from '../services/socket';
import { eventBus } from '../services/event-bus';
import type { JoinRequestSummary, IncomingJoinRequest, AppNotification, ChatRoomSummary } from '@/types/api';

// Registered once at module scope — apiService is a stable singleton, and
// these are the two REST writes queued for offline retry (see
// src/lib/offline-mutation-queue.ts for why chat messages aren't included).
registerMutationHandler('join-request', async (payload) => {
  const { tripId, ...opts } = payload as { tripId: string; midway?: boolean; fromCity?: string; toCity?: string };
  await apiService.createJoinRequest(tripId, opts);
});
registerMutationHandler('sos', async (payload) => {
  const { userName, lat, lng } = payload as { userName: string; lat: number; lng: number };
  await apiService.triggerSOS(userName, lat, lng);
});

/** A request that never reached the server (offline/timeout) is queued for
 * retry rather than rolled back — the user's optimistic UI stays as-is and
 * the write completes silently once connectivity returns. Anything else
 * (validation, auth, a real server rejection) is not retryable and should
 * roll back immediately, which callers handle themselves. */
function isOfflineFailure(e: unknown): boolean {
  return e instanceof ApiError && e.statusCode === null && e.code !== 'UNAUTHORIZED';
}

export type UserRole = 'TOURIST' | 'GUIDE' | 'ORGANIZER' | 'FAMILY_TRAVELER' | 'ADMIN';

// Client-only (no backend model) — persisted inside the Profile blob via
// updateProfile, not its own endpoint.
export interface SavedPlace {
  id: string;
  name: string;
  location: string;
  image: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  avatar: string;
  gender?: string;
  role: UserRole;
  isVerified: boolean;
  guideLicenseStatus: 'NONE' | 'PENDING' | 'VERIFIED';
  walletBalance: number;
  rewardPoints: number;
  email?: string;
  phoneNumber?: string;
  emergencyContact?: string;
  bio?: string;
  languages?: string;
  travelStyles?: string;
  savedPlaces?: SavedPlace[];
  selectedLanguage?: string;
  pushNotifications?: boolean;
  locationSharing?: boolean;
}

export interface Trip {
  id: string;
  name: string;
  creator: string;
  creatorId?: string;
  isMyTrip?: boolean;
  cities: string[];
  startDate: string;
  endDate: string;
  durationDays: number;
  // Money crosses the wire as a string (docs/CONVENTIONS.md §3). This was
  // typed `number` while every Trip row arrived with a string, so anything
  // calling .toLocaleString on it silently hit String.prototype and
  // rendered the digits ungrouped.
  budget: Money;
  availableSeats: number;
  totalSeats: number;
  meetingPoint: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  hotelIncluded?: boolean;
  cabIncluded?: boolean;
  privacy: 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
  membersCount: number;
  coverImage?: string | null;
  category?: string;
  travelStyle?: string;
  coordinates?: { latitude: number; longitude: number; name: string }[];
  chatRoomId?: string;
}

// A trip the current user is a confirmed TripMember on, returned by
// GET /trips/mine (docs/REMEDIATION.md §8.11). `status` is derived
// server-side from the trip's dates, never stored — see that route.
export interface MyTripBooking extends Trip {
  status: 'ONGOING' | 'UPCOMING' | 'COMPLETED';
  joinedAt: string;
  memberRole: 'MEMBER' | 'ORGANIZER' | 'CO_LEAD';
}

// Full destination-detail content from GET /destinations/:id
// (docs/REMEDIATION.md §8.19). No `reviews` field — there is no real
// review-authoring feature yet (§8.14, not built).
export interface DestinationDetail {
  id: string;
  name: string;
  tags: string;
  rating: number;
  image: string;
  description: string;
  gallery: string[];
  specialties: { icon: string; title: string; desc: string }[];
}

export interface Guide {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  reviewsCount: number;
  expertise: string[];
  languages: string[];
  hourlyRate: number;
  dailyRate: number;
  verified: boolean;
}

export interface Message {
  id: string;
  senderName: string;
  senderRole: string;
  senderAvatar?: string | null;
  avatar?: string | null;
  content: string;
  timestamp: string;
  mediaType?: 'NONE' | 'IMAGE' | 'VOICE';
  mediaUrl?: string;
  roomId?: string;
  senderId?: string;
}

export interface SOSAlert {
  id: string;
  userName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

export interface Story {
  id: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  content: string;
  coverImg: string;
  likesCount: number;
  location: string;
  createdAt: string;
}

export type NewStoryInput = Pick<Story, 'title' | 'content'> & Partial<Pick<Story, 'coverImg' | 'location'>>;

/**
 * Per-collection load state, so a screen can render §0.2.5's four states
 * instead of an ambiguous empty array. Before this existed, a failed fetch
 * left the previous (fabricated) seed data on screen and logged a warning —
 * see docs/REMEDIATION.md §0.2 rule 4.
 */
export type LoadStatus = 'loading' | 'ready' | 'error';

export interface DataStatus {
  trips: LoadStatus;
  guides: LoadStatus;
  stories: LoadStatus;
}

interface AppContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  profile: UserProfile;
  updateProfile: (profile: Partial<UserProfile>) => void;
  isLoggedIn: boolean;
  sessionRestored: boolean;
  /** True once the one-time first-launch onboarding flow has been shown
   *  (completed or skipped) and persisted locally. Meaningless before
   *  `sessionRestored` — see the hydrate effect below. */
  hasOnboarded: boolean;
  completeOnboarding: () => void;
  login: () => void;
  logout: () => void;
  trips: Trip[];
  addTrip: (trip: CreateTripInput) => Promise<Trip | null>;
  joinTrip: (tripId: string, opts?: { midway?: boolean; fromCity?: string; toCity?: string }) => void;
  cancelJoinRequest: (tripId: string) => void;
  guides: Guide[];
  messages: Message[];
  sendMessage: (content: string, mediaType?: 'NONE' | 'IMAGE' | 'VOICE') => void;
  setTyping: (isTyping: boolean) => void;
  typingUser: { roomId: string; userId: string; userName: string; userAvatar?: string | null; isTyping: boolean } | null;
  sosAlerts: SOSAlert[];
  triggerSOS: (lat: number, lng: number) => void;
  resolveSOS: (id: string) => void;
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;
  navbarHidden: boolean;
  setNavbarHidden: (hidden: boolean) => void;
  storiesList: Story[];
  addStory: (storyData: NewStoryInput) => void;
  requestedTrips: Set<string>;
  setRequestedTrips: React.Dispatch<React.SetStateAction<Set<string>>>;
  reloadJoinRequests: () => void;
  refreshTrips: () => void;
  pendingRequestsCount: number;
  reloadIncomingRequestsCount: () => void;
  hasUnreadChat: boolean;
  clearChatUnread: () => void;
  checkUnreadNotifications: () => void;
  hasUnreadNotification: boolean;
  dataStatus: DataStatus;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// What logout resets to. A logged-out session must not carry forward any
// previous user's id, avatar, bio, wallet balance, or contact info — see
// docs/REMEDIATION.md §2.12.
const GUEST_PROFILE: UserProfile = {
  name: 'Guest Traveler',
  avatar: '',
  role: 'TOURIST',
  isVerified: false,
  guideLicenseStatus: 'NONE',
  walletBalance: 0,
  rewardPoints: 0,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('TOURIST');
  const [requestedTrips, setRequestedTrips] = useState<Set<string>>(new Set());
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [hasUnreadChat, setHasUnreadChat] = useState<boolean>(false);
  // docs/REMEDIATION.md §8.7 — the last 'userTyping' event received, for
  // whichever room it was in. chat.tsx filters this down to the room it
  // currently has open; null once that room's typing indicator has cleared.
  const [typingUser, setTypingUser] = useState<{
    roomId: string;
    userId: string;
    userName: string;
    userAvatar?: string | null;
    isTyping: boolean;
  } | null>(null);
  const [hasUnreadNotification, setHasUnreadNotification] = useState<boolean>(false);
  const activeTabNameRef = useRef<string>('index');

  useEffect(() => {
    const unsub = eventBus.on('tabChanged', (name: string) => {
      activeTabNameRef.current = name;
    });
    return unsub;
  }, []);
  // Placeholder shown only until the real profile loads (or the session
  // restores as logged-out, at which point this is what it settles on
  // anyway). Reuses GUEST_PROFILE itself rather than a second hand-typed
  // copy — this used to hardcode the name 'Aarav Sharma' and a stock photo
  // here, a specific fake identity that could flash on a cold launch before
  // the real profile (or the logged-out state) resolved. `walletBalance`/
  // `rewardPoints` used to be fabricated non-zero numbers (2450.0 / 120)
  // here too — a real fresh wallet always starts at 0 (backend/src/api/
  // routes/auth.ts's register route), so a fabricated balance could flash
  // before the real fetch resolves. `isVerified: true` was also wrong for
  // the same reason: nothing is verified before a real profile says so.
  const [profile, setProfile] = useState<UserProfile>(GUEST_PROFILE);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True once the local session read (isLoggedIn/savedProfile from
  // storage) has settled — see the hydrate effect below and §7.5.
  const [sessionRestored, setSessionRestored] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // TODO(prod): re-enable safeStorage.setItem('hasOnboarded', 'true') here
  // once the onboarding flow is finalised — removed during development so
  // the onboarding screen shows on every fresh app launch.
  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
  }, []);

  // Declared here (rather than down by the other chat/SOS state, where they
  // used to live) because `logout` below reads their setters — the React
  // Compiler requires a value be declared before any hook that closes over
  // it, even though the runtime closure itself was always safe.
  // No mock seed on `messages` on purpose: these used to be three hardcoded
  // messages with no roomId, which meant they rendered in whichever chat
  // room was currently open (docs/REMEDIATION.md §3.6). Real history loads
  // via GET /chats/:id/messages; this array only accumulates live socket
  // deltas.
  const [messages, setMessages] = useState<Message[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const login = useCallback(() => {
    setIsLoggedIn(true);
    safeStorage.setItem('isLoggedIn', 'true').catch((e) => logger.warn('[Auth] Failed to persist login state:', e));
    // Register this device for push (docs/REMEDIATION.md §8.18). Fire and
    // forget: registration handles its own errors and returns a status
    // rather than throwing, and a push problem must never block a login.
    void registerForPushNotifications().then((result) => {
      if (result.status !== 'registered') {
        logger.log('[Push] Not registered for push notifications:', result.status);
      }
    });
  }, []);

  // Logout clears every trace of the previous session: revokes it server-side,
  // wipes all local storage keys (tokens + cached profile), resets in-memory
  // state to a genuine guest default (not a partially-cleared copy of the
  // previous user), and disconnects the socket. See docs/REMEDIATION.md §2.12
  // — the old version kept id/avatar/bio/walletBalance/emergencyContact on
  // disk after "logging out".
  const logout = useCallback(() => {
    setIsLoggedIn(false);
    // Drop this device's push token first — otherwise a signed-out phone
    // keeps receiving the previous account's notifications (§8.18).
    void unregisterPushNotifications();
    setRequestedTrips(new Set());
    setPendingRequestsCount(0);
    setActiveRoomId(null);
    setMessages([]);
    setHasUnreadChat(false);
    setSosAlerts([]);
    setProfile(GUEST_PROFILE);
    socketService.disconnect();

    apiService
      .logout()
      .catch((e) => logger.warn('[Auth] Server-side logout failed (clearing local session anyway):', e));

    Promise.all([clearTokens(), safeStorage.removeItem('isLoggedIn'), safeStorage.removeItem('savedProfile')]).catch(
      (e) => logger.warn('[Auth] Failed to fully clear local session:', e),
    );
  }, []);

  useEffect(() => {
    const unsub = eventBus.on('sessionExpired', () => {
      logout();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjusted during render (see profile.tsx's identical pattern) rather than
  // in the effect below, which stays for the actual network side effect
  // only — react-hooks/set-state-in-effect flags a synchronous setProfile
  // call in an effect body. Never writes a role change from an
  // unauthenticated session — this used to fire unconditionally on every
  // mount, including logged out, and (before §2.3's fix) mutated whichever
  // profile the server last saw.
  const [prevRoleSync, setPrevRoleSync] = useState({ role: currentRole, loggedIn: isLoggedIn });
  if (isLoggedIn && (currentRole !== prevRoleSync.role || isLoggedIn !== prevRoleSync.loggedIn)) {
    setPrevRoleSync({ role: currentRole, loggedIn: isLoggedIn });
    setProfile((prev) => ({ ...prev, role: currentRole }));
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    apiService
      .updateProfile({ role: currentRole })
      .catch((e) => logger.warn('[Profile] Failed to sync role change:', e));
  }, [currentRole, isLoggedIn]);

  // No hardcoded seed (docs/REMEDIATION.md §0.2 rule 4). This used to hold
  // fabricated trips with invented organizers, prices, seat counts and
  // meeting points. They were rendered by home-screen, map, and
  // group-organizer as real, bookable trips whenever GET /trips failed or
  // returned an empty list — and a join request against `trip-1` targets a
  // trip id that does not exist in any database.
  const [trips, setTrips] = useState<Trip[]>([]);

  // No hardcoded seed (docs/REMEDIATION.md §0.2 rule 4). This used to hold
  // three fabricated guides — invented names, Unsplash avatars, invented
  // ratings and rates, and `verified: true` on all three. "Verified Guide"
  // is the trust signal users pay on (§2.6), so rendering fake verified
  // guides whenever GET /guides failed was the worst instance of this bug.
  //
  // On useQuery (REMEDIATION.md §6.3 follow-up) rather than useState+effect:
  // unlike trips/sosAlerts/storiesList, nothing else in the app mutates this
  // list optimistically or pushes into it from a socket event, so there's no
  // second source of truth to keep in sync — a plain query is a strict
  // improvement (caching, refetch-on-reconnect) with no entanglement risk.
  const {
    data: guides = [],
    isLoading: guidesLoading,
    isError: guidesErrored,
  } = useQuery({
    queryKey: queryKeys.guides(),
    queryFn: async () => (await apiService.getGuides()) ?? [],
  });

  // No hardcoded seed (docs/REMEDIATION.md §0.2 rule 4). This used to hold
  // two fabricated stories with invented authors, captions and Unsplash
  // cover images, which stayed on screen — presented as real posts by real
  // people — whenever GET /stories failed or legitimately returned nothing.
  const [storiesList, setStoriesList] = useState<Story[]>([]);

  const [dataStatus, setDataStatus] = useState<Omit<DataStatus, 'guides'>>({
    trips: 'loading',
    stories: 'loading',
  });
  const [navbarHidden, setNavbarHidden] = useState(false);

  // Declared here (rather than down by the effects that call them, where
  // they used to live) so the React Compiler can see them declared before
  // the mount/reactive effects below close over them.
  const reloadJoinRequests = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getJoinRequests()
      .then((reqs) => {
        if (reqs && reqs.length > 0) {
          const tripIds = reqs
            .filter((r: JoinRequestSummary) => r.status === 'PENDING' || r.status === 'APPROVED')
            .map((r: JoinRequestSummary) => r.tripId);
          setRequestedTrips(new Set(tripIds));
        } else {
          setRequestedTrips(new Set());
        }
      })
      .catch((e) => logger.warn('[Trips] Reload join requests failed:', e));
  }, [isLoggedIn]);

  const refreshTrips = useCallback(() => {
    apiService
      .getTrips()
      .then((remoteTrips) => {
        setTrips(remoteTrips ?? []);
        setDataStatus((prev) => ({ ...prev, trips: 'ready' }));
      })
      .catch((e) => {
        logger.warn('[Trips] Refresh failed:', e);
        setDataStatus((prev) => ({ ...prev, trips: 'error' }));
      });
  }, []);

  const reloadIncomingRequestsCount = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getIncomingRequests()
      .then((reqs) => {
        if (reqs && reqs.length > 0) {
          const pending = reqs.filter((r: IncomingJoinRequest) => r.status === 'PENDING').length;
          setPendingRequestsCount(pending);
        } else {
          setPendingRequestsCount(0);
        }
      })
      .catch(() => {
        setPendingRequestsCount(0);
      });
  }, [isLoggedIn]);

  const clearChatUnread = useCallback(() => {
    setHasUnreadChat(false);
  }, []);

  const checkUnreadNotifications = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getNotifications()
      .then((notifs) => {
        if (notifs && notifs.length > 0) {
          const hasAnyUnread = notifs.some((n: AppNotification) => n.unread === true);
          setHasUnreadNotification(hasAnyUnread);
          const hasUnreadJoinAccepted = notifs.some(
            (n: AppNotification) => (n.category === 'CHAT_ADDED' || n.category === 'JOIN_ACCEPTED') && n.unread === true,
          );
          if (hasUnreadJoinAccepted) {
            setHasUnreadChat(true);
          }
        } else {
          setHasUnreadNotification(false);
        }
      })
      .catch((e) => logger.warn('[Notifications] Unread check failed:', e));
  }, [isLoggedIn]);

  const checkUnreadChats = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getChats()
      .then((rooms) => {
        if (rooms && rooms.length > 0) {
          // ChatRoomSummary has no top-level `unread` flag - unreadCount is
          // the real signal (the `any` here had been silently treating a
          // nonexistent field as a second, always-false condition).
          const hasUnread = rooms.some((r: ChatRoomSummary) => r.unreadCount > 0);
          setHasUnreadChat(hasUnread);
        } else {
          setHasUnreadChat(false);
        }
      })
      .catch((e) => logger.warn('[Chats] Unread check failed:', e));
  }, [isLoggedIn]);

  // ── One-time mount: hydrate auth, profile, socket, guides, wallet, SOS, stories ──
  useEffect(() => {
    // Hydrate local auth status and saved profile. sessionRestored flips
    // once both local reads have settled (success or failure) — the root
    // layout's splash screen waits on it (REMEDIATION.md §7.5) so it never
    // hides before we actually know whether the user is logged in. This is
    // deliberately NOT gated on the remote getProfile() call below, which
    // keeps running in the background and can be slow or fail offline —
    // local storage is fast and authoritative enough for "logged in or
    // not"; waiting on the network here would just make the splash hang.
    void Promise.allSettled([
      safeStorage.getItem('isLoggedIn').then((val) => {
        if (val === 'true') {
          setIsLoggedIn(true);
        }
      }),
      safeStorage.getItem('savedProfile').then((val) => {
        if (val) {
          setProfile(JSON.parse(val));
        }
      }),
      // TODO(prod): re-enable reading hasOnboarded from storage once the
      // onboarding flow is finalised. Skipped during development so it
      // always shows on app launch.
      // safeStorage.getItem('hasOnboarded').then((val) => {
      //   if (val === 'true') setHasOnboarded(true);
      // }),
    ]).then((results) => {
      results.forEach((r) => {
        if (r.status === 'rejected') logger.warn('[Hydrate] Reading local session failed:', r.reason);
      });
      setSessionRestored(true);
    });

    // Auto-sign-in from backend profile (only on initial load). A 401 here
    // just means there's no valid session yet (the common case pre-login) —
    // that's expected and quiet, not an error to surface.
    apiService
      .getProfile()
      .then((remoteProfile) => {
        if (remoteProfile) {
          setProfile((prev) => {
            const merged = { ...prev, ...remoteProfile };
            if (merged.email && merged.email !== 'aarav@example.com' && merged.name !== 'Guest Traveler') {
              setIsLoggedIn(true);
            }
            safeStorage
              .setItem('savedProfile', JSON.stringify(merged))
              .catch((e) => logger.warn('[Hydrate] Failed to persist merged profile locally:', e));
            return merged;
          });
        }
      })
      .catch((e) => logger.warn('[Hydrate] Profile fetch failed (no session yet, or offline):', e));

    apiService
      .getSOSAlerts()
      .then((alerts) => {
        setSosAlerts(alerts ?? []);
      })
      .catch((e) => logger.warn('[Hydrate] SOS alerts fetch failed:', e));

    apiService
      .getStories()
      .then((remoteStories) => {
        setStoriesList(remoteStories ?? []);
        setDataStatus((prev) => ({ ...prev, stories: 'ready' }));
      })
      .catch((e) => {
        logger.warn('[Hydrate] Stories fetch failed:', e);
        setDataStatus((prev) => ({ ...prev, stories: 'error' }));
      });

    // Trips load on mount for everyone, not only once a session exists.
    // GET /trips is a public read (backend/src/middleware/auth.ts's
    // PUBLIC_GET_EXACT) and the app is browse-before-login, but the only
    // call site used to be the reactive effect below, which returns early
    // while logged out — so a guest's `dataStatus.trips` stayed 'loading'
    // for the life of the session and every trips section rendered a
    // skeleton forever (CONVENTIONS.md §6: no screen may show a spinner
    // forever). The reactive effect still re-runs this after login so
    // `isMyTrip` gets recomputed with the caller's token.
    refreshTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydration; refreshTrips is a stable useCallback with no deps
  }, []);

  // ── Reactive: refresh trips, join requests, and socket when login/room changes ──
  useEffect(() => {
    if (!isLoggedIn || !profile.id) {
      socketService.disconnect();
      return;
    }

    // connect() is async but handles its own errors internally (see
    // socket.ts) and never rejects in a way this caller needs to react to.
    void socketService.connect();
    if (activeRoomId) {
      socketService.joinRoom(activeRoomId);
    } else {
      socketService.joinRoom('trip-1');
    }

    refreshTrips();
    reloadJoinRequests();
    reloadIncomingRequestsCount();

    // Real-time socket subscriptions
    const unsubMsg = socketService.onMessage((data) => {
      if (data && data.message) {
        const msgWithRoom = {
          ...data.message,
          roomId: data.roomId,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === msgWithRoom.id)) return prev;
          return [...prev, msgWithRoom];
        });

        // Set unread chat dot if message is from a different room OR user is not currently viewing the Chat tab
        if (data.roomId !== activeRoomId || activeTabNameRef.current !== 'chat') {
          setHasUnreadChat(true);
        }
      }
    });

    const unsubSOS = socketService.onSOS((alert) => {
      if (alert) {
        setSosAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          return [alert, ...prev];
        });
      }
    });

    const unsubTyping = socketService.onUserTyping((data) => {
      setTypingUser(data);
    });

    const unsubAddedToChat = socketService.onAddedToChat((data) => {
      setHasUnreadChat(true);
      refreshTrips();
      reloadJoinRequests();
    });

    const unsubNotification = socketService.onNotification((data) => {
      // Refresh notification badge count
      checkUnreadNotifications();
      // Show in-app banner (component handles navigation)
      eventBus.emit('inAppNotification', {
        id: data.id || `notif-${Date.now()}`,
        title: data.title || 'Notification',
        content: data.content || 'Your request was updated.',
        chatRoomId: data.chatRoomId ?? undefined,
        tripId: data.tripId ?? undefined,
        category: data.category ?? undefined,
      });
    });

    return () => {
      unsubMsg();
      unsubSOS();
      unsubTyping();
      unsubAddedToChat();
      unsubNotification();
    };
  }, [activeRoomId, isLoggedIn, profile.id, refreshTrips, reloadJoinRequests, reloadIncomingRequestsCount, checkUnreadNotifications]);

  // The isLoggedIn===false branch is adjusted during render (see profile.tsx
  // and the role-sync effect above for the same pattern) rather than in the
  // effect below, which now only ever calls the reload* functions — no
  // synchronous setState of its own, so it doesn't trip
  // react-hooks/set-state-in-effect.
  const [prevIsLoggedInForReset, setPrevIsLoggedInForReset] = useState(isLoggedIn);
  if (isLoggedIn !== prevIsLoggedInForReset) {
    setPrevIsLoggedInForReset(isLoggedIn);
    if (!isLoggedIn) {
      setPendingRequestsCount(0);
      setRequestedTrips(new Set());
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    reloadJoinRequests();
    reloadIncomingRequestsCount();
    checkUnreadNotifications();
    checkUnreadChats();
  }, [
    isLoggedIn,
    profile?.id,
    reloadJoinRequests,
    reloadIncomingRequestsCount,
    checkUnreadNotifications,
    checkUnreadChats,
  ]);

  const updateProfile = useCallback((updated: Partial<UserProfile>) => {
    let previous: UserProfile | null = null;
    setProfile((prev) => {
      previous = prev;
      const next = { ...prev, ...updated };
      safeStorage
        .setItem('savedProfile', JSON.stringify(next))
        .catch((e) => logger.warn('[Profile] Failed to persist profile locally:', e));
      return next;
    });
    apiService.updateProfile(updated).catch((e) => {
      logger.warn('[Profile] Server update failed, rolling back:', e);
      if (previous) setProfile(previous);
      toast(errorToastMessage(e, 'Could not save your profile changes.'), 'error');
    });
  }, []);

  /**
   * Publishes a trip and returns the server's version of it.
   *
   * There is no optimistic local insert. The previous version built one
   * from a client-invented `trip-${Date.now()}` id, which (a) the server
   * rejects outright as a non-UUID, so creation always failed, and (b)
   * would have put a row in the list whose id matched no real trip —
   * tapping it opened nothing. The real trip arrives from the response and
   * `refreshTrips()` reconciles the list from the server, which is the only
   * place `isMyTrip` and the generated ids are authoritative.
   */
  const addTrip = useCallback(
    async (trip: CreateTripInput): Promise<Trip | null> => {
      try {
        const created = await apiService.createTrip(trip);
        toast('Trip created', 'success');
        refreshTrips();
        return created;
      } catch (e) {
        logger.warn('[Trips] Create trip failed:', e);
        toast(errorToastMessage(e, 'Could not create the trip.'), 'error');
        return null;
      }
    },
    [refreshTrips],
  );

  const joinTrip = useCallback((tripId: string, opts?: { midway?: boolean; fromCity?: string; toCity?: string }) => {
    // Optimistic UI: mark as "requested", but do NOT touch availableSeats/membersCount here.
    // Seats are only decremented on the backend once the organizer approves the JoinRequest
    // (see /interactions/join-request/:id/status). Decrementing locally here caused seats
    // to be counted twice — once fraudulently on request, once for real on approval.
    setRequestedTrips((prev) => {
      const next = new Set(prev);
      next.add(tripId);
      return next;
    });
    // adjustedPrice is never sent — the server computes and owns it
    // (docs/REMEDIATION.md §8.6); the client only proposes a segment.
    apiService
      .createJoinRequest(tripId, opts)
      .then(() => {
        toast('Join request sent', 'success');
      })
      .catch((e) => {
        if (isOfflineFailure(e)) {
          logger.warn('[Trips] Join request offline, queued for retry:', e);
          enqueueMutation('join-request', { tripId, ...opts }).catch((qe) =>
            logger.warn('[Trips] Failed to queue join request:', qe),
          );
          toast("You're offline — your join request will send once you reconnect.", 'info');
          return;
        }
        logger.warn('[Trips] Join request failed, rolling back:', e);
        setRequestedTrips((prev) => {
          const next = new Set(prev);
          next.delete(tripId);
          return next;
        });
        toast(errorToastMessage(e, 'Could not send the join request.'), 'error');
      });
  }, []);

  const cancelJoinRequest = useCallback((tripId: string) => {
    setRequestedTrips((prev) => {
      const next = new Set(prev);
      next.delete(tripId);
      return next;
    });
    apiService
      .cancelJoinRequest(tripId)
      .then(() => {
        toast('Request withdrawn', 'success');
      })
      .catch((e) => {
        logger.warn('[Trips] Cancel join request failed, rolling back:', e);
        setRequestedTrips((prev) => {
          const next = new Set(prev);
          next.add(tripId);
          return next;
        });
        toast(errorToastMessage(e, 'Could not withdraw the request.'), 'error');
      });
  }, []);

  const sendMessage = useCallback(
    (content: string, mediaType: 'NONE' | 'IMAGE' | 'VOICE' = 'NONE') => {
      socketService.sendMessage(activeRoomId || 'trip-1', content, mediaType);
    },
    [activeRoomId],
  );

  // docs/REMEDIATION.md §8.7 — real typing events, replacing chat.tsx's
  // fake timer-driven simulation.
  const setTyping = useCallback(
    (isTyping: boolean) => {
      socketService.setTyping(activeRoomId || 'trip-1', isTyping);
    },
    [activeRoomId],
  );

  const triggerSOS = useCallback(
    (lat: number, lng: number) => {
      const newAlert: SOSAlert = {
        id: `sos-${Date.now()}`,
        userName: profile.name,
        latitude: lat,
        longitude: lng,
        timestamp: new Date().toLocaleTimeString(),
        status: 'ACTIVE',
      };
      setSosAlerts((prev) => [newAlert, ...prev]);
      // Fire over both transports: the socket delta reaches connected devices
      // immediately, the REST call is the durable, retried-by-nothing-else
      // write to SOSAlert. A user in distress must see a failure, not silence.
      apiService.triggerSOS(profile.name, lat, lng).catch((e) => {
        if (isOfflineFailure(e)) {
          logger.error('[Safety] SOS trigger offline, queued for retry the moment connectivity returns:', e);
          enqueueMutation('sos', { userName: profile.name, lat, lng }).catch((qe) =>
            logger.error('[Safety] Failed to queue SOS trigger:', qe),
          );
          toast(
            'No connection — your SOS will be sent the instant you reconnect. Call local emergency services directly if you can.',
            'error',
          );
          return;
        }
        logger.error('[Safety] SOS trigger failed to reach the server:', e);
        toast(
          errorToastMessage(
            e,
            'Could not reach emergency services. Try again or call local emergency services directly.',
          ),
          'error',
        );
      });
      socketService.triggerSOS(profile.name, lat, lng);
    },
    [profile.name],
  );

  const resolveSOS = useCallback((id: string) => {
    setSosAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, status: 'RESOLVED' } : alert)));
    apiService.resolveSOS(id).catch((e) => {
      logger.warn('[Safety] SOS resolve failed:', e);
      setSosAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, status: 'ACTIVE' } : alert)));
      toast(errorToastMessage(e, 'Could not resolve the alert.'), 'error');
    });
    socketService.resolveSOS(id);
  }, []);

  const addStory = useCallback(
    (storyData: NewStoryInput) => {
      const newStory = {
        id: `story-${Date.now()}`,
        authorName: profile.name,
        authorAvatar: profile.avatar,
        title: storyData.title,
        content: storyData.content,
        coverImg: storyData.coverImg || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
        likesCount: 0,
        location: storyData.location || 'India',
        createdAt: new Date().toISOString(),
      };
      setStoriesList((prev) => [newStory, ...prev]);
      apiService
        .createStory(newStory)
        .then(() => {
          toast('Story shared', 'success');
        })
        .catch((e) => {
          logger.warn('[Stories] Create story failed, rolling back:', e);
          setStoriesList((prev) => prev.filter((s) => s !== newStory));
          toast(errorToastMessage(e, 'Could not share your story.'), 'error');
        });
    },
    [profile.name, profile.avatar],
  );

  const combinedDataStatus: DataStatus = useMemo(
    () => ({
      ...dataStatus,
      guides: guidesLoading ? 'loading' : guidesErrored ? 'error' : 'ready',
    }),
    [dataStatus, guidesLoading, guidesErrored],
  );

  const providerValue = useMemo(
    () => ({
      currentRole,
      setCurrentRole,
      profile,
      updateProfile,
      isLoggedIn,
      sessionRestored,
      hasOnboarded,
      completeOnboarding,
      login,
      logout,
      trips,
      addTrip,
      joinTrip,
      cancelJoinRequest,
      guides,
      messages,
      sendMessage,
      setTyping,
      typingUser,
      sosAlerts,
      triggerSOS,
      resolveSOS,
      activeRoomId,
      setActiveRoomId,
      navbarHidden,
      setNavbarHidden,
      storiesList,
      addStory,
      requestedTrips,
      setRequestedTrips,
      reloadJoinRequests,
      refreshTrips,
      pendingRequestsCount,
      reloadIncomingRequestsCount,
      hasUnreadChat,
      clearChatUnread,
      checkUnreadNotifications,
      hasUnreadNotification,
      dataStatus: combinedDataStatus,
    }),
    [
      currentRole,
      profile,
      updateProfile,
      isLoggedIn,
      sessionRestored,
      hasOnboarded,
      completeOnboarding,
      login,
      logout,
      trips,
      addTrip,
      joinTrip,
      cancelJoinRequest,
      guides,
      messages,
      sendMessage,
      setTyping,
      typingUser,
      sosAlerts,
      triggerSOS,
      resolveSOS,
      activeRoomId,
      navbarHidden,
      storiesList,
      addStory,
      requestedTrips,
      reloadJoinRequests,
      refreshTrips,
      pendingRequestsCount,
      reloadIncomingRequestsCount,
      hasUnreadChat,
      clearChatUnread,
      checkUnreadNotifications,
      hasUnreadNotification,
      combinedDataStatus,
    ],
  );

  return <AppContext.Provider value={providerValue}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
