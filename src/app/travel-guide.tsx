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
  UploadCloud,
  Image as ImageIcon,
  Video,
  Plus,
  FileText,
  Camera,
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
  CloudRain,
  Wind,
  Sunrise,
  Sunset,
  Activity,
  ShieldAlert,
  PhoneCall,
  HeartPulse,
  Shield,
  AlertTriangle,
  CheckCircle,
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

// ─── Interfaces ───
interface CustomerLead {
  id: string;
  name: string;
  avatar: string;
  destination: string;
  groupSize: number;
  durationDays: number;
  budget: number;
  startDate: string;
  description: string;
  status: 'PENDING' | 'QUOTE_SENT';
}

interface UploadedMedia {
  id: string;
  type: 'STORY' | 'REEL';
  title: string;
  category: 'LOCATION' | 'PRICING';
  image: string;
  location: string;
  price?: string;
  likes: number;
  date: string;
}

interface WeatherData {
  city: string;
  temp: string;
  condition: string;
  wind: string;
  sunrise: string;
  sunset: string;
  aqi: number;
  aqiStatus: 'EXCELLENT' | 'GOOD' | 'POOR' | 'HAZARDOUS';
  aqiColor: string;
  crowdLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  crowdColor: string;
}

export default function TravelGuideScreen() {
  const router = useRouter();
  const { profile, withdrawWalletFunds } = useApp();

  const [activeTab, setActiveTab] = useState<'leads' | 'upload' | 'planning' | 'weather' | 'safety'>('leads');

  // ────────────────────────────────────────────────────────
  // TABS 1: LEADS & EARNINGS STATE
  // ────────────────────────────────────────────────────────
  const [cashoutModalVisible, setCashoutModalVisible] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [searchLeadQuery, setSearchLeadQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({});

  const [leads, setLeads] = useState<CustomerLead[]>([
    {
      id: 'l-1',
      name: 'Rohan Malhotra',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80',
      destination: 'Sikkim (Gangtok & Lachung)',
      groupSize: 4,
      durationDays: 5,
      budget: 18000,
      startDate: '2026-08-15',
      description: 'Looking for a certified guide with a SUV to cover Yumthang Valley and Gurudongmar Lake. Preference for multi-lingual guides.',
      status: 'PENDING',
    },
    {
      id: 'l-2',
      name: 'Neha & Kabir',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
      destination: 'Jaipur Historical Tour',
      groupSize: 2,
      durationDays: 2,
      budget: 6500,
      startDate: '2026-08-02',
      description: 'Interested in a heritage walking tour of Amer Fort, City Palace, and local bazaar shopping guide. Photogenic spots suggestions needed.',
      status: 'PENDING',
    },
    {
      id: 'l-3',
      name: 'The Sen Family',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&q=80',
      destination: 'Munnar Tea Plantations',
      groupSize: 6,
      durationDays: 4,
      budget: 14000,
      startDate: '2026-08-18',
      description: 'Family holiday trip. Need dynamic, slow-paced sightseeing, kid-friendly trekking assistance, and spice gardens walk guidance.',
      status: 'PENDING',
    },
    {
      id: 'l-4',
      name: 'Amit Negi',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&q=80',
      destination: 'Leh Ladakh Monasteries',
      groupSize: 3,
      durationDays: 6,
      budget: 25000,
      startDate: '2026-09-08',
      description: 'Adventure photography crew. We want custom route exploration including Hemis, Alchi, and Thiksey monasteries. Knowledge of high altitude safety required.',
      status: 'PENDING',
    },
  ]);

  const handleSendQuote = (leadId: string) => {
    const quoteVal = quoteInputs[leadId] || '';
    if (!quoteVal.trim() || isNaN(parseFloat(quoteVal))) {
      Alert.alert('Invalid Quote', 'Please enter a valid numeric quote amount in ₹.');
      return;
    }

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: 'QUOTE_SENT' } : l))
    );
    Alert.alert(
      'Quote Sent Successfully!',
      `Your bid of ₹${quoteVal} has been sent to the traveler. They will be notified immediately.`
    );
    setQuoteInputs((prev) => ({ ...prev, [leadId]: '' }));
    setSelectedLeadId(null);
  };

  const handleCashout = () => {
    const amt = parseFloat(cashoutAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Error', 'Please enter a valid positive number.');
      return;
    }
    if (amt > profile.walletBalance) {
      Alert.alert('Insufficient Balance', 'You do not have enough funds in your wallet to withdraw.');
      return;
    }
    withdrawWalletFunds(amt);
    setCashoutAmount('');
    setCashoutModalVisible(false);
    Alert.alert('Cashout Requested', `₹${amt} successfully queued for payout to your registered bank account.`);
  };

  // Filtered Leads
  const filteredLeads = leads.filter(
    (l) =>
      l.destination.toLowerCase().includes(searchLeadQuery.toLowerCase()) ||
      l.name.toLowerCase().includes(searchLeadQuery.toLowerCase())
  );

  // ────────────────────────────────────────────────────────
  // TABS 2: UPLOAD STORIES & REELS STATE
  // ────────────────────────────────────────────────────────
  const [uploadCategory, setUploadCategory] = useState<'STORY' | 'REEL'>('STORY');
  const [uploadTheme, setUploadTheme] = useState<'LOCATION' | 'PRICING'>('LOCATION');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaLocation, setMediaLocation] = useState('');
  const [mediaPrice, setMediaPrice] = useState('');
  const [selectedMockImage, setSelectedMockImage] = useState('https://images.unsplash.com/photo-1548013146-72479768bada?w=300&q=80');

  const [activeMedia, setActiveMedia] = useState<UploadedMedia[]>([
    {
      id: 'm-1',
      type: 'STORY',
      title: 'Sunrise at Hawa Mahal, Jaipur',
      category: 'LOCATION',
      image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=300&q=80',
      location: 'Jaipur, Rajasthan',
      likes: 124,
      date: 'Today, 08:30 AM',
    },
    {
      id: 'm-2',
      type: 'REEL',
      title: 'Standard Heritage Day Tour Package Price List',
      category: 'PRICING',
      image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=300&q=80',
      location: 'Agra, UP',
      price: '₹2,500/Day',
      likes: 85,
      date: 'Yesterday',
    },
    {
      id: 'm-3',
      type: 'STORY',
      title: 'Trekking path guide to Chembra Peak',
      category: 'LOCATION',
      image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=300&q=80',
      location: 'Wayanad, Kerala',
      likes: 210,
      date: '2 days ago',
    },
  ]);

  const mockGallery = [
    'https://images.unsplash.com/photo-1548013146-72479768bada?w=300&q=80', // Sikkim
    'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=300&q=80', // Ladakh
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&q=80', // Beach
    'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=300&q=80', // Snow Shimla
    'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=300&q=80', // Varanasi
  ];

  const handlePublishMedia = () => {
    if (!mediaTitle.trim() || !mediaLocation.trim()) {
      Alert.alert('Empty Fields', 'Please fill in the title and location tags.');
      return;
    }

    const newItem: UploadedMedia = {
      id: `m-${Date.now()}`,
      type: uploadCategory,
      title: mediaTitle.trim(),
      category: uploadTheme,
      image: selectedMockImage,
      location: mediaLocation.trim(),
      price: uploadTheme === 'PRICING' ? (mediaPrice.trim() ? `₹${mediaPrice.trim()}/Day` : undefined) : undefined,
      likes: 0,
      date: 'Just Now',
    };

    setActiveMedia([newItem, ...activeMedia]);
    setMediaTitle('');
    setMediaLocation('');
    setMediaPrice('');
    Alert.alert('Published!', `Your ${uploadCategory.toLowerCase()} has been uploaded successfully & broadcasts to all tourists search feeds.`);
  };

  // ────────────────────────────────────────────────────────
  // TABS 3: PLANNING, ESTIMATOR, BUDGET & LODGING STATE
  // ────────────────────────────────────────────────────────
  const [plannerTab, setPlannerTab] = useState<'itinerary' | 'estimator' | 'budget' | 'lodging'>('itinerary');

  // Itinerary
  const [itineraryDays, setItineraryDays] = useState([
    { id: 'd-1', day: '01', title: 'Arrival & Local Market Walk', activities: 'Pick up from hotel at 09:00 AM. Visit local handicraft shops, walk around City lake, and witness the evening light show.' },
    { id: 'd-2', day: '02', title: 'Fort exploration & Sunset Viewpoint', activities: 'Depart early (07:30 AM) to avoid crowd. Detailed guided exploration of main fortress complex. Sunset photography session at hill ledge.' },
  ]);
  const [newDayTitle, setNewDayTitle] = useState('');
  const [newDayDesc, setNewDayDesc] = useState('');

  const handleAddDay = () => {
    if (!newDayTitle.trim() || !newDayDesc.trim()) {
      Alert.alert('Empty Fields', 'Please add both a Day Title and Activities.');
      return;
    }
    const nextDayNum = itineraryDays.length + 1;
    const formattedDay = nextDayNum < 10 ? `0${nextDayNum}` : `${nextDayNum}`;
    const newDay = {
      id: `d-${Date.now()}`,
      day: formattedDay,
      title: newDayTitle.trim(),
      activities: newDayDesc.trim(),
    };
    setItineraryDays([...itineraryDays, newDay]);
    setNewDayTitle('');
    setNewDayDesc('');
    Alert.alert('Success', `Day ${nextDayNum} added to itinerary.`);
  };

  // Time Estimator
  const [estFrom, setEstFrom] = useState('');
  const [estTo, setEstTo] = useState('');
  const [estDist, setEstDist] = useState('');
  const [estMode, setEstMode] = useState<'BIKE' | 'CAR' | 'TRAIN' | 'PLANE'>('CAR');
  const [estimationResult, setEstimationResult] = useState<string | null>(null);

  const calculateEstimation = () => {
    const distanceVal = parseFloat(estDist);
    if (!estFrom.trim() || !estTo.trim() || isNaN(distanceVal) || distanceVal <= 0) {
      Alert.alert('Invalid Inputs', 'Please provide valid starting location, destination and distance.');
      return;
    }

    let avgSpeed = 45; // km/h
    let loadingBuffer = 0.5; // hrs
    if (estMode === 'BIKE') avgSpeed = 38;
    if (estMode === 'TRAIN') {
      avgSpeed = 65;
      loadingBuffer = 1.0;
    }
    if (estMode === 'PLANE') {
      avgSpeed = 600;
      loadingBuffer = 2.5; // check-in/airport buffer
    }

    const travelHrs = distanceVal / avgSpeed;
    const totalTime = travelHrs + loadingBuffer;
    const hours = Math.floor(totalTime);
    const minutes = Math.round((totalTime - hours) * 60);

    const timeString = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
    setEstimationResult(
      `Estimated transit duration from ${estFrom.trim()} to ${estTo.trim()} (${distanceVal} km) via ${estMode} is ${timeString} (includes standard buffer logs).`
    );
  };

  // Budget Calculator
  const [costTransport, setCostTransport] = useState('1500');
  const [costFood, setCostFood] = useState('800');
  const [costLodge, setCostLodge] = useState('2200');
  const [costGuide, setCostGuide] = useState('1500');
  const [costMisc, setCostMisc] = useState('500');
  const [budgetBreakdown, setBudgetBreakdown] = useState<{ total: number; percentages: Record<string, number> } | null>(null);

  const calculateBudgetBreakdown = () => {
    const tr = parseFloat(costTransport) || 0;
    const fd = parseFloat(costFood) || 0;
    const ld = parseFloat(costLodge) || 0;
    const gd = parseFloat(costGuide) || 0;
    const ms = parseFloat(costMisc) || 0;

    const total = tr + fd + ld + gd + ms;
    if (total === 0) {
      Alert.alert('Zero Cost', 'Please enter some amounts to calculate budget.');
      return;
    }

    setBudgetBreakdown({
      total,
      percentages: {
        Transport: (tr / total) * 100,
        Food: (fd / total) * 100,
        Lodging: (ld / total) * 100,
        'Guide Fee': (gd / total) * 100,
        Misc: (ms / total) * 100,
      },
    });
  };

  // Accommodations
  const [accomTab, setAccomTab] = useState<'HOTELS' | 'HOSTELS' | 'HOMESTAYS' | 'CAMPING'>('HOTELS');
  const accommodationsData = {
    HOTELS: [
      { name: 'Raddison Palace', location: 'Jaipur', rate: '₹4,500/night', rating: 4.8, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=80' },
      { name: 'Hotel Snow Retreat', location: 'Manali', rate: '₹3,200/night', rating: 4.5, image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=200&q=80' },
    ],
    HOSTELS: [
      { name: 'Zostel Heritage', location: 'Jaipur Outskirts', rate: '₹800/night', rating: 4.6, image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&q=80' },
      { name: 'The Backpackers Nest', location: 'Goa', rate: '₹650/night', rating: 4.3, image: 'https://images.unsplash.com/photo-1623625434462-e5e42318ae4f?w=200&q=80' },
    ],
    HOMESTAYS: [
      { name: 'Verdant Meadows Homestay', location: 'Munnar Hills', rate: '₹1,800/night', rating: 4.9, image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=200&q=80' },
      { name: 'Sikkimese Traditional Stay', location: 'Gangtok', rate: '₹2,000/night', rating: 4.7, image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=200&q=80' },
    ],
    CAMPING: [
      { name: 'Pangong Lake Echo Camps', location: 'Ladakh', rate: '₹3,500/night', rating: 4.8, image: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=200&q=80' },
      { name: 'Riverside Woods Camping', location: 'Rishikesh', rate: '₹1,500/night', rating: 4.4, image: 'https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=200&q=80' },
    ],
  };

  const handleBookingRedirect = (accomName: string) => {
    Alert.alert(
      'Partner Redirection',
      `Redirecting you to our external booking partner dashboard to confirm reservation for "${accomName}"...`
    );
  };

  // ────────────────────────────────────────────────────────
  // TABS 4: LIVE WEATHER, FORECAST, AQI & CROWD LEVEL
  // ────────────────────────────────────────────────────────
  const [selectedWeatherIdx, setSelectedWeatherIdx] = useState(0);

  const weatherLocations: WeatherData[] = [
    {
      city: 'Leh-Ladakh',
      temp: '14°C',
      condition: 'Chilly & Sunny',
      wind: '18 km/h NW',
      sunrise: '05:14 AM',
      sunset: '07:22 PM',
      aqi: 10,
      aqiStatus: 'EXCELLENT',
      aqiColor: C.green,
      crowdLevel: 'LOW',
      crowdColor: C.green,
    },
    {
      city: 'Jaipur (Amer)',
      temp: '35°C',
      condition: 'Warm & Sunny',
      wind: '8 km/h E',
      sunrise: '05:48 AM',
      sunset: '07:11 PM',
      aqi: 65,
      aqiStatus: 'GOOD',
      aqiColor: C.cyan,
      crowdLevel: 'HIGH',
      crowdColor: C.amber,
    },
    {
      city: 'Agra (Taj Mahal)',
      temp: '34°C',
      condition: 'Sunny & Clear',
      wind: '12 km/h W',
      sunrise: '05:39 AM',
      sunset: '07:05 PM',
      aqi: 125,
      aqiStatus: 'POOR',
      aqiColor: C.amber,
      crowdLevel: 'CRITICAL',
      crowdColor: C.rose,
    },
    {
      city: 'Munnar Hills',
      temp: '22°C',
      condition: 'Mist & Clouds',
      wind: '14 km/h S',
      sunrise: '06:05 AM',
      sunset: '06:44 PM',
      aqi: 12,
      aqiStatus: 'EXCELLENT',
      aqiColor: C.green,
      crowdLevel: 'MODERATE',
      crowdColor: C.cyan,
    },
  ];

  const currentW = weatherLocations[selectedWeatherIdx];

  // ────────────────────────────────────────────────────────
  // TABS 5: SAFETY HUB & EMERGENCY CONTACTS
  // ────────────────────────────────────────────────────────
  const handleEmergencyCall = (name: string, phone: string) => {
    Alert.alert('Emergency Speed Dial', `Initiating cellular call to ${name} (${phone})...`);
  };

  const emergencyContacts = [
    { title: 'National Tourist Helpline', phone: '1800-11-1363', description: 'Toll-free 24/7 assistance in 12 languages', color: C.blue, Icon: PhoneCall },
    { title: 'Police Emergency Response', phone: '112', description: 'Immediate assistance from local police', color: C.rose, Icon: Shield },
    { title: 'National Medical Helpline', phone: '102', description: 'Ambulance service and hospital updates', color: C.green, Icon: HeartPulse },
    { title: 'State Disaster Alert Desk', phone: '1070', description: 'Landslide, rainfall, and weather alerts', color: C.amber, Icon: AlertTriangle },
  ];

  const safetyAlerts = [
    { id: 'sa-1', type: 'DANGER', location: 'Ladakh Highway', message: 'Rohtang Pass closed temporarily due to fresh landslide. Avoid traveling after 6:00 PM.' },
    { id: 'sa-2', type: 'WARNING', location: 'Agra Fort Area', message: 'Heavy crowd surge today due to VIP visit. Parking queues estimated up to 1.5 hours.' },
    { id: 'sa-3', type: 'INFO', location: 'Jaipur Old City', message: 'Special cultural fair starting tonight. Traffic diversions in place around Badi Chaupar.' },
  ];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Modern Neon Header */}
      <LinearGradient
        colors={['rgba(20,24,47,0.8)', 'rgba(6,8,20,0.95)']}
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
            <Text style={styles.headerTitle}>Tourist Guide Portal</Text>
            <Text style={styles.headerSub}>Certified Local Expert Dashboard</Text>
          </View>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.badgeOfficialGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Shield size={11} color={C.white} strokeWidth={2.5} />
            <Text style={styles.badgeOfficialText}>VERIFIED</Text>
          </LinearGradient>
        </View>

        {/* Floating Capsule Navigation Bar */}
        <View style={styles.tabBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarScroll}
          >
            {[
              { key: 'leads', label: 'Hub & Earnings', Icon: TrendingUp },
              { key: 'upload', label: 'Upload Reels', Icon: UploadCloud },
              { key: 'planning', label: 'Guidance', Icon: Compass },
              { key: 'weather', label: 'Live Info', Icon: Sun },
              { key: 'safety', label: 'Safety Desk', Icon: ShieldAlert },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key as any)}
                  activeOpacity={0.85}
                >
                  <tab.Icon size={14} color={isActive ? C.white : C.textSec} strokeWidth={isActive ? 2.5 : 1.8} />
                  <Text style={[styles.tabLabel, { color: isActive ? C.white : C.textSec }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ========================================================
            TAB 1: LEADS & EARNINGS DASHBOARD
            ======================================================== */}
        {activeTab === 'leads' && (
          <View>
            {/* Premium Metallic Wallet Card */}
            <LinearGradient
              colors={['#181e3a', '#0b0d1b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.walletCard}
            >
              <View style={styles.walletCardAccent} />
              <View style={styles.walletHeader}>
                <View>
                  <Text style={styles.walletLabel}>TOTAL WALLET BALANCE</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.rupeeSign}>₹</Text>
                    <Text style={styles.walletBalance}>{profile.walletBalance.toLocaleString('en-IN')}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCashoutModalVisible(true)}
                  style={styles.cashoutBtn}
                >
                  <LinearGradient
                    colors={[C.blueGlow, C.blue]}
                    style={styles.cashoutBtnGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.cashoutBtnText}>Cashout</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <View style={styles.walletDivider} />

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Active Leads</Text>
                  <Text style={[styles.statValue, { color: C.cyan }]}>{leads.length}</Text>
                </View>
                <View style={styles.statBoxVerticalDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Rating</Text>
                  <Text style={[styles.statValue, { color: C.amberGlow }]}>4.9 ★</Text>
                </View>
                <View style={styles.statBoxVerticalDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Completed Trips</Text>
                  <Text style={[styles.statValue, { color: C.greenGlow }]}>28</Text>
                </View>
              </View>

              {/* Earnings Mini Chart Graphic */}
              <Text style={styles.sectionLabelInline}>Weekly Earnings Progress</Text>
              <View style={styles.chartContainer}>
                {[
                  { day: 'Mon', amt: '₹1.5k', height: 40 },
                  { day: 'Tue', amt: '₹2.2k', height: 65 },
                  { day: 'Wed', amt: '₹0', height: 5 },
                  { day: 'Thu', amt: '₹3.5k', height: 95 },
                  { day: 'Fri', amt: '₹1.8k', height: 50 },
                  { day: 'Sat', amt: '₹4.2k', height: 110 },
                  { day: 'Sun', amt: '₹2.8k', height: 80 },
                ].map((item, idx) => {
                  const isWeekend = idx === 5 || idx === 6;
                  return (
                    <View key={idx} style={styles.chartCol}>
                      <Text style={styles.chartBarValue}>{item.amt}</Text>
                      <LinearGradient
                        colors={isWeekend ? [C.purpleGlow, C.purple] : [C.blueGlow, C.blue]}
                        style={[styles.chartBar, { height: item.height }]}
                      />
                      <Text style={[styles.chartDayText, isWeekend && { color: C.purpleGlow }]}>{item.day}</Text>
                    </View>
                  );
                })}
              </View>
            </LinearGradient>

            {/* Tourist Customers Lead Search */}
            <View style={styles.leadHeader}>
              <View>
                <Text style={styles.subTitle}>Tourist Lead Finder</Text>
                <Text style={styles.descSec}>Connect directly with travellers matching your expertise</Text>
              </View>
              <View style={styles.badgeLive}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>LIVE FEEDS</Text>
              </View>
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color={C.textSec} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by state, city, tourist name..."
                placeholderTextColor={C.textMuted}
                value={searchLeadQuery}
                onChangeText={setSearchLeadQuery}
              />
            </View>

            {filteredLeads.map((lead) => {
              const isSelected = selectedLeadId === lead.id;
              const hasQuote = lead.status === 'QUOTE_SENT';

              return (
                <View key={lead.id} style={[styles.leadCard, isSelected && styles.leadCardSelected]}>
                  {isSelected && <View style={styles.activeBorderGlow} />}
                  <View style={styles.leadHeaderRow}>
                    <View style={styles.avatarBorder}>
                      <Image source={{ uri: lead.avatar }} style={styles.leadAvatar} />
                    </View>
                    <View style={styles.leadInfo}>
                      <Text style={styles.leadName}>{lead.name}</Text>
                      <View style={styles.leadDestinationRow}>
                        <MapPin size={11} color={C.green} />
                        <Text style={styles.leadDestination} numberOfLines={1}>{lead.destination}</Text>
                      </View>
                    </View>
                    <View style={styles.leadRight}>
                      <Text style={styles.leadBudget}>₹{lead.budget.toLocaleString('en-IN')}</Text>
                      <Text style={styles.leadDays}>{lead.durationDays} Days • {lead.groupSize} Pax</Text>
                    </View>
                  </View>

                  <Text style={styles.leadDesc} numberOfLines={isSelected ? undefined : 2}>
                    {lead.description}
                  </Text>

                  {/* Toggle Detailed Lead quote input */}
                  {isSelected ? (
                    <View style={styles.quoteInputsBox}>
                      <View style={styles.quoteInputsHeader}>
                        <Text style={styles.quoteInputLabel}>Proposed Schedule</Text>
                        <Text style={styles.quoteDurationBadge}>{lead.durationDays} Days Tour</Text>
                      </View>
                      <Text style={styles.quoteSchedulePreview}>Dynamic {lead.durationDays}-Day itinerary covering all major sightseeing, local food joints, and shopping hotspots with private SUV transport.</Text>

                      <View style={styles.bidRow}>
                        <View style={styles.currencyPrefix}>
                          <Text style={styles.currencyPrefixText}>₹</Text>
                        </View>
                        <TextInput
                          style={styles.bidInput}
                          placeholder="Quote package budget"
                          placeholderTextColor={C.textMuted}
                          keyboardType="numeric"
                          value={quoteInputs[lead.id] || ''}
                          onChangeText={(text) => setQuoteInputs({ ...quoteInputs, [lead.id]: text })}
                        />
                        <TouchableOpacity
                          style={styles.sendQuoteBtn}
                          onPress={() => handleSendQuote(lead.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.sendQuoteBtnText}>Submit Quote</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.leadActionRow}>
                      <Text style={styles.dateLabel}>Departure: {lead.startDate}</Text>
                      {hasQuote ? (
                        <View style={styles.quoteSentTag}>
                          <CheckCircle size={11} color={C.greenGlow} />
                          <Text style={styles.quoteSentTagText}>Quote Sent</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.applyLeadBtn}
                          onPress={() => setSelectedLeadId(lead.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.applyLeadBtnText}>Quote Trip</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ========================================================
            TAB 2: REELS & STORIES UPLOAD
            ======================================================== */}
        {activeTab === 'upload' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>Broadcaster Panel</Text>
              <Text style={styles.descSec}>Upload high-fidelity stories and price guides to local discovery feeds</Text>
            </View>

            <View style={styles.uploadOptionsBox}>
              <Text style={styles.formInputLabel}>Content Format</Text>
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[styles.selectorBtn, uploadCategory === 'STORY' && styles.selectorBtnActive]}
                  onPress={() => setUploadCategory('STORY')}
                  activeOpacity={0.85}
                >
                  <ImageIcon size={15} color={uploadCategory === 'STORY' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadCategory === 'STORY' ? C.white : C.textSec }]}>Quick Story</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.selectorBtn, uploadCategory === 'REEL' && styles.selectorBtnActive]}
                  onPress={() => setUploadCategory('REEL')}
                  activeOpacity={0.85}
                >
                  <Video size={15} color={uploadCategory === 'REEL' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadCategory === 'REEL' ? C.white : C.textSec }]}>Travel Reel</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.formInputLabel}>Category Theme</Text>
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[styles.selectorBtnAlt, uploadTheme === 'LOCATION' && styles.selectorBtnAltActive]}
                  onPress={() => setUploadTheme('LOCATION')}
                  activeOpacity={0.85}
                >
                  <Compass size={13} color={uploadTheme === 'LOCATION' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadTheme === 'LOCATION' ? C.white : C.textSec }]}>Tourist Spot</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.selectorBtnAlt, uploadTheme === 'PRICING' && styles.selectorBtnAltActive]}
                  onPress={() => setUploadTheme('PRICING')}
                  activeOpacity={0.85}
                >
                  <FileText size={13} color={uploadTheme === 'PRICING' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadTheme === 'PRICING' ? C.white : C.textSec }]}>Price Packages</Text>
                </TouchableOpacity>
              </View>

              {/* Form inputs */}
              <Text style={styles.formInputLabel}>Caption & Description</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Give a catchy title..."
                placeholderTextColor={C.textMuted}
                value={mediaTitle}
                onChangeText={setMediaTitle}
              />

              <Text style={styles.formInputLabel}>Location Tag</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Amer Fort, Jaipur"
                placeholderTextColor={C.textMuted}
                value={mediaLocation}
                onChangeText={setMediaLocation}
              />

              {uploadTheme === 'PRICING' && (
                <View>
                  <Text style={styles.formInputLabel}>Trip Package Price List (₹ / Day)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 2500"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={mediaPrice}
                    onChangeText={setMediaPrice}
                  />
                </View>
              )}

              {/* Simulated media selection gallery */}
              <Text style={styles.formInputLabel}>Select Gallery Media</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryPreviewScroll}>
                {mockGallery.map((imgUrl, idx) => {
                  const isSel = selectedMockImage === imgUrl;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.galleryItemBtn, isSel && styles.galleryItemBtnSelected]}
                      onPress={() => setSelectedMockImage(imgUrl)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: imgUrl }} style={styles.galleryItemImage} />
                      {isSel && (
                        <View style={styles.gallerySelectedCheck}>
                          <Plus size={10} color={C.white} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.publishBtn}
                activeOpacity={0.8}
                onPress={handlePublishMedia}
              >
                <Camera size={16} color={C.white} />
                <Text style={styles.publishBtnText}>Publish Broadcast</Text>
              </TouchableOpacity>
            </View>

            {/* Active Feed Uploads */}
            <Text style={styles.subTitle}>Live Stories Feed</Text>
            <View style={styles.uploadsGrid}>
              {activeMedia.map((media) => (
                <View key={media.id} style={styles.uploadCardItem}>
                  <Image source={{ uri: media.image }} style={styles.uploadCardImg} />
                  <View style={styles.uploadCardOverlay}>
                    <View style={styles.badgeCategory}>
                      <Text style={styles.badgeCategoryText}>{media.type}</Text>
                    </View>
                    {media.price && (
                      <View style={[styles.badgeCategory, { backgroundColor: C.amber }]}>
                        <Text style={styles.badgeCategoryText}>{media.price}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.uploadCardInfoBox}>
                    <Text style={styles.uploadCardTitle} numberOfLines={1}>{media.title}</Text>
                    <View style={styles.uploadCardLocRow}>
                      <MapPin size={9} color={C.textSec} />
                      <Text style={styles.uploadCardLocText} numberOfLines={1}>{media.location}</Text>
                    </View>
                    <View style={styles.uploadCardLikesRow}>
                      <TrendingUp size={9} color={C.green} />
                      <Text style={styles.uploadCardLikes}>{media.likes} Views • {media.date}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 3: PLANNING, ESTIMATION, BUDGET & ACCOMMODATION
            ======================================================== */}
        {activeTab === 'planning' && (
          <View>
            <View style={styles.plannerSubTabs}>
              {[
                { key: 'itinerary', label: 'Itinerary', Icon: Calendar },
                { key: 'estimator', label: 'Time Estimator', Icon: Clock },
                { key: 'budget', label: 'Budget Plan', Icon: Calculator },
                { key: 'lodging', label: 'Accommodations', Icon: Hotel },
              ].map((sTab) => {
                const isSubActive = plannerTab === sTab.key;
                return (
                  <TouchableOpacity
                    key={sTab.key}
                    style={[styles.plannerSubTabItem, isSubActive && styles.plannerSubTabItemActive]}
                    onPress={() => setPlannerTab(sTab.key as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.plannerSubTabLabel, { color: isSubActive ? C.blueGlow : C.textSec }]}>
                      {sTab.label}
                    </Text>
                    {isSubActive && <View style={styles.plannerSubTabIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3A: Itinerary Builder */}
            {plannerTab === 'itinerary' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Day-Wise Trip Itinerary Builder</Text>
                <Text style={styles.descSec}>Add detailed daily schedules for tourists to view and download</Text>

                {/* Timeline connector visual container */}
                <View style={styles.timelineContainer}>
                  {itineraryDays.map((day, index) => {
                    const isLast = index === itineraryDays.length - 1;
                    return (
                      <View key={day.id} style={styles.timelineItem}>
                        {/* Vertical line connector */}
                        <View style={[styles.timelineLine, isLast && { backgroundColor: 'transparent' }]} />

                        {/* Round Day Node */}
                        <LinearGradient
                          colors={[C.blueGlow, C.blue]}
                          style={styles.timelineNode}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        >
                          <Text style={styles.timelineNodeText}>{day.day}</Text>
                        </LinearGradient>

                        {/* Itinerary Day Content */}
                        <View style={styles.dayCard}>
                          <Text style={styles.dayTitle}>{day.title}</Text>
                          <Text style={styles.dayActivitiesText}>{day.activities}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Form to Add Day */}
                <View style={styles.addDayBox}>
                  <Text style={styles.addDayBoxTitle}>Insert Itinerary Day</Text>

                  <Text style={styles.formInputLabel}>Day Schedule Title</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. City Palace Guided Walk & Photography"
                    placeholderTextColor={C.textMuted}
                    value={newDayTitle}
                    onChangeText={setNewDayTitle}
                  />

                  <Text style={styles.formInputLabel}>Activities Description</Text>
                  <TextInput
                    style={[styles.formInput, { height: 75, textAlignVertical: 'top' }]}
                    placeholder="Outline transport details, sights, tickets & logistics..."
                    placeholderTextColor={C.textMuted}
                    multiline
                    numberOfLines={3}
                    value={newDayDesc}
                    onChangeText={setNewDayDesc}
                  />

                  <TouchableOpacity
                    style={styles.addDayBtn}
                    onPress={handleAddDay}
                    activeOpacity={0.8}
                  >
                    <Plus size={15} color={C.white} />
                    <Text style={styles.addDayBtnText}>Add Day to Itinerary</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 3B: Travel Time Estimator */}
            {plannerTab === 'estimator' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Transit Time Estimator</Text>
                <Text style={styles.descSec}>Calculate route duration logs based on transport speeds</Text>

                <View style={styles.estimatorForm}>
                  <View style={styles.formInputRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.formInputLabel}>Origin City</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="e.g. Gangtok"
                        placeholderTextColor={C.textMuted}
                        value={estFrom}
                        onChangeText={setEstFrom}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formInputLabel}>Destination City</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="e.g. Gurudongmar"
                        placeholderTextColor={C.textMuted}
                        value={estTo}
                        onChangeText={setEstTo}
                      />
                    </View>
                  </View>

                  <Text style={styles.formInputLabel}>Road Distance (in km)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 180"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={estDist}
                    onChangeText={setEstDist}
                  />

                  <Text style={styles.formInputLabel}>Travel Mode Selection</Text>
                  <View style={styles.modesGrid}>
                    {[
                      { mode: 'BIKE', label: 'Bike', Icon: Car },
                      { mode: 'CAR', label: 'SUV / Cab', Icon: Car },
                      { mode: 'TRAIN', label: 'Train', Icon: Train },
                      { mode: 'PLANE', label: 'Flight', Icon: Plane },
                    ].map((item) => {
                      const isModeActive = estMode === item.mode;
                      return (
                        <TouchableOpacity
                          key={item.mode}
                          style={[styles.modeTile, isModeActive && styles.modeTileActive]}
                          onPress={() => setEstMode(item.mode as any)}
                          activeOpacity={0.8}
                        >
                          <item.Icon size={14} color={isModeActive ? C.white : C.textSec} />
                          <Text style={[styles.modeTileLabel, { color: isModeActive ? C.white : C.textSec }]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={styles.estimateBtn}
                    onPress={calculateEstimation}
                    activeOpacity={0.8}
                  >
                    <Clock size={15} color={C.white} />
                    <Text style={styles.estimateBtnText}>Calculate Transit Time</Text>
                  </TouchableOpacity>

                  {estimationResult && (
                    <View style={styles.estimationResultCard}>
                      <Clock size={16} color={C.blueGlow} />
                      <Text style={styles.estimationResultText}>{estimationResult}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3C: Budget Calculator */}
            {plannerTab === 'budget' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Travel Cost Budget Calculator</Text>
                <Text style={styles.descSec}>Evaluate day-wise tourist expenses across core sectors</Text>

                <View style={styles.budgetForm}>
                  <View style={styles.budgetInputItem}>
                    <Text style={styles.budgetInputLabel}>Transport Expenses (₹)</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={costTransport}
                      onChangeText={setCostTransport}
                    />
                  </View>

                  <View style={styles.budgetInputItem}>
                    <Text style={styles.budgetInputLabel}>Food & Meals Cost (₹)</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={costFood}
                      onChangeText={setCostFood}
                    />
                  </View>

                  <View style={styles.budgetInputItem}>
                    <Text style={styles.budgetInputLabel}>Accommodation / Stays (₹)</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={costLodge}
                      onChangeText={setCostLodge}
                    />
                  </View>

                  <View style={styles.budgetInputItem}>
                    <Text style={styles.budgetInputLabel}>Guide Service Charge (₹)</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={costGuide}
                      onChangeText={setCostGuide}
                    />
                  </View>

                  <View style={styles.budgetInputItem}>
                    <Text style={styles.budgetInputLabel}>Miscellaneous Buffer (₹)</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={costMisc}
                      onChangeText={setCostMisc}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.calculateBudgetBtn}
                    onPress={calculateBudgetBreakdown}
                    activeOpacity={0.8}
                  >
                    <Calculator size={15} color={C.white} />
                    <Text style={styles.calculateBudgetBtnText}>Run Cost Analysis</Text>
                  </TouchableOpacity>

                  {budgetBreakdown && (
                    <View style={styles.budgetResultCard}>
                      <Text style={styles.budgetResultTitle}>TOTAL TRIP BUDGET</Text>
                      <Text style={styles.budgetResultAmount}>₹{budgetBreakdown.total.toLocaleString('en-IN')}</Text>

                      <Text style={styles.budgetResultSubtitle}>Expense Breakdown</Text>
                      {Object.entries(budgetBreakdown.percentages).map(([name, pct]) => (
                        <View key={name} style={styles.breakdownRow}>
                          <View style={styles.breakdownLabelRow}>
                            <Text style={styles.breakdownName}>{name}</Text>
                            <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                          </View>
                          <View style={styles.breakdownTrack}>
                            <View
                              style={[
                                styles.breakdownFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor:
                                    name === 'Transport'
                                      ? C.blue
                                      : name === 'Food'
                                      ? C.amber
                                      : name === 'Lodging'
                                      ? C.purple
                                      : name === 'Guide Fee'
                                      ? C.green
                                      : C.cyan,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3D: Lodging / Accommodations */}
            {plannerTab === 'lodging' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>Lodging & Accommodations</Text>
                <Text style={styles.descSec}>Recommend high-rated hotels, hostels, and campsite bookings</Text>

                <View style={styles.accomSelectorRow}>
                  {[
                    { key: 'HOTELS', label: 'Hotels', Icon: Hotel },
                    { key: 'HOSTELS', label: 'Hostels', Icon: Home },
                    { key: 'HOMESTAYS', label: 'Homestays', Icon: Home },
                    { key: 'CAMPING', label: 'Campsites', Icon: Tent },
                  ].map((item) => {
                    const isAccomActive = accomTab === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.accomSelectBtn, isAccomActive && styles.accomSelectBtnActive]}
                        onPress={() => setAccomTab(item.key as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.accomSelectLabel, { color: isAccomActive ? C.white : C.textSec }]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {accommodationsData[accomTab].map((item, idx) => (
                  <View key={idx} style={styles.stayCard}>
                    <Image source={{ uri: item.image }} style={styles.stayImage} />
                    <View style={styles.stayInfo}>
                      <View style={styles.stayHeaderRow}>
                        <Text style={styles.stayName}>{item.name}</Text>
                        <Text style={styles.stayRating}>{item.rating} ★</Text>
                      </View>
                      <View style={styles.stayLocRow}>
                        <MapPin size={11} color={C.textMuted} />
                        <Text style={styles.stayLocText}>{item.location}</Text>
                      </View>
                      <View style={styles.stayPriceRow}>
                        <Text style={styles.stayPrice}>{item.rate}</Text>
                        <TouchableOpacity
                          style={styles.bookingLinkBtn}
                          onPress={() => handleBookingRedirect(item.name)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.bookingLinkText}>Reserve</Text>
                          <ExternalLink size={10} color={C.blueGlow} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================
            TAB 4: WEATHER
            ======================================================== */}
        {activeTab === 'weather' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>Live Local Parameters</Text>
              <Text style={styles.descSec}>Real-time weather forecast, air quality indices, and live crowd levels</Text>
            </View>

            {/* Weather City Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weatherCitiesScroll}>
              {weatherLocations.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.weatherCityBtn, selectedWeatherIdx === idx && styles.weatherCityBtnActive]}
                  onPress={() => setSelectedWeatherIdx(idx)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.weatherCityText, { color: selectedWeatherIdx === idx ? C.white : C.textSec }]}>
                    {item.city}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Primary Weather & Live Parameters Info */}
            <LinearGradient
              colors={['#0e1227', '#080a15']}
              style={styles.weatherLiveCard}
            >
              <View style={styles.weatherLiveCardGlow} />
              <View style={styles.weatherMainRow}>
                <View>
                  <Text style={styles.weatherMainCity}>{currentW.city}</Text>
                  <Text style={styles.weatherMainDesc}>{currentW.condition}</Text>
                </View>
                <View style={styles.weatherMainTempBox}>
                  <Sun size={28} color={C.amber} />
                  <Text style={styles.weatherMainTemp}>{currentW.temp}</Text>
                </View>
              </View>

              <View style={styles.weatherDetailsGrid}>
                <View style={styles.weatherDetailBox}>
                  <Wind size={15} color={C.blueGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>Wind Speed</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.wind}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Sunrise size={15} color={C.greenGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>Sunrise</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.sunrise}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Sunset size={15} color={C.amberGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>Sunset</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.sunset}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Activity size={15} color={currentW.crowdColor} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>Crowd Level</Text>
                    <Text style={[styles.weatherDetailValue, { color: currentW.crowdColor }]}>
                      {currentW.crowdLevel}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.aqiCard}>
                <View style={styles.aqiHeader}>
                  <Text style={styles.aqiTitle}>AIR QUALITY INDEX (AQI)</Text>
                  <View style={[styles.aqiBadge, { backgroundColor: currentW.aqiColor }]}>
                    <Text style={styles.aqiBadgeText}>{currentW.aqiStatus}</Text>
                  </View>
                </View>
                <View style={styles.aqiMeterRow}>
                  <Text style={styles.aqiValue}>{currentW.aqi}</Text>
                  <Text style={styles.aqiDescText}>
                    {currentW.aqiStatus === 'EXCELLENT' && 'Excellent air quality. Perfectly safe for long mountain trekking and camping stays.'}
                    {currentW.aqiStatus === 'GOOD' && 'Good air quality. Minimal risk for general outdoor tour exploration.'}
                    {currentW.aqiStatus === 'POOR' && 'Poor air quality. Sensitive tourists should limit long strenuous walks around dense traffic.'}
                    {currentW.aqiStatus === 'HAZARDOUS' && 'Hazardous conditions. Outdoor face mask is highly recommended for city excursions.'}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* 5-Day Forecast Grid */}
            <Text style={styles.subTitle}>5-Day Weather Outlook</Text>
            <View style={styles.forecastGrid}>
              {[
                { day: 'Friday', temp: '32°C', icon: Sun, condition: 'Sunny' },
                { day: 'Saturday', temp: '29°C', icon: CloudRain, condition: 'Partly Rain' },
                { day: 'Sunday', temp: '28°C', icon: CloudRain, condition: 'Thunderstorm' },
                { day: 'Monday', temp: '31°C', icon: Sun, condition: 'Clear' },
                { day: 'Tuesday', temp: '33°C', icon: Sun, condition: 'Sunny' },
              ].map((f, idx) => (
                <View key={idx} style={styles.forecastRow}>
                  <Text style={styles.forecastDay}>{f.day}</Text>
                  <View style={styles.forecastMid}>
                    <f.icon size={15} color={f.condition.includes('Rain') ? C.blue : C.amber} />
                    <Text style={styles.forecastCondText}>{f.condition}</Text>
                  </View>
                  <Text style={styles.forecastTemp}>{f.temp}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 5: SAFETY
            ======================================================== */}
        {activeTab === 'safety' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>Safety & Emergency Helpdesk</Text>
              <Text style={styles.descSec}>Quick dial government helplines, nearby clinics, police authorities, and warning alerts</Text>
            </View>

            {/* Safety Warning Alerts List */}
            <Text style={styles.sectionLabelInline}>Real-Time Safety & Transit Alerts</Text>
            {safetyAlerts.map((alert) => (
              <View key={alert.id} style={styles.safetyAlertItem}>
                <View style={styles.safetyAlertHeader}>
                  <View style={[
                    styles.safetyAlertBadge,
                    { backgroundColor: alert.type === 'DANGER' ? 'rgba(239,68,68,0.2)' : alert.type === 'WARNING' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)' }
                  ]}>
                    <AlertTriangle size={11} color={alert.type === 'DANGER' ? C.rose : alert.type === 'WARNING' ? C.amber : C.blue} />
                    <Text style={[
                      styles.safetyAlertBadgeText,
                      { color: alert.type === 'DANGER' ? C.rose : alert.type === 'WARNING' ? C.amber : C.blue }
                    ]}>
                      {alert.type}
                    </Text>
                  </View>
                  <Text style={styles.safetyAlertLocation}>{alert.location}</Text>
                </View>
                <Text style={styles.safetyAlertMessage}>{alert.message}</Text>
              </View>
            ))}

            {/* Emergency Contacts Dial Desk */}
            <Text style={styles.sectionLabelInline}>Speed Dial Emergency Helpline Desk</Text>
            {emergencyContacts.map((contact, idx) => (
              <View key={idx} style={styles.contactItemCard}>
                <View style={styles.contactItemHeader}>
                  <View style={[styles.contactIconCircle, { backgroundColor: contact.color + '18' }]}>
                    <contact.Icon size={15} color={contact.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.contactTitle}>{contact.title}</Text>
                    <Text style={styles.contactDesc}>{contact.description}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.callActionBtn, { borderColor: contact.color }]}
                  onPress={() => handleEmergencyCall(contact.title, contact.phone)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.callActionBtnText, { color: contact.color }]}>{contact.phone}</Text>
                  <PhoneCall size={11} color={contact.color} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Hospitals & Police Stations Locator */}
            <Text style={styles.sectionLabelInline}>Nearby Emergency Facilities</Text>
            <View style={styles.facilitiesRow}>
              <View style={styles.facilityBox}>
                <View style={styles.facilityHeader}>
                  <HeartPulse size={15} color={C.greenGlow} />
                  <Text style={styles.facilityTitle}>Apex Hospital</Text>
                </View>
                <Text style={styles.facilityName}>Apex Trauma Care</Text>
                <Text style={styles.facilityDist}>1.4 km • Open 24/7</Text>
                <Text style={styles.facilityLoc}>Sector 5 Main Marg</Text>
                <TouchableOpacity
                  style={styles.facilityNavBtn}
                  onPress={() => Alert.alert('GPS Navigator', 'Launching Google Maps route to Apex Trauma Center...')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.facilityNavBtnText}>Navigate</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.facilityBox}>
                <View style={styles.facilityHeader}>
                  <Shield size={15} color={C.blueGlow} />
                  <Text style={styles.facilityTitle}>Police HQ</Text>
                </View>
                <Text style={styles.facilityName}>District Police HQ</Text>
                <Text style={styles.facilityDist}>2.8 km • Open 24/7</Text>
                <Text style={styles.facilityLoc}>Kutchery Circle Rd</Text>
                <TouchableOpacity
                  style={styles.facilityNavBtn}
                  onPress={() => Alert.alert('GPS Navigator', 'Launching Google Maps route to District Police HQ...')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.facilityNavBtnText}>Navigate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Bottom Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CASHOUT MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={cashoutModalVisible}
        onRequestClose={() => setCashoutModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Withdraw Payout Funds</Text>
            <Text style={styles.modalDesc}>
              Move earnings directly to your verified bank account. Daily limit: ₹50,000.
            </Text>

            <View style={styles.modalBalanceRow}>
              <Text style={styles.modalBalanceLabel}>Available Wallet Balance:</Text>
              <Text style={styles.modalBalanceVal}>₹{profile.walletBalance.toLocaleString('en-IN')}</Text>
            </View>

            <Text style={styles.modalInputLabel}>Withdrawal Amount (₹)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 1000"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              value={cashoutAmount}
              onChangeText={setCashoutAmount}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setCashoutModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={handleCashout}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm Cashout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────
// STYLES
// ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Header Gradient Box ─────────────────────────────
  headerGradient: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.08)',
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
    shadowColor: C.green,
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

  // ── Tab Bar ─────────────────────────────────────────
  tabBarContainer: {
    paddingHorizontal: 10,
    marginTop: 4,
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
    gap: 6,
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
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Section Titles ──────────────────────────────────
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

  // ── Premium Wallet Card ─────────────────────────────
  walletCard: {
    borderRadius: 24,
    padding: 18,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  walletCardAccent: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,102,255,0.15)',
    filter: 'blur(30px)',
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  rupeeSign: {
    fontSize: 20,
    fontWeight: '700',
    color: C.blueGlow,
    marginRight: 2,
  },
  walletBalance: {
    fontSize: 28,
    fontWeight: '900',
    color: C.white,
  },
  cashoutBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  cashoutBtnGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashoutBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  walletDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statBoxVerticalDivider: {
    width: 1.2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statLabel: {
    fontSize: 9.5,
    color: C.textSec,
    marginBottom: 4,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
  },

  // ── Weekly Chart ────────────────────────────────────
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarValue: {
    fontSize: 8,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartBar: {
    width: 11,
    borderRadius: 6,
  },
  chartDayText: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 6,
    fontWeight: '700',
  },

  // ── Lead Feed Header ────────────────────────────────
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 2,
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.rose,
  },
  liveLabel: {
    fontSize: 8.5,
    fontWeight: '900',
    color: C.rose,
  },

  // ── Search & Inputs ──────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: C.white,
    marginLeft: 8,
    fontSize: 12.5,
    fontWeight: '600',
  },

  // ── Glowing Leads Cards ──────────────────────────────
  leadCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  leadCardSelected: {
    borderColor: 'rgba(0,102,255,0.4)',
    backgroundColor: C.cardAlt,
  },
  activeBorderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.blueGlow,
  },
  avatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.borderGlow,
    padding: 1.5,
    marginRight: 10,
  },
  leadAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  leadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
  leadDestinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  leadDestination: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
    maxWidth: '92%',
  },
  leadRight: {
    alignItems: 'flex-end',
  },
  leadBudget: {
    fontSize: 14,
    fontWeight: '900',
    color: C.greenGlow,
  },
  leadDays: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 2,
    fontWeight: '700',
  },
  leadDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  leadActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
  },
  dateLabel: {
    fontSize: 10.5,
    color: C.textMuted,
    fontWeight: '700',
  },
  applyLeadBtn: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  applyLeadBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.blueGlow,
  },
  quoteSentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  quoteSentTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.greenGlow,
  },

  // ── Leads Bid Section ──
  quoteInputsBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 14,
  },
  quoteInputsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quoteInputLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.white,
  },
  quoteDurationBadge: {
    fontSize: 9.5,
    fontWeight: '900',
    color: C.blueGlow,
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  quoteSchedulePreview: {
    fontSize: 11,
    color: C.textSec,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
    lineHeight: 16,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyPrefix: {
    width: 34,
    height: 38,
    backgroundColor: C.card,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  currencyPrefixText: {
    color: C.greenGlow,
    fontWeight: '800',
    fontSize: 13,
  },
  bidInput: {
    flex: 1,
    height: 38,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    color: C.white,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sendQuoteBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  sendQuoteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // ========================================================
  // TAB 2: REELS UPLOADER
  // ========================================================
  cardHeader: {
    marginTop: 4,
  },
  uploadOptionsBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 24,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
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
    gap: 6,
  },
  selectorBtnActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  selectorBtnAlt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  selectorBtnAltActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleGlow,
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  selectorLabelText: {
    fontSize: 11.5,
    fontWeight: '800',
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
  galleryPreviewScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  galleryItemBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.8,
    borderColor: 'transparent',
  },
  galleryItemBtnSelected: {
    borderColor: C.blueGlow,
  },
  galleryItemImage: {
    width: '100%',
    height: '100%',
  },
  gallerySelectedCheck: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: C.blueGlow,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  publishBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  uploadsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  uploadCardItem: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: C.border,
    position: 'relative',
  },
  uploadCardImg: {
    width: '100%',
    height: 115,
  },
  uploadCardOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    gap: 4,
  },
  badgeCategory: {
    backgroundColor: 'rgba(4,6,15,0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeCategoryText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: C.white,
  },
  uploadCardInfoBox: {
    padding: 10,
  },
  uploadCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  uploadCardLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  uploadCardLocText: {
    fontSize: 10,
    color: C.textSec,
    fontWeight: '600',
  },
  uploadCardLikesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  uploadCardLikes: {
    fontSize: 9.5,
    color: C.greenGlow,
    fontWeight: '700',
  },

  // ========================================================
  // TAB 3: PLANNER SUB NAV
  // ========================================================
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 8,
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

  // Timeline UI Itinerary
  timelineContainer: {
    paddingLeft: 16,
    position: 'relative',
    marginTop: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
    paddingLeft: 22,
  },
  timelineLine: {
    position: 'absolute',
    left: -2,
    top: 24,
    bottom: -24,
    width: 2,
    backgroundColor: C.border,
  },
  timelineNode: {
    position: 'absolute',
    left: -12,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blueGlow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineNodeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: C.white,
  },
  dayCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 12,
    flex: 1,
  },
  dayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
    marginBottom: 4,
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

  // Time Estimator
  estimatorForm: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  formInputRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  modesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modeTile: {
    flex: 1,
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  modeTileActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  modeTileLabel: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  estimateBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  estimateBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  estimationResultCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,102,255,0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(0,102,255,0.18)',
    marginTop: 14,
    gap: 8,
  },
  estimationResultText: {
    flex: 1,
    color: C.white,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '500',
  },

  // Budget Calculator
  budgetForm: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  budgetInputItem: {
    marginBottom: 10,
  },
  budgetInputLabel: {
    fontSize: 11,
    color: C.textSec,
    marginBottom: 4,
    fontWeight: '700',
  },
  budgetInput: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    height: 36,
    paddingHorizontal: 10,
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
  calculateBudgetBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  calculateBudgetBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  budgetResultCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginTop: 14,
  },
  budgetResultTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.6,
  },
  budgetResultAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: C.greenGlow,
    marginTop: 2,
  },
  budgetResultSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
    marginTop: 14,
    marginBottom: 8,
  },
  breakdownRow: {
    marginBottom: 8,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  breakdownName: {
    fontSize: 10.5,
    color: C.textSec,
    fontWeight: '600',
  },
  breakdownPct: {
    fontSize: 10.5,
    color: C.white,
    fontWeight: '800',
  },
  breakdownTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Stays & Accommodations
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

  // ========================================================
  // TAB 4: WEATHER
  // ========================================================
  weatherCitiesScroll: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  weatherCityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
    marginRight: 8,
  },
  weatherCityBtnActive: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderColor: C.blue,
  },
  weatherCityText: {
    fontSize: 11,
    fontWeight: '800',
  },
  weatherLiveCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  weatherLiveCardGlow: {
    position: 'absolute',
    top: -30,
    left: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0,102,255,0.1)',
    filter: 'blur(20px)',
  },
  weatherMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  weatherMainCity: {
    fontSize: 20,
    fontWeight: '900',
    color: C.white,
  },
  weatherMainDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    fontWeight: '600',
  },
  weatherMainTempBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weatherMainTemp: {
    fontSize: 32,
    fontWeight: '900',
    color: C.white,
  },
  weatherDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  weatherDetailBox: {
    width: (SCREEN_WIDTH - 64) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 10,
  },
  weatherDetailLabel: {
    fontSize: 9.5,
    color: C.textMuted,
    fontWeight: '700',
  },
  weatherDetailValue: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
    marginTop: 1,
  },
  aqiCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  aqiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aqiTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.5,
  },
  aqiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  aqiBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#04060f',
  },
  aqiMeterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aqiValue: {
    fontSize: 26,
    fontWeight: '900',
    color: C.white,
  },
  aqiDescText: {
    flex: 1,
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  forecastGrid: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  forecastDay: {
    width: 80,
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  forecastMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  forecastCondText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  forecastTemp: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    width: 45,
    textAlign: 'right',
  },

  // ========================================================
  // TAB 5: SAFETY
  // ========================================================
  safetyAlertItem: {
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 10,
  },
  safetyAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  safetyAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  safetyAlertBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
  },
  safetyAlertLocation: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
  },
  safetyAlertMessage: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  contactItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  contactItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  contactDesc: {
    fontSize: 10.5,
    color: C.textSec,
    marginTop: 1,
    fontWeight: '500',
  },
  callActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.2,
    borderRadius: 8,
    height: 32,
    marginTop: 12,
  },
  callActionBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
  },
  facilitiesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  facilityBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: 'space-between',
  },
  facilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  facilityTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.textSec,
  },
  facilityName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  facilityDist: {
    fontSize: 10.5,
    color: C.greenGlow,
    fontWeight: '700',
    marginTop: 2,
  },
  facilityLoc: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  facilityNavBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1.2,
    borderColor: C.border,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  facilityNavBtnText: {
    color: C.blueGlow,
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Cashout Modal Styles
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
  modalBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  modalBalanceLabel: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '700',
  },
  modalBalanceVal: {
    fontSize: 11,
    fontWeight: '900',
    color: C.greenGlow,
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
    backgroundColor: C.green,
  },
  modalBtnConfirmText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
