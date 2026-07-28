import { safeStorage } from '@/services/storage';
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiService } from '../services/api';
import { socketService } from '../services/socket';
import { eventBus } from '../services/event-bus';


export type UserRole = 'TOURIST' | 'GUIDE' | 'ORGANIZER' | 'FAMILY_TRAVELER' | 'ADMIN';

export interface UserProfile {
  id?: string;
  name: string;
  avatar: string;
  gender?: string;
  role: UserRole;
  isVerified: boolean;
  aadhaarStatus: 'NONE' | 'PENDING' | 'VERIFIED';
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
  login: () => void;
  logout: () => void;
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  joinTrip: (tripId: string) => void;
  guides: Guide[];
  messages: Message[];
  sendMessage: (content: string, mediaType?: 'NONE' | 'IMAGE' | 'VOICE') => void;
  sosAlerts: SOSAlert[];
  triggerSOS: (lat: number, lng: number) => void;
  resolveSOS: (id: string) => void;
  walletTransactions: any[];
  addWalletFunds: (amount: number) => void;
  withdrawWalletFunds: (amount: number) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('TOURIST');
  const [requestedTrips, setRequestedTrips] = useState<Set<string>>(new Set());
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [hasUnreadChat, setHasUnreadChat] = useState<boolean>(false);
  const activeTabNameRef = useRef<string>('index');

  useEffect(() => {
    const unsub = eventBus.on('tabChanged', (name: string) => {
      activeTabNameRef.current = name;
    });
    return unsub;
  }, []);
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Aarav Sharma',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    role: 'TOURIST',
    isVerified: true,
    aadhaarStatus: 'VERIFIED',
    guideLicenseStatus: 'NONE',
    walletBalance: 2450.0,
    rewardPoints: 120,
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const login = () => {
    setIsLoggedIn(true);
    try {
      safeStorage.setItem('isLoggedIn', 'true').catch(() => { });
    } catch (e) { }
  };
  const logout = () => {
    setIsLoggedIn(false);
    setRequestedTrips(new Set());
    setPendingRequestsCount(0);
    setActiveRoomId(null);
    setMessages([]);
    setHasUnreadChat(false);
    setSosAlerts([]);
    socketService.disconnect();

    setProfile((prev) => {
      const nextProfile = {
        ...prev,
        name: 'Guest Traveler',
        email: '',
        phoneNumber: '',
        isVerified: false,
        aadhaarStatus: 'NONE' as const,
      };
      try {
        safeStorage.setItem('savedProfile', JSON.stringify(nextProfile)).catch(() => { });
      } catch (e) { }
      return nextProfile;
    });
    try {
      safeStorage.removeItem('isLoggedIn').catch(() => { });
      safeStorage.removeItem('userToken').catch(() => { });
    } catch (e) { }
  };

  useEffect(() => {
    setProfile((prev) => ({ ...prev, role: currentRole }));
    apiService.updateProfile({ role: currentRole });
  }, [currentRole]);

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

  const [messages, setMessages] = useState<Message[]>([
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
  const [walletTransactions, setWalletTransactions] = useState<any[]>([
    { id: 't-1', amount: 1500, type: 'DEPOSIT', remark: 'Added via GPay', date: '2026-07-18' },
    { id: 't-2', amount: -500, type: 'PAYMENT', remark: 'Trip booking advance', date: '2026-07-17' },
    { id: 't-3', amount: 150, type: 'CASHBACK', remark: 'Referral cashback reward', date: '2026-07-16' },
  ]);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [navbarHidden, setNavbarHidden] = useState(false);

  // ── One-time mount: hydrate auth, profile, socket, guides, wallet, SOS, stories ──
  useEffect(() => {
    // Hydrate local auth status and saved profile safely
    try {
      safeStorage.getItem('isLoggedIn').then((val) => {
        if (val === 'true') {
          setIsLoggedIn(true);
        }
      }).catch(() => { });

      safeStorage.getItem('savedProfile').then((val) => {
        if (val) {
          try {
            setProfile(JSON.parse(val));
          } catch (e) { }
        }
      }).catch(() => { });
    } catch (e) {
      console.warn('[Storage Warning] Native module fallback:', e);
    }

    // Auto-sign-in from backend profile (only on initial load)
    apiService.getProfile().then((remoteProfile) => {
      if (remoteProfile) {
        setProfile((prev) => {
          const merged = { ...prev, ...remoteProfile };
          if (merged.email && merged.email !== 'aarav@example.com' && merged.name !== 'Guest Traveler') {
            setIsLoggedIn(true);
          }
          try {
            safeStorage.setItem('savedProfile', JSON.stringify(merged)).catch(() => { });
          } catch (e) { }
          return merged;
        });
      }
    });

    apiService.getGuides().then((remoteGuides) => {
      if (remoteGuides && remoteGuides.length > 0) {
        setGuides(remoteGuides);
      }
    });

    apiService.getWalletTransactions().then((txns) => {
      if (txns && txns.length > 0) {
        setWalletTransactions(txns);
      }
    });

    apiService.getSOSAlerts().then((alerts) => {
      if (alerts && alerts.length > 0) {
        setSosAlerts(alerts);
      }
    });

    apiService.getStories().then((remoteStories) => {
      if (remoteStories && remoteStories.length > 0) {
        setStoriesList(remoteStories);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reactive: refresh trips, join requests, and socket when login/room changes ──
  useEffect(() => {
    if (!isLoggedIn) {
      socketService.disconnect();
      return;
    }

    socketService.connect(profile.id);
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
  }, [activeRoomId, isLoggedIn]);

  const reloadJoinRequests = useCallback(() => {
    if (!isLoggedIn) return;
    apiService.getJoinRequests().then((reqs) => {
      if (reqs && reqs.length > 0) {
        const tripIds = reqs.filter((r: any) => r.status === 'PENDING' || r.status === 'APPROVED').map((r: any) => r.tripId);
        setRequestedTrips(new Set(tripIds));
      } else {
        setRequestedTrips(new Set());
      }
    }).catch(() => {});
  }, [isLoggedIn]);

  const refreshTrips = useCallback(() => {
    apiService.getTrips().then((remoteTrips) => {
      if (remoteTrips && remoteTrips.length > 0) {
        setTrips(remoteTrips);
      }
    }).catch(() => {});
  }, []);

  const reloadIncomingRequestsCount = useCallback(() => {
    if (!isLoggedIn) return;
    apiService.getIncomingRequests().then((reqs) => {
      if (reqs && reqs.length > 0) {
        const pending = reqs.filter((r: any) => r.status === 'PENDING').length;
        setPendingRequestsCount(pending);
      } else {
        setPendingRequestsCount(0);
      }
    }).catch(() => {
      setPendingRequestsCount(0);
    });
  }, [isLoggedIn]);

  const clearChatUnread = useCallback(() => {
    setHasUnreadChat(false);
  }, []);

  const checkUnreadNotifications = () => {
    if (!isLoggedIn) return;
    apiService.getNotifications().then((notifs) => {
      if (notifs && notifs.length > 0) {
        const hasUnreadJoinAccepted = notifs.some(
          (n: any) => (n.type === 'JOIN_ACCEPTED' || n.category === 'CHAT_ADDED' || n.category === 'JOIN_ACCEPTED') && n.unread === true
        );
        if (hasUnreadJoinAccepted) {
          setHasUnreadChat(true);
        }
      }
    }).catch(() => {});
  };

  const checkUnreadChats = () => {
    if (!isLoggedIn) return;
    apiService.getChats().then((rooms) => {
      if (rooms && rooms.length > 0) {
        const hasUnread = rooms.some((r: any) => r.unread === true || r.unreadCount > 0);
        setHasUnreadChat(hasUnread);
      } else {
        setHasUnreadChat(false);
      }
    }).catch(() => {});
  };

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
  }, [isLoggedIn, profile?.id]);

  const updateProfile = (updated: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updated };
      safeStorage.setItem('savedProfile', JSON.stringify(next)).catch(() => { });
      return next;
    });
    apiService.updateProfile(updated);
  };

  const addTrip = (trip: Trip) => {
    const tripWithMeta = {
      ...trip,
      creatorId: profile?.id,
      isMyTrip: true,
    };
    setTrips((prev) => [tripWithMeta, ...prev]);
    apiService.createTrip(tripWithMeta).then(() => {
      // Re-fetch all trips from backend so isMyTrip is correctly calculated server-side
      refreshTrips();
    }).catch(() => {});
  };

  const joinTrip = (tripId: string) => {
  // Optimistic UI: mark as "requested", but do NOT touch availableSeats/membersCount here.
  // Seats are only decremented on the backend once the organizer approves the JoinRequest
  // (see /interactions/join-request/:id/status). Decrementing locally here caused seats
  // to be counted twice — once fraudulently on request, once for real on approval.
  setRequestedTrips((prev) => {
    const next = new Set(prev);
    next.add(tripId);
    return next;
  });
  apiService.createJoinRequest(tripId).catch(() => {});
};

  const sendMessage = (content: string, mediaType: 'NONE' | 'IMAGE' | 'VOICE' = 'NONE') => {
    socketService.sendMessage(activeRoomId || 'trip-1', profile.name, currentRole, content, mediaType);
  };

  const triggerSOS = (lat: number, lng: number) => {
    const newAlert: SOSAlert = {
      id: `sos-${Date.now()}`,
      userName: profile.name,
      latitude: lat,
      longitude: lng,
      timestamp: new Date().toLocaleTimeString(),
      status: 'ACTIVE',
    };
    setSosAlerts((prev) => [newAlert, ...prev]);
    apiService.triggerSOS(profile.name, lat, lng);
    socketService.triggerSOS(profile.name, lat, lng);
  };

  const resolveSOS = (id: string) => {
    setSosAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, status: 'RESOLVED' } : alert))
    );
    apiService.resolveSOS(id);
    socketService.resolveSOS(id);
  };

  const addWalletFunds = (amount: number) => {
    setProfile((prev) => ({ ...prev, walletBalance: prev.walletBalance + amount }));
    const newTxn = {
      id: `t-${Date.now()}`,
      amount,
      type: 'DEPOSIT',
      remark: 'Added to wallet',
      date: new Date().toISOString().split('T')[0],
    };
    setWalletTransactions((prev) => [newTxn, ...prev]);
    apiService.addWalletFunds(amount);
  };

  const withdrawWalletFunds = (amount: number) => {
    if (profile.walletBalance >= amount) {
      setProfile((prev) => ({ ...prev, walletBalance: prev.walletBalance - amount }));
      const newTxn = {
        id: `t-${Date.now()}`,
        amount: -amount,
        type: 'WITHDRAWAL',
        remark: 'Withdrawn to Bank A/C',
        date: new Date().toISOString().split('T')[0],
      };
      setWalletTransactions((prev) => [newTxn, ...prev]);
      apiService.withdrawWalletFunds(amount);
    }
  };

  const addStory = (storyData: any) => {
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
    apiService.createStory(newStory);
  };

  const providerValue = useMemo(() => ({
    currentRole,
    setCurrentRole,
    profile,
    updateProfile,
    isLoggedIn,
    login,
    logout,
    trips,
    addTrip,
    joinTrip,
    guides,
    messages,
    sendMessage,
    sosAlerts,
    triggerSOS,
    resolveSOS,
    walletTransactions,
    addWalletFunds,
    withdrawWalletFunds,
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
  }), [
    currentRole,
    profile,
    isLoggedIn,
    trips,
    guides,
    messages,
    sosAlerts,
    walletTransactions,
    activeRoomId,
    navbarHidden,
    storiesList,
    requestedTrips,
    pendingRequestsCount,
    hasUnreadChat,
  ]);

  return (
    <AppContext.Provider value={providerValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
