import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CornerUpLeft,
  Copy,
  DollarSign,
  Download,
  FileText,
  Globe as TranslateIcon,
  Image as ImageIcon,
  Info,
  LogOut,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MoreVertical,
  Phone,
  Pin,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Smile,
  Star,
  Trash2,
  Users as UsersIcon,
  Video,
  X
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  ImagePicker = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Color Palette matching search theme exactly
const C = {
  bg: '#000000',
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
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
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

// Swipe to Reply gesture wrapper component
const SwipeableMessageRow = ({ children, onSwipeReply, isMe }: { children: React.ReactNode, onSwipeReply: () => void, isMe: boolean }) => {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Active when dragging left-to-right significantly, and horizontal exceeds vertical
        return gestureState.dx > 10 && Math.abs(gestureState.dy) < 8;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Drag only to the right, up to a limit of 70px
        if (gestureState.dx > 0) {
          pan.setValue(Math.min(gestureState.dx, 70));
        } else {
          pan.setValue(0);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 55) {
          onSwipeReply();
        }
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 6,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    })
  ).current;

  return (
    <View style={{ position: 'relative', width: '100%' }} {...panResponder.panHandlers}>
      {/* Revealed background reply icon container */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 12,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pan.interpolate({
            inputRange: [0, 35],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              scale: pan.interpolate({
                inputRange: [0, 55],
                outputRange: [0.6, 1.1],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={['#0066FF', '#7C3AED']}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#0066FF',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <CornerUpLeft size={16} color="#FFF" />
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={{
          transform: [{ translateX: pan }],
          width: '100%',
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
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
  const [isTripDetailsExpanded, setIsTripDetailsExpanded] = useState(false);

  // Tab Selection & Group Updates
  const [activeTab, setActiveTab] = useState<'chat' | 'itinerary' | 'docs' | 'members'>('chat');
  const [showGroupUpdate, setShowGroupUpdate] = useState(true);

  // Initial Documents per Trip
  const [tripDocs, setTripDocs] = useState<Record<string, { id: string; title: string; subtitle: string; status: string; date: string }[]>>({
    'trip-1': [
      { id: 'doc-1-1', title: 'Train Tickets (Ranchi - Mathura)', subtitle: 'IRCTC PNR #2847395837', status: 'Confirmed', date: '2026-07-21' },
      { id: 'doc-1-2', title: 'Temple Special Darshan Passes', subtitle: 'Banke Bihari Temple Entry Pass', status: 'Booked', date: '2026-07-22' },
      { id: 'doc-1-3', title: 'Aadhaar ID Verification', subtitle: 'All participants verified', status: 'Completed', date: '2026-07-18' },
    ],
    'trip-2': [
      { id: 'doc-2-1', title: 'Inner Line Permits (ILP)', subtitle: 'Approved & Managed by Lobsang Yeshi', status: 'Approved', date: '2026-07-22' },
      { id: 'doc-2-2', title: 'Bike Rental Agreement', subtitle: 'Royal Enfield Himalayan 411cc', status: 'Signed', date: '2026-07-20' },
      { id: 'doc-2-3', title: 'Aadhaar / ID Verification', subtitle: 'Aditya, Priya, Vikram verified', status: 'Completed', date: '2026-07-18' },
      { id: 'doc-2-4', title: 'Travel Insurance Policy', subtitle: 'Digit Policy #DG-2026-9938', status: 'Valid', date: '2026-07-15' },
    ],
    'trip-3': [
      { id: 'doc-3-1', title: 'Alleppey Houseboat Booking Voucher', subtitle: 'Voucher #LH-938592', status: 'Confirmed', date: '2026-07-21' },
      { id: 'doc-3-2', title: 'Munnar Resort Stay Confirmation', subtitle: 'Standard Rooms x 4', status: 'Confirmed', date: '2026-07-20' },
    ]
  });

  // Document Upload form states
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docSubtitle, setDocSubtitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Reset tab to chat when activeRoomId/selectedRoomId changes
  useEffect(() => {
    setActiveTab('chat');
  }, [activeRoomId]);

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
  const [tripMessages, setTripMessages] = useState<Record<string, CustomMessage[]>>(() => {
    return {
      ...INITIAL_TRIP_MESSAGES,
      'room-vrindavan-group': INITIAL_TRIP_MESSAGES['trip-1'] || [],
      'room-ladakh-group': INITIAL_TRIP_MESSAGES['trip-2'] || [],
      'room-kerala-group': INITIAL_TRIP_MESSAGES['trip-3'] || [],
      'room-guide-rajesh': [
        {
          id: 'guide-init-1',
          senderName: 'Rajesh Kumar',
          senderRole: 'Guide',
          avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80',
          content: 'Hello! Feel free to ask me any private questions about temple entry or darshan coordinates here. 🙏',
          timestamp: 'Yesterday, 04:00 PM',
          isMe: false,
        }
      ],
      'room-guide-lobsang': [
        {
          id: 'guide-init-2',
          senderName: 'Lobsang Yeshi',
          senderRole: 'Guide',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
          content: 'Hello! I am Lobsang Yeshi. We can coordinate here regarding bike gears or acclimatization rest. 🏔️',
          timestamp: 'Yesterday',
          isMe: false,
        }
      ],
    };
  });
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
  const [replyingToMessage, setReplyingToMessage] = useState<CustomMessage | null>(null);
  const [selectedMessageForOptions, setSelectedMessageForOptions] = useState<CustomMessage | null>(null);
  const [selectedRoomForOptions, setSelectedRoomForOptions] = useState<ChatRoom | null>(null);
  const [pinnedRoomIds, setPinnedRoomIds] = useState<Set<string>>(new Set());
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

  // Retrieve current active messages list (unified feed)
  const currentMessages = tripMessages[selectedRoomId || selectedTripId] || [];

  // Dynamically extract group members from message history in this room/trip
  const groupMembers = useMemo(() => {
    const membersMap = new Map<string, { name: string; avatar: string; role: string }>();
    
    // Add the guide
    if (activeGuide) {
      membersMap.set(activeGuide.name, {
        name: activeGuide.name,
        avatar: activeGuide.avatar,
        role: 'Guide'
      });
    }
    
    // Add other senders from the current active messages
    currentMessages.forEach(msg => {
      if (msg.senderName && !msg.isMe) {
        membersMap.set(msg.senderName, {
          name: msg.senderName,
          avatar: msg.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
          role: msg.senderRole || 'Tourist'
        });
      }
    });
    
    // Fallback static list of members if message history is empty
    if (membersMap.size <= 1) {
      const mockMembers = [
        { name: 'Neha Sharma', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80', role: 'Tourist' },
        { name: 'Vikram Singh', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', role: 'Tourist' },
        { name: 'Suman Gupta', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80', role: 'Tourist' },
        { name: 'Aditya Sen', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80', role: 'Tourist' },
      ];
      mockMembers.forEach(m => {
        if (m.name !== activeGuide?.name) {
          membersMap.set(m.name, m);
        }
      });
    }
    
    return Array.from(membersMap.values());
  }, [currentMessages, activeGuide]);

  // Click a member to direct message
  const handleMemberClick = (member: { name: string; avatar: string }) => {
    setIsSettingsOpen(false); // Close settings panel
    handleStartDirectMessage(member.name, member.avatar);
  };

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
    const key = selectedRoomId || selectedTripId;
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
        if (room.id === selectedRoomId) {
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
    const msgData: Partial<CustomMessage> = {
      content: inputText,
      type: 'text'
    };

    if (replyingToMessage) {
      msgData.replyTo = {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        content: replyingToMessage.content
      };
      setReplyingToMessage(null);
    }

    sendNewMessage(msgData);
    setInputText('');
  };

  // Copy message text to device clipboard safely
  const handleCopyMessage = (content: string) => {
    try {
      const ClipboardObj = require('react-native').Clipboard;
      if (ClipboardObj && typeof ClipboardObj.setString === 'function') {
        ClipboardObj.setString(content);
      }
    } catch (e) {
      // Fallback if Clipboard module is unlinked or not bundled in Expo client
    }
    Alert.alert('Success', 'Message text copied to clipboard.');
    setSelectedMessageForOptions(null);
  };

  // Delete message from current active room history stream
  const handleDeleteMessage = (msgId: string) => {
    const key = selectedRoomId || selectedTripId;
    setTripMessages(prev => {
      const list = prev[key] || [];
      return {
        ...prev,
        [key]: list.filter(m => m.id !== msgId)
      };
    });
    setSelectedMessageForOptions(null);
  };

  // Delete document from vault
  const handleDeleteDoc = (docId: string) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setTripDocs(prev => ({
              ...prev,
              [selectedTripId]: (prev[selectedTripId] || []).filter(d => d.id !== docId)
            }));
          }
        }
      ]
    );
  };

  // Simulated upload and submission of document
  const handleDocSubmit = () => {
    if (docTitle.trim() === '') {
      Alert.alert('Error', 'Please enter a document title.');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        
        const newDoc = {
          id: 'doc-uploaded-' + Date.now(),
          title: docTitle.trim(),
          subtitle: docSubtitle.trim() || 'Uploaded certificate file',
          status: 'Approved',
          date: new Date().toISOString().split('T')[0]
        };
        
        setTripDocs(prev => ({
          ...prev,
          [selectedTripId]: [...(prev[selectedTripId] || []), newDoc]
        }));
        
        setIsUploading(false);
        setIsDocModalOpen(false);
        setDocTitle('');
        setDocSubtitle('');
        setUploadProgress(0);
        
        Alert.alert('Success', 'Document uploaded and verified successfully.');
      }
    }, 120);
  };

  // Start Direct Message with sender
  const handleStartDirectMessage = (senderName: string, avatar: string) => {
    const dmRoomId = `room-dm-${senderName.toLowerCase().replace(/\s+/g, '-')}`;
    
    // Check if DM room already exists in state
    const existingRoom = inboxRooms.find(r => r.id === dmRoomId);
    if (existingRoom) {
      setSelectedRoomId(dmRoomId);
      setSelectedTripId(existingRoom.tripId);
    } else {
      // Create new private chat room
      const newRoom: ChatRoom = {
        id: dmRoomId,
        tripId: selectedTripId,
        name: senderName,
        avatar: avatar,
        type: 'GUIDE', // treat as GUIDE/DM in inbox rendering
        latestMessage: `Direct chat started with ${senderName}`,
        latestTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unreadCount: 0,
        badge: 'Member',
      };
      
      setInboxRooms(prev => [newRoom, ...prev]);
      
      // Initialize message history
      setTripMessages(prev => ({
        ...prev,
        [dmRoomId]: [
          {
            id: `dm-init-${Date.now()}`,
            senderName: senderName,
            senderRole: 'Tourist',
            avatar: avatar,
            content: `This is the beginning of your private message thread with ${senderName}. 👋`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isMe: false,
          }
        ]
      }));
      
      setSelectedRoomId(dmRoomId);
    }
    setSelectedMessageForOptions(null);
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

  // Photo receipt selector using device image library
  const handlePhotoSimulate = async () => {
    setIsAttachmentOpen(false);
    try {
      if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== 'function') {
        Alert.alert('Notice', 'Photo gallery module is initializing or requires restarting Expo dev client.');
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert('Permission Required', 'Permission to access photo gallery is required to select photos from your device.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : 'images',
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        sendNewMessage({
          content: '📷 Photo Sent',
          type: 'image',
          mediaUrl: result.assets[0].uri
        });
      }
    } catch (err: any) {
      Alert.alert('Notice', 'Photo gallery selection error: ' + (err?.message || 'Please try again.'));
    }
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

  // Filtered and sorted rooms listing (pins at the top!)
  const filteredRooms = inboxRooms
    .filter(room => {
      const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        room.latestMessage.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (inboxFilter === 'ALL') return true;
      if (inboxFilter === 'GROUPS') return room.type === 'GROUP';
      if (inboxFilter === 'GUIDES') return room.type === 'GUIDE';

      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedRoomIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedRoomIds.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

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
                onLongPress={() => setSelectedRoomForOptions(room)}
                delayLongPress={400}
                activeOpacity={0.85}
              >
                {/* Avatar left */}
                <View style={styles.roomAvatarWrap}>
                  <Image source={{ uri: room.avatar }} style={styles.roomAvatarImg} />
                </View>

                {/* Info Center */}
                <View style={styles.roomMetaWrap}>
                  <View style={styles.roomNameRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                      <Text style={[styles.roomNameText, { flex: 1, marginRight: 4 }]} numberOfLines={1}>{room.name}</Text>
                      {pinnedRoomIds.has(room.id) && (
                        <Pin size={12} color={C.blueGlow} />
                      )}
                    </View>
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

        {/* ─── CHAT ROOM LONG PRESS OPTIONS OVERLAY ─────────────── */}
        {selectedRoomForOptions && (
          <View style={styles.optionsModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setSelectedRoomForOptions(null)}
            />
            <View style={styles.optionsModalContent}>
              <View style={styles.optionsHeaderRow}>
                <Text style={styles.optionsHeaderTitle} numberOfLines={1}>
                  {selectedRoomForOptions.name} Options
                </Text>
                <Text style={styles.optionsHeaderSubText} numberOfLines={1}>
                  {selectedRoomForOptions.type === 'GROUP' ? 'Group Chat' : 'Direct Message'} • {selectedRoomForOptions.badge || 'Contact'}
                </Text>
              </View>

              <View style={styles.optionsDivider} />

              {/* PIN / UNPIN CHAT */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  setPinnedRoomIds(prev => {
                    const next = new Set(prev);
                    next.has(roomId) ? next.delete(roomId) : next.add(roomId);
                    return next;
                  });
                  setSelectedRoomForOptions(null);
                }}
              >
                <Pin size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {pinnedRoomIds.has(selectedRoomForOptions.id) ? 'Unpin Chat' : 'Pin Chat to Top'}
                </Text>
              </TouchableOpacity>

              {/* MARK AS READ / UNREAD */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  setInboxRooms(prev =>
                    prev.map(r => {
                      if (r.id === roomId) {
                        return { ...r, unreadCount: r.unreadCount > 0 ? 0 : 3 };
                      }
                      return r;
                    })
                  );
                  setSelectedRoomForOptions(null);
                }}
              >
                <CheckCircle size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {selectedRoomForOptions.unreadCount > 0 ? 'Mark as Read' : 'Mark as Unread'}
                </Text>
              </TouchableOpacity>

              {/* CLEAR CHAT HISTORY */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  Alert.alert(
                    'Clear Chat',
                    'Are you sure you want to clear all message history for this chat? This action cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: () => {
                          setTripMessages(prev => ({
                            ...prev,
                            [roomId]: []
                          }));
                          // Reset the room's latest message snippet
                          setInboxRooms(prev =>
                            prev.map(r => {
                              if (r.id === roomId) {
                                return { ...r, latestMessage: 'No messages in this chat' };
                              }
                              return r;
                            })
                          );
                        }
                      }
                    ]
                  );
                  setSelectedRoomForOptions(null);
                }}
              >
                <Trash2 size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>Clear Conversation</Text>
              </TouchableOpacity>

              {/* LEAVE GROUP / DELETE CHAT */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  const roomName = selectedRoomForOptions.name;
                  const isGroup = selectedRoomForOptions.type === 'GROUP';
                  Alert.alert(
                    isGroup ? 'Leave Group' : 'Delete Chat',
                    isGroup
                      ? `Are you sure you want to leave ${roomName}? You will no longer receive updates.`
                      : `Are you sure you want to delete the chat with ${roomName}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: isGroup ? 'Leave' : 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          setInboxRooms(prev => prev.filter(r => r.id !== roomId));
                        }
                      }
                    ]
                  );
                  setSelectedRoomForOptions(null);
                }}
              >
                <X size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>
                  {selectedRoomForOptions.type === 'GROUP' ? 'Leave Group' : 'Delete Chat'}
                </Text>
              </TouchableOpacity>

              <View style={styles.optionsCancelDivider} />

              <TouchableOpacity
                style={styles.optionsCancelBtn}
                onPress={() => setSelectedRoomForOptions(null)}
              >
                <Text style={styles.optionsCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
          <TouchableOpacity 
            style={styles.actionRoundBtn} 
            onPress={() => router.push('/map')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <MapPin size={17} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionRoundBtn} 
            onPress={() => setIsSettingsOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Settings size={17} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── TAB SELECTION BAR ───────────────────────────────── */}
      {activeRoom?.type === 'GROUP' && (
        <View style={styles.tabBarWrapper}>
          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'chat' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('chat')}
            activeOpacity={0.8}
          >
            <MessageSquare size={17} color={activeTab === 'chat' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'chat' && styles.tabItemLabelActive]}>
              Chat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'itinerary' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('itinerary')}
            activeOpacity={0.8}
          >
            <Calendar size={17} color={activeTab === 'itinerary' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'itinerary' && styles.tabItemLabelActive]}>
              Itinerary
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'docs' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('docs')}
            activeOpacity={0.8}
          >
            <FileText size={17} color={activeTab === 'docs' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'docs' && styles.tabItemLabelActive]}>
              Docs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'members' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('members')}
            activeOpacity={0.8}
          >
            <UsersIcon size={17} color={activeTab === 'members' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'members' && styles.tabItemLabelActive]}>
              Members
            </Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* ─── WORKSPACE CONTENT AREA (CLEAN CONVERSATION FEED OR TABS) ───── */}
      {activeTab === 'chat' ? (
        <View style={{ flex: 1 }}>
          {/* Pinned Group Update Banner */}
          {activeRoom?.type === 'GROUP' && showGroupUpdate && (
            <View style={styles.groupUpdateCard}>
              <View style={styles.groupUpdateLeft}>
                <Pin size={16} color="#8B5CF6" style={styles.groupUpdatePinIcon} />
                <View style={styles.groupUpdateInfo}>
                  <Text style={styles.groupUpdateTitleText}>Group Update</Text>
                  <Text style={styles.groupUpdateDescText}>
                    {selectedTripId === 'trip-2' 
                      ? 'Acclimatization is key. First 2 days in Leh we will rest. No high altitude rides on Day 1 & 2.' 
                      : 'Acclimatization and schedule sync. Please tag luggage and be on time.'}
                  </Text>
                </View>
              </View>
              <View style={styles.groupUpdateRight}>
                <TouchableOpacity 
                  style={styles.groupUpdateViewBtn}
                  onPress={() => setIsSettingsOpen(true)}
                >
                  <Text style={styles.groupUpdateViewBtnText}>View Details</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.groupUpdateCloseBtn}
                  onPress={() => setShowGroupUpdate(false)}
                >
                  <X size={14} color="#7E8494" />
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                <SwipeableMessageRow
                  key={msg.id}
                  isMe={msg.isMe}
                  onSwipeReply={() => setReplyingToMessage(msg)}
                >
                  <View style={[styles.messageRow, msg.isMe && { justifyContent: 'flex-end' }, isSOS && styles.sosMessageBg, isConsecutive && { marginTop: 2 }]}>
                  {!msg.isMe && (
                    <View style={styles.avatarContainer}>
                      {!isConsecutive && (
                        <>
                          <Image source={{ uri: msg.avatar }} style={styles.messageAvatar} />
                        </>
                      )}
                    </View>
                  )}

                  <View style={[styles.messageBody, msg.isMe ? { flex: 1, alignItems: 'flex-end' } : { flex: 1 }]}>
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
                          {profile.role === 'ORGANIZER' || profile.role === 'GUIDE' ? (
                            <TouchableOpacity
                              style={[styles.sosAlertBtn, { backgroundColor: C.green }]}
                              onPress={handleResolveSOSEvent}
                            >
                              <Text style={styles.sosAlertBtnText}>Mark as Safe</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ) : (
                      <View style={[msg.isMe ? styles.instagramBubbleContainerMe : styles.bubbleContainerOther]}>
                        {msg.isMe ? (
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onLongPress={() => setSelectedMessageForOptions(msg)}
                          >
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
                              {msg.replyTo && (
                                <View style={styles.bubbleReplyHeaderMe}>
                                  <Text style={styles.bubbleReplySenderMe} numberOfLines={1}>
                                    {msg.replyTo.senderName}
                                  </Text>
                                  <Text style={styles.bubbleReplyContentMe} numberOfLines={1}>
                                    {msg.replyTo.content}
                                  </Text>
                                </View>
                              )}
                              <Text style={styles.bubbleTextMe}>{displayedContent}</Text>
                              <Text style={styles.timestampTextMe}>{msg.timestamp}</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onLongPress={() => setSelectedMessageForOptions(msg)}
                          >
                            <View style={[styles.bubble, styles.bubbleOther]}>
                              {msg.replyTo && (
                                <View style={styles.bubbleReplyHeaderOther}>
                                  <Text style={styles.bubbleReplySenderOther} numberOfLines={1}>
                                    {msg.replyTo.senderName}
                                  </Text>
                                  <Text style={styles.bubbleReplyContentOther} numberOfLines={1}>
                                    {msg.replyTo.content}
                                  </Text>
                                </View>
                              )}
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
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
                </SwipeableMessageRow>
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
          <Animated.View style={[
            styles.attachmentPanel, 
            { 
              height: attachMenuHeight, 
              bottom: Animated.add(selectedRoomId ? Math.max(insets.bottom + 58, 74) : 140, keyboardOffset),
              borderWidth: isAttachmentOpen ? 1 : 0,
            }
          ]}>
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
          <Animated.View style={[
            styles.bottomInputBarDetail, 
            { 
              bottom: keyboardOffset,
              paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 20
            }
          ]}>
            {replyingToMessage && (
              <View style={styles.replyPreviewContainer}>
                <View style={styles.replyPreviewTextCol}>
                  <Text style={styles.replyPreviewSenderName}>
                    Replying to {replyingToMessage.isMe ? 'yourself' : replyingToMessage.senderName}
                  </Text>
                  <Text style={styles.replyPreviewContentText} numberOfLines={1}>
                    {replyingToMessage.content}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyPreviewCloseBtn}
                  onPress={() => setReplyingToMessage(null)}
                >
                  <X size={14} color={C.textSec} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputRowContainer}>
              <TouchableOpacity
                style={[styles.plusCircle, isAttachmentOpen && styles.plusCircleOpen]}
                onPress={() => setIsAttachmentOpen(!isAttachmentOpen)}
              >
                <Plus size={18} color="#FFF" style={{ transform: [{ rotate: isAttachmentOpen ? '45deg' : '0deg' }] }} />
              </TouchableOpacity>
              
              <View style={styles.textInputWrapper}>
                <TextInput
                  placeholder="Message..."
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
                style={[
                  styles.sendIconCircle,
                  { backgroundColor: inputText.trim() === '' ? 'rgba(255, 255, 255, 0.08)' : C.blue }
                ]}
                onPress={handleSendText}
                disabled={inputText.trim() === ''}
              >
                <Send size={15} color={inputText.trim() === '' ? C.textMuted : '#FFF'} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      ) : activeTab === 'itinerary' ? (
        <ScrollView style={styles.tabScrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScrollViewContent}>
          {/* Summary / Stats Card */}
          <LinearGradient
            colors={['#181236', '#0F0D22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsSummaryCard}
          >
            <View style={styles.statsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Compass size={16} color="#C084FC" />
                <Text style={styles.statsTitle}>TRIP COMMAND CENTER</Text>
              </View>
              <View style={styles.statsStatusBadge}>
                <Text style={styles.statsStatusText}>ACTIVE</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statsCell}>
                <Text style={styles.statsValLabel}>Shared Pool Total</Text>
                <Text style={styles.statsValText}>₹{getExpensesTotal()}</Text>
              </View>
              <View style={styles.statsCell}>
                <Text style={styles.statsValLabel}>Budget Per Person</Text>
                <Text style={[styles.statsValText, { color: C.green }]}>₹{activeTrip.budget}</Text>
              </View>
            </View>

            <View style={styles.statsFooter}>
              <Clock size={12} color="#C084FC" style={{ marginRight: 6 }} />
              <Text style={styles.statsFooterText}>Assembly: {activeTrip.meetingPoint}</Text>
            </View>
          </LinearGradient>

          {/* Vertical Roadmap Timeline */}
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <MapPin size={16} color="#0066FF" style={{ marginRight: 6 }} />
              <Text style={styles.timelineTitleText}>Vertical Itinerary Roadmap</Text>
            </View>

            <View style={styles.timelineList}>
              {(() => {
                const getTripItineraryHighlights = (tripId: string) => {
                  if (tripId === 'trip-2') {
                    return [
                      { day: 'Day 1', title: 'Manali Assembly', desc: 'Assemble at Mall Road. Bike check & safety briefing.' },
                      { day: 'Day 2', title: 'Sarchu Ride', desc: 'Cross Rohtang Pass / Atal Tunnel. Rest in Sarchu camps (14k ft).' },
                      { day: 'Day 3', title: 'Leh Arrival', desc: 'Ride through Nakeela & Tanglang La passes. Reach Leh.' },
                      { day: 'Day 4-5', title: 'Leh Acclimatization', desc: 'Local exploration, rest, and oxygen checks.' },
                      { day: 'Day 6-7', title: 'Nubra Valley via Khardung La', desc: 'Cross one of the highest roads. Desert camping & double-hump camels.' },
                      { day: 'Day 8-9', title: 'Pangong Tso Lakeside', desc: 'High-altitude lake riding. Overnight in lakeside tents.' },
                      { day: 'Day 10', title: 'Leh Return & Departure', desc: 'Return ride to Leh and board flights.' },
                    ];
                  } else if (tripId === 'trip-1') {
                    return [
                      { day: 'Day 1', title: 'Departure from Ranchi', desc: 'Board train from Ranchi Junction. Group icebreaker.' },
                      { day: 'Day 2', title: 'Arrive at Delhi', desc: 'Transit to Mathura via express cabs. Check-in at ashram.' },
                      { day: 'Day 3', title: 'Vrindavan Temples', desc: 'Banke Bihari special darshan and Prem Mandir light show.' },
                      { day: 'Day 4', title: 'Barsana & Nandgaon', desc: 'Visit Radha Rani temple and local spiritual walks.' },
                      { day: 'Day 5', title: 'Mathura Heritage', desc: 'Krishna Janmabhoomi temple and Yamuna Aarti.' },
                      { day: 'Day 6', title: 'Spiritual Wrap & Return', desc: 'Final morning prayers and return journey to Ranchi.' },
                    ];
                  } else {
                    return [
                      { day: 'Day 1', title: 'Kochi Meetup', desc: 'Assemble at Airport Terminal. Transfer to Munnar hills.' },
                      { day: 'Day 2', title: 'Munnar Tea Gardens', desc: 'Trek through Eravikulam National Park and explore tea estates.' },
                      { day: 'Day 3', title: 'Munnar to Alleppey', desc: 'Drive down to backwaters. Board private luxury houseboat.' },
                      { day: 'Day 4', title: 'Backwater Cruising', desc: 'Full day cruising through canals. Traditional Kerala lunch.' },
                      { day: 'Day 5', title: 'Alleppey Beach & Sunset', desc: 'Visit beach, local coir museums, and group dinner.' },
                      { day: 'Day 6', title: 'Departure', desc: 'Checkout and transfer back to Kochi Airport.' },
                    ];
                  }
                };

                const highlights = getTripItineraryHighlights(selectedTripId);
                return highlights.map((hl, idx) => {
                  const isLast = idx === highlights.length - 1;
                  return (
                    <View key={hl.day} style={styles.verticalTimelineStep}>
                      <View style={styles.verticalTimelineLeft}>
                        <View style={styles.verticalTimelineDot}>
                          <View style={styles.verticalTimelineInnerDot} />
                        </View>
                        {!isLast && <View style={styles.verticalTimelineLine} />}
                      </View>
                      <View style={styles.verticalTimelineCard}>
                        <View style={styles.verticalTimelineHeaderRow}>
                          <Text style={styles.verticalTimelineDayText}>{hl.day}</Text>
                          <Text style={styles.verticalTimelineNodeTitle}>{hl.title}</Text>
                        </View>
                        <Text style={styles.verticalTimelineDesc}>{hl.desc}</Text>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          </View>
        </ScrollView>
      ) : activeTab === 'docs' ? (
        <ScrollView style={styles.tabScrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScrollViewContent}>
          {/* Docs Info */}
          <View style={styles.docsHeaderBlock}>
            <Text style={styles.docsHeaderTitleText}>Trip Documents Vault</Text>
            <Text style={styles.docsHeaderDescText}>
              Manage, upload, and view mandatory permits, flight tickets, and rental agreements for the group.
            </Text>
          </View>

          {/* Upload Button */}
          <TouchableOpacity 
            style={styles.uploadDocBtn}
            onPress={() => {
              setDocTitle('');
              setDocSubtitle('');
              setUploadProgress(0);
              setIsUploading(false);
              setIsDocModalOpen(true);
            }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#0044CC', '#0066FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.uploadDocGradient}
            >
              <Plus size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.uploadDocBtnText}>Upload New Document</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Documents list */}
          <View style={styles.docsListContainer}>
            {((tripDocs[selectedTripId] || []).length === 0) ? (
              <Text style={styles.noDocsText}>No documents uploaded yet for this trip.</Text>
            ) : (
              (tripDocs[selectedTripId] || []).map((doc) => {
                const getStatusColor = (status: string) => {
                  const s = status.toLowerCase();
                  if (s === 'approved' || s === 'confirmed' || s === 'completed' || s === 'valid') return C.green;
                  if (s === 'signed') return C.blue;
                  return C.orange;
                };

                return (
                  <View key={doc.id} style={styles.docItemRow}>
                    <View style={styles.docItemLeft}>
                      <View style={styles.docIconBox}>
                        <FileText size={18} color="#0066FF" />
                      </View>
                      <View style={styles.docItemMeta}>
                        <Text style={styles.docTitleText} numberOfLines={1}>{doc.title}</Text>
                        <Text style={styles.docSubText} numberOfLines={1}>{doc.subtitle}</Text>
                        <Text style={styles.docDateText}>Added: {doc.date}</Text>
                      </View>
                    </View>
                    <View style={styles.docItemRight}>
                      <View style={[styles.docStatusBadge, { borderColor: getStatusColor(doc.status) }]}>
                        <Text style={[styles.docStatusText, { color: getStatusColor(doc.status) }]}>{doc.status.toUpperCase()}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.docDeleteBtn}
                        onPress={() => handleDeleteDoc(doc.id)}
                      >
                        <Trash2 size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.tabScrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScrollViewContent}>
          {/* Members Title Info */}
          <View style={styles.docsHeaderBlock}>
            <Text style={styles.docsHeaderTitleText}>Group Directory</Text>
            <Text style={styles.docsHeaderDescText}>
              All members in this expedition chat. Click a participant to start a private conversation.
            </Text>
          </View>

          {/* Members List Container */}
          <View style={styles.membersTabList}>
            {groupMembers.map((member) => (
              <TouchableOpacity
                key={member.name}
                style={styles.memberTabCard}
                onPress={() => handleMemberClick(member)}
                activeOpacity={0.8}
              >
                <View style={styles.memberTabCardLeft}>
                  <Image source={{ uri: member.avatar }} style={styles.memberTabAvatar} />
                  <View style={styles.memberTabMeta}>
                    <Text style={styles.memberTabNameText}>{member.name}</Text>
                    <Text style={styles.memberTabRoleText}>{member.role}</Text>
                  </View>
                </View>

                <View style={styles.memberTabCardRight}>
                  <View style={[
                    styles.memberRoleBadge,
                    member.role === 'Organizer' ? styles.roleBadgeOrganizer :
                    member.role === 'Guide' ? styles.roleBadgeGuide : styles.roleBadgeTourist
                  ]}>
                    <Text style={[
                      styles.memberRoleBadgeText,
                      member.role === 'Organizer' ? { color: '#0066FF' } :
                      member.role === 'Guide' ? { color: '#10B981' } : { color: '#94A3B8' }
                    ]}>
                      {member.role.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberChatIconBox}>
                    <MessageSquare size={14} color="#0066FF" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ─── MESSAGE LONG PRESS OPTIONS OVERLAY ────────────────── */}
      {selectedMessageForOptions && (
        <View style={styles.optionsModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedMessageForOptions(null)}
          />
          <View style={styles.optionsModalContent}>
            <View style={styles.optionsHeaderRow}>
              <Text style={styles.optionsHeaderTitle} numberOfLines={1}>
                Message Options
              </Text>
              <Text style={styles.optionsHeaderSubText} numberOfLines={1}>
                "{selectedMessageForOptions.content}"
              </Text>
            </View>

            <View style={styles.optionsDivider} />

            {/* REPLY OPTION */}
            <TouchableOpacity
              style={styles.optionsRowBtn}
              onPress={() => {
                setReplyingToMessage(selectedMessageForOptions);
                setSelectedMessageForOptions(null);
              }}
            >
              <CornerUpLeft size={16} color="#94A3B8" style={styles.optionsRowIcon} />
              <Text style={styles.optionsRowText}>Reply to Message</Text>
            </TouchableOpacity>

            {/* COPY OPTION */}
            <TouchableOpacity
              style={styles.optionsRowBtn}
              onPress={() => handleCopyMessage(selectedMessageForOptions.content)}
            >
              <Copy size={16} color="#94A3B8" style={styles.optionsRowIcon} />
              <Text style={styles.optionsRowText}>Copy Text</Text>
            </TouchableOpacity>

            {/* TRANSLATE OPTION */}
            {selectedMessageForOptions.translations?.hindi && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  toggleTranslate(selectedMessageForOptions.id);
                  setSelectedMessageForOptions(null);
                }}
              >
                <TranslateIcon size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>Translate Message</Text>
              </TouchableOpacity>
            )}

            {/* DIRECT MESSAGE OPTION */}
            {!selectedMessageForOptions.isMe && activeRoom?.type === 'GROUP' && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() =>
                  handleStartDirectMessage(
                    selectedMessageForOptions.senderName,
                    selectedMessageForOptions.avatar
                  )
                }
              >
                <MessageSquare size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  Direct Message {selectedMessageForOptions.senderName}
                </Text>
              </TouchableOpacity>
            )}

            {/* DELETE OPTION */}
            {selectedMessageForOptions.isMe && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => handleDeleteMessage(selectedMessageForOptions.id)}
              >
                <X size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>Delete Message</Text>
              </TouchableOpacity>
            )}

            <View style={styles.optionsCancelDivider} />

            <TouchableOpacity
              style={styles.optionsCancelBtn}
              onPress={() => setSelectedMessageForOptions(null)}
            >
              <Text style={styles.optionsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── GROUP INFO & OPTIONS SETTINGS OVERLAY ───────────── */}
      {isSettingsOpen && (
        <View style={styles.settingsOverlay}>
          <SafeAreaView style={{ flex: 1 }}>
            
            {/* Floating Close Button */}
            <TouchableOpacity 
              onPress={() => setIsSettingsOpen(false)} 
              style={styles.settingsAbsoluteCloseBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft size={20} color="#FFF" />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
              
              {/* Group Meta Display */}
              <View style={styles.settingsAvatarBlock}>
                <Image source={{ uri: activeRoom?.avatar }} style={styles.settingsAvatarImg} />
                <Text style={styles.settingsRoomName}>{activeRoom?.name}</Text>
                <Text style={styles.settingsTripDates}>
                  {activeTrip.startDate} to {activeTrip.endDate}
                </Text>
              </View>

              {/* ADVANCED TELEMETRY MONITOR CARD */}
              <TouchableOpacity
                onPress={() => setIsTripDetailsExpanded(prev => !prev)}
                activeOpacity={0.85}
                style={{ marginBottom: 16 }}
              >
                <LinearGradient
                  colors={['#2E1065', '#120D26']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.telemetryCardGradient}
                >
                  <View style={styles.telemetryHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Compass size={15} color="#C084FC" />
                      <Text style={[styles.telemetryTitle, { color: '#E9D5FF' }]}>TRIP COMMAND CENTER</Text>
                    </View>
                    <View style={[styles.telemetryStatusBadge, { backgroundColor: 'rgba(192, 132, 252, 0.15)', borderColor: 'rgba(192, 132, 252, 0.3)' }]}>
                      <Text style={[styles.telemetryStatusText, { color: '#F3E8FF' }]}>ACTIVE RUN</Text>
                    </View>
                  </View>

                  <Text style={styles.telemetryLabel}>Itinerary Sync Progress</Text>
                  <View style={styles.progressBarBg}>
                    <LinearGradient
                      colors={['#0066FF', '#8B5CF6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressBarFill, { width: '45%' }]}
                    />
                  </View>

                  <View style={styles.telemetryMetaGrid}>
                    <View style={styles.telemetryMetaCell}>
                      <Text style={styles.telemetryMetaVal}>{activeTrip.cities[1] || 'Delhi'}</Text>
                      <Text style={styles.telemetryMetaLbl}>Last Node</Text>
                    </View>
                    <View style={[styles.telemetryMetaCell, { alignItems: 'flex-end' }]}>
                      <Text style={styles.telemetryMetaVal}>{activeTrip.cities[activeTrip.cities.length - 1] || 'Vrindavan'}</Text>
                      <Text style={styles.telemetryMetaLbl}>Target Node</Text>
                    </View>
                  </View>

                  <View style={styles.telemetryDivider} />

                  <View style={styles.telemetryFooter}>
                    <Text style={[styles.telemetryFooterText, { color: '#C084FC' }]}>
                      {isTripDetailsExpanded ? 'Tap to collapse settings & timeline' : 'Tap to expand settings, ledger & logs'}
                    </Text>
                    {isTripDetailsExpanded ? (
                      <ChevronUp size={14} color="#C084FC" />
                    ) : (
                      <ChevronDown size={14} color="#C084FC" />
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {isTripDetailsExpanded && (
                <>
                  {/* 1. Trip Progress Timeline */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <MapPin size={16} color="#0066FF" style={{ marginRight: 6 }} />
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
                  <Clock size={14} color="#0066FF" style={{ marginRight: 6 }} />
                  <Text style={styles.meetingTitle}>Assembly point:</Text>
                  <Text style={styles.meetingLocation} numberOfLines={1}>{activeTrip.meetingPoint}</Text>
                </View>
              </View>

              {/* 2. Group Expenses & Split */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <DollarSign size={16} color="#0066FF" style={{ marginRight: 6 }} />
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
                  style={[styles.settingsOutlineBtn, { borderColor: '#0066FF' }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    setActiveModal('EXPENSE');
                  }}
                >
                  <DollarSign size={14} color="#0066FF" style={{ marginRight: 4 }} />
                  <Text style={[styles.settingsOutlineBtnText, { color: '#0066FF' }]}>Log Shared Expense Bill</Text>
                </TouchableOpacity>
              </View>

              {/* 3. Group Polls & Decisions */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <BarChart2 size={16} color="#0066FF" style={{ marginRight: 6 }} />
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
                  style={[styles.settingsOutlineBtn, { borderColor: '#0066FF' }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    setActiveModal('POLL');
                  }}
                >
                  <BarChart2 size={14} color="#0066FF" style={{ marginRight: 4 }} />
                  <Text style={[styles.settingsOutlineBtnText, { color: '#0066FF' }]}>Create Group Poll</Text>
                </TouchableOpacity>
              </View>

              {/* 4. Tour Guide details */}
              <View style={styles.settingSectionCard}>
                <View style={styles.sectionHeader}>
                  <Compass size={16} color="#0066FF" style={{ marginRight: 6 }} />
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
                  <ShieldAlert size={16} color="#0066FF" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionHeaderTitle}>Safety Command & Emergency Control</Text>
                </View>

                <View style={styles.safetyControlRow}>
                  <View style={styles.controlInfo}>
                    <Text style={styles.controlTitle}>Live Location Pinging</Text>
                    <Text style={styles.controlDesc}>Sends background telemetry updates</Text>
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#0066FF', letterSpacing: 0.5 }}>ACTIVE</Text>
                </View>

                <View style={styles.safetyControlRow}>
                  <View style={styles.controlInfo}>
                    <Text style={styles.controlTitle}>Government Aadhaar verification</Text>
                    <Text style={styles.controlDesc}>Aadhaar status: verified</Text>
                  </View>
                  <CheckCircle size={16} color="#0066FF" />
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
            </>
          )}

              {/* 6. Group Members List (Core Info shown directly) */}
              {activeRoom?.type === 'GROUP' && (
                <View style={{ marginBottom: 14, paddingHorizontal: 4 }}>
                  <View style={styles.sectionHeader}>
                    <UsersIcon size={16} color="#0066FF" style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeaderTitle}>Group Members ({groupMembers.length})</Text>
                  </View>
                  <Text style={styles.settingsSubInfo}>Tap a member to start a private chat.</Text>
                  <View style={styles.membersListContainer}>
                    {groupMembers.map((member, idx) => {
                      const isLast = idx === groupMembers.length - 1;
                      return (
                        <TouchableOpacity
                          key={member.name}
                          style={[
                            styles.memberItemRow,
                            !isLast && { borderBottomWidth: 0.8, borderBottomColor: '#1E293B', paddingBottom: 12 }
                          ]}
                          onPress={() => handleMemberClick(member)}
                          activeOpacity={0.7}
                        >
                          <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
                          <View style={styles.memberMeta}>
                            <Text style={styles.memberName}>{member.name}</Text>
                            <Text style={styles.memberRoleText}>{member.role}</Text>
                          </View>

                          {/* Role Badge indicator */}
                          <View style={[
                            styles.roleBadge,
                            member.role === 'Organizer' ? styles.roleBadgeOrganizer :
                            member.role === 'Guide' ? styles.roleBadgeGuide : styles.roleBadgeTourist
                          ]}>
                            <Text style={[
                              styles.roleBadgeText,
                              member.role === 'Organizer' ? { color: '#0066FF' } :
                              member.role === 'Guide' ? { color: '#10B981' } : { color: '#94A3B8' }
                            ]}>
                              {member.role.toUpperCase()}
                            </Text>
                          </View>

                          <MessageSquare size={14} color="#0066FF" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {/* EXIT GROUP ACTION */}
              {activeRoom?.type === 'GROUP' && (
                <TouchableOpacity
                  style={styles.settingsExitBtn}
                  onPress={() => {
                    Alert.alert(
                      'Exit Group',
                      `Are you sure you want to leave ${activeRoom?.name}? You will no longer receive messages or updates.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Exit',
                          style: 'destructive',
                          onPress: () => {
                            setIsSettingsOpen(false);
                            setSelectedRoomId(null);
                            setInboxRooms(prev => prev.filter(r => r.id !== activeRoom?.id));
                          }
                        }
                      ]
                    );
                  }}
                  activeOpacity={0.8}
                >
                  <LogOut size={16} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.settingsExitBtnText}>Exit Group</Text>
                </TouchableOpacity>
              )}

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

      {/* ─── DOCUMENT UPLOAD MODAL OVERLAY ────────────────── */}
      {isDocModalOpen && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <Text style={styles.modalHeading}>Upload Document</Text>
            
            {isUploading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={[styles.modalSubLabel, { marginBottom: 12, color: C.textSec }]}>Uploading document to vault...</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${uploadProgress}%`, backgroundColor: '#0066FF' }]} />
                </View>
                <Text style={{ color: '#FFF', fontSize: 13, marginTop: 8, fontWeight: '600' }}>{uploadProgress}% Complete</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.modalSubLabel}>Document Title / Name</Text>
                <TextInput
                  placeholder="e.g. Driving License, Aadhaar, Insurance..."
                  placeholderTextColor={C.textMuted}
                  value={docTitle}
                  onChangeText={setDocTitle}
                  style={styles.modalInput}
                />
                
                <Text style={styles.modalSubLabel}>Details / Subtitle</Text>
                <TextInput
                  placeholder="e.g. DL #DL-03-2026194, PNR, Policy ID..."
                  placeholderTextColor={C.textMuted}
                  value={docSubtitle}
                  onChangeText={setDocSubtitle}
                  style={styles.modalInput}
                />

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setIsDocModalOpen(false)}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: C.blue }]}
                    onPress={handleDocSubmit}
                  >
                    <Text style={styles.modalBtnSubmitText}>Upload File</Text>
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
    flexShrink: 0,
  },
  actionRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
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
    backgroundColor: '#09090C',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 102, 255, 0.25)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: '#1E293B',
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
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: C.bg,
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  textInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14.5,
    paddingVertical: 4,
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
    backgroundColor: '#000000',
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
    borderBottomWidth: 1.2,
    borderBottomColor: '#1E293B',
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
  
  // Swipe to Reply & Reply UI Styles
  inputRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  replyPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    width: '100%',
  },
  replyPreviewTextCol: {
    flex: 1,
    marginRight: 10,
  },
  replyPreviewSenderName: {
    fontSize: 11,
    fontWeight: '800',
    color: C.blueGlow,
    marginBottom: 2,
  },
  replyPreviewContentText: {
    fontSize: 12,
    color: C.textMuted,
  },
  replyPreviewCloseBtn: {
    padding: 4,
  },
  bubbleReplyHeaderMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderMe: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 10.5,
    marginBottom: 1,
  },
  bubbleReplyContentMe: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
  },
  bubbleReplyHeaderOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderOther: {
    color: C.blueGlow,
    fontWeight: '800',
    fontSize: 10.5,
    marginBottom: 1,
  },
  bubbleReplyContentOther: {
    color: C.textSec,
    fontSize: 11,
  },
  
  // Long Press Options Modal Styles
  optionsModalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  optionsModalContent: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    padding: 20,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  optionsHeaderRow: {
    marginBottom: 12,
  },
  optionsHeaderTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  optionsHeaderSubText: {
    color: C.textSec,
    fontSize: 11.5,
    fontStyle: 'italic',
  },
  optionsDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginBottom: 10,
  },
  optionsRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  optionsRowIcon: {
    width: 20,
    textAlign: 'center',
  },
  optionsRowText: {
    color: '#E2E8F0',
    fontSize: 13.5,
    fontWeight: '500',
  },
  optionsCancelDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  optionsCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
  },
  optionsCancelText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '700',
  },

  // Group Members Styles
  settingsSubInfo: {
    color: C.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  membersListContainer: {
    marginTop: 4,
    gap: 8,
  },
  memberItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  memberMeta: {
    flex: 1,
  },
  memberName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  memberRoleText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.8,
    marginRight: 4,
  },
  roleBadgeOrganizer: {
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    borderColor: 'rgba(0, 102, 255, 0.3)',
  },
  roleBadgeGuide: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  roleBadgeTourist: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  roleBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Telemetry Monitor Styles
  telemetryCardGradient: {
    borderRadius: 16,
    padding: 16,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  telemetryTitle: {
    color: '#8B5CF6',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryStatusBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.8,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  telemetryStatusText: {
    color: '#8B5CF6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  telemetryMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryMetaCell: {
    flex: 1,
  },
  telemetryMetaVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  telemetryMetaLbl: {
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 2,
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  telemetryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryFooterText: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '600',
  },
  settingsAbsoluteCloseBtn: {
    position: 'absolute',
    top: 45,
    left: 20,
    zIndex: 300,
  },
  settingsExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 20,
    gap: 8,
  },
  settingsExitBtnText: {
    color: '#EF4444',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ─── TAB SELECTION BAR STYLES ─────────────────────────────────
  tabBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: C.border,
    marginHorizontal: 12,
    marginVertical: 10,
    elevation: 4,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  tabItemTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
  },
  tabItemTouchActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  tabItemLabel: {
    color: '#7E8494',
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabItemLabelActive: {
    color: '#C084FC',
    fontWeight: '700',
  },

  // ─── PINNED GROUP UPDATE STYLES ───────────────────────────────
  groupUpdateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 10,
  },
  groupUpdateLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  groupUpdatePinIcon: {
    marginTop: 2,
    transform: [{ rotate: '45deg' }],
  },
  groupUpdateInfo: {
    flex: 1,
    paddingRight: 6,
  },
  groupUpdateTitleText: {
    color: '#C084FC',
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  groupUpdateDescText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
  },
  groupUpdateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupUpdateViewBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  groupUpdateViewBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  groupUpdateCloseBtn: {
    padding: 4,
  },

  // ─── TAB CONTENT MAIN SCROLL VIEWS ────────────────────────────
  tabScrollView: {
    flex: 1,
  },
  tabScrollViewContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 40,
  },

  // ─── ITINERARY STATS SUMMARY CARD ─────────────────────────────
  statsSummaryCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsTitle: {
    color: '#E2E8F0',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statsStatusBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statsStatusText: {
    color: '#34D399',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsCell: {
    flex: 1,
  },
  statsValLabel: {
    color: '#7E8494',
    fontSize: 10.5,
    fontWeight: '600',
    marginBottom: 3,
  },
  statsValText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  statsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.8,
    borderTopColor: '#1E293B',
    paddingTop: 10,
  },
  statsFooterText: {
    color: '#C084FC',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },

  // ─── ROADMAP TIMELINE STYLES ──────────────────────────────────
  timelineCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  timelineTitleText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  timelineList: {
    paddingLeft: 4,
  },
  verticalTimelineStep: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  verticalTimelineLeft: {
    alignItems: 'center',
    marginRight: 12,
    width: 20,
  },
  verticalTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    zIndex: 10,
  },
  verticalTimelineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
  },
  verticalTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  verticalTimelineCard: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
  },
  verticalTimelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  verticalTimelineDayText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verticalTimelineNodeTitle: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  verticalTimelineDesc: {
    color: '#7E8494',
    fontSize: 11.5,
    lineHeight: 16,
  },

  // ─── DOCUMENTS VAULT STYLES ───────────────────────────────────
  docsHeaderBlock: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  docsHeaderTitleText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  docsHeaderDescText: {
    color: '#7E8494',
    fontSize: 12.5,
    lineHeight: 17,
  },
  uploadDocBtn: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  uploadDocGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  uploadDocBtnText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  docsListContainer: {
    gap: 12,
  },
  noDocsText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 30,
  },
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 12,
  },
  docItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docItemMeta: {
    flex: 1,
    paddingRight: 6,
  },
  docTitleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  docSubText: {
    color: '#7E8494',
    fontSize: 11,
    marginBottom: 2,
  },
  docDateText: {
    color: '#64748B',
    fontSize: 9,
  },
  docItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docStatusBadge: {
    borderWidth: 0.8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  docStatusText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  docDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },

  // ─── MEMBERS DIRECTORY STYLES ─────────────────────────────────
  membersTabList: {
    gap: 10,
  },
  memberTabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 12,
  },
  memberTabCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberTabAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberTabMeta: {
    justifyContent: 'center',
  },
  memberTabNameText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  memberTabRoleText: {
    color: '#7E8494',
    fontSize: 10.5,
    marginTop: 1,
  },
  memberTabCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberRoleBadge: {
    borderWidth: 0.8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  memberRoleBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberChatIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
