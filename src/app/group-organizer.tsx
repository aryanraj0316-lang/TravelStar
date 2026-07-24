import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  TextInput,
  Modal,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import {
  ArrowLeft,
  Search,
  Users,
  MessageSquare,
  DollarSign,
  MapPin,
  Calendar,
  TrendingUp,
  Plus,
  FileText,
  Map,
  Clock,
  Compass,
  Car,
  Train,
  Plane,
  Calculator,
  Hotel,
  Home,
  Tent,
  ExternalLink,
  Sun,
  Activity,
  ShieldAlert,
  PhoneCall,
  HeartPulse,
  Shield,
  AlertTriangle,
  CheckCircle,
  X,
  Check,
  Send,
  Coffee,
  Star,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#04060f',
  card: '#0c0f1d',
  cardAlt: '#14182f',
  border: '#22294c',
  borderGlow: '#323f7c',
  white: '#ffffff',
  textSec: '#a2a9c3',
  textMuted: '#677196',
  blue: '#0066FF',
  blueGlow: '#3385ff',
  purple: '#8B5CF6',
  purpleGlow: '#a78bfa',
  green: '#10B981',
  greenGlow: '#34d399',
  amber: '#F59E0B',
  amberGlow: '#fbbf24',
  rose: '#EF4444',
  roseGlow: '#f87171',
  cyan: '#06B6D4',
};

// â”€â”€â”€ Data Interfaces â”€â”€â”€
interface ActiveTour {
  id: string;
  groupName: string;
  destination: string;
  durationDays: number;
  maxSize: number;
  currentSize: number;
  price: number;
  status: 'OPEN' | 'FULL' | 'COMPLETED';
  chatLink: string;
}

interface GroupMember {
  id: string;
  name: string;
  avatar: string;
  role: 'LEADER' | 'GUIDE' | 'MEMBER';
  emergencyContact: string;
  checkedIn: boolean;
  diet: string;
  roomAllocated: string;
  seatAllocated: string;
}

interface JoinRequest {
  id: string;
  tourId: string;
  userName: string;
  userAvatar: string;
  requestMessage: string;
}

export default function GroupOrganizerScreen() {
  const router = useRouter();
  const { profile, addTrip } = useApp();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'trips' | 'logistics' | 'payments' | 'chat'>('dashboard');

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // STATE: TOURS & CHATS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [tours, setTours] = useState<ActiveTour[]>([
    {
      id: 'tour-1',
      groupName: 'Sikkim Highlanders Club',
      destination: 'North Sikkim Expedition',
      durationDays: 6,
      maxSize: 12,
      currentSize: 9,
      price: 18500,
      status: 'OPEN',
      chatLink: 'travelstar.app/chat/join/sikkim-highlanders',
    },
    {
      id: 'tour-2',
      groupName: 'Rajasthan Heritage Royals',
      destination: 'Jaipur & Jodhpur Forts',
      durationDays: 4,
      maxSize: 15,
      currentSize: 15,
      price: 9500,
      status: 'FULL',
      chatLink: 'travelstar.app/chat/join/rajasthan-royals',
    },
    {
      id: 'tour-3',
      groupName: 'Kerala Backwaters Cruise',
      destination: 'Alleppey & Munnar Hills',
      durationDays: 5,
      maxSize: 10,
      currentSize: 4,
      price: 12000,
      status: 'OPEN',
      chatLink: 'travelstar.app/chat/join/kerala-cruise',
    },
  ]);

  const [selectedTourIdx, setSelectedTourIdx] = useState(0);
  const currentTour = tours[selectedTourIdx];

  // Join Requests state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([
    { id: 'req-1', tourId: 'tour-1', userName: 'Amit Khandelwal', userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80', requestMessage: 'Hey! I would love to join the Sikkim trek. Verified guide is included right?' },
    { id: 'req-2', tourId: 'tour-1', userName: 'Preeti Deshmukh', userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80', requestMessage: 'Interested in the Himalayas hike. Pls approve request, ready to deposit token amount.' },
    { id: 'req-3', tourId: 'tour-3', userName: 'Sunil Rao', userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80', requestMessage: 'Traveling with my spouse, looking forward to join approved backwaters trip.' },
  ]);

  // Members list (dynamic for currently selected tour)
  const [members, setMembers] = useState<GroupMember[]>([
    { id: 'm-1', name: 'Aarav Sharma (You)', avatar: profile.avatar, role: 'LEADER', emergencyContact: 'Father: 9876543210', checkedIn: true, diet: 'VEG', roomAllocated: 'Room 302', seatAllocated: 'Seat 1A' },
    { id: 'm-2', name: 'Rajesh Kumar', avatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=120&q=80', role: 'GUIDE', emergencyContact: 'Wife: 9812345678', checkedIn: true, diet: 'VEG', roomAllocated: 'Room 303', seatAllocated: 'Seat 1B' },
    { id: 'm-3', name: 'Rohan Malhotra', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80', role: 'MEMBER', emergencyContact: 'Mother: 9944556677', checkedIn: true, diet: 'NON-VEG', roomAllocated: 'Room 305', seatAllocated: 'Seat 4A' },
    { id: 'm-4', name: 'Neha Gupta', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80', role: 'MEMBER', emergencyContact: 'Brother: 9789456123', checkedIn: false, diet: 'VEGAN', roomAllocated: 'Room 306', seatAllocated: 'Seat 4B' },
    { id: 'm-5', name: 'Kabir Sen', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&q=80', role: 'MEMBER', emergencyContact: 'Sister: 9654123789', checkedIn: false, diet: 'NON-VEG', roomAllocated: 'Room 305', seatAllocated: 'Seat 5A' },
  ]);

  // Create new Tour form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newDest, setNewDest] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newMaxSize, setNewMaxSize] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const handleCreateTour = () => {
    if (!newGroupName.trim() || !newDest.trim() || !newDuration.trim() || !newMaxSize.trim() || !newPrice.trim()) {
      Alert.alert('Empty Fields', 'Please fill in all the details for the new trip.');
      return;
    }

    const globalTripId = `trip-${Date.now()}`;

    const newTour: ActiveTour = {
      id: globalTripId,
      groupName: newGroupName.trim(),
      destination: newDest.trim(),
      durationDays: parseInt(newDuration),
      maxSize: parseInt(newMaxSize),
      currentSize: 1, // Organizer starts inside
      price: parseFloat(newPrice),
      status: 'OPEN',
      chatLink: `travelstar.app/chat/join/${newGroupName.trim().toLowerCase().replace(/\s+/g, '-')}`,
    };

    const newGlobalTrip = {
      id: globalTripId,
      name: newGroupName.trim(),
      creator: `${profile.name} (Organizer)`,
      cities: [newDest.trim()],
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: parseFloat(newPrice),
      availableSeats: parseInt(newMaxSize) - 1,
      totalSeats: parseInt(newMaxSize),
      meetingPoint: 'Organizer Meeting Point',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC' as const,
      membersCount: 1,
    };

    addTrip(newGlobalTrip);
    setTours([...tours, newTour]);
    setNewGroupName('');
    setNewDest('');
    setNewDuration('');
    setNewMaxSize('');
    setNewPrice('');
    setShowCreateModal(false);
    Alert.alert('Tour Created!', `"${newTour.groupName}" has been successfully added to your dashboard. Group chat link generated.`);
  };

  const handleApproveRequest = (reqId: string, userName: string, avatar: string) => {
    // Add traveler to active member list
    const newMember: GroupMember = {
      id: `m-${Date.now()}`,
      name: userName,
      avatar,
      role: 'MEMBER',
      emergencyContact: 'Not Provided (Pending onboarding)',
      checkedIn: false,
      diet: 'VEG',
      roomAllocated: 'Room TBD',
      seatAllocated: 'Seat TBD',
    };

    setMembers([...members, newMember]);
    setJoinRequests(joinRequests.filter((r) => r.id !== reqId));

    // Update current size on tour
    setTours(
      tours.map((t, idx) =>
        idx === selectedTourIdx ? { ...t, currentSize: t.currentSize + 1 } : t
      )
    );

    Alert.alert('Approved!', `"${userName}" has been added to ${currentTour.groupName} and the group chat.`);
  };

  const handleRejectRequest = (reqId: string, userName: string) => {
    setJoinRequests(joinRequests.filter((r) => r.id !== reqId));
    Alert.alert('Rejected', `Declined group chat join request for "${userName}".`);
  };

  const handleEditGroupName = () => {
    Alert.prompt(
      'Edit Group Name',
      'Change the display name of this tour group & chat:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (newName?: string) => {
            if (newName && newName.trim()) {
              setTours(
                tours.map((t, idx) =>
                  idx === selectedTourIdx
                    ? {
                        ...t,
                        groupName: newName.trim(),
                        chatLink: `travelstar.app/chat/join/${newName.trim().toLowerCase().replace(/\s+/g, '-')}`,
                      }
                    : t
                )
              );
              Alert.alert('Success', `Group name updated to "${newName.trim()}"`);
            }
          },
        },
      ],
      'plain-text',
      currentTour.groupName
    );
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 2: MEMBERS & TOOLS STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [newMemName, setNewMemName] = useState('');
  const [newMemRole, setNewMemRole] = useState<'MEMBER' | 'GUIDE'>('MEMBER');
  const [newMemContact, setNewMemContact] = useState('');

  const handleAddMember = () => {
    if (!newMemName.trim()) {
      Alert.alert('Empty Name', 'Please provide a valid participant name.');
      return;
    }
    const nm: GroupMember = {
      id: `m-${Date.now()}`,
      name: newMemName.trim(),
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80',
      role: newMemRole,
      emergencyContact: newMemContact.trim() || 'No record',
      checkedIn: false,
      diet: 'VEG',
      roomAllocated: 'Room TBD',
      seatAllocated: 'Seat TBD',
    };
    setMembers([...members, nm]);
    setNewMemName('');
    setNewMemContact('');
    setShowMemberModal(false);
    Alert.alert('Member Added', `Successfully added ${nm.name} to the roster.`);
  };

  const handleRemoveMember = (id: string, name: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${name} from this tour roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setMembers(members.filter((m) => m.id !== id));
            // Update size
            setTours(
              tours.map((t, idx) =>
                idx === selectedTourIdx ? { ...t, currentSize: Math.max(1, t.currentSize - 1) } : t
              )
            );
          },
        },
      ]
    );
  };

  const handleCheckInToggle = (id: string) => {
    setMembers(
      members.map((m) => (m.id === id ? { ...m, checkedIn: !m.checkedIn } : m))
    );
  };

  // Roster stats
  const checkedInCount = members.filter((m) => m.checkedIn).length;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 3: ITINERARY PLANNER & LOGISTICS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [logisticsTab, setLogisticsTab] = useState<'itinerary' | 'transport' | 'hotel' | 'meals'>('itinerary');

  const [itinerary, setItinerary] = useState([
    { day: 1, title: 'Arrival & Welcoming Dinner', plan: 'SUV pickup at airport. Standard room check-in. Dinner reservation at spice estate by 07:30 PM.' },
    { day: 2, title: 'Trekking & Sightseeing', plan: '08:00 AM breakfast. Guided 6km forest trek. Picnic lunch. 4:00 PM free time blocks. Sunset view.' },
  ]);
  const [newDayTitle, setNewDayTitle] = useState('');
  const [newDayDesc, setNewDayDesc] = useState('');

  const handleAddItineraryDay = () => {
    if (!newDayTitle.trim() || !newDayDesc.trim()) {
      Alert.alert('Empty Fields', 'Please complete day title and schedule details.');
      return;
    }
    const newDay = {
      day: itinerary.length + 1,
      title: newDayTitle.trim(),
      plan: newDayDesc.trim(),
    };
    setItinerary([...itinerary, newDay]);
    setNewDayTitle('');
    setNewDayDesc('');
    Alert.alert('Added', `Day ${newDay.day} added to schedule.`);
  };

  // Rooms and Seats allocations states
  const handleAllocateRoom = (memberId: string, currentVal: string) => {
    Alert.prompt(
      'Allocate Hotel Room',
      'Set room number assignment (e.g. Room 402):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Allocate',
          onPress: (room?: string) => {
            if (room) {
              setMembers(members.map((m) => (m.id === memberId ? { ...m, roomAllocated: room.trim() } : m)));
            }
          },
        },
      ],
      'plain-text',
      currentVal
    );
  };

  const handleAllocateSeat = (memberId: string, currentVal: string) => {
    Alert.prompt(
      'Allocate Transport Seat',
      'Set seat number assignment (e.g. Seat 12A):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Allocate',
          onPress: (seat?: string) => {
            if (seat) {
              setMembers(members.map((m) => (m.id === memberId ? { ...m, seatAllocated: seat.trim() } : m)));
            }
          },
        },
      ],
      'plain-text',
      currentVal
    );
  };

  // Transport details
  const [driverInfo] = useState({ name: 'Jaspreet Singh', phone: '+91 9988776655', bus: 'Winger Deluxe (NL-01H-7788)', route: 'Siliguri to Gangtok/Lachung' });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 4: PAYMENTS & DOCUMENTS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [payments] = useState([
    { id: 'p-1', name: 'Rohan Malhotra', deposit: 5000, balance: 13500, status: 'PAID' },
    { id: 'p-2', name: 'Neha Gupta', deposit: 5000, balance: 0, status: 'FULLY_PAID' },
    { id: 'p-3', name: 'Kabir Sen', deposit: 0, balance: 18500, status: 'PENDING' },
  ]);

  const [documents] = useState([
    { id: 'd-1', type: 'Sikkim Permit', fileName: 'NorthSikkim_Permit_0812.pdf', status: 'APPROVED' },
    { id: 'd-2', type: 'Travel Insurance Logs', fileName: 'Roster_GroupInsurance.xlsx', status: 'PENDING' },
    { id: 'd-3', type: 'Transit Train Tickets', fileName: 'Pnr_MathuraExp_1208.pdf', status: 'APPROVED' },
  ]);

  const handleGenerateInvoice = (name: string, balance: number) => {
    Alert.alert(
      'Invoice Generated',
      `PDF Invoice successfully compiled for ${name}.\nOutstanding Balance: â‚¹${balance.toLocaleString('en-IN')}.\nSent copy to registered email.`
    );
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 5: ANNOUNCEMENTS & POLLS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [announcements, setAnnouncements] = useState([
    { id: 'a-1', title: 'Bring Warm Clothes', date: 'Today, 10:15 AM', content: 'Temperatures in Lachung/Lachen are dropping to 8Â°C. Pls pack heavy woolens.' },
    { id: 'a-2', title: 'Meeting Point Updated', date: 'Yesterday', content: 'Meeting point set to NJP Platform 1 at 08:30 AM sharp on August 12.' },
  ]);
  const [newAnnounceTitle, setNewAnnounceTitle] = useState('');
  const [newAnnounceDesc, setNewAnnounceDesc] = useState('');

  const handlePublishAnnouncement = () => {
    if (!newAnnounceTitle.trim() || !newAnnounceDesc.trim()) {
      Alert.alert('Empty Fields', 'Please fill in title and announcement contents.');
      return;
    }
    const newAnn = {
      id: `a-${Date.now()}`,
      title: newAnnounceTitle.trim(),
      date: 'Just Now',
      content: newAnnounceDesc.trim(),
    };
    setAnnouncements([newAnn, ...announcements]);
    setNewAnnounceTitle('');
    setNewAnnounceDesc('');
    Alert.alert('Published', 'Announcement broadcasted to all group members via Push Notification.');
  };

  // Group decision polls
  const [poll, setPoll] = useState({
    question: 'Select preferred day for trekking lunch:',
    options: [
      { text: 'Local traditional thali', votes: 6 },
      { text: 'Continental buffet packs', votes: 2 },
      { text: 'Fast-food sandwich packets', votes: 1 },
    ],
  });

  const handlePollVote = (index: number) => {
    const updatedOptions = poll.options.map((opt, idx) =>
      idx === index ? { ...opt, votes: opt.votes + 1 } : opt
    );
    setPoll({ ...poll, options: updatedOptions });
    Alert.alert('Vote Cast', 'Your vote as leader has been recorded in the consensus poll.');
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 6: LIVE GPS, SOS & AI DESK
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [liveTab, setLiveTab] = useState<'map' | 'ai' | 'qr'>('map');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const triggerAIGenerator = () => {
    if (!aiPrompt.trim()) {
      Alert.alert('Enter Destination', 'Pls enter a target destination/activities for the AI planner.');
      return;
    }

    setAiGenerating(true);
    setAiOutput(null);

    // Simulate AI generation lag
    setTimeout(() => {
      setAiGenerating(false);
      setAiOutput(
        `ðŸ¤– TRAVELSTAR AI PROPOSAL FOR "${aiPrompt.trim().toUpperCase()}"\n\n` +
          `â€¢ Day 1 Schedule: Airport arrival. Standard Hotel booking check-in. Evening walking tour of local heritage market. Dinner coupon reservation.\n` +
          `â€¢ Day 2 Schedule: 08:30 AM departure to high altitude viewpoint. Smart grouping hike (group size: 5 per guide). Suggested attraction visits.\n` +
          `â€¢ Day 3 Schedule: Check-out, transit, hotel room allocations, and local cuisine tasting reservations. Travel time estimated via auto vehicle routing.`
      );
    }, 2000);
  };

  const handleMockQRCheckin = (mName: string) => {
    setMembers(members.map((m) => (m.name === mName ? { ...m, checkedIn: true } : m)));
    setShowQRScanner(false);
    Alert.alert('QR Check-in Success', `Digital ticket validated. checked-in "${mName}".`);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Modern neon header */}
      <LinearGradient
        colors={['rgba(24,30,59,0.85)', 'rgba(4,6,15,0.96)']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Group Organizer Portal</Text>
            <Text style={styles.headerSub}>Admin Panel & Trip Manager</Text>
          </View>
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            style={styles.badgeOfficialGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Users size={11} color={C.white} />
            <Text style={styles.badgeOfficialText}>ADMIN</Text>
          </LinearGradient>
        </View>

        {/* Floating Scrollable Tab Selector */}
        <View style={styles.tabBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarScroll}
          >
            {[
              { key: 'dashboard', label: 'Dashboard', Icon: TrendingUp },
              { key: 'trips', label: 'Tours & Roster', Icon: Users },
              { key: 'logistics', label: 'Itinerary & Room', Icon: Hotel },
              { key: 'payments', label: 'Billing & Permit', Icon: FileText },
              { key: 'chat', label: 'Chats & Approvals', Icon: MessageSquare },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key as any)}
                  activeOpacity={0.85}
                >
                  <tab.Icon size={13} color={isActive ? C.white : C.textSec} strokeWidth={isActive ? 2.5 : 1.8} />
                  <Text style={[styles.tabLabel, { color: isActive ? C.white : C.textSec }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Dropdown Trip Selector */}
        <View style={styles.dropdownTripBar}>
          <Text style={styles.dropdownLabel}>ACTIVE TOURNAMENT ROSTER:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dropdownTripScroll}>
            {tours.map((t, idx) => {
              const isSel = idx === selectedTourIdx;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.dropdownTripBtn, isSel && styles.dropdownTripBtnActive]}
                  onPress={() => setSelectedTourIdx(idx)}
                >
                  <Text style={[styles.dropdownTripText, { color: isSel ? C.white : C.textSec }]}>
                    {t.groupName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ========================================================
            TAB 1: DASHBOARD & ANALYTICS
            ======================================================== */}
        {activeTab === 'dashboard' && (
          <View>
            {/* Dashboard Cards Grid */}
            <View style={styles.metricsGrid}>
              <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                <Users size={16} color={C.blueGlow} />
                <Text style={styles.metricVal}>{currentTour.currentSize} / {currentTour.maxSize}</Text>
                <Text style={styles.metricLabel}>Total Members</Text>
              </LinearGradient>

              <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                <Calendar size={16} color={C.purpleGlow} />
                <Text style={styles.metricVal}>{tours.length} Active</Text>
                <Text style={styles.metricLabel}>Upcoming Trips</Text>
              </LinearGradient>

              <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                <DollarSign size={16} color={C.greenGlow} />
                <Text style={styles.metricVal}>â‚¹{(currentTour.currentSize * currentTour.price).toLocaleString('en-IN')}</Text>
                <Text style={styles.metricLabel}>Revenue Booking</Text>
              </LinearGradient>

              <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                <Activity size={16} color={C.amberGlow} />
                <Text style={styles.metricVal}>{joinRequests.filter((r) => r.tourId === currentTour.id).length} New</Text>
                <Text style={styles.metricLabel}>Pending Requests</Text>
              </LinearGradient>
            </View>

            {/* Performance Analytics Block */}
            <Text style={styles.sectionLabelInline}>Reports & Statistics Overview</Text>
            <View style={styles.analyticsBox}>
              <View style={styles.statsRow}>
                <View style={styles.subStatBox}>
                  <Text style={styles.subStatLabel}>Occupancy Rate</Text>
                  <Text style={[styles.subStatValue, { color: C.blueGlow }]}>
                    {((currentTour.currentSize / currentTour.maxSize) * 100).toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.subStatDivider} />
                <View style={styles.subStatBox}>
                  <Text style={styles.subStatLabel}>Customer Satisfaction</Text>
                  <Text style={[styles.subStatValue, { color: C.amberGlow }]}>96% â˜…</Text>
                </View>
                <View style={styles.subStatDivider} />
                <View style={styles.subStatBox}>
                  <Text style={styles.subStatLabel}>Cancellation Rate</Text>
                  <Text style={[styles.subStatValue, { color: C.roseGlow }]}>4.5%</Text>
                </View>
              </View>

              {/* Simple Chart */}
              <Text style={styles.chartTitleInline}>Monthly Gross Revenue Log (Simulated)</Text>
              <View style={styles.chartContainer}>
                {[
                  { month: 'Apr', rev: 'â‚¹40k', height: 40 },
                  { month: 'May', rev: 'â‚¹65k', height: 60 },
                  { month: 'Jun', rev: 'â‚¹95k', height: 90 },
                  { month: 'Jul', rev: 'â‚¹120k', height: 110 },
                ].map((item, idx) => (
                  <View key={idx} style={styles.chartCol}>
                    <Text style={styles.chartBarValue}>{item.rev}</Text>
                    <LinearGradient colors={[C.blueGlow, C.blue]} style={[styles.chartBar, { height: item.height }]} />
                    <Text style={styles.chartDayText}>{item.month}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Recent activity feed logs */}
            <Text style={styles.subTitle}>Recent Activity Logs</Text>
            <View style={styles.recentActivityBox}>
              <Text style={styles.activityLogText}>â€¢ Jaspreet Singh (Driver) assigned to Sikkim Highlanders Winger vehicle.</Text>
              <Text style={styles.activityLogText}>â€¢ Deposit payment of â‚¹5,000 confirmed for Rohan Malhotra.</Text>
              <Text style={styles.activityLogText}>â€¢ Permit document "NorthSikkim_Permit_0812.pdf" approved by state authorities.</Text>
              <Text style={styles.activityLogText}>â€¢ Consensus poll launched for deciding Day 3 trekking lunch preferences.</Text>
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 2: TRIP & MEMBER MANAGER
            ======================================================== */}
        {activeTab === 'trips' && (
          <View>
            {/* Roster & Roster Action tools */}
            <View style={styles.leadsHeaderRow}>
              <View>
                <Text style={styles.subTitle}>Participant Roster Management</Text>
                <Text style={styles.descSec}>Control emergency contacts, check-ins, and participant roles</Text>
              </View>
              <TouchableOpacity
                style={styles.addNewBtn}
                onPress={() => setShowMemberModal(true)}
              >
                <Plus size={14} color={C.white} />
                <Text style={styles.addNewBtnText}>Add Member</Text>
              </TouchableOpacity>
            </View>

            {/* Checked-in status bar */}
            <View style={styles.checkInProgressCard}>
              <View style={styles.checkInRow}>
                <Text style={styles.checkInProgressText}> Roster Checked-in Status:</Text>
                <Text style={styles.checkInProgressValue}>{checkedInCount} / {members.length} Present</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(checkedInCount / members.length) * 100}%`, backgroundColor: C.green }]} />
              </View>
            </View>

            {members.map((member) => (
              <View key={member.id} style={styles.memberListItemCard}>
                <View style={styles.memberItemHeader}>
                  <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.memberTitleRow}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <View style={[styles.roleBadge, member.role === 'LEADER' ? { backgroundColor: C.blueGlow } : member.role === 'GUIDE' ? { backgroundColor: C.purpleGlow } : { backgroundColor: C.border }]}>
                        <Text style={styles.roleBadgeText}>{member.role}</Text>
                      </View>
                    </View>
                    <Text style={styles.memberContactText}>🚑 Emergency: {member.emergencyContact}</Text>
                  </View>
                </View>

                <View style={styles.memberActionsDivider} />

                <View style={styles.memberListItemActions}>
                  <TouchableOpacity
                    style={[styles.memberActionToggleBtn, member.checkedIn ? styles.memberActionToggleBtnActive : {}]}
                    onPress={() => handleCheckInToggle(member.id)}
                  >
                    <CheckCircle size={12} color={member.checkedIn ? C.white : C.textSec} />
                    <Text style={[styles.memberActionToggleBtnLabel, { color: member.checkedIn ? C.white : C.textSec }]}>
                      {member.checkedIn ? 'Checked-In' : 'Check-In'}
                    </Text>
                  </TouchableOpacity>

                  {member.role !== 'LEADER' && (
                    <TouchableOpacity
                      style={styles.memberDeleteBtn}
                      onPress={() => handleRemoveMember(member.id, member.name)}
                    >
                      <Text style={styles.memberDeleteBtnLabel}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Trip management tool */}
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>Configure Tour Information</Text>
              <Text style={styles.descSec}>Add/Modify general parameters like destinations, group capacities, pricing details</Text>
            </View>

            {/* Unified Trip Card Design */}
            <View style={[styles.tripCard, { marginBottom: 16 }]}>
              {/* Left side: Image */}
              <View style={styles.tripImageContainer}>
                <Image source={{ uri: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80' }} style={styles.tripImage} />
                <LinearGradient
                  colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.tripBadge, { backgroundColor: '#6C5CE7' }]}>
                  <Text style={styles.tripBadgeText}>Active Tour</Text>
                </View>
              </View>

              {/* Right side: Detailed trip content */}
              <View style={styles.tripContent}>
                <Text style={styles.tripName} numberOfLines={2}>
                  {currentTour.groupName}
                </Text>

                <View style={styles.tripDetailsMetaRow}>
                  <View style={styles.verifiedBadge}>
                    <Check size={8} color="#0066FF" strokeWidth={3} />
                    <Text style={styles.verifiedText}>Verified Route</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Star size={10} color="#FBBF24" fill="#FBBF24" />
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#FFF' }}>4.8</Text>
                  </View>
                  <Text style={{ fontSize: 9.5, color: '#7E8494' }}>•</Text>
                  <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#10B981' }}>{currentTour.maxSize - currentTour.currentSize} left</Text>
                </View>

                {/* Route cities with arrow */}
                <View style={styles.routeCities}>
                  <Text style={styles.cityText}>{currentTour.destination}</Text>
                </View>

                {/* Subtitle / capsules */}
                <View style={styles.capsulesRow}>
                  <View style={styles.capsule}>
                    <Clock size={8} color="#7E8494" />
                    <Text style={styles.capsuleText} numberOfLines={1}>{currentTour.durationDays} Days</Text>
                  </View>
                  <View style={styles.capsule}>
                    <Users size={8} color="#7E8494" />
                    <Text style={styles.capsuleText} numberOfLines={1}>{currentTour.currentSize}/{currentTour.maxSize} Members</Text>
                  </View>
                </View>

                {/* Price and Action Buttons */}
                <View style={styles.priceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>Package Cost</Text>
                    <Text style={styles.priceAmount}>₹{currentTour.price.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={{ gap: 4, width: 110 }}>
                    <TouchableOpacity
                      style={styles.joinBtn}
                      onPress={() => {
                        Alert.alert('Edit Details', `Edit configuration mode for "${currentTour.groupName}" is active.`);
                      }}
                    >
                      <Text style={styles.joinBtnText}>Edit Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.joinBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0066FF', paddingVertical: 4 }]}
                      onPress={() => {
                        setActiveTab('chat');
                      }}
                    >
                      <MessageSquare size={9} color="#0066FF" style={{ marginRight: 2 }} />
                      <Text style={[styles.joinBtnText, { color: '#0066FF' }]}>Open Chat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.tripManagerConfigBox}>
              <View style={styles.tripDetailField}>
                <Text style={styles.tripFieldLabel}>Destination Target</Text>
                <Text style={styles.tripFieldValue}>{currentTour.destination}</Text>
              </View>

              <View style={styles.tripDetailField}>
                <Text style={styles.tripFieldLabel}>Tour Duration</Text>
                <Text style={styles.tripFieldValue}>{currentTour.durationDays} Days</Text>
              </View>

              <View style={styles.tripDetailField}>
                <Text style={styles.tripFieldLabel}>Max Group Capacity</Text>
                <Text style={styles.tripFieldValue}>{currentTour.maxSize} Persons</Text>
              </View>

              <View style={styles.tripDetailField}>
                <Text style={styles.tripFieldLabel}>Price Per Tourist Package</Text>
                <Text style={styles.tripFieldValue}>₹{currentTour.price.toLocaleString('en-IN')}</Text>
              </View>

              <View style={styles.tripDetailField}>
                <Text style={styles.tripFieldLabel}>Current Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: currentTour.status === 'OPEN' ? C.green : currentTour.status === 'FULL' ? C.amber : C.rose }]}>
                  <Text style={styles.statusBadgeText}>{currentTour.status}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.createTripBtn}
                onPress={() => setShowCreateModal(true)}
              >
                <Plus size={16} color={C.white} />
                <Text style={styles.createTripBtnText}>Launch New Tour Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 3: ITINERARY PLANNER & LOGISTICS
            ======================================================== */}
        {activeTab === 'logistics' && (
          <View>
            {/* Logistics Subtabs */}
            <View style={styles.plannerSubTabs}>
              {[
                { key: 'itinerary', label: 'Day Schedule', Icon: Calendar },
                { key: 'transport', label: 'Transport', Icon: Car },
                { key: 'hotel', label: 'Room Assigns', Icon: Hotel },
                { key: 'meals', label: 'Meal Dietary', Icon: Coffee },
              ].map((sTab) => {
                const isSubActive = logisticsTab === sTab.key;
                return (
                  <TouchableOpacity
                    key={sTab.key}
                    style={[styles.plannerSubTabItem, isSubActive && styles.plannerSubTabItemActive]}
                    onPress={() => setLogisticsTab(sTab.key as any)}
                  >
                    <Text style={[styles.plannerSubTabLabel, { color: isSubActive ? C.blueGlow : C.textSec }]}>
                      {sTab.label}
                    </Text>
                    {isSubActive && <View style={styles.plannerSubTabIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3A: Day Schedule */}
            {logisticsTab === 'itinerary' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Day-Wise schedule details</Text>
                {itinerary.map((day) => (
                  <View key={day.day} style={styles.dayCard}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayNumber}>Day {day.day}</Text>
                      <Text style={styles.dayTitleText}>{day.title}</Text>
                    </View>
                    <Text style={styles.dayActivitiesText}>{day.plan}</Text>
                  </View>
                ))}

                <View style={styles.addDayBox}>
                  <Text style={styles.addDayBoxTitle}>Add Schedule Day</Text>
                  <Text style={styles.formInputLabel}>Day Heading</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Check-in & Free time blocks"
                    placeholderTextColor={C.textMuted}
                    value={newDayTitle}
                    onChangeText={setNewDayTitle}
                  />

                  <Text style={styles.formInputLabel}>Plan & Activities</Text>
                  <TextInput
                    style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                    placeholder="Detailed activities, hotel shifts, meal spots..."
                    placeholderTextColor={C.textMuted}
                    multiline
                    value={newDayDesc}
                    onChangeText={setNewDayDesc}
                  />

                  <TouchableOpacity
                    style={styles.addDayBtn}
                    onPress={handleAddItineraryDay}
                  >
                    <Plus size={14} color={C.white} />
                    <Text style={styles.addDayBtnText}>Insert Itinerary Day</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 3B: Transport Manager */}
            {logisticsTab === 'transport' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Vehicle & Driver Assignment</Text>
                <View style={styles.driverInfoCard}>
                  <View style={styles.driverInfoRow}>
                    <Car size={18} color={C.blueGlow} />
                    <Text style={styles.driverTitleText}>Transit Coach Allocations</Text>
                  </View>
                  <View style={styles.driverMetaBox}>
                    <Text style={styles.driverMetaLabel}>Bus / Vehicle Type:</Text>
                    <Text style={styles.driverMetaValue}>{driverInfo.bus}</Text>
                  </View>
                  <View style={styles.driverMetaBox}>
                    <Text style={styles.driverMetaLabel}>Driver Name:</Text>
                    <Text style={styles.driverMetaValue}>{driverInfo.name}</Text>
                  </View>
                  <View style={styles.driverMetaBox}>
                    <Text style={styles.driverMetaLabel}>Driver Phone Contact:</Text>
                    <Text style={styles.driverMetaValue}>{driverInfo.phone}</Text>
                  </View>
                  <View style={styles.driverMetaBox}>
                    <Text style={styles.driverMetaLabel}>Target Transit Route:</Text>
                    <Text style={styles.driverMetaValue}>{driverInfo.route}</Text>
                  </View>
                </View>

                {/* Seat Allocations list */}
                <Text style={styles.subTitle}>Seat Allocation Matrix</Text>
                {members.map((m) => (
                  <View key={m.id} style={styles.allocationRowItem}>
                    <Text style={styles.allocNameText}>{m.name}</Text>
                    <TouchableOpacity
                      style={styles.allocButton}
                      onPress={() => handleAllocateSeat(m.id, m.seatAllocated)}
                    >
                      <Text style={styles.allocButtonText}>{m.seatAllocated}</Text>
                      <ExternalLink size={10} color={C.blueGlow} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* 3C: Room Assignments */}
            {logisticsTab === 'hotel' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Hotel Room Allocation Matrix</Text>
                <Text style={styles.descSec}>Assign hotel rooms to participants and track check-in status</Text>

                {members.map((m) => (
                  <View key={m.id} style={styles.allocationRowItem}>
                    <Text style={styles.allocNameText}>{m.name}</Text>
                    <TouchableOpacity
                      style={styles.allocButton}
                      onPress={() => handleAllocateRoom(m.id, m.roomAllocated)}
                    >
                      <Text style={styles.allocButtonText}>{m.roomAllocated}</Text>
                      <ExternalLink size={10} color={C.blueGlow} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* 3D: Meal Management */}
            {logisticsTab === 'meals' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Dietary Preferences & Meals Chart</Text>
                <Text style={styles.descSec}>Summary of group food rules for restaurant reservations</Text>

                <View style={styles.mealSummaryCard}>
                  <View style={styles.mealRatioRow}>
                    <Text style={styles.mealLabelText}>VEGETARIAN (VEG):</Text>
                    <Text style={styles.mealValueText}>{members.filter((m) => m.diet === 'VEG').length} Orders</Text>
                  </View>
                  <View style={styles.mealRatioRow}>
                    <Text style={styles.mealLabelText}>VEGAN DIET:</Text>
                    <Text style={styles.mealValueText}>{members.filter((m) => m.diet === 'VEGAN').length} Orders</Text>
                  </View>
                  <View style={styles.mealRatioRow}>
                    <Text style={styles.mealLabelText}>NON-VEGETARIAN:</Text>
                    <Text style={styles.mealValueText}>{members.filter((m) => m.diet === 'NON-VEG').length} Orders</Text>
                  </View>
                </View>

                {/* Dietary preference list */}
                <Text style={styles.subTitle}>Diet Preference Log</Text>
                {members.map((m) => (
                  <View key={m.id} style={styles.dietListRow}>
                    <Text style={styles.dietMemName}>{m.name}</Text>
                    <View style={styles.dietBadge}>
                      <Text style={styles.dietBadgeText}>{m.diet}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================
            TAB 4: PAYMENTS & DOCUMENTS
            ======================================================== */}
        {activeTab === 'payments' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>Deposit & Billing Tracker</Text>
              <Text style={styles.descSec}>Track outstanding balances, confirm receipts, and generate invoices</Text>
            </View>

            {payments.map((p) => (
              <View key={p.id} style={styles.paymentCardItem}>
                <View style={styles.paymentHeaderRow}>
                  <Text style={styles.paymentMemName}>{p.name}</Text>
                  <View style={[styles.payStatusBadge, { backgroundColor: p.status === 'FULLY_PAID' ? C.greenGlow : p.status === 'PAID' ? C.blueGlow : C.rose }]}>
                    <Text style={styles.payStatusBadgeText}>{p.status}</Text>
                  </View>
                </View>
                <View style={styles.paymentBreakdownRow}>
                  <View>
                    <Text style={styles.paymentMetaLabel}>Paid Deposit:</Text>
                    <Text style={styles.paymentMetaVal}>â‚¹{p.deposit.toLocaleString('en-IN')}</Text>
                  </View>
                  <View>
                    <Text style={styles.paymentMetaLabel}>Outstanding Balance:</Text>
                    <Text style={[styles.paymentMetaVal, p.balance > 0 && { color: C.rose }]}>â‚¹{p.balance.toLocaleString('en-IN')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.invoiceBtn}
                    onPress={() => handleGenerateInvoice(p.name, p.balance)}
                  >
                    <Text style={styles.invoiceBtnText}>Invoice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Documents Safe Section */}
            <Text style={styles.subTitle}>Group Permit & Document safe</Text>
            <Text style={styles.descSec}>Verify IDs, permits, travel insurance, and waivers before border checks</Text>

            {documents.map((doc) => (
              <View key={doc.id} style={styles.docRowItem}>
                <View style={styles.docIconWrap}>
                  <FileText size={16} color={C.white} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.docTypeTitle}>{doc.type}</Text>
                  <Text style={styles.docFileNameText} numberOfLines={1}>{doc.fileName}</Text>
                </View>
                <View style={[styles.docStatusBadge, { backgroundColor: doc.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                  <Text style={[styles.docStatusText, { color: doc.status === 'APPROVED' ? C.greenGlow : C.amberGlow }]}>
                    {doc.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ========================================================
            TAB 5: COMM & JOIN MODERATION
            ======================================================== */}
        {activeTab === 'chat' && (
          <View>
            {/* Chat Moderation Panel */}
            <View style={styles.chatGroupModeratorHeader}>
              <View>
                <Text style={styles.subTitle}>Group Chat Moderation</Text>
                <Text style={styles.descSec}>Only approved travelers can join your official chat group link</Text>
              </View>
              <TouchableOpacity
                style={styles.editGroupNameBtn}
                onPress={handleEditGroupName}
              >
                <Text style={styles.editGroupNameBtnText}>Edit Group Name</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chatModeratorLinkBox}>
              <View style={styles.chatLinkHeader}>
                <Text style={styles.chatLinkLabel}>OFFICIAL CHAT JOIN LINK (ADMIN):</Text>
                <Text style={styles.chatLinkAdminTag}>YOU ARE CHAT OWNER</Text>
              </View>
              <Text style={styles.chatLinkValueText}>{currentTour.chatLink}</Text>
            </View>

            {/* Moderation List of Requests */}
            <Text style={styles.sectionLabelInline}>Pending Chat Join Requests</Text>
            {joinRequests.filter((r) => r.tourId === currentTour.id).length === 0 ? (
              <View style={styles.emptyRequestsCard}>
                <CheckCircle size={18} color={C.green} />
                <Text style={styles.emptyRequestsText}>All chat join requests have been processed successfully!</Text>
              </View>
            ) : (
              joinRequests
                .filter((r) => r.tourId === currentTour.id)
                .map((req) => (
                  <View key={req.id} style={styles.requestItemCard}>
                    <View style={styles.requestHeaderRow}>
                      <Image source={{ uri: req.userAvatar }} style={styles.reqAvatar} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.reqName}>{req.userName}</Text>
                        <Text style={styles.reqMsg}>"{req.requestMessage}"</Text>
                      </View>
                    </View>

                    <View style={styles.reqActionButtonsRow}>
                      <TouchableOpacity
                        style={[styles.reqBtn, styles.reqBtnReject]}
                        onPress={() => handleRejectRequest(req.id, req.userName)}
                      >
                        <X size={12} color={C.rose} />
                        <Text style={styles.reqBtnRejectText}>Reject</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.reqBtn, styles.reqBtnApprove]}
                        onPress={() => handleApproveRequest(req.id, req.userName, req.userAvatar)}
                      >
                        <Check size={12} color={C.white} />
                        <Text style={styles.reqBtnApproveText}>Approve Join</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}

            {/* Announcements Panel */}
            <Text style={styles.subTitle}>Group Announcements</Text>
            <Text style={styles.descSec}>Broadcast important warnings & notices to all participants</Text>

            {announcements.map((ann) => (
              <View key={ann.id} style={styles.announceCard}>
                <View style={styles.announceCardHeader}>
                  <Text style={styles.announceCardTitle}>{ann.title}</Text>
                  <Text style={styles.announceCardDate}>{ann.date}</Text>
                </View>
                <Text style={styles.announceCardContent}>{ann.content}</Text>
              </View>
            ))}

            <View style={styles.addAnnounceBox}>
              <Text style={styles.formInputLabel}>Notice Title</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Schedule delay warning"
                placeholderTextColor={C.textMuted}
                value={newAnnounceTitle}
                onChangeText={setNewAnnounceTitle}
              />
              <Text style={styles.formInputLabel}>Notice Description</Text>
              <TextInput
                style={[styles.formInput, { height: 50 }]}
                placeholder="Enter details..."
                placeholderTextColor={C.textMuted}
                value={newAnnounceDesc}
                onChangeText={setNewAnnounceDesc}
              />
              <TouchableOpacity
                style={styles.announceBtn}
                onPress={handlePublishAnnouncement}
              >
                <Send size={12} color={C.white} />
                <Text style={styles.announceBtnText}>Broadcast Notice</Text>
              </TouchableOpacity>
            </View>

            {/* Decision Consensus Polls */}
            <Text style={styles.subTitle}>Group Consensus Polls</Text>
            <View style={styles.pollCard}>
              <Text style={styles.pollQuestion}>{poll.question}</Text>
              {poll.options.map((opt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.pollOptionBtn}
                  onPress={() => handlePollVote(idx)}
                >
                  <View style={styles.pollOptionInfo}>
                    <Text style={styles.pollOptionText}>{opt.text}</Text>
                    <Text style={styles.pollOptionVotes}>{opt.votes} Votes</Text>
                  </View>
                  <View style={styles.pollOptionProgressTrack}>
                    <View style={[styles.pollOptionProgressFill, { width: `${(opt.votes / 9) * 100}%` }]} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 6: LIVE GPS & AI DESK
            ======================================================== */}
        {activeTab === 'live' && (
          <View>
            {/* Live GPS Subtabs */}
            <View style={styles.plannerSubTabs}>
              <TouchableOpacity style={[styles.plannerSubTabItem, liveTab === 'map' && styles.plannerSubTabItemActive]} onPress={() => setLiveTab('map')}>
                <Text style={[styles.plannerSubTabLabel, { color: liveTab === 'map' ? C.blueGlow : C.textSec }]}>GPS Tracking</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.plannerSubTabItem, liveTab === 'ai' && styles.plannerSubTabItemActive]} onPress={() => setLiveTab('ai')}>
                <Text style={[styles.plannerSubTabLabel, { color: liveTab === 'ai' ? C.blueGlow : C.textSec }]}>AI Generator</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.plannerSubTabItem, liveTab === 'qr' && styles.plannerSubTabItemActive]} onPress={() => setLiveTab('qr')}>
                <Text style={[styles.plannerSubTabLabel, { color: liveTab === 'qr' ? C.blueGlow : C.textSec }]}>QR Scanner</Text>
              </TouchableOpacity>
            </View>

            {/* 6A: GPS TRACKING */}
            {liveTab === 'map' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Live Location Sharing Roster</Text>
                <Text style={styles.descSec}>Real-time GPS coordinate mapping of members on active trails</Text>

                {/* Mock GPS Map Drawing */}
                <View style={styles.mockMapBox}>
                  <View style={styles.mapGridMockPattern} />
                  {/* Meeting point icon */}
                  <View style={[styles.mapMarkerDot, { top: 60, left: 140, backgroundColor: C.rose }]}>
                    <View style={styles.mapMarkerPulse} />
                    <Text style={styles.mapMarkerLabel}>Meeting Point</Text>
                  </View>
                  {/* Members dots */}
                  <View style={[styles.mapMarkerDot, { top: 40, left: 80, backgroundColor: C.blue }]}>
                    <Text style={styles.mapMarkerLabel}>Aarav</Text>
                  </View>
                  <View style={[styles.mapMarkerDot, { top: 90, left: 220, backgroundColor: C.purple }]}>
                    <Text style={styles.mapMarkerLabel}>Rajesh</Text>
                  </View>
                  <View style={[styles.mapMarkerDot, { top: 120, left: 100, backgroundColor: C.cyan }]}>
                    <Text style={styles.mapMarkerLabel}>Rohan</Text>
                  </View>
                </View>

                {/* SOS Safety alerts box */}
                <View style={styles.sosAlertPanelBox}>
                  <View style={styles.sosPanelHeader}>
                    <ShieldAlert size={16} color={C.rose} />
                    <Text style={styles.sosPanelTitle}>Emergency Safety Center (SOS)</Text>
                  </View>
                  <Text style={styles.sosPanelDesc}>Broadcasting active weather warnings, road alerts, and SOS helplines to all devices</Text>
                  <TouchableOpacity
                    style={styles.sosActionBtn}
                    onPress={() => Alert.alert('SOS BroadcastED', 'Warning: High altitude oxygen drops advisory successfully pushed to all participants.')}
                  >
                    <Text style={styles.sosActionBtnText}>Trigger Emergency Alarm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 6B: AI GENERATOR */}
            {liveTab === 'ai' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>AI Travel Itinerary Generator</Text>
                <Text style={styles.descSec}>Use AI to automatically draft custom itineraries & estimate costs</Text>

                <View style={styles.aiFormBox}>
                  <Text style={styles.formInputLabel}>Destination & Vibe Target</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Sikkim 3-Days Trek with camping focus"
                    placeholderTextColor={C.textMuted}
                    value={aiPrompt}
                    onChangeText={setAiPrompt}
                  />

                  <TouchableOpacity
                    style={styles.aiSubmitBtn}
                    onPress={triggerAIGenerator}
                    disabled={aiGenerating}
                  >
                    {aiGenerating ? (
                      <Text style={styles.aiSubmitBtnText}>Running Model...</Text>
                    ) : (
                      <>
                        <Cpu size={15} color={C.white} />
                        <Text style={styles.aiSubmitBtnText}>Generate Custom Schedule</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {aiOutput && (
                    <View style={styles.aiResultCard}>
                      <Text style={styles.aiResultText}>{aiOutput}</Text>
                    </View>
                  )}
                </View>

                {/* Suggested Attractions */}
                <Text style={styles.sectionLabelInline}>Suggested Attractions (Region Selected)</Text>
                <View style={styles.suggestedAttractionsRow}>
                  <View style={styles.attractionItem}>
                    <Text style={styles.attractionName}>Gurudongmar Lake</Text>
                    <Text style={styles.attractionRating}>4.9 â˜… â€¢ High Altitude</Text>
                  </View>
                  <View style={styles.attractionItem}>
                    <Text style={styles.attractionName}>Yumthang Valley</Text>
                    <Text style={styles.attractionRating}>4.8 â˜… â€¢ Hot Springs</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 6C: QR CHECKIN SCANNER SIMULATION */}
            {liveTab === 'qr' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>QR Check-In Scanner</Text>
                <Text style={styles.descSec}>Validate tourist digital boarding passes and update check-in logs</Text>

                {showQRScanner ? (
                  <View style={styles.mockScannerContainer}>
                    <View style={styles.scannerTargetBox}>
                      <View style={styles.scannerCornerTL} />
                      <View style={styles.scannerCornerTR} />
                      <View style={styles.scannerCornerBL} />
                      <View style={styles.scannerCornerBR} />
                      <Text style={styles.scannerScanText}>Scanning Ticket QR Code...</Text>
                    </View>
                    <Text style={styles.selectScannedMockLabel}>Simulate Scanned Participant:</Text>
                    {members.filter((m) => !m.checkedIn).length === 0 ? (
                      <Text style={styles.allCheckedInText}>All roster members are checked in!</Text>
                    ) : (
                      members
                        .filter((m) => !m.checkedIn)
                        .map((m) => (
                          <TouchableOpacity
                            key={m.id}
                            style={styles.mockScanOptionBtn}
                            onPress={() => handleMockQRCheckin(m.name)}
                          >
                            <Text style={styles.mockScanOptionText}>Simulate scanning: {m.name}</Text>
                          </TouchableOpacity>
                        ))
                    )}
                    <TouchableOpacity
                      style={styles.cancelScannerBtn}
                      onPress={() => setShowQRScanner(false)}
                    >
                      <Text style={styles.cancelScannerBtnText}>Close Camera View</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.openScannerBox}>
                    <Text style={styles.openScannerDesc}>Check-in attendees instantly using their mobile QR codes.</Text>
                    <TouchableOpacity
                      style={styles.openScannerBtn}
                      onPress={() => setShowQRScanner(true)}
                    >
                      <Text style={styles.openScannerBtnText}>Open QR Scanner Camera</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Bottom Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CREATE NEW TOUR MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCreateModal}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Launch New Tour Group</Text>
            <Text style={styles.modalDesc}>Set up routing destinations, maximum capacities, pricing tiers, and generate group chats.</Text>

            <Text style={styles.modalInputLabel}>Tour Group Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Sikkim Rangers"
              placeholderTextColor={C.textMuted}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <Text style={styles.modalInputLabel}>Destination Target</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Gangtok & Lachen"
              placeholderTextColor={C.textMuted}
              value={newDest}
              onChangeText={setNewDest}
            />

            <View style={styles.modalInputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalInputLabel}>Duration (Days)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 5"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={newDuration}
                  onChangeText={setNewDuration}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Max Capacity</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 12"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={newMaxSize}
                  onChangeText={setNewMaxSize}
                />
              </View>
            </View>

            <Text style={styles.modalInputLabel}>Price Package Per Head (â‚¹)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 15000"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              value={newPrice}
              onChangeText={setNewPrice}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={handleCreateTour}
              >
                <Text style={styles.modalBtnConfirmText}>Create Tour Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD MEMBER MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showMemberModal}
        onRequestClose={() => setShowMemberModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Member to Roster</Text>
            <Text style={styles.modalDesc}>Manually insert verified participants or certified local guides into the roster.</Text>

            <Text style={styles.modalInputLabel}>Participant Full Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Suman Gupta"
              placeholderTextColor={C.textMuted}
              value={newMemName}
              onChangeText={setNewMemName}
            />

            <Text style={styles.modalInputLabel}>Roster Role Assignment</Text>
            <View style={styles.selectorRow}>
              <TouchableOpacity
                style={[styles.selectorBtn, newMemRole === 'MEMBER' && styles.selectorBtnActive]}
                onPress={() => setNewMemRole('MEMBER')}
              >
                <Text style={[styles.selectorLabelText, { color: newMemRole === 'MEMBER' ? C.white : C.textSec }]}>Tourist Member</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.selectorBtn, newMemRole === 'GUIDE' && styles.selectorBtnActive]}
                onPress={() => setNewMemRole('GUIDE')}
              >
                <Text style={[styles.selectorLabelText, { color: newMemRole === 'GUIDE' ? C.white : C.textSec }]}>Local Tour Guide</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInputLabel}>Emergency Contact Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Mother: 9944001122"
              placeholderTextColor={C.textMuted}
              value={newMemContact}
              onChangeText={setNewMemContact}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowMemberModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={handleAddMember}
              >
                <Text style={styles.modalBtnConfirmText}>Add Member</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STYLESheet
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: '#0c0f1d',
    borderColor: '#22294c',
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 180,
  },
  tripImageContainer: {
    width: 110,
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: '#000',
  },
  tripImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tripBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#FFF',
  },
  tripContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  tripName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 18,
  },
  tripDetailsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2,
  },
  verifiedText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#0066FF',
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0066FF',
  },
  routeArrow: {
    fontSize: 9,
    color: '#a2a9c3',
    marginHorizontal: 2,
  },
  capsulesRow: {
    flexDirection: 'row',
    gap: 4,
    marginVertical: 2,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14182f',
    paddingHorizontal: 5,
    paddingVertical: 3.5,
    borderRadius: 5,
    gap: 2,
  },
  capsuleText: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#a2a9c3',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#22294c',
    paddingTop: 6,
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: '#677196',
  },
  priceAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0066FF',
    marginTop: -2,
  },
  joinBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Header Visuals
  headerGradient: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: C.white,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: C.textSec,
  },
  badgeOfficialGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  badgeOfficialText: {
    fontSize: 9,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },

  // Scrollable Horizontal Tab Selector
  tabBarContainer: {
    paddingHorizontal: 10,
    marginTop: 6,
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 5,
  },
  tabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  // Dropdown selectors
  dropdownTripBar: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  dropdownLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dropdownTripScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  dropdownTripBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
    marginRight: 6,
  },
  dropdownTripBtnActive: {
    borderColor: C.purpleGlow,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  dropdownTripText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Section titles
  subTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
    marginTop: 20,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  descSec: {
    fontSize: 11.5,
    color: C.textSec,
    marginBottom: 14,
  },
  sectionLabelInline: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.white,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  // Dashboard Tab Styles
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: C.border,
    justifyContent: 'space-between',
    height: 90,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 9.5,
    color: C.textSec,
    fontWeight: '700',
  },

  // Reports & Analytics
  analyticsBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  subStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  subStatDivider: {
    width: 1.2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  subStatLabel: {
    fontSize: 9.5,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 4,
  },
  subStatValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  chartTitleInline: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  chartCol: {
    alignItems: 'center',
    width: 44,
  },
  chartBarValue: {
    fontSize: 8,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartBar: {
    width: 10,
    borderRadius: 5,
  },
  chartDayText: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 6,
    fontWeight: '700',
  },
  recentActivityBox: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 8,
    marginBottom: 20,
  },
  activityLogText: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },

  // TAB 2: TRIP & MEMBER MANAGER
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  addNewBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.blueGlow,
  },
  checkInProgressCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
  },
  checkInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkInProgressText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.white,
  },
  checkInProgressValue: {
    fontSize: 11.5,
    fontWeight: '900',
    color: C.greenGlow,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  memberListItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 12,
  },
  memberItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  memberTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.white,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: C.white,
  },
  memberContactText: {
    fontSize: 11,
    color: C.textSec,
    marginTop: 4,
    fontWeight: '600',
  },
  memberActionsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 12,
  },
  memberListItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberActionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberActionToggleBtnActive: {
    backgroundColor: C.green,
    borderColor: C.greenGlow,
  },
  memberActionToggleBtnLabel: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  memberDeleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  memberDeleteBtnLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.roseGlow,
  },
  tripManagerConfigBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
    gap: 12,
  },
  tripDetailField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    paddingBottom: 8,
  },
  tripFieldLabel: {
    fontSize: 11.5,
    color: C.textSec,
    fontWeight: '700',
  },
  tripFieldValue: {
    fontSize: 12.5,
    color: C.white,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: C.white,
  },
  createTripBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  createTripBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },

  // TAB 3: ITINERARY PLANNER & LOGISTICS
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  plannerSubTabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  plannerSubTabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  plannerSubTabLabel: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  plannerSubTabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 14,
    height: 2,
    backgroundColor: C.blueGlow,
    borderRadius: 1,
  },
  innerPlannerSection: {
    marginTop: 8,
  },
  dayCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: '900',
    color: C.blueGlow,
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
    flex: 1,
  },
  dayActivitiesText: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 17,
    fontWeight: '500',
  },
  addDayBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginTop: 14,
    marginBottom: 24,
  },
  addDayBoxTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: C.white,
    marginBottom: 4,
  },
  addDayBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  addDayBtnText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
  },

  // Transport details style
  driverInfoCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 16,
    gap: 8,
  },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  driverTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  driverMetaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  driverMetaLabel: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  driverMetaValue: {
    fontSize: 11,
    color: C.white,
    fontWeight: '700',
  },
  allocationRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 8,
  },
  allocNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
  },
  allocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,102,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  allocButtonText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.blueGlow,
  },

  // Stays lodging card
  stayCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 10,
    marginBottom: 10,
  },
  stayImage: {
    width: 66,
    height: 66,
    borderRadius: 12,
    marginRight: 12,
  },
  stayInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  stayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stayName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  stayRating: {
    fontSize: 10.5,
    color: C.amberGlow,
    fontWeight: '800',
  },
  stayLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  stayLocText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '500',
  },
  stayPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  stayPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: C.greenGlow,
  },
  bookingLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,102,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  bookingLinkText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.blueGlow,
  },
  accomSelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  accomSelectBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  accomSelectBtnActive: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderColor: C.blue,
  },
  accomSelectLabel: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Meal management
  mealSummaryCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 16,
    gap: 6,
  },
  mealRatioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mealLabelText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '700',
  },
  mealValueText: {
    fontSize: 11,
    color: C.white,
    fontWeight: '800',
  },
  dietListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  dietMemName: {
    fontSize: 12,
    color: C.white,
    fontWeight: '600',
  },
  dietBadge: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dietBadgeText: {
    fontSize: 8.5,
    color: C.textSec,
    fontWeight: '800',
  },

  // TAB 4: PAYMENTS & DOCUMENTS
  paymentCardItem: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 12,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  paymentMemName: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  payStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  payStatusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: C.white,
  },
  paymentBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  paymentMetaLabel: {
    fontSize: 9.5,
    color: C.textMuted,
    fontWeight: '700',
  },
  paymentMetaVal: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    marginTop: 2,
  },
  invoiceBtn: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  invoiceBtnText: {
    fontSize: 10.5,
    color: C.blueGlow,
    fontWeight: '900',
  },

  // Doc lists
  docRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  docIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTypeTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  docFileNameText: {
    fontSize: 10.5,
    color: C.textSec,
    marginTop: 1,
  },
  docStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  docStatusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  // TAB 5: CHAT & MODERATION
  chatGroupModeratorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  editGroupNameBtn: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: C.purple,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editGroupNameBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.purpleGlow,
  },
  chatModeratorLinkBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
  },
  chatLinkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chatLinkLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.5,
  },
  chatLinkAdminTag: {
    fontSize: 7.5,
    fontWeight: '900',
    color: C.greenGlow,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  chatLinkValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blueGlow,
  },
  emptyRequestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.06)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
    marginBottom: 16,
  },
  emptyRequestsText: {
    flex: 1,
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  requestItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  requestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reqAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reqName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  reqMsg: {
    fontSize: 10.5,
    color: C.textSec,
    marginTop: 2,
    fontStyle: 'italic',
  },
  reqActionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  reqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  reqBtnReject: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  reqBtnRejectText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.roseGlow,
  },
  reqBtnApprove: {
    backgroundColor: C.green,
  },
  reqBtnApproveText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.white,
  },

  // Announcements
  announceCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 10,
  },
  announceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  announceCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  announceCardDate: {
    fontSize: 9.5,
    color: C.textMuted,
    fontWeight: '700',
  },
  announceCardContent: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  addAnnounceBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
  },
  announceBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  announceBtnText: {
    color: C.white,
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Decision polls
  pollCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 24,
  },
  pollQuestion: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
    marginBottom: 12,
  },
  pollOptionBtn: {
    marginBottom: 12,
  },
  pollOptionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pollOptionText: {
    fontSize: 11.5,
    color: C.textSec,
    fontWeight: '600',
  },
  pollOptionVotes: {
    fontSize: 11.5,
    color: C.white,
    fontWeight: '700',
  },
  pollOptionProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  pollOptionProgressFill: {
    height: '100%',
    backgroundColor: C.purpleGlow,
    borderRadius: 2,
  },

  // TAB 6: GPS & AI
  mockMapBox: {
    height: 180,
    backgroundColor: '#0a0d1b',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.border,
    position: 'relative',
    overflow: 'hidden',
  },
  mapGridMockPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.05,
    borderWidth: 1,
    borderColor: C.white,
  },
  mapMarkerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  mapMarkerPulse: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.rose,
    opacity: 0.35,
    top: -5,
    left: -5,
  },
  mapMarkerLabel: {
    position: 'absolute',
    top: 12,
    fontSize: 9,
    fontWeight: '900',
    color: C.white,
    backgroundColor: 'rgba(4,6,15,0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
    textAlign: 'center',
    width: 80,
    left: -35,
  },
  sosAlertPanelBox: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.22)',
    borderRadius: 20,
    padding: 14,
    marginTop: 14,
  },
  sosPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sosPanelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: C.roseGlow,
  },
  sosPanelDesc: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  sosActionBtn: {
    backgroundColor: C.rose,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  sosActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // AI Planner
  aiFormBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  aiSubmitBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  aiSubmitBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  aiResultCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginTop: 14,
  },
  aiResultText: {
    fontSize: 11.5,
    color: C.white,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  attractionItem: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 8,
  },
  attractionName: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  attractionRating: {
    fontSize: 10,
    color: C.amberGlow,
    marginTop: 2,
    fontWeight: '700',
  },

  // QR checkins scanner
  mockScannerContainer: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  scannerTargetBox: {
    width: 140,
    height: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
    marginBottom: 16,
  },
  scannerCornerTL: { position: 'absolute', top: 0, left: 0, width: 14, height: 14, borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.blueGlow },
  scannerCornerTR: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderTopWidth: 3, borderRightWidth: 3, borderColor: C.blueGlow },
  scannerCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 14, height: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.blueGlow },
  scannerCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.blueGlow },
  scannerScanText: { fontSize: 8.5, fontWeight: '800', color: C.textMuted },
  selectScannedMockLabel: { fontSize: 11, fontWeight: '800', color: C.white, marginBottom: 8, alignSelf: 'flex-start' },
  allCheckedInText: { fontSize: 11, color: C.greenGlow, fontWeight: '700', marginVertical: 8 },
  mockScanOptionBtn: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    width: '100%',
    marginBottom: 6,
  },
  mockScanOptionText: { fontSize: 11.5, color: C.white, fontWeight: '600' },
  cancelScannerBtn: { marginTop: 12, paddingVertical: 6 },
  cancelScannerBtnText: { fontSize: 11.5, color: C.textSec, fontWeight: '700' },
  openScannerBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
  },
  openScannerDesc: {
    fontSize: 11.5,
    color: C.textSec,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 17,
  },
  openScannerBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  openScannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // Modal styling details
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: C.cardAlt,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
  },
  modalDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalInputLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.white,
    marginTop: 14,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
  },
  modalInputRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.2,
    borderColor: C.border,
  },
  modalBtnCancelText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '800',
  },
  modalBtnConfirm: {
    backgroundColor: C.blue,
  },
  modalBtnConfirmText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  selectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  selectorBtnActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
  },
  selectorLabelText: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Missing Style Definitions
  leadsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 2,
  },
  cardHeader: {
    marginTop: 4,
  },
  formInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textSec,
    marginTop: 14,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 12.5,
    fontWeight: '600',
  },
  suggestedAttractionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
});