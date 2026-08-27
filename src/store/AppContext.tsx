import { safeStorage } from '@/services/storage';
import { logger } from '@/lib/logger';
import { toast, errorToastMessage } from '@/lib/feedback';
import { enqueueMutation, registerMutationHandler } from '@/lib/offline-mutation-queue';
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiService, clearTokens, ApiError } from '../services/api';
import { socketService } from '../services/socket';
import { eventBus } from '../services/event-bus';

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
  savedPlaces?: any[];
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
  budget: number;
  availableSeats: number;
  totalSeats: number;
  meetingPoint: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  hotelIncluded?: boolean;
  cabIncluded?: boolean;
  privacy: 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
  membersCount: number;
  coverImage?: string;
  category?: string;
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

interface AppContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  profile: UserProfile;
  updateProfile: (profile: Partial<UserProfile>) => void;
  isLoggedIn: boolean;
  sessionRestored: boolean;
  login: () => void;
  logout: () => void;
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  joinTrip: (tripId: string, opts?: { midway?: boolean; fromCity?: string; toCity?: string }) => void;
  cancelJoinRequest: (tripId: string) => void;
  guides: Guide[];
  messages: Message[];
  sendMessage: (content: string, mediaType?: 'NONE' | 'IMAGE' | 'VOICE') => void;
  sosAlerts: SOSAlert[];
  triggerSOS: (lat: number, lng: number) => void;
  resolveSOS: (id: string) => void;
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;
  navbarHidden: boolean;
  setNavbarHidden: (hidden: boolean) => void;
  storiesList: Story[];
  addStory: (storyData: any) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// What logout resets to. A logged-out session must not carry forward any
// previous user's id, avatar, bio, wallet balance, or contact info — see
// docs/REMEDIATION.md §2.12.
const GUEST_PROFILE: UserProfile = {
  name: 'Guest Traveler',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
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
  const [hasUnreadNotification, setHasUnreadNotification] = useState<boolean>(false);
  const activeTabNameRef = useRef<string>('index');

  useEffect(() => {
    const unsub = eventBus.on('tabChanged', (name: string) => {
      activeTabNameRef.current = name;
    });
    return unsub;
  }, []);
  // Placeholder shown only until the real profile loads (or the session
  // restores as logged-out, at which point GUEST_PROFILE above takes over).
  // `walletBalance`/`rewardPoints` used to be fabricated non-zero numbers
  // (2450.0 / 120) here — a real fresh wallet always starts at 0
  // (backend/src/api/routes/auth.ts's register route), so a fabricated
  // balance could flash before the real fetch resolves. `isVerified: true`
  // was also wrong for the same reason: nothing is verified before a real
  // profile says so.
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Aarav Sharma',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    role: 'TOURIST',
    isVerified: false,
    guideLicenseStatus: 'NONE',
    walletBalance: 0,
    rewardPoints: 0,
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True once the local session read (isLoggedIn/savedProfile from
  // storage) has settled — see the hydrate effect below and §7.5.
  const [sessionRestored, setSessionRestored] = useState(false);

  const login = useCallback(() => {
    setIsLoggedIn(true);
    safeStorage.setItem('isLoggedIn', 'true').catch((e) => logger.warn('[Auth] Failed to persist login state:', e));
  }, []);

  // Logout clears every trace of the previous session: revokes it server-side,
  // wipes all local storage keys (tokens + cached profile), resets in-memory
  // state to a genuine guest default (not a partially-cleared copy of the
  // previous user), and disconnects the socket. See docs/REMEDIATION.md §2.12
  // — the old version kept id/avatar/bio/walletBalance/emergencyContact on
  // disk after "logging out".
  const logout = useCallback(() => {
    setIsLoggedIn(false);
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

  useEffect(() => {
    // Never write a role change from an unauthenticated session — this used to
    // fire unconditionally on every mount, including logged out, and (before
    // §2.3's fix) mutated whichever profile the server last saw.
    if (!isLoggedIn) return;
    setProfile((prev) => ({ ...prev, role: currentRole }));
    apiService
      .updateProfile({ role: currentRole })
      .catch((e) => logger.warn('[Profile] Failed to sync role change:', e));
  }, [currentRole, isLoggedIn]);

  const [trips, setTrips] = useState<Trip[]>([
    {
      id: 'trip-1',
      name: 'Ranchi to Vrindavan Spiritual Journey',
      creator: 'Vikram Singh (Organizer)',
      cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
      startDate: '2026-08-12',
      endDate: '2026-08-17',
      budget: 8500,
      availableSeats: 5,
      totalSeats: 15,
      meetingPoint: 'Ranchi Junction Platform 1',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 10,
    },
    {
      id: 'trip-2',
      name: 'Leh Ladakh Bike Expedition',
      creator: 'Aditya Sen',
      cities: ['Manali', 'Sarchu', 'Leh', 'Nubra Valley', 'Pangong Tso'],
      startDate: '2026-09-05',
      endDate: '2026-09-14',
      budget: 28000,
      availableSeats: 4,
      totalSeats: 8,
      meetingPoint: 'Manali Mall Road',
      guideIncluded: true,
      foodIncluded: false,
      privacy: 'PUBLIC',
      membersCount: 4,
    },
    {
      id: 'trip-3',
      name: 'Kerala Backwaters & Hills',
      creator: 'Priya Nair',
      cities: ['Kochi', 'Munnar', 'Alleppey'],
      startDate: '2026-08-25',
      endDate: '2026-08-30',
      budget: 15000,
      availableSeats: 6,
      totalSeats: 10,
      meetingPoint: 'Kochi Airport Terminal 1',
      guideIncluded: false,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 4,
    },
    {
      id: 'creation-1',
      name: 'Taj Mahal Heritage Getaway',
      creator: 'Aarav Sharma (Organizer)',
      cities: ['Delhi', 'Agra', 'Fatehpur Sikri'],
      startDate: '2026-08-10',
      endDate: '2026-08-12',
      budget: 6500,
      availableSeats: 12,
      totalSeats: 15,
      meetingPoint: 'Delhi Aerocity Metro Stn',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 3,
      coverImage: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
      category: 'Heritage',
    },
    {
      id: 'creation-2',
      name: 'Golden Triangle Scenic Tour',
      creator: 'Aarav Sharma (Organizer)',
      cities: ['Delhi', 'Agra', 'Jaipur'],
      startDate: '2026-08-20',
      endDate: '2026-08-25',
      budget: 9800,
      availableSeats: 8,
      totalSeats: 12,
      meetingPoint: 'New Delhi Rly Station PF 1',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 4,
      coverImage: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
      category: 'Adventure',
    },
    {
      id: 'bt-2',
      name: 'Varanasi Spiritual Ghats & Sarnath Heritage Tour',
      creator: 'Anjali Sharma (Local Guide)',
      cities: ['Varanasi', 'Sarnath'],
      startDate: '2026-08-18',
      endDate: '2026-08-20',
      budget: 6500,
      availableSeats: 6,
      totalSeats: 12,
      meetingPoint: 'Dashashwamedh Ghat Varanasi',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 6,
      category: 'Religious',
    },
    {
      id: 'bt-4',
      name: 'Kashmir Backpacking (Srinagar, Gulmarg & Pahalgam)',
      creator: 'Aarav Sharma (Solo Traveler/User)',
      cities: ['Srinagar', 'Gulmarg', 'Pahalgam'],
      startDate: '2026-09-01',
      endDate: '2026-09-06',
      budget: 14500,
      availableSeats: 3,
      totalSeats: 8,
      meetingPoint: 'Srinagar Airport Gate 1',
      guideIncluded: false,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 5,
      category: 'Adventure',
    },
    {
      id: 'bt-5',
      name: 'Goa Beach Hopping & Dudhsagar Waterfalls Road Trip',
      creator: 'Priya & Friends (Tourist Group)',
      cities: ['North Goa', 'South Goa', 'Dudhsagar'],
      startDate: '2026-08-28',
      endDate: '2026-09-01',
      budget: 9800,
      availableSeats: 2,
      totalSeats: 8,
      meetingPoint: 'Mapusa Bus Terminal Goa',
      guideIncluded: false,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 6,
      category: 'Nature',
    },
  ]);

  const [guides, setGuides] = useState<Guide[]>([
    {
      id: 'guide-1',
      name: 'Rajesh Kumar',
      avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80',
      rating: 4.9,
      reviewsCount: 142,
      expertise: ['Vrindavan Temples', 'Taj Mahal Guide', 'Delhi Red Fort'],
      languages: ['Hindi', 'English', 'Sanskrit'],
      hourlyRate: 350,
      dailyRate: 2200,
      verified: true,
    },
    {
      id: 'guide-2',
      name: 'Anjali Sharma',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      rating: 4.8,
      reviewsCount: 96,
      expertise: ['Jaipur Forts', 'Jodhpur Heritage Walk', 'Udaipur Lakes'],
      languages: ['Hindi', 'English', 'Rajasthani'],
      hourlyRate: 400,
      dailyRate: 2500,
      verified: true,
    },
    {
      id: 'guide-3',
      name: 'Lobsang Yeshi',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      rating: 4.95,
      reviewsCount: 204,
      expertise: ['Leh Monasteries', 'Nubra Valley Trekking', 'Pangong Ecology'],
      languages: ['Tibetan', 'English', 'Hindi'],
      hourlyRate: 500,
      dailyRate: 3500,
      verified: true,
    },
  ]);

  // No mock seed here on purpose: these used to be three hardcoded messages
  // with no roomId, which meant they rendered in whichever chat room was
  // currently open (docs/REMEDIATION.md §3.6). Real history loads via
  // GET /chats/:id/messages; this array only accumulates live socket deltas.
  const [messages, setMessages] = useState<Message[]>([]);

  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [storiesList, setStoriesList] = useState<Story[]>([
    {
      id: 'story-1',
      authorName: 'Aarav Sharma',
      authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      title: 'Spiritual Peace in Vrindavan',
      content: 'Experiencing the morning Aarti at Bankey Bihari Temple was truly divine...',
      coverImg: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
      likesCount: 24,
      location: 'Vrindavan, UP',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'story-2',
      authorName: 'Anjali Sharma',
      authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      title: 'Conquering Khardung La Pass',
      content: 'Riding through the cold winds of Ladakh with our group was unforgettable.',
      coverImg: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
      likesCount: 58,
      location: 'Leh Ladakh',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [navbarHidden, setNavbarHidden] = useState(false);

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
    Promise.allSettled([
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
      .getGuides()
      .then((remoteGuides) => {
        if (remoteGuides && remoteGuides.length > 0) {
          setGuides(remoteGuides);
        }
      })
      .catch((e) => logger.warn('[Hydrate] Guides fetch failed:', e));

    apiService
      .getSOSAlerts()
      .then((alerts) => {
        if (alerts && alerts.length > 0) {
          setSosAlerts(alerts);
        }
      })
      .catch((e) => logger.warn('[Hydrate] SOS alerts fetch failed:', e));

    apiService
      .getStories()
      .then((remoteStories) => {
        if (remoteStories && remoteStories.length > 0) {
          setStoriesList(remoteStories);
        }
      })
      .catch((e) => logger.warn('[Hydrate] Stories fetch failed:', e));
  }, []);

  // ── Reactive: refresh trips, join requests, and socket when login/room changes ──
  useEffect(() => {
    if (!isLoggedIn || !profile.id) {
      socketService.disconnect();
      return;
    }

    socketService.connect();
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
        chatRoomId: data.chatRoomId,
        tripId: data.tripId,
        category: data.category,
      });
    });

    return () => {
      unsubMsg();
      unsubSOS();
      unsubAddedToChat();
      unsubNotification();
    };
  }, [activeRoomId, isLoggedIn, profile.id]);

  const reloadJoinRequests = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getJoinRequests()
      .then((reqs) => {
        if (reqs && reqs.length > 0) {
          const tripIds = reqs
            .filter((r: any) => r.status === 'PENDING' || r.status === 'APPROVED')
            .map((r: any) => r.tripId);
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
        if (remoteTrips && remoteTrips.length > 0) {
          setTrips(remoteTrips);
        }
      })
      .catch((e) => logger.warn('[Trips] Refresh failed:', e));
  }, []);

  const reloadIncomingRequestsCount = useCallback(() => {
    if (!isLoggedIn) return;
    apiService
      .getIncomingRequests()
      .then((reqs) => {
        if (reqs && reqs.length > 0) {
          const pending = reqs.filter((r: any) => r.status === 'PENDING').length;
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
          const hasAnyUnread = notifs.some((n: any) => n.unread === true);
          setHasUnreadNotification(hasAnyUnread);
          const hasUnreadJoinAccepted = notifs.some(
            (n: any) => (n.category === 'CHAT_ADDED' || n.category === 'JOIN_ACCEPTED') && n.unread === true,
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
          const hasUnread = rooms.some((r: any) => r.unread === true || r.unreadCount > 0);
          setHasUnreadChat(hasUnread);
        } else {
          setHasUnreadChat(false);
        }
      })
      .catch((e) => logger.warn('[Chats] Unread check failed:', e));
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setPendingRequestsCount(0);
      setRequestedTrips(new Set());
      return;
    }
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

  const addTrip = useCallback(
    (trip: Trip) => {
      const tripWithMeta = {
        ...trip,
        creatorId: profile?.id,
        isMyTrip: true,
      };
      setTrips((prev) => [tripWithMeta, ...prev]);
      apiService
        .createTrip(tripWithMeta)
        .then(() => {
          toast('Trip created', 'success');
          // Re-fetch all trips from backend so isMyTrip is correctly calculated server-side
          refreshTrips();
        })
        .catch((e) => {
          logger.warn('[Trips] Create trip failed, rolling back:', e);
          setTrips((prev) => prev.filter((t) => t !== tripWithMeta));
          toast(errorToastMessage(e, 'Could not create the trip.'), 'error');
        });
    },
    [profile?.id, refreshTrips],
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
    (storyData: any) => {
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

  const providerValue = useMemo(
    () => ({
      currentRole,
      setCurrentRole,
      profile,
      updateProfile,
      isLoggedIn,
      sessionRestored,
      login,
      logout,
      trips,
      addTrip,
      joinTrip,
      cancelJoinRequest,
      guides,
      messages,
      sendMessage,
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
    }),
    [
      currentRole,
      profile,
      updateProfile,
      isLoggedIn,
      sessionRestored,
      login,
      logout,
      trips,
      addTrip,
      joinTrip,
      cancelJoinRequest,
      guides,
      messages,
      sendMessage,
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
