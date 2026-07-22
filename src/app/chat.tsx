import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  DollarSign,
  Download,
  Globe as TranslateIcon,
  Image as ImageIcon,
  Info,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Smile,
  Star,
  Users as UsersIcon,
  Video,
  X
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Color Palette matching search theme exactly
const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1A1D30',
  white: '#FFFFFF',
  textSec: '#7E8494',
  textMuted: '#64748B',
  blue: '#0066FF',
  blueGlow: '#00F2FE',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  purple: '#8B5CF6',
  pink: '#EC4899',
  yellow: '#FBBF24',
};

// Custom Type for Rich Messages
interface CustomMessage {
  id: string;
  senderName: string;
  senderRole: 'Organizer' | 'Guide' | 'Tourist' | 'Family' | 'System' | string;
  avatar: string;
  content: string;
  timestamp: string;
  isMe: boolean;
  type?: 'text' | 'image' | 'voice' | 'poll' | 'expense' | 'location' | 'sos';
  mediaUrl?: string;
  translations?: Record<string, string>;
  pollQuestion?: string;
  pollOptions?: { text: string; votes: number }[];
  pollVoted?: number; // index of option voted by me
  expenseAmount?: number;
  expenseDesc?: string;
  expenseSplitWith?: number;
  locationCoords?: { latitude: number; longitude: number };
  sosId?: string;
  resolved?: boolean;
}

// Initial messages mapped by tripId (Unified streams)
const INITIAL_TRIP_MESSAGES: Record<string, CustomMessage[]> = {
  // --- TRIP 1: Vrindavan ---
  'trip-1': [
    {
      id: 't1-ann-1',
      senderName: 'Vikram Singh',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&q=80',
      content: 'Welcome everyone to the Ranchi-Vrindavan spiritual journey! 🌸 Let\'s coordinate our schedules here.',
      timestamp: 'Yesterday, 10:30 AM',
      isMe: false,
    },
    {
      id: 't1-g-1',
      senderName: 'Rajesh Kumar',
      senderRole: 'Guide',
      avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80',
      content: 'Radhe Radhe! 🙏 I am Rajesh, your spiritual guide for this trip. I will meet you all at Mathura Junction. Let me know if you need help with temple entry details or special darshan.',
      timestamp: 'Yesterday, 04:00 PM',
      isMe: false,
    },
    {
      id: 't1-gen-1',
      senderName: 'Vikram Singh',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&q=80',
      content: 'Hey team! 👋 We start from Ranchi Junction on 12th August. Make sure your luggage is tagged.',
      timestamp: '10:30 AM',
      isMe: false,
      translations: {
        hindi: 'हे टीम! 👋 हम 12 अगस्त को रांची जंक्शन से शुरू करेंगे। सुनिश्चित करें कि आपका सामान टैग किया गया है।'
      }
    },
    {
      id: 't1-gen-2',
      senderName: 'Suman Gupta',
      senderRole: 'Tourist',
      avatar: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&q=80',
      content: 'Super excited! 😍 Is the train ticket booking included in the budget or do we pay extra?',
      timestamp: '10:32 AM',
      isMe: false,
      translations: {
        hindi: 'बेहद उत्साहित! 😍 क्या ट्रेन टिकट बुकिंग बजट में शामिल है या हमें अलग से भुगतान करना होगा?'
      }
    },
    {
      id: 't1-gen-3',
      senderName: 'Vikram Singh',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&q=80',
      content: 'Yes, it is included in the base package of ₹8500 per head.',
      timestamp: '10:33 AM',
      isMe: false,
      translations: {
        hindi: 'हां, यह ₹8500 प्रति व्यक्ति के मूल पैकेज में शामिल है।'
      }
    }
  ],

  // --- TRIP 2: Leh Ladakh ---
  'trip-2': [
    {
      id: 't2-ann-1',
      senderName: 'Aditya Sen',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      content: 'Welcome riders! 🏍️ Leh Ladakh expedition is locked. Acclimatization is key. First 2 days in Leh we will rest. No high altitude rides on Day 1 & 2.',
      timestamp: '3 Days ago',
      isMe: false,
    },
    {
      id: 't2-g-1',
      senderName: 'Lobsang Yeshi',
      senderRole: 'Guide',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      content: 'Juley! 👋 Welcome to Ladakh. I am Lobsang Yeshi, your native guide. I have arranged the Inner Line Permits for Pangong and Nubra. I will bring extra oxygen cylinders in our backup vehicle.',
      timestamp: 'Yesterday',
      isMe: false,
    },
    {
      id: 't2-gen-1',
      senderName: 'Aditya Sen',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      content: 'Ready to roll guys? Make sure your bikes are serviced. Changing engine oil and checking brake pads is highly recommended.',
      timestamp: '09:00 AM',
      isMe: false,
    },
    {
      id: 't2-gen-2',
      senderName: 'Priya Nair',
      senderRole: 'Tourist',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      content: 'Servicing is complete! Fitted off-road tires too. Ready for the Sarchu river crossings.',
      timestamp: '09:12 AM',
      isMe: false,
    }
  ],

  // --- TRIP 3: Kerala ---
  'trip-3': [
    {
      id: 't3-ann-1',
      senderName: 'Priya Nair',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      content: 'Hello family! 🌴 Kerala Backwaters trip itinerary finalized. We have booked private luxury houseboats in Alleppey. Check in at 12 PM on 28th Aug.',
      timestamp: '2 days ago',
      isMe: false,
    },
    {
      id: 't3-g-1',
      senderName: 'Anjali Sharma',
      senderRole: 'Guide',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      content: 'Namaskaram! 🙏 I am Anjali Sharma, your tourist guide. I speak English, Hindi, and Malayalam. Looking forward to showing you the beautiful tea gardens of Munnar.',
      timestamp: 'Yesterday',
      isMe: false,
    },
    {
      id: 't3-gen-1',
      senderName: 'Priya Nair',
      senderRole: 'Organizer',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      content: 'Weather check: Munnar is cool (18°C) but carrying an umbrella is smart since rains are unpredictable.',
      timestamp: 'Yesterday',
      isMe: false,
    }
  ],
};

// Initial Polls per Trip
const INITIAL_TRIP_POLLS: Record<string, { question: string; options: { text: string; votes: number }[]; voted?: number }> = {
  'trip-1': {
    question: 'Where should we have group dinner in Vrindavan?',
    options: [
      { text: 'Govinda\'s Restaurant (ISKCON)', votes: 8 },
      { text: 'Prem Mandir Local Braj Dhaba', votes: 4 }
    ],
  },
  'trip-2': {
    question: 'Select tomorrow\'s ride departure time from Sarchu:',
    options: [
      { text: '06:00 AM (Avoid water crossings)', votes: 5 },
      { text: '08:00 AM (Warm sunshine, but water rises)', votes: 2 }
    ],
  },
  'trip-3': {
    question: 'Lunch preference on the Houseboat trip:',
    options: [
      { text: 'Traditional Kerala Sadya (Veg on leaf)', votes: 6 },
      { text: 'Mixed Seafood Platter & Grill', votes: 3 }
    ],
  }
};

// Initial Expenses per Trip
interface TripExpense {
  id: string;
  amount: number;
  description: string;
  paidBy: string;
  splitWith: number;
}
const INITIAL_TRIP_EXPENSES: Record<string, TripExpense[]> = {
  'trip-1': [
    { id: 'exp-1', amount: 8500, description: 'Train Ticket Booking', paidBy: 'Vikram Singh', splitWith: 12 },
    { id: 'exp-2', amount: 4500, description: 'Taxi from Delhi to Vrindavan', paidBy: 'Vikram Singh', splitWith: 12 },
    { id: 'exp-3', amount: 1200, description: 'Breakfast on Day 1', paidBy: 'Suman Gupta', splitWith: 12 },
  ],
  'trip-2': [
    { id: 'exp-1', amount: 25000, description: 'Royal Enfield Rental Deposit', paidBy: 'Aditya Sen', splitWith: 8 },
    { id: 'exp-2', amount: 10000, description: 'Fuel Backup Canisters', paidBy: 'Aditya Sen', splitWith: 8 },
  ],
  'trip-3': [
    { id: 'exp-1', amount: 9000, description: 'Alleppey Resort Advance', paidBy: 'Priya Nair', splitWith: 10 },
  ]
};

// WhatsApp-style Room model
interface ChatRoom {
  id: string;
  tripId: string;
  name: string;
  avatar: string;
  type: 'GROUP' | 'GUIDE' | 'SAFETY';
  latestMessage: string;
  latestTime: string;
  unreadCount: number;
  badge?: string;
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trips, guides, profile, sosAlerts, triggerSOS, resolveSOS, activeRoomId, setActiveRoomId } = useApp();

  // Navigation States
  const selectedRoomId = activeRoomId;
  const setSelectedRoomId = setActiveRoomId;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filters for the Inbox List view
  const [inboxFilter, setInboxFilter] = useState<'ALL' | 'GROUPS' | 'GUIDES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Trip selection (binds details drawer + polls + expenses)
  const [selectedTripId, setSelectedTripId] = useState<string>('trip-1');

  // Bottom attachments overlay
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const attachPanelHeight = useRef(new Animated.Value(0)).current;

  // Keyboard height tracking for input bar repositioning
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Custom Modal Forms
  const [activeModal, setActiveModal] = useState<'NONE' | 'POLL' | 'EXPENSE' | 'LOCATION'>('NONE');
  const [pollForm, setPollForm] = useState({ question: '', opt1: '', opt2: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', desc: '' });
  const [locationForm, setLocationForm] = useState({ label: '', lat: '', lng: '' });

  // Stateful Chat Data
  const [tripMessages, setTripMessages] = useState<Record<string, CustomMessage[]>>(INITIAL_TRIP_MESSAGES);
  const [tripPolls, setTripPolls] = useState<Record<string, typeof INITIAL_TRIP_POLLS['trip-1']>>(INITIAL_TRIP_POLLS);
  const [tripExpenses, setTripExpenses] = useState<Record<string, TripExpense[]>>(INITIAL_TRIP_EXPENSES);

  // Inbox Rooms state - updates snippet text in real-time
  const [inboxRooms, setInboxRooms] = useState<ChatRoom[]>([
    {
      id: 'room-vrindavan-group',
      tripId: 'trip-1',
      name: 'Ranchi-Vrindavan Group Chat',
      avatar: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=150&q=80',
      type: 'GROUP',
      latestMessage: 'Vikram Singh: Yes, it is included in the base package of ₹8500 per head.',
      latestTime: '10:33 AM',
      unreadCount: 2,
      badge: 'Trip Group',
    },
    {
      id: 'room-ladakh-group',
      tripId: 'trip-2',
      name: 'Leh Ladakh Bike Expedition',
      avatar: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=150&q=80',
      type: 'GROUP',
      latestMessage: 'Priya Nair: Servicing is complete! Fitted off-road tires too.',
      latestTime: '09:12 AM',
      unreadCount: 0,
      badge: 'Bikers',
    },
    {
      id: 'room-kerala-group',
      tripId: 'trip-3',
      name: 'Kerala Backwaters & Hills',
      avatar: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=150&q=80',
      type: 'GROUP',
      latestMessage: 'Priya Nair: Munnar is cool (18°C) but carry umbrellas.',
      latestTime: 'Yesterday',
      unreadCount: 0,
      badge: 'Family',
    },
    {
      id: 'room-guide-rajesh',
      tripId: 'trip-1',
      name: 'Rajesh Kumar (Guide)',
      avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80',
      type: 'GUIDE',
      latestMessage: 'Rajesh Kumar: Modest attire is recommended for temples.',
      latestTime: 'Yesterday',
      unreadCount: 0,
      badge: 'Braj Expert',
    },
    {
      id: 'room-guide-lobsang',
      tripId: 'trip-2',
      name: 'Lobsang Yeshi (Guide)',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      type: 'GUIDE',
      latestMessage: 'Lobsang: Acclimatization is key. First 2 days in Leh we rest.',
      latestTime: 'Yesterday',
      unreadCount: 0,
      badge: 'Local Rider',
    }
  ]);

  // Input states
  const [inputText, setInputText] = useState('');
  const [translatedMsgs, setTranslatedMsgs] = useState<Set<string>>(new Set());

  // Typing simulator
  const [isTyping, setIsTyping] = useState(false);
  const [typerName, setTyperName] = useState('Neha');

  // SOS Countdown
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<any>(null);

  // Scroll ref
  const scrollViewRef = useRef<ScrollView>(null);

  // Fetch current active trip data
  const activeTrip = trips.find(t => t.id === selectedTripId) || {
    id: 'trip-1',
    name: 'Ranchi to Vrindavan Spiritual Journey',
    cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    startDate: '2026-08-12',
    endDate: '2026-08-17',
    meetingPoint: 'Ranchi Junction Platform 1',
    budget: 8500,
    membersCount: 12,
  };

  // Find guide details
  const activeGuide = guides.find(g => {
    if (selectedTripId === 'trip-1') return g.id === 'guide-1';
    if (selectedTripId === 'trip-2') return g.id === 'guide-3';
    return g.id === 'guide-2';
  }) || guides[0];

  // Active global SOS check
  const activeSOS = sosAlerts.find(sos => sos.status === 'ACTIVE');

  // Toggle Attachment panel Animation
  useEffect(() => {
    Animated.timing(attachPanelHeight, {
      toValue: isAttachmentOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isAttachmentOpen]);

  // Keyboard show/hide — lift input bar above keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const kbHeight = e.endCoordinates.height;
      Animated.timing(keyboardOffset, {
        toValue: kbHeight,
        duration: Platform.OS === 'ios' ? 250 : 150,
        useNativeDriver: false,
      }).start();
      scrollToBottom();
    });

    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? 200 : 100,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Typing indicator simulation
  useEffect(() => {
    const timer = setTimeout(() => {
      setTyperName(selectedTripId === 'trip-2' ? 'Aditya' : 'Suman');
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 5000);
    }, 5000);
    return () => clearTimeout(timer);
  }, [selectedTripId, selectedRoomId]);

  // Auto scroll
  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  useEffect(() => {
    if (selectedRoomId) {
      scrollToBottom();
    }
  }, [selectedRoomId, tripMessages]);

  // Translate toggle
  const toggleTranslate = (id: string) => {
    setTranslatedMsgs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Core send message handler
  const sendNewMessage = (msgData: Partial<CustomMessage>) => {
    const key = selectedTripId;
    const newMsg: CustomMessage = {
      id: `msg-${Date.now()}`,
      senderName: profile.name,
      senderRole: profile.role === 'TOURIST' ? 'Tourist' : 'Organizer',
      avatar: profile.avatar,
      content: msgData.content || '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
      ...msgData
    };

    // Update messages map
    setTripMessages(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newMsg]
    }));

    // Update the WhatsApp Inbox snippet text dynamically!
    setInboxRooms(prevRooms =>
      prevRooms.map(room => {
        if (room.tripId === selectedTripId) {
          return {
            ...room,
            latestMessage: `You: ${msgData.content || 'Attachment shared'}`,
            latestTime: newMsg.timestamp,
            unreadCount: 0,
          };
        }
        return room;
      })
    );

    scrollToBottom();
  };

  // Submit keyboard text message
  const handleSendText = () => {
    if (inputText.trim() === '') return;
    sendNewMessage({
      content: inputText,
      type: 'text'
    });
    setInputText('');
  };

  // Vote in Poll
  const handlePollVote = (msgId: string, optionIndex: number) => {
    const key = selectedTripId;
    setTripMessages(prev => {
      const currentList = prev[key] || [];
      const updatedList = currentList.map(msg => {
        if (msg.id === msgId && msg.pollOptions) {
          const votedPrev = msg.pollVoted;
          const updatedOptions = msg.pollOptions.map((opt, idx) => {
            let delta = 0;
            if (idx === optionIndex) delta = 1;
            if (idx === votedPrev) delta = -1;
            return { ...opt, votes: Math.max(0, opt.votes + delta) };
          });
          return {
            ...msg,
            pollOptions: updatedOptions,
            pollVoted: votedPrev === optionIndex ? undefined : optionIndex
          };
        }
        return msg;
      });
      return { ...prev, [key]: updatedList };
    });
  };

  // Submit Poll
  const handleCreatePollSubmit = () => {
    if (!pollForm.question || !pollForm.opt1 || !pollForm.opt2) return;
    const pollMessage: Partial<CustomMessage> = {
      type: 'poll',
      content: `📊 Group Poll: ${pollForm.question}`,
      pollQuestion: pollForm.question,
      pollOptions: [
        { text: pollForm.opt1, votes: 0 },
        { text: pollForm.opt2, votes: 0 }
      ]
    };
    sendNewMessage(pollMessage);
    setPollForm({ question: '', opt1: '', opt2: '' });
    setActiveModal('NONE');
    setIsAttachmentOpen(false);
  };

  // Submit Expense
  const handleLogExpenseSubmit = () => {
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt <= 0 || !expenseForm.desc) return;
    
    const newExpense: TripExpense = {
      id: `exp-${Date.now()}`,
      amount: amt,
      description: expenseForm.desc,
      paidBy: profile.name,
      splitWith: activeTrip.membersCount || 10
    };

    setTripExpenses(prev => ({
      ...prev,
      [selectedTripId]: [...(prev[selectedTripId] || []), newExpense]
    }));

    const expenseMessage: Partial<CustomMessage> = {
      type: 'expense',
      content: `💸 Shared Expense: ${expenseForm.desc} - ₹${amt}`,
      expenseAmount: amt,
      expenseDesc: expenseForm.desc,
      expenseSplitWith: activeTrip.membersCount || 10
    };

    sendNewMessage(expenseMessage);
    setExpenseForm({ amount: '', desc: '' });
    setActiveModal('NONE');
    setIsAttachmentOpen(false);
  };

  // Submit Location
  const handleShareLocationSubmit = () => {
    if (!locationForm.label) return;
    const lat = parseFloat(locationForm.lat) || 27.5650;
    const lng = parseFloat(locationForm.lng) || 77.6593;

    const locationMessage: Partial<CustomMessage> = {
      type: 'location',
      content: `📍 Location Shared: ${locationForm.label}`,
      locationCoords: { latitude: lat, longitude: lng },
    };

    sendNewMessage(locationMessage);
    setLocationForm({ label: '', lat: '', lng: '' });
    setActiveModal('NONE');
    setIsAttachmentOpen(false);
  };

  // Voice note simulator
  const handleVoiceNoteSimulate = () => {
    setIsAttachmentOpen(false);
    sendNewMessage({
      content: '🎙️ Audio Recording...',
      type: 'voice',
      mediaUrl: 'simulated_voice_note.mp3'
    });
  };

  // Photo receipt simulator
  const handlePhotoSimulate = () => {
    setIsAttachmentOpen(false);
    sendNewMessage({
      content: '📷 Uploaded a photo receipt',
      type: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80'
    });
  };

  // SOS Countdown handles
  const startSOSCountdown = () => {
    setSosCountdown(3);
    countdownInterval.current = setInterval(() => {
      setSosCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(countdownInterval.current!);
          triggerSOSEvent();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }
    setSosCountdown(null);
  };

  // Trigger SOS context logic
  const triggerSOSEvent = () => {
    let lat = 27.5650;
    let lng = 77.6593;
    if (selectedTripId === 'trip-2') {
      lat = 34.1526; lng = 77.5770;
    } else if (selectedTripId === 'trip-3') {
      lat = 9.9312; lng = 76.2673;
    }

    triggerSOS(lat, lng);

    const sosMessage: CustomMessage = {
      id: `sos-gen-${Date.now()}`,
      type: 'sos',
      content: `🚨 SOS PANIC TRIGGERED by ${profile.name}! Needs immediate assistance.`,
      locationCoords: { latitude: lat, longitude: lng },
      resolved: false,
      senderName: profile.name,
      senderRole: 'Tourist',
      avatar: profile.avatar,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };

    setTripMessages(prev => {
      const key = selectedTripId;
      return {
        ...prev,
        [key]: [...(prev[key] || []), sosMessage]
      };
    });

    setInboxRooms(prevRooms =>
      prevRooms.map(room => {
        if (room.tripId === selectedTripId) {
          return {
            ...room,
            latestMessage: `🚨 SOS Alert Triggered!`,
            latestTime: 'Now',
          };
        }
        return room;
      })
    );
  };

  const handleResolveSOSEvent = () => {
    if (activeSOS) {
      resolveSOS(activeSOS.id);
    }
  };

  // Get total expense amount
  const getExpensesTotal = () => {
    const list = tripExpenses[selectedTripId] || [];
    return list.reduce((sum, item) => sum + item.amount, 0);
  };

  const attachMenuHeight = attachPanelHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });

  // Filtered rooms listing
  const filteredRooms = inboxRooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.latestMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (inboxFilter === 'ALL') return true;
    if (inboxFilter === 'GROUPS') return room.type === 'GROUP';
    if (inboxFilter === 'GUIDES') return room.type === 'GUIDE';

    return true;
  });

  // Retrieve current active messages list (unified feed)
  const currentMessages = tripMessages[selectedTripId] || [];

  // Find Room info of the selected room
  const activeRoom = inboxRooms.find(r => r.id === selectedRoomId);

  // --- SCREEN 1: WHATSAPP-STYLE INBOX LIST VIEW ---
  if (!selectedRoomId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.inboxContainer}>
        
        {/* WhatsApp-Style Header */}
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxHeaderTitle}>TravelStar Chats</Text>
          <View style={styles.inboxHeaderIcons}>
            <TouchableOpacity style={styles.headerIconTouch}>
              <UsersIcon size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconTouch}>
              <MoreVertical size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchBarWrapper}>
          <View style={styles.searchBarInner}>
            <Search size={16} color={C.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search groups, guides, or alerts..."
              placeholderTextColor={C.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
            />
          </View>
        </View>

        {/* Category filters */}
        <View style={styles.inboxFiltersRow}>
          {(['ALL', 'GROUPS', 'GUIDES'] as const).map(filter => {
            const isSelected = inboxFilter === filter;
            const label = filter === 'ALL' ? 'All Chats' :
                          filter === 'GROUPS' ? 'Groups' : 'Guides';
            
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                onPress={() => setInboxFilter(filter)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SOS Pulse Alerter if active globally */}
        {activeSOS && (
          <TouchableOpacity
            style={styles.safetyTickerBanner}
            onPress={() => {
              setSelectedTripId('trip-1'); // default to Vrindavan
              setSelectedRoomId('room-vrindavan-group');
            }}
          >
            <AlertTriangle size={15} color="#FFF" style={styles.sosFlash} />
            <Text style={styles.safetyTickerText} numberOfLines={1}>
              CRITICAL: Active SOS for {activeSOS.userName}! Tap to join room.
            </Text>
          </TouchableOpacity>
        )}

        {/* Inbox Rooms Scroll List */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
          {filteredRooms.map((room) => {
            const hasUnread = room.unreadCount > 0;

            return (
              <TouchableOpacity
                key={room.id}
                style={[
                  styles.roomItemTouch,
                  activeSOS && room.tripId === activeSOS.id.split('-')[1] && styles.sosBlinkingRoomBorder
                ]}
                onPress={() => {
                  setSelectedRoomId(room.id);
                  setSelectedTripId(room.tripId);
                }}
                activeOpacity={0.85}
              >
                {/* Avatar left */}
                <View style={styles.roomAvatarWrap}>
                  <Image source={{ uri: room.avatar }} style={styles.roomAvatarImg} />
                  {room.type === 'GUIDE' ? (
                    <View style={styles.onlineBadgeGuide} />
                  ) : (
                    <View style={[styles.onlineBadgeGuide, { backgroundColor: C.blue }]} />
                  )}
                </View>

                {/* Info Center */}
                <View style={styles.roomMetaWrap}>
                  <View style={styles.roomNameRow}>
                    <Text style={styles.roomNameText} numberOfLines={1}>{room.name}</Text>
                    <Text style={[styles.roomTimeText, hasUnread && { color: C.blueGlow }]}>{room.latestTime}</Text>
                  </View>

                  <View style={styles.roomSnippetRow}>
                    <Text style={[styles.roomSnippetText, hasUnread && { color: '#FFF', fontWeight: '500' }]} numberOfLines={1}>
                      {room.latestMessage}
                    </Text>
                    <View style={styles.roomBadgeWrap}>
                      {room.badge && (
                        <View style={[
                          styles.inboxTag,
                          room.type === 'GUIDE' ? styles.tagPurple : styles.tagBlue
                        ]}>
                          <Text style={styles.inboxTagText}>{room.badge}</Text>
                        </View>
                      )}
                      {hasUnread && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{room.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- SCREEN 2: CLEAN CONVERSATION DETAIL VIEW ---
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      
      {/* ─── CLEAN ROOM HEADER BAR ───────────────────────────── */}
      <View style={styles.roomHeaderBar}>
        <View style={styles.headerLeftMeta}>
          <TouchableOpacity
            style={styles.backBtnTouch}
            onPress={() => {
              setSelectedRoomId(null);
              setIsSettingsOpen(false);
            }}
          >
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>
          
          <Image source={{ uri: activeRoom?.avatar }} style={styles.roomHeaderAvatar} />
          
          <TouchableOpacity 
            style={styles.roomHeaderTitles}
            onPress={() => setIsSettingsOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.roomHeaderNameText} numberOfLines={1}>{activeRoom?.name}</Text>
            <View style={styles.activityStatusRow}>
              <View style={styles.statusGreenDot} />
              <Text style={styles.roomHeaderStatusText}>
                Active Group Ledger • {activeTrip.membersCount || 10} members
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity style={styles.actionRoundBtn} onPress={() => router.push('/map')}>
            <MapPin size={15} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRoundBtn} onPress={() => setIsSettingsOpen(true)}>
            <Settings size={15} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── SOS ACTIVE BANNER ─────────────────────────────────── */}
      {activeSOS && (
        <LinearGradient
          colors={['#7A0010', '#D32F2F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sosAlertBanner}
        >
          <View style={styles.sosBannerLeft}>
            <AlertTriangle size={18} color="#FFF" style={styles.sosPulse} />
            <Text style={styles.sosBannerText}>
              🚨 SOS Alert: {activeSOS.userName} needs help!
            </Text>
          </View>
          <View style={styles.sosBannerRight}>
            <TouchableOpacity
              style={styles.sosBannerActionBtn}
              onPress={() => router.push('/map')}
            >
              <Text style={styles.sosBannerBtnText}>Locate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sosBannerActionBtn, { backgroundColor: '#FFF' }]}
              onPress={handleResolveSOSEvent}
            >
              <Text style={[styles.sosBannerBtnText, { color: '#D32F2F' }]}>Safe</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      )}

      {/* ─── WORKSPACE CONTENT AREA (CLEAN CONVERSATION FEED) ───── */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={scrollToBottom}
        >
          {currentMessages.map((msg, idx) => {
            const hasTranslation = !!translatedMsgs.has(msg.id);
            const displayedContent = hasTranslation && msg.translations?.hindi ? msg.translations.hindi : msg.content;
            const isSOS = msg.type === 'sos';

            // Check if previous message was sent by the same sender using senderName as key
            const isConsecutive = idx > 0 && currentMessages[idx - 1].senderName === msg.senderName;

            return (
              <View key={msg.id} style={[styles.messageRow, msg.isMe && { justifyContent: 'flex-end' }, isSOS && styles.sosMessageBg, isConsecutive && { marginTop: 2 }]}>
                {!msg.isMe && (
                  <View style={styles.avatarContainer}>
                    {!isConsecutive && (
                      <>
                        <Image source={{ uri: msg.avatar }} style={styles.messageAvatar} />
                        {msg.senderRole === 'Organizer' && (
                          <View style={styles.roleOnlineBadge} />
                        )}
                      </>
                    )}
                  </View>
                )}

                <View style={[styles.messageBody, msg.isMe ? { flex: 0, alignItems: 'flex-end', alignSelf: 'flex-end', maxWidth: '85%' } : { flex: 1 }]}>
                  {!isConsecutive && (
                    <View style={[styles.senderHeader, msg.isMe && { justifyContent: 'flex-end' }]}>
                      <Text style={[
                        styles.senderNameText,
                        msg.senderRole === 'Organizer' ? { color: C.blueGlow } :
                        msg.senderRole === 'Guide' ? { color: C.purple } : { color: C.green }
                      ]}>
                        {msg.isMe ? 'You' : msg.senderName}
                      </Text>
                      {msg.senderRole && !msg.isMe && (
                        <View style={[
                          styles.rolePill,
                          msg.senderRole === 'Organizer' ? styles.rolePillOrganizer :
                          msg.senderRole === 'Guide' ? styles.rolePillGuide : styles.rolePillTourist
                        ]}>
                          <Text style={styles.rolePillText}>{msg.senderRole}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {msg.type === 'poll' ? (
                    <View style={styles.pollCard}>
                      <View style={styles.pollHeader}>
                        <BarChart2 size={16} color={C.orange} style={{ marginRight: 6 }} />
                        <Text style={styles.pollQuestionText}>{msg.pollQuestion}</Text>
                      </View>
                      {msg.pollOptions?.map((opt, idx) => {
                        const totalVotes = msg.pollOptions?.reduce((acc, current) => acc + current.votes, 0) || 1;
                        const percent = Math.round((opt.votes / totalVotes) * 100) || 0;
                        const isVotedByMe = msg.pollVoted === idx;

                        return (
                          <TouchableOpacity
                            key={opt.text}
                            style={[styles.pollOptionTouch, isVotedByMe && styles.pollOptionVoted]}
                            onPress={() => handlePollVote(msg.id, idx)}
                          >
                            <View style={[styles.pollProgressFill, { width: `${percent}%` }]} />
                            <View style={styles.pollOptionContent}>
                              <Text style={[styles.pollOptionLabel, isVotedByMe && { fontWeight: '800', color: '#FFF' }]}>{opt.text}</Text>
                              <Text style={styles.pollOptionPercent}>{percent}% ({opt.votes})</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      <Text style={styles.pollFooter}>Tap option to vote in thread</Text>
                    </View>
                  ) : msg.type === 'expense' ? (
                    <View style={styles.expenseCard}>
                      <View style={styles.expenseHeader}>
                        <DollarSign size={16} color={C.green} />
                        <Text style={styles.expenseHeaderTitle}>Shared Expense Logged</Text>
                      </View>
                      <Text style={styles.expenseBillDesc}>{msg.expenseDesc}</Text>
                      <Text style={styles.expenseBillAmount}>₹{msg.expenseAmount}</Text>
                      <View style={styles.expenseDivider} />
                      <View style={styles.expenseFooterRow}>
                        <Text style={styles.expenseShareText}>Split with {msg.expenseSplitWith} members</Text>
                        <Text style={styles.expenseCostHead}>₹{Math.round((msg.expenseAmount || 0) / (msg.expenseSplitWith || 1))}/head</Text>
                      </View>
                    </View>
                  ) : msg.type === 'location' ? (
                    <View style={styles.locationCard}>
                      <View style={styles.locationHeader}>
                        <MapPin size={16} color={C.blueGlow} />
                        <Text style={styles.locationCardTitle}>Shared Meeting Point</Text>
                      </View>
                      <Text style={styles.locationText}>{msg.content}</Text>
                      <View style={styles.miniMapPlaceholder}>
                        <View style={styles.radarRing1} />
                        <View style={styles.radarRing2} />
                        <MapPin size={24} color={C.red} style={styles.miniMapPin} />
                        <Text style={styles.coordsText}>Lat: {msg.locationCoords?.latitude.toFixed(4)}, Lng: {msg.locationCoords?.longitude.toFixed(4)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.locationActionTouch}
                        onPress={() => router.push('/map')}
                      >
                        <Text style={styles.locationActionText}>Open Live Navigation</Text>
                      </TouchableOpacity>
                    </View>
                  ) : msg.type === 'voice' ? (
                    <View style={styles.voiceNoteCard}>
                      <TouchableOpacity style={styles.playButtonCircle}>
                        <View style={styles.playArrow} />
                      </TouchableOpacity>
                      <View style={styles.waveformContainer}>
                        <View style={[styles.waveBar, { height: 12, backgroundColor: C.blueGlow }]} />
                        <View style={[styles.waveBar, { height: 22, backgroundColor: C.blueGlow }]} />
                        <View style={[styles.waveBar, { height: 18, backgroundColor: C.blueGlow }]} />
                        <View style={[styles.waveBar, { height: 14, backgroundColor: C.textSec }]} />
                        <View style={[styles.waveBar, { height: 8, backgroundColor: C.textSec }]} />
                        <View style={[styles.waveBar, { height: 16, backgroundColor: C.textSec }]} />
                        <View style={[styles.waveBar, { height: 24, backgroundColor: C.textSec }]} />
                        <View style={[styles.waveBar, { height: 10, backgroundColor: C.textSec }]} />
                      </View>
                      <Text style={styles.voiceDuration}>0:04</Text>
                    </View>
                  ) : msg.type === 'image' ? (
                    <View style={styles.imageCard}>
                      <Image source={{ uri: msg.mediaUrl }} style={styles.imageMedia} />
                      <View style={styles.imageOverlayTextRow}>
                        <Text style={styles.imageCardDesc} numberOfLines={1}>{msg.content}</Text>
                        <TouchableOpacity style={styles.imageDownloadBtn}>
                          <Download size={14} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : msg.type === 'sos' ? (
                    <View style={styles.sosCardAlert}>
                      <View style={styles.sosAlertHeader}>
                        <AlertCircle size={18} color="#FFF" />
                        <Text style={styles.sosAlertHeaderTitle}>CRITICAL EMERGENCY WARNING</Text>
                      </View>
                      <Text style={styles.sosAlertDesc}>{msg.content}</Text>
                      <Text style={styles.sosAlertCoords}>Coordinates: {msg.locationCoords?.latitude.toFixed(4)}, {msg.locationCoords?.longitude.toFixed(4)}</Text>
                      <View style={styles.sosAlertBtnRow}>
                        <TouchableOpacity
                          style={[styles.sosAlertBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                          onPress={() => router.push('/map')}
                        >
                          <Text style={styles.sosAlertBtnText}>Show on Map</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.sosAlertBtn, { backgroundColor: C.green }]}
                          onPress={handleResolveSOSEvent}
                        >
                          <Text style={styles.sosAlertBtnText}>Mark as Safe</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={[msg.isMe ? styles.instagramBubbleContainerMe : styles.bubbleContainerOther]}>
                      {msg.isMe ? (
                        <LinearGradient
                          colors={['#0066FF', '#7C3AED', '#BA68C8']}
                          start={(() => {
                            // Compute deterministic but randomized start coordinates based on message ID
                            let hash = 0;
                            const idStr = msg.id || 'random';
                            for (let i = 0; i < idStr.length; i++) {
                              hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
                            }
                            const normX = (Math.abs(hash) % 5) / 10; // 0.0 to 0.4
                            const normY = (Math.abs(hash >> 2) % 5) / 10; // 0.0 to 0.4
                            return { x: normX, y: normY };
                          })()}
                          end={(() => {
                            let hash = 0;
                            const idStr = msg.id || 'random';
                            for (let i = 0; i < idStr.length; i++) {
                              hash = idStr.charCodeAt(i) + ((hash << 3) - hash);
                            }
                            const normX = 0.6 + (Math.abs(hash) % 5) / 10; // 0.6 to 1.0
                            const normY = 0.6 + (Math.abs(hash >> 2) % 5) / 10; // 0.6 to 1.0
                            return { x: normX, y: normY };
                          })()}
                          style={styles.instagramGradientBubble}
                        >
                          <Text style={styles.bubbleTextMe}>{displayedContent}</Text>
                          <Text style={styles.timestampTextMe}>{msg.timestamp}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.bubble, styles.bubbleOther]}>
                          <Text style={styles.bubbleText}>{displayedContent}</Text>
                          {msg.translations && (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => toggleTranslate(msg.id)}
                              style={styles.translateRow}
                            >
                              <TranslateIcon size={12} color={C.blueGlow} />
                              <Text style={styles.translateText}>
                                {hasTranslation ? 'Show Original' : 'Translate to Hindi'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <Text style={styles.timestampText}>{msg.timestamp}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {isTyping && (
            <View style={styles.typingIndicatorRow}>
              <View style={styles.typingDotWrap}>
                <Text style={styles.typingText}>{typerName} is typing</Text>
                <ActivityIndicator size="small" color={C.textSec} style={{ marginLeft: 6 }} />
              </View>
            </View>
          )}
          
          {/* Scroll spacer dynamically adjusts with keyboard height to keep latest messages just above the input box */}
          <Animated.View style={{ height: Animated.add(selectedRoomId ? 110 : 170, keyboardOffset) }} />
        </ScrollView>

        {/* Floating Attachments Drawer */}
        <Animated.View style={[styles.attachmentPanel, { height: attachMenuHeight, bottom: Animated.add(selectedRoomId ? Math.max(insets.bottom + 58, 74) : 140, keyboardOffset) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachScrollInner}>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setActiveModal('POLL')}>
              <LinearGradient colors={['#FF8A65', '#FF5722']} style={styles.attachIconCircle}>
                <BarChart2 size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Create Poll</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachBtn} onPress={() => setActiveModal('EXPENSE')}>
              <LinearGradient colors={['#81C784', '#4CAF50']} style={styles.attachIconCircle}>
                <DollarSign size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Split Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachBtn} onPress={() => setActiveModal('LOCATION')}>
              <LinearGradient colors={['#64B5F6', '#2196F3']} style={styles.attachIconCircle}>
                <MapPin size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Share Place</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachBtn} onPress={handleVoiceNoteSimulate}>
              <LinearGradient colors={['#BA68C8', '#9C27B0']} style={styles.attachIconCircle}>
                <Mic size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Voice Note</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachBtn} onPress={handlePhotoSimulate}>
              <LinearGradient colors={['#4DB6AC', '#009688']} style={styles.attachIconCircle}>
                <ImageIcon size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.attachLabel}>Send Photo</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>

        {/* BOTTOM MESSAGE INPUT BAR — lifts with keyboard, dynamically positioned when tab bar is hidden, respecting system bottom inset */}
        <Animated.View style={[styles.bottomInputBarDetail, { bottom: Animated.add(selectedRoomId ? Math.max(insets.bottom, 16) : 82, keyboardOffset) }]}>
          <TouchableOpacity
            style={[styles.plusCircle, isAttachmentOpen && styles.plusCircleOpen]}
            onPress={() => setIsAttachmentOpen(!isAttachmentOpen)}
          >
            <Plus size={18} color="#FFF" style={{ transform: [{ rotate: isAttachmentOpen ? '45deg' : '0deg' }] }} />
          </TouchableOpacity>
          
          <View style={styles.textInputWrapper}>
            <TextInput
              placeholder="Type your message..."
              placeholderTextColor={C.textMuted}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendText}
            />
            <TouchableOpacity style={styles.smileIcon}>
              <Smile size={18} color={C.textSec} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.sendIconCircle}
            onPress={handleSendText}
            disabled={inputText.trim() === ''}
          >
            <Send size={15} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ─── GROUP INFO & OPTIONS SETTINGS OVERLAY ───────────── */}
      {isSettingsOpen && (
        <View style={styles.settingsOverlay}>
          <SafeAreaView style={{ flex: 1 }}>
            
            {/* Settings Header */}
            <View style={styles.settingsHeader}>
              <TouchableOpacity onPress={() => setIsSettingsOpen(false)} style={styles.settingsBackBtn}>
                <X size={22} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.settingsHeaderTitle}>Group Information</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
              
              {/* Group Meta Display */}
              <View style={styles.settingsAvatarBlock}>
                <Image source={{ uri: activeRoom?.avatar }} style={styles.settingsAvatarImg} />
                <Text style={styles.settingsRoomName}>{activeRoom?.name}</Text>
                <Text style={styles.settingsTripDates}>
                  {activeTrip.startDate} to {activeTrip.endDate}
                </Text>
              </View>

              {/* 1. Trip Progress Timeline */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <MapPin size={16} color={C.blueGlow} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Itinerary Timeline</Text>
                </View>
                <View style={styles.timelineRow}>
                  {activeTrip.cities.map((city, idx) => {
                    const isLast = idx === activeTrip.cities.length - 1;
                    const isPassed = idx <= 1;
                    return (
                      <View key={city} style={styles.timelineStepWrap}>
                        <View style={styles.timelineDotContainer}>
                          <View style={[
                            styles.timelineDot,
                            isPassed ? styles.timelineDotActive : styles.timelineDotInactive
                          ]}>
                            {isPassed && <Check size={8} color="#FFF" />}
                          </View>
                          {!isLast && <View style={[
                            styles.timelineLine,
                            isPassed ? styles.timelineLineActive : styles.timelineLineInactive
                          ]} />}
                        </View>
                        <Text style={[
                          styles.timelineCityText,
                          isPassed ? styles.timelineCityTextActive : styles.timelineCityTextInactive
                        ]} numberOfLines={1}>
                          {city}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.meetingPointPanel}>
                  <Clock size={14} color={C.yellow} style={{ marginRight: 6 }} />
                  <Text style={styles.meetingTitle}>Assembly point:</Text>
                  <Text style={styles.meetingLocation} numberOfLines={1}>{activeTrip.meetingPoint}</Text>
                </View>
              </View>

              {/* 2. Group Expenses & Split */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <DollarSign size={16} color={C.green} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Group Budget & Splits</Text>
                </View>
                
                <View style={styles.budgetOverviewRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.budgetLabel}>Shared Pool Expense</Text>
                    <Text style={styles.budgetValue}>₹{getExpensesTotal()}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.budgetLabel}>Budget / Person</Text>
                    <Text style={[styles.budgetValue, { color: C.green }]}>₹{activeTrip.budget}</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.settingsOutlineBtn, { borderColor: C.green }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    setActiveModal('EXPENSE');
                  }}
                >
                  <DollarSign size={14} color={C.green} style={{ marginRight: 4 }} />
                  <Text style={[styles.settingsOutlineBtnText, { color: C.green }]}>Log Shared Expense Bill</Text>
                </TouchableOpacity>
              </View>

              {/* 3. Group Polls & Decisions */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <BarChart2 size={16} color={C.orange} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Group Polls</Text>
                </View>

                {tripPolls[selectedTripId] ? (
                  <View style={styles.settingsPollMiniCard}>
                    <Text style={styles.miniPollQuestion}>{tripPolls[selectedTripId].question}</Text>
                    <Text style={styles.miniPollSubText}>
                      Active in room thread • {tripPolls[selectedTripId].options.reduce((a,b)=> a+b.votes, 0)} votes cast
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noActiveLabel}>No active polls</Text>
                )}

                <TouchableOpacity 
                  style={[styles.settingsOutlineBtn, { borderColor: C.orange }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    setActiveModal('POLL');
                  }}
                >
                  <BarChart2 size={14} color={C.orange} style={{ marginRight: 4 }} />
                  <Text style={[styles.settingsOutlineBtnText, { color: C.orange }]}>Create Group Poll</Text>
                </TouchableOpacity>
              </View>

              {/* 4. Tour Guide details */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <Compass size={16} color={C.purple} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Your Travel Guide</Text>
                </View>

                <View style={styles.settingsGuideCard}>
                  <Image source={{ uri: activeGuide?.avatar }} style={styles.guideSettingsAvatar} />
                  <View style={styles.guideSettingsMeta}>
                    <Text style={styles.guideSettingsName}>{activeGuide?.name}</Text>
                    <View style={styles.guideSettingsRatingRow}>
                      <Star size={12} color={C.yellow} fill={C.yellow} />
                      <Text style={styles.guideSettingsRatingText}>{activeGuide?.rating}</Text>
                      <Text style={styles.guideSettingsLangText}>• {activeGuide?.languages.join(', ')}</Text>
                    </View>
                    <Text style={styles.guideSettingsExpertise} numberOfLines={1}>
                      Exp: {activeGuide?.expertise.join(', ')}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 5. Safety Desk Controls & SOS Trigger */}
              <View style={[styles.settingSectionCard, { borderColor: 'rgba(239,68,68,0.2)' }]}>
                <View style={styles.sectionHeader}>
                  <ShieldAlert size={16} color={C.red} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Safety Command & Emergency Control</Text>
                </View>

                <View style={styles.safetyControlRow}>
                  <View style={styles.controlInfo}>
                    <Text style={styles.controlTitle}>Live Location Pinging</Text>
                    <Text style={styles.controlDesc}>Sends background telemetry updates</Text>
                  </View>
                  <View style={styles.pingerActiveDot} />
                </View>

                <View style={styles.safetyControlRow}>
                  <View style={styles.controlInfo}>
                    <Text style={styles.controlTitle}>Government Aadhaar verification</Text>
                    <Text style={styles.controlDesc}>Aadhaar status: verified</Text>
                  </View>
                  <CheckCircle size={16} color={C.green} />
                </View>

                {sosCountdown !== null ? (
                  <View style={styles.settingsArmedBox}>
                    <Text style={styles.armedLabel}>ARMING SOS IN</Text>
                    <Text style={styles.armedTimer}>{sosCountdown}</Text>
                    <TouchableOpacity style={styles.armedCancelTouch} onPress={cancelSOS}>
                      <Text style={styles.armedCancelText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.settingsSOSBtn}
                    onPress={startSOSCountdown}
                  >
                    <ShieldAlert size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.settingsSOSBtnText}>TRIGGER PANIC SOS ALERT</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Forms Modals */}
      {activeModal !== 'NONE' && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            
            {activeModal === 'POLL' && (
              <View>
                <Text style={styles.modalHeading}>Create Group Poll</Text>
                <Text style={styles.modalSubLabel}>Question / Activity</Text>
                <TextInput
                  placeholder="e.g. Which temple to visit next?"
                  placeholderTextColor={C.textMuted}
                  value={pollForm.question}
                  onChangeText={(val) => setPollForm(p => ({ ...p, question: val }))}
                  style={styles.modalInput}
                />
                <Text style={styles.modalSubLabel}>Option A</Text>
                <TextInput
                  placeholder="Option 1"
                  placeholderTextColor={C.textMuted}
                  value={pollForm.opt1}
                  onChangeText={(val) => setPollForm(p => ({ ...p, opt1: val }))}
                  style={styles.modalInput}
                />
                <Text style={styles.modalSubLabel}>Option B</Text>
                <TextInput
                  placeholder="Option 2"
                  placeholderTextColor={C.textMuted}
                  value={pollForm.opt2}
                  onChangeText={(val) => setPollForm(p => ({ ...p, opt2: val }))}
                  style={styles.modalInput}
                />
                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setActiveModal('NONE')}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit]}
                    onPress={handleCreatePollSubmit}
                  >
                    <Text style={styles.modalBtnSubmitText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeModal === 'EXPENSE' && (
              <View>
                <Text style={styles.modalHeading}>Log Shared Expense</Text>
                <Text style={styles.modalSubLabel}>Amount (₹)</Text>
                <TextInput
                  placeholder="e.g. 1200"
                  keyboardType="numeric"
                  placeholderTextColor={C.textMuted}
                  value={expenseForm.amount}
                  onChangeText={(val) => setExpenseForm(p => ({ ...p, amount: val }))}
                  style={styles.modalInput}
                />
                <Text style={styles.modalSubLabel}>Description</Text>
                <TextInput
                  placeholder="e.g. Dinner at Govindas"
                  placeholderTextColor={C.textMuted}
                  value={expenseForm.desc}
                  onChangeText={(val) => setExpenseForm(p => ({ ...p, desc: val }))}
                  style={styles.modalInput}
                />
                <Text style={styles.modalInfoNotice}>
                  * This will be split equally among all {activeTrip.membersCount || 10} trip participants.
                </Text>
                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setActiveModal('NONE')}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: C.green }]}
                    onPress={handleLogExpenseSubmit}
                  >
                    <Text style={styles.modalBtnSubmitText}>Log bill</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeModal === 'LOCATION' && (
              <View>
                <Text style={styles.modalHeading}>Share Custom Location</Text>
                <Text style={styles.modalSubLabel}>Location Name / Meeting spot</Text>
                <TextInput
                  placeholder="e.g. Prem Mandir Entrance Gate"
                  placeholderTextColor={C.textMuted}
                  value={locationForm.label}
                  onChangeText={(val) => setLocationForm(p => ({ ...p, label: val }))}
                  style={styles.modalInput}
                />
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.modalSubLabel}>Latitude</Text>
                    <TextInput
                      placeholder="e.g. 27.5650"
                      keyboardType="numeric"
                      placeholderTextColor={C.textMuted}
                      value={locationForm.lat}
                      onChangeText={(val) => setLocationForm(p => ({ ...p, lat: val }))}
                      style={styles.modalInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalSubLabel}>Longitude</Text>
                    <TextInput
                      placeholder="e.g. 77.6593"
                      keyboardType="numeric"
                      placeholderTextColor={C.textMuted}
                      value={locationForm.lng}
                      onChangeText={(val) => setLocationForm(p => ({ ...p, lng: val }))}
                      style={styles.modalInput}
                    />
                  </View>
                </View>
                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setActiveModal('NONE')}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: C.blue }]}
                    onPress={handleShareLocationSubmit}
                  >
                    <Text style={styles.modalBtnSubmitText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // WhatsApp-style Inbox List View
  inboxContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#070913',
  },
  inboxHeaderTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inboxHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconTouch: {
    padding: 4,
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#070913',
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
  },
  inboxFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  filterPillSelected: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
    borderColor: C.blue,
  },
  filterPillText: {
    color: C.textSec,
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterPillTextSelected: {
    color: C.blueGlow,
  },
  safetyTickerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.red,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sosFlash: {
    marginRight: 8,
  },
  safetyTickerText: {
    color: '#FFF',
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Room Item Rows
  roomItemTouch: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(37, 39, 64, 0.5)',
    alignItems: 'center',
  },
  sosBlinkingRoomBorder: {
    borderLeftWidth: 3,
    borderLeftColor: C.red,
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  roomAvatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  roomAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  onlineBadgeGuide: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.bg,
  },
  roomMetaWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  roomNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roomNameText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
  },
  roomTimeText: {
    color: C.textMuted,
    fontSize: 10.5,
    fontWeight: '600',
  },
  roomSnippetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomSnippetText: {
    color: C.textSec,
    fontSize: 12.5,
    flex: 1,
    marginRight: 8,
  },
  roomBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inboxTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBlue: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
  },
  tagPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  inboxTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFF',
  },
  unreadBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
  },

  // Room Header Bar (Detail view)
  roomHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#070913',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtnTouch: {
    padding: 6,
    marginRight: 4,
  },
  roomHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  roomHeaderTitles: {
    flex: 1,
  },
  roomHeaderNameText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  roomHeaderStatusText: {
    color: C.textSec,
    fontSize: 10,
    fontWeight: '600',
  },
  activityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 5,
  },
  statusGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionRoundBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // SOS Banner
  sosAlertBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sosBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sosPulse: {
    marginRight: 8,
  },
  sosBannerText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  sosBannerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  sosBannerActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sosBannerBtnText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Collapsible Accordion Itinerary Settings Panel (Settings overlay)
  settingSectionCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingBottom: 6,
  },
  sectionHeaderTitle: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Timeline Progress
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  timelineStepWrap: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timelineDotActive: {
    backgroundColor: C.green,
  },
  timelineDotInactive: {
    backgroundColor: C.border,
  },
  timelineLine: {
    height: 2,
    position: 'absolute',
    left: '50%',
    right: '-50%',
    top: 6,
    zIndex: 1,
  },
  timelineLineActive: {
    backgroundColor: C.green,
  },
  timelineLineInactive: {
    backgroundColor: C.border,
  },
  timelineCityText: {
    fontSize: 9.5,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  timelineCityTextActive: {
    color: '#FFF',
  },
  timelineCityTextInactive: {
    color: C.textMuted,
  },

  // Meeting Point Panel
  meetingPointPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  meetingTitle: {
    color: C.yellow,
    fontSize: 10.5,
    fontWeight: '800',
    marginRight: 4,
  },
  meetingLocation: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  // Budget details
  budgetOverviewRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  budgetLabel: {
    color: C.textSec,
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  budgetValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
  },

  // Settings Panel Outline BTN
  settingsOutlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  settingsOutlineBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Settings Poll MiniCard
  settingsPollMiniCard: {
    backgroundColor: C.cardAlt,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  miniPollQuestion: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  miniPollSubText: {
    color: C.textMuted,
    fontSize: 9.5,
    marginTop: 2,
  },
  noActiveLabel: {
    color: C.textMuted,
    fontSize: 11.5,
    textAlign: 'center',
    marginVertical: 10,
  },

  // Settings Guide details
  settingsGuideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
  },
  guideSettingsAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.purple,
  },
  guideSettingsMeta: {
    flex: 1,
  },
  guideSettingsName: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  guideSettingsRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  guideSettingsRatingText: {
    color: C.yellow,
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 3,
  },
  guideSettingsLangText: {
    color: C.textSec,
    fontSize: 10.5,
    marginLeft: 4,
  },
  guideSettingsExpertise: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 2,
  },

  // Safety Controls
  safetyControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  controlInfo: {
    flex: 1,
  },
  controlTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  controlDesc: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  pingerActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },
  settingsSOSBtn: {
    backgroundColor: C.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  settingsSOSBtnText: {
    color: '#FFF',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  settingsArmedBox: {
    backgroundColor: '#3F0E14',
    borderWidth: 1.5,
    borderColor: C.red,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  armedLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  armedTimer: {
    color: C.red,
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 4,
  },
  armedCancelTouch: {
    backgroundColor: C.red,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  armedCancelText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // Messages Scroll Feed
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateText: {
    color: C.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingVertical: 4,
  },
  sosMessageBg: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  avatarContainer: {
    marginRight: 10,
    position: 'relative',
  },
  messageAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  roleOnlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  messageBody: {
    flex: 1,
  },
  senderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: '800',
    marginRight: 6,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rolePillOrganizer: {
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 0.5,
    borderColor: C.blue,
  },
  rolePillGuide: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 0.5,
    borderColor: C.purple,
  },
  rolePillTourist: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 0.5,
    borderColor: C.green,
  },
  rolePillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFF',
  },

  // Bubble
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  instagramBubbleContainerMe: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  bubbleContainerOther: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  instagramGradientBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 70,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  bubbleTextMe: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '500',
  },
  timestampTextMe: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 8.5,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  bubbleMe: {
    backgroundColor: 'rgba(0, 102, 255, 0.22)',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 242, 254, 0.35)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  bubbleOther: {
    backgroundColor: C.card,
    borderWidth: 1.2,
    borderColor: 'rgba(37, 39, 64, 0.8)',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleText: {
    color: '#F8FAFC',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  translateText: {
    color: C.blueGlow,
    fontSize: 9.5,
    fontWeight: '800',
    marginLeft: 4,
  },
  timestampText: {
    color: C.textMuted,
    fontSize: 8.5,
    alignSelf: 'flex-end',
    marginTop: 4,
  },

  // Interactive Poll Card
  pollCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    maxWidth: '94%',
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pollQuestionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  pollOptionTouch: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    height: 38,
    justifyContent: 'center',
  },
  pollOptionVoted: {
    borderColor: C.orange,
  },
  pollProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 5,
  },
  pollOptionLabel: {
    color: '#D1D5DB',
    fontSize: 12.5,
    fontWeight: '600',
  },
  pollOptionPercent: {
    color: C.orange,
    fontSize: 11,
    fontWeight: '700',
  },
  pollFooter: {
    color: C.textMuted,
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 2,
  },

  // Expense Card
  expenseCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 14,
    padding: 12,
    maxWidth: '92%',
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  expenseHeaderTitle: {
    color: C.green,
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  expenseBillDesc: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  expenseBillAmount: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  expenseDivider: {
    height: 0.5,
    backgroundColor: C.border,
    marginVertical: 8,
  },
  expenseFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expenseShareText: {
    color: C.textSec,
    fontSize: 10.5,
    fontWeight: '600',
  },
  expenseCostHead: {
    color: C.green,
    fontSize: 11,
    fontWeight: '800',
  },

  // Location Card
  locationCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    maxWidth: '92%',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationCardTitle: {
    color: C.blueGlow,
    fontSize: 11.5,
    fontWeight: '800',
    marginLeft: 6,
  },
  locationText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  miniMapPlaceholder: {
    height: 100,
    backgroundColor: '#0F111E',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
  },
  radarRing1: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.2)',
    position: 'absolute',
  },
  radarRing2: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.1)',
    position: 'absolute',
  },
  miniMapPin: {
    zIndex: 10,
  },
  coordsText: {
    color: C.textMuted,
    fontSize: 8.5,
    position: 'absolute',
    bottom: 6,
  },
  locationActionTouch: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 0.5,
    borderColor: C.blue,
  },
  locationActionText: {
    color: C.blueGlow,
    fontSize: 11,
    fontWeight: '800',
  },

  // Voice Note Card
  voiceNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  playButtonCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderLeftColor: '#FFF',
    borderTopWidth: 5,
    borderTopColor: 'transparent',
    borderBottomWidth: 5,
    borderBottomColor: 'transparent',
    marginLeft: 2,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDuration: {
    color: C.textSec,
    fontSize: 10,
    marginLeft: 10,
    fontWeight: '700',
  },

  // Image Card
  imageCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '92%',
  },
  imageMedia: {
    width: 220,
    height: 140,
  },
  imageOverlayTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: C.cardAlt,
  },
  imageCardDesc: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  imageDownloadBtn: {
    padding: 4,
  },

  // SOS Card Alert
  sosCardAlert: {
    backgroundColor: '#8B0000',
    borderWidth: 1.5,
    borderColor: C.red,
    borderRadius: 14,
    padding: 12,
    maxWidth: '95%',
  },
  sosAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sosAlertHeaderTitle: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  sosAlertDesc: {
    color: '#FFCDD2',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  sosAlertCoords: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
  sosAlertBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sosAlertBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  sosAlertBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // Typing Row
  typingIndicatorRow: {
    paddingLeft: 46,
    marginTop: 4,
  },
  typingDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    color: C.textMuted,
    fontSize: 10.5,
    fontWeight: '600',
  },

  // Safety Panel (Drawer Settings content styles)
  safetyDashboard: {
    padding: 12,
  },
  safetyStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  safetyStatusMeta: {
    marginLeft: 12,
  },
  safetyStatusTitle: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  safetyStatusDesc: {
    color: C.textSec,
    fontSize: 10.5,
    marginTop: 2,
  },
  safetySectionLabel: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  checklistCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  sosButtonContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sosNotice: {
    color: C.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Dynamic Floating Detail Input Bar sits at bottom: 82 to float perfectly above nav bar!
  bottomInputBarDetail: {
    position: 'absolute',
    bottom: 82,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#070913EE',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 90,
  },
  plusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  plusCircleOpen: {
    backgroundColor: C.red,
    borderColor: C.red,
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 38,
  },
  textInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13.5,
    padding: 0,
  },
  smileIcon: {
    padding: 2,
  },
  sendIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  // Floating Attachments Panel
  attachmentPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#070913F5',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    zIndex: 91,
  },
  attachScrollInner: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 20,
    height: '100%',
  },
  attachBtn: {
    alignItems: 'center',
  },
  attachIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  attachLabel: {
    color: C.textSec,
    fontSize: 10,
    fontWeight: '700',
  },

  // Settings Overlay Card
  settingsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    zIndex: 200,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: '#070913',
  },
  settingsBackBtn: {
    padding: 4,
  },
  settingsHeaderTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  settingsScrollContent: {
    padding: 16,
  },
  settingsAvatarBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  settingsAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: C.blueGlow,
    marginBottom: 10,
  },
  settingsRoomName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsTripDates: {
    color: C.textSec,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 4,
  },

  // Custom Form Overlays
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContentCard: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeading: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalSubLabel: {
    color: C.textSec,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    color: '#FFF',
    fontSize: 13,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  modalInfoNotice: {
    color: C.textMuted,
    fontSize: 9.5,
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
  },
  modalBtnCancelText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBtnSubmit: {
    backgroundColor: C.blue,
  },
  modalBtnSubmitText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
