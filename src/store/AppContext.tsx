import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'TOURIST' | 'GUIDE' | 'ORGANIZER' | 'FAMILY_TRAVELER' | 'ADMIN';

export interface UserProfile {
  name: string;
  avatar: string;
  role: UserRole;
  isVerified: boolean;
  aadhaarStatus: 'NONE' | 'PENDING' | 'VERIFIED';
  guideLicenseStatus: 'NONE' | 'PENDING' | 'VERIFIED';
  walletBalance: number;
  rewardPoints: number;
}

export interface Trip {
  id: string;
  name: string;
  creator: string;
  cities: string[];
  startDate: string;
  endDate: string;
  budget: number;
  availableSeats: number;
  totalSeats: number;
  meetingPoint: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  privacy: 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
  membersCount: number;
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
}

export interface SOSAlert {
  id: string;
  userName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

interface AppContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  profile: UserProfile;
  updateProfile: (profile: Partial<UserProfile>) => void;
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  guides: Guide[];
  messages: Message[];
  sendMessage: (content: string, mediaType?: 'NONE' | 'IMAGE' | 'VOICE') => void;
  sosAlerts: SOSAlert[];
  triggerSOS: (lat: number, lng: number) => void;
  resolveSOS: (id: string) => void;
  walletTransactions: any[];
  addWalletFunds: (amount: number) => void;
  withdrawWalletFunds: (amount: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('TOURIST');
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

  useEffect(() => {
    setProfile((prev) => ({ ...prev, role: currentRole }));
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
  ]);

  const [guides] = useState<Guide[]>([
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
  const [walletTransactions, setWalletTransactions] = useState<any[]>([
    { id: 't-1', amount: 1500, type: 'DEPOSIT', remark: 'Added via GPay', date: '2026-07-18' },
    { id: 't-2', amount: -500, type: 'PAYMENT', remark: 'Trip booking advance', date: '2026-07-17' },
    { id: 't-3', amount: 150, type: 'CASHBACK', remark: 'Referral cashback reward', date: '2026-07-16' },
  ]);

  const updateProfile = (updated: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...updated }));
  };

  const addTrip = (trip: Trip) => {
    setTrips((prev) => [trip, ...prev]);
  };

  const sendMessage = (content: string, mediaType: 'NONE' | 'IMAGE' | 'VOICE' = 'NONE') => {
    const newMsg: Message = {
      id: `m-${Date.now()}`,
      senderName: profile.name,
      senderRole: currentRole,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mediaType,
    };
    setMessages((prev) => [...prev, newMsg]);
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
  };

  const resolveSOS = (id: string) => {
    setSosAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, status: 'RESOLVED' } : alert))
    );
  };

  const addWalletFunds = (amount: number) => {
    setProfile((prev) => ({ ...prev, walletBalance: prev.walletBalance + amount }));
    setWalletTransactions((prev) => [
      {
        id: `t-${Date.now()}`,
        amount,
        type: 'DEPOSIT',
        remark: 'Added to wallet',
        date: new Date().toISOString().split('T')[0],
      },
      ...prev,
    ]);
  };

  const withdrawWalletFunds = (amount: number) => {
    if (profile.walletBalance >= amount) {
      setProfile((prev) => ({ ...prev, walletBalance: prev.walletBalance - amount }));
      setWalletTransactions((prev) => [
        {
          id: `t-${Date.now()}`,
          amount: -amount,
          type: 'WITHDRAWAL',
          remark: 'Withdrawn to Bank A/C',
          date: new Date().toISOString().split('T')[0],
        },
        ...prev,
      ]);
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        profile,
        updateProfile,
        trips,
        addTrip,
        guides,
        messages,
        sendMessage,
        sosAlerts,
        triggerSOS,
        resolveSOS,
        walletTransactions,
        addWalletFunds,
        withdrawWalletFunds,
      }}
    >
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
