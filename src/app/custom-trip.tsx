import { Trip, useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Car,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  Globe,
  IndianRupee,
  Link as LinkIcon,
  Lock,
  Map as MapIcon,
  MapPin,
  Share2,
  Sparkles,
  Square,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle
} from 'lucide-react-native';
import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#EC4899',
};

const CATEGORIES = ['Adventure', 'Family', 'Solo', 'Couple', 'Business', 'Road Trip'];
const TRIP_TYPES = ['Solo', 'Couple', 'Family', 'Friends', 'Group', 'Business'];

const COVER_BANNERS = [
  { id: '1', title: 'Taj Mahal', url: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80' },
  { id: '2', title: 'Ladakh Mountains', url: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80' },
  { id: '3', title: 'Goa Beaches', url: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80' },
  { id: '4', title: 'Kerala Hills', url: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&q=80' },
];

const infiniteCoverBanners = [...COVER_BANNERS, ...COVER_BANNERS];

export default function CustomTripPlannerScreen() {
  const router = useRouter();
  const { trips, addTrip } = useApp();

  // Active Tab: 'PLANNER' | 'TIMELINE' | 'TRAVELERS' | 'CHECKLIST'
  const [activeTab, setActiveTab] = useState<'PLANNER' | 'TIMELINE' | 'TRAVELERS' | 'CHECKLIST'>('PLANNER');

  // 1. Trip Information (NO HARDCODED DEFAULT RAJASTHAN DATA)
  const [tripTitle, setTripTitle] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [selectedBanner, setSelectedBanner] = useState(COVER_BANNERS[0].url);
  const [startCity, setStartCity] = useState('');
  const [destinationsInput, setDestinationsInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Adventure');

  // 2. Dates & Duration
  const [startDate, setStartDate] = useState('2026-08-15');
  const [endDate, setEndDate] = useState('2026-08-20');

  // 3. Trip Details & Expenses
  const [transportMode, setTransportMode] = useState('');
  const [hotelDetails, setHotelDetails] = useState('');
  const [estBudget, setEstBudget] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  // 4. Travelers Section
  const [totalCapacity, setTotalCapacity] = useState(4);
  const [selectedTripType, setSelectedTripType] = useState('Friends');
  const [travelerNamesInput, setTravelerNamesInput] = useState('');
  const [availableSeatsForOthers, setAvailableSeatsForOthers] = useState(3);

  // 5. Privacy
  const [privacyMode, setPrivacyMode] = useState<'PUBLIC' | 'INVITE_ONLY' | 'PRIVATE'>('PUBLIC');

  // 6. Join Requests Simulation
  const [joinRequests, setJoinRequests] = useState([
    { id: 'req-1', name: 'Kabir Mehta', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80' },
  ]);
  const [participants, setParticipants] = useState([
    { id: 'p-1', name: 'Aarav Sharma (Creator)', isCreator: true },
  ]);

  // 7. Essential Packing & Documents Checklist (BY DEFAULT ALL UNCHECKED FOR USER TO CONFIRM)
  const [checklist, setChecklist] = useState([
    { id: '1', item: 'Passport & National ID / Aadhaar Card', checked: false },
    { id: '2', item: 'Driving License & Required Travel Permits', checked: false },
    { id: '3', item: 'Flight / Bus / Train Tickets & Hotel Vouchers', checked: false },
    { id: '4', item: 'Powerbank, Portable Chargers & Universal Cable', checked: false },
    { id: '5', item: 'First Aid Kit & Personal Prescription Medications', checked: false },
    { id: '6', item: 'Sunscreen, Sunglasses & Personal Toiletries', checked: false },
    { id: '7', item: 'Weather-Appropriate Clothing & Trekking Shoes', checked: false },
    { id: '8', item: 'Emergency Cash & Credit / Debit Cards', checked: false },
  ]);

  // Modals & Toasts
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [selectedDay, setSelectedDay] = useState(15);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Smooth Cross-Fade & Ken-Burns Zoom Motion Carousel
  const [bannerIndex, setBannerIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const currentCover = COVER_BANNERS[bannerIndex];

  const triggerSlideTo = (idx: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0.2, duration: 250, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setBannerIndex(idx);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.12, duration: 3000, useNativeDriver: true }),
      ]).start();
    });
  };

  useEffect(() => {
    // Start initial Ken-Burns zoom
    Animated.timing(scaleAnim, { toValue: 1.12, duration: 3200, useNativeDriver: true }).start();

    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 450, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.0, duration: 450, useNativeDriver: true }),
      ]).start(() => {
        setBannerIndex((prev) => (prev + 1) % COVER_BANNERS.length);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.12, duration: 3200, useNativeDriver: true }),
        ]).start();
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [fadeAnim, scaleAnim]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Parsed Cities for live route & timeline
  const parsedLocations = destinationsInput
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const toggleChecklist = (id: string) => {
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  };

  const handleAcceptRequest = (reqId: string, name: string) => {
    setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
    setParticipants((prev) => [...prev, { id: `p-${Date.now()}`, name, isCreator: false }]);
    setAvailableSeatsForOthers((prev) => Math.max(0, prev - 1));
    showToast(`✅ Accepted ${name}'s join request!`);
  };

  const handleRejectRequest = (reqId: string) => {
    setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
    showToast('❌ Join request declined');
  };

  const handleSaveTrip = (publish: boolean) => {
    if (!tripTitle || !destinationsInput || !estBudget) {
      Alert.alert('Missing Info', 'Please enter Trip Title, Destinations, and Budget.');
      return;
    }

    const cities = parsedLocations.length > 0 ? parsedLocations : ['Delhi', 'Destination'];
    const newTrip: Trip = {
      id: `custom-${Date.now()}`,
      name: tripTitle,
      creator: 'Aarav Sharma (Organizer)',
      cities: startCity ? [startCity, ...cities] : cities,
      startDate,
      endDate,
      budget: parseFloat(estBudget) || 12000,
      availableSeats: availableSeatsForOthers,
      totalSeats: totalCapacity,
      meetingPoint: startCity || 'Central Departure Station',
      guideIncluded: true,
      foodIncluded: true,
      privacy: privacyMode,
      membersCount: participants.length,
    };

    addTrip(newTrip);

    if (publish) {
      Alert.alert('🚀 Custom Trip Published!', `Your custom trip "${tripTitle}" is live for tourists to join!`, [
        { text: 'View Search Feed', onPress: () => router.push('/search') },
      ]);
    } else {
      showToast('📝 Trip saved as Draft!');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ════════════════════════════════════════════════
            TOP NAV BAR WITH DRAFT & PUBLISH ACTIONS
            ════════════════════════════════════════════════ */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.topNavTitle}>Custom Trip Studio</Text>
          <TouchableOpacity style={styles.draftBtn} onPress={() => handleSaveTrip(false)}>
            <Text style={styles.draftBtnText}>Draft</Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════════════════════════════════════
            HERO BANNER WITH CINEMATIC CROSS-FADE & KEN-BURNS ZOOM
            ════════════════════════════════════════════════ */}
        <View style={styles.heroWrap}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Image
              source={{ uri: currentCover.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </Animated.View>
          <LinearGradient colors={['rgba(6,8,20,0.3)', 'rgba(6,8,20,0.92)']} style={StyleSheet.absoluteFill} />

          <View style={styles.heroHeaderRow}>
            <View style={styles.heroBadge}>
              <Sparkles size={11} color={C.amber} />
              <Text style={styles.heroBadgeText}>{selectedCategory.toUpperCase()} MODE</Text>
            </View>

            {/* Active Scenic Location Tag */}
            <View style={styles.locationTagPill}>
              <MapPin size={10} color={C.blue} />
              <Text style={styles.locationTagText}>{currentCover.title}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{tripTitle || 'Create Custom Trip Plan'}</Text>
          <Text style={styles.heroSub}>{shortDesc || 'Prepare, organize, and invite tourists to your custom travel plan.'}</Text>

          {/* Interactive Banner Selector Thumbnails */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bannerRow}>
            {COVER_BANNERS.map((b, idx) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bannerThumb, bannerIndex === idx && styles.bannerThumbActive]}
                onPress={() => triggerSlideTo(idx)}
              >
                <Image source={{ uri: b.url }} style={styles.thumbImg} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ════════════════════════════════════════════════
            TAB SWITCHER (PLANNER, TIMELINE, TRAVELERS, CHECKLIST)
            ════════════════════════════════════════════════ */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'PLANNER' && styles.tabItemActive]}
            onPress={() => setActiveTab('PLANNER')}
          >
            <Compass size={14} color={activeTab === 'PLANNER' ? C.white : C.textSec} />
            <Text style={[styles.tabText, activeTab === 'PLANNER' && styles.tabTextActive]}>Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'TIMELINE' && styles.tabItemActive]}
            onPress={() => setActiveTab('TIMELINE')}
          >
            <Clock size={14} color={activeTab === 'TIMELINE' ? C.white : C.textSec} />
            <Text style={[styles.tabText, activeTab === 'TIMELINE' && styles.tabTextActive]}>Timeline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'TRAVELERS' && styles.tabItemActive]}
            onPress={() => setActiveTab('TRAVELERS')}
          >
            <Users size={14} color={activeTab === 'TRAVELERS' ? C.white : C.textSec} />
            <Text style={[styles.tabText, activeTab === 'TRAVELERS' && styles.tabTextActive]}>Travelers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'CHECKLIST' && styles.tabItemActive]}
            onPress={() => setActiveTab('CHECKLIST')}
          >
            <CheckSquare size={14} color={activeTab === 'CHECKLIST' ? C.white : C.textSec} />
            <Text style={[styles.tabText, activeTab === 'CHECKLIST' && styles.tabTextActive]}>Checklist</Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════════════════════════════════════
            TAB 1: PLANNER & TRIP DETAILS
            ════════════════════════════════════════════════ */}
        {activeTab === 'PLANNER' && (
          <View style={styles.formContainer}>

            {/* 1. TRIP TITLE & CATEGORY */}
            <View style={styles.sectionHeader}>
              <View style={[styles.iconTile, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Compass size={15} color={C.blue} />
              </View>
              <Text style={styles.sectionTitle}>1. Trip Information</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TRIP TITLE *</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={tripTitle}
                  onChangeText={setTripTitle}
                  placeholder="e.g. Kashmir Valley Snow Trek & Houseboat"
                  placeholderTextColor={C.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SHORT DESCRIPTION</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={shortDesc}
                  onChangeText={setShortDesc}
                  placeholder="e.g. Exploring Dal Lake, Gondola ride in Gulmarg & Pahalgam"
                  placeholderTextColor={C.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TRIP CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 2. LOCATIONS & ROUTE */}
            <View style={styles.sectionHeader}>
              <View style={[styles.iconTile, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <MapPin size={15} color={C.green} />
              </View>
              <Text style={styles.sectionTitle}>2. Locations & Route Stops</Text>
            </View>

            <View style={styles.gridRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>START LOCATION *</Text>
                <View style={styles.inputWrapper}>
                  <MapPin size={14} color={C.green} style={styles.leftIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={startCity}
                    onChangeText={setStartCity}
                    placeholder="e.g. New Delhi"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>DESTINATIONS (COMMA SEPARATED)</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    value={destinationsInput}
                    onChangeText={setDestinationsInput}
                    placeholder="e.g. Srinagar, Gulmarg, Pahalgam"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              </View>
            </View>

            {/* Dynamic Map Route Preview Card */}
            {(startCity || parsedLocations.length > 0) && (
              <View style={styles.mapPreviewCard}>
                <View style={styles.mapHeaderRow}>
                  <MapIcon size={16} color={C.blue} />
                  <Text style={styles.mapTitle}>DYNAMIC ROUTE MAP</Text>
                  <Text style={styles.distPill}>
                    {parsedLocations.length * 140 + 80} km Route
                  </Text>
                </View>
                <Text style={styles.mapRouteText}>
                  {startCity || 'Start'} ➔ {parsedLocations.join(' ➔ ') || 'Destination'}
                </Text>
              </View>
            )}

            {/* 3. DATES & TIMINGS */}
            <View style={styles.sectionHeader}>
              <View style={[styles.iconTile, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                <CalendarIcon size={15} color={C.purple} />
              </View>
              <Text style={styles.sectionTitle}>3. Dates & Schedule</Text>
            </View>

            <View style={styles.gridRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>START DATE *</Text>
                <TouchableOpacity style={styles.inputWrapper} onPress={() => setShowDatePicker('start')}>
                  <CalendarIcon size={14} color={C.purple} style={styles.leftIcon} />
                  <Text style={styles.textInput}>{startDate}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>END DATE *</Text>
                <TouchableOpacity style={styles.inputWrapper} onPress={() => setShowDatePicker('end')}>
                  <CalendarIcon size={14} color={C.purple} style={styles.leftIcon} />
                  <Text style={styles.textInput}>{endDate}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. EXPENSES & ACCOMMODATION */}
            <View style={styles.sectionHeader}>
              <View style={[styles.iconTile, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <IndianRupee size={15} color={C.amber} />
              </View>
              <Text style={styles.sectionTitle}>4. Budget & Accommodation</Text>
            </View>

            <View style={styles.gridRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>ESTIMATED BUDGET PER PERSON (₹)</Text>
                <View style={styles.inputWrapper}>
                  <IndianRupee size={14} color={C.amber} style={styles.leftIcon} />
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={estBudget}
                    onChangeText={setEstBudget}
                    placeholder="e.g. 14500"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>TRANSPORTATION MODE</Text>
                <View style={styles.inputWrapper}>
                  <Car size={14} color={C.blue} style={styles.leftIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={transportMode}
                    onChangeText={setTransportMode}
                    placeholder="e.g. AC SUV / Flight"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              </View>
            </View>

            {/* 5. PRIVACY & VISIBILITY */}
            <View style={styles.sectionHeader}>
              <View style={[styles.iconTile, { backgroundColor: 'rgba(236,72,153,0.15)' }]}>
                <Globe size={15} color={C.rose} />
              </View>
              <Text style={styles.sectionTitle}>5. Privacy & Access Settings</Text>
            </View>

            <View style={styles.privacyGrid}>
              <TouchableOpacity
                style={[styles.privacyTile, privacyMode === 'PUBLIC' && styles.privacyTileActive]}
                onPress={() => setPrivacyMode('PUBLIC')}
              >
                <Globe size={18} color={privacyMode === 'PUBLIC' ? C.blue : C.textMuted} />
                <Text style={[styles.privacyTitle, privacyMode === 'PUBLIC' && styles.privacyTitleActive]}>Public</Text>
                <Text style={styles.privacySub}>Discoverable by all</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.privacyTile, privacyMode === 'INVITE_ONLY' && styles.privacyTileActive]}
                onPress={() => setPrivacyMode('INVITE_ONLY')}
              >
                <LinkIcon size={18} color={privacyMode === 'INVITE_ONLY' ? C.amber : C.textMuted} />
                <Text style={[styles.privacyTitle, privacyMode === 'INVITE_ONLY' && styles.privacyTitleActive]}>By Link</Text>
                <Text style={styles.privacySub}>Shareable link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.privacyTile, privacyMode === 'PRIVATE' && styles.privacyTileActive]}
                onPress={() => setPrivacyMode('PRIVATE')}
              >
                <Lock size={18} color={privacyMode === 'PRIVATE' ? C.rose : C.textMuted} />
                <Text style={[styles.privacyTitle, privacyMode === 'PRIVATE' && styles.privacyTitleActive]}>Private</Text>
                <Text style={styles.privacySub}>Only for you</Text>
              </TouchableOpacity>
            </View>

            {/* PUBLISH ACTION BUTTON */}
            <TouchableOpacity style={styles.publishBtnWrap} onPress={() => handleSaveTrip(true)}>
              <LinearGradient colors={['#3B82F6', '#8B5CF6']} style={styles.publishGradient}>
                <Sparkles size={18} color={C.white} />
                <Text style={styles.publishText}>Publish Custom Trip</Text>
              </LinearGradient>
            </TouchableOpacity>

          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 2: DYNAMIC DAY-BY-DAY VISUAL TIMELINE
            ════════════════════════════════════════════════ */}
        {activeTab === 'TIMELINE' && (
          <View style={styles.timelineContainer}>
            <Text style={styles.timelineHeaderTitle}>
              Dynamic Day-by-Day Itinerary Timeline
            </Text>

            {parsedLocations.length > 0 ? (
              parsedLocations.map((loc, idx) => (
                <View key={idx} style={styles.timelineItem}>
                  <View style={styles.timelineDotLine}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: idx === 0 ? C.blue : idx === 1 ? C.green : C.amber },
                      ]}
                    />
                    {idx < parsedLocations.length - 1 && <View style={styles.timelineVerticalLine} />}
                  </View>

                  <View style={styles.timelineContentCard}>
                    <Text style={styles.dayBadge}>DAY {idx + 1} • {loc.toUpperCase()}</Text>
                    <Text style={styles.timelineTitle}>
                      {idx === 0
                        ? `${startCity || 'Departure Point'} ➔ Arrival at ${loc}`
                        : `Sightseeing & Exploration at ${loc}`}
                    </Text>
                    <Text style={styles.timelineTime}>⏰ Day {idx + 1} Morning Activity Schedule</Text>
                    <Text style={styles.timelineDesc}>
                      {idx === 0
                        ? `Check in at ${loc} hotel, relax, and explore local food night markets.`
                        : `Guided tour of key attraction spots around ${loc}, photo sessions & evening sunset view.`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyTimelineCard}>
                <Compass size={32} color={C.blue} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTimelineTitle}>Prepare Your Custom Timeline</Text>
                <Text style={styles.emptyTimelineSub}>
                  Enter your destination stopover locations in the Plan tab above (e.g. "Srinagar, Gulmarg, Pahalgam") to automatically generate your visual itinerary timeline!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 3: TRAVELERS & JOIN REQUESTS
            ════════════════════════════════════════════════ */}
        {activeTab === 'TRAVELERS' && (
          <View style={styles.travelersContainer}>

            {/* CAPACITY SELECTOR */}
            <View style={styles.capacityBox}>
              <Text style={styles.boxTitle}>HOW MANY PEOPLE? (GROUP CAPACITY)</Text>
              <View style={styles.capacityCounterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setTotalCapacity(Math.max(1, totalCapacity - 1))}
                >
                  <Text style={styles.counterBtnText}>-</Text>
                </TouchableOpacity>

                <View style={styles.counterDisplay}>
                  <Text style={styles.counterValueText}>{totalCapacity}</Text>
                  <Text style={styles.counterSubText}>Total Capacity</Text>
                </View>

                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setTotalCapacity(totalCapacity + 1)}
                >
                  <Text style={styles.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.seatsAvailableText}>
                ⚡ {availableSeatsForOthers} Open Seats Available for Co-Travelers
              </Text>
            </View>

            {/* TRIP TYPE SELECTION */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TRIP TYPE</Text>
              <View style={styles.pillsRow}>
                {TRIP_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.categoryPill, selectedTripType === t && styles.categoryPillActive]}
                    onPress={() => setSelectedTripType(t)}
                  >
                    <Text style={[styles.categoryPillText, selectedTripType === t && styles.categoryPillTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* CONFIRMED PARTICIPANTS LIST */}
            <View style={styles.sectionHeader}>
              <UserCheck size={16} color={C.green} />
              <Text style={styles.sectionTitle}>Confirmed Travelers ({participants.length})</Text>
            </View>

            <View style={styles.participantsList}>
              {participants.map((p) => (
                <View key={p.id} style={styles.participantItem}>
                  <View style={styles.avatarCircle}>
                    <User size={16} color={C.white} />
                  </View>
                  <Text style={styles.participantName}>{p.name}</Text>
                  {p.isCreator && (
                    <View style={styles.creatorBadge}>
                      <Text style={styles.creatorBadgeText}>CREATOR</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* PENDING JOIN REQUESTS */}
            {privacyMode !== 'PRIVATE' && joinRequests.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <UserPlus size={16} color={C.amber} />
                  <Text style={styles.sectionTitle}>Pending Join Requests ({joinRequests.length})</Text>
                </View>

                {joinRequests.map((req) => (
                  <View key={req.id} style={styles.requestItem}>
                    <Image source={{ uri: req.avatar }} style={styles.reqAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqName}>{req.name}</Text>
                      <Text style={styles.reqSub}>Requested to join your trip</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptRequest(req.id, req.name)}
                    >
                      <CheckCircle2 size={16} color={C.white} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleRejectRequest(req.id)}
                    >
                      <XCircle size={16} color={C.rose} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 4: ESSENTIAL PACKING & DOCUMENTS CHECKLIST
            (BY DEFAULT ALL UNCHECKED FOR USER TO CONFIRM)
            ════════════════════════════════════════════════ */}
        {activeTab === 'CHECKLIST' && (
          <View style={styles.checklistContainer}>
            <Text style={styles.checklistTitle}>Essential Packing & Travel Documents Checklist</Text>
            <Text style={styles.checklistSub}>
              Confirm each essential item before embarking on your journey.
            </Text>

            {checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                style={[styles.checklistCard, item.checked && styles.checklistCardChecked]}
                onPress={() => toggleChecklist(item.id)}
              >
                {item.checked ? (
                  <CheckSquare size={20} color={C.green} />
                ) : (
                  <Square size={20} color={C.textMuted} />
                )}
                <Text style={[styles.checkItemText, item.checked && styles.checkItemTextChecked]}>
                  {item.item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* DATE PICKER MODAL */}
      {showDatePicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalCard}>
            <View style={styles.dateModalHeader}>
              <Text style={styles.dateModalTitle}>
                Select {showDatePicker === 'start' ? 'Start' : 'End'} Date
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowDatePicker(null)}>
                <X size={18} color={C.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const isSelected = selectedDay === day;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayCell, isSelected && styles.dayCellActive]}
                    onPress={() => {
                      setSelectedDay(day);
                      const formatted = `2026-08-${String(day).padStart(2, '0')}`;
                      if (showDatePicker === 'start') setStartDate(formatted);
                      else setEndDate(formatted);
                    }}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.dayCellTextActive]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.confirmDateBtn} onPress={() => setShowDatePicker(null)}>
              <Text style={styles.confirmDateText}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  topNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  draftBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  draftBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },

  heroWrap: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    height: 190,
    justifyContent: 'space-between',
  },
  heroSlideItem: {
    width: SCREEN_WIDTH * 0.75,
    height: 190,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(17, 20, 34, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  locationTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.white,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
  },
  shareIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
  },
  heroSub: {
    fontSize: 11.5,
    color: '#CBD5E1',
  },
  bannerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bannerThumb: {
    width: 44,
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  bannerThumbActive: {
    borderColor: C.blue,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: C.blue,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSec,
  },
  tabTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  formContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.white,
  },

  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textSec,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    height: 46,
  },
  leftIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 12.5,
    color: C.white,
  },

  gridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPill: {
    backgroundColor: '#181C2E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  categoryPillActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  categoryPillText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  mapPreviewCard: {
    backgroundColor: '#181C2E',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  mapTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: C.blue,
    flex: 1,
  },
  distPill: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.green,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mapRouteText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },

  privacyGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  privacyTile: {
    flex: 1,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  privacyTileActive: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: C.blue,
  },
  privacyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    marginTop: 6,
  },
  privacyTitleActive: {
    color: C.white,
  },
  privacySub: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 2,
  },

  publishBtnWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  publishGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
  },
  publishText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },

  // Timeline
  timelineContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  timelineHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDotLine: {
    alignItems: 'center',
    marginRight: 12,
    width: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineVerticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: C.border,
    marginTop: 4,
  },
  timelineContentCard: {
    flex: 1,
    backgroundColor: '#181C2E',
    borderRadius: 14,
    padding: 12,
  },
  dayBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: C.blue,
    marginBottom: 2,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  timelineTime: {
    fontSize: 10,
    color: C.amber,
    marginVertical: 4,
  },
  timelineDesc: {
    fontSize: 11,
    color: C.textSec,
    lineHeight: 16,
  },

  emptyTimelineCard: {
    backgroundColor: '#181C2E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  emptyTimelineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    marginBottom: 6,
  },
  emptyTimelineSub: {
    fontSize: 11.5,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 17,
  },

  // Travelers
  travelersContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  capacityBox: {
    backgroundColor: '#181C2E',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  boxTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textSec,
    marginBottom: 10,
  },
  capacityCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 10,
  },
  counterBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
  },
  counterDisplay: {
    alignItems: 'center',
  },
  counterValueText: {
    fontSize: 24,
    fontWeight: '800',
    color: C.white,
  },
  counterSubText: {
    fontSize: 9.5,
    color: C.textSec,
  },
  seatsAvailableText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },

  participantsList: {
    gap: 8,
    marginBottom: 16,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 10,
    borderRadius: 12,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
    flex: 1,
  },
  creatorBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creatorBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
  },

  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  reqAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reqName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
  },
  reqSub: {
    fontSize: 10,
    color: C.textSec,
  },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(236,72,153,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Checklist
  checklistContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  checklistTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
    marginBottom: 4,
  },
  checklistSub: {
    fontSize: 11,
    color: C.textSec,
    marginBottom: 16,
  },
  checklistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#181C2E',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  checklistCardChecked: {
    borderColor: C.green,
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  checkItemText: {
    fontSize: 12.5,
    color: C.white,
    fontWeight: '500',
  },
  checkItemTextChecked: {
    color: C.textSec,
    textDecorationLine: 'line-through',
  },

  toastBox: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,41,59,0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 999,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },

  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 999,
  },
  dateModalCard: {
    width: '100%',
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellActive: {
    backgroundColor: C.blue,
  },
  dayCellText: {
    fontSize: 12,
    color: C.white,
  },
  dayCellTextActive: {
    fontWeight: '800',
  },
  confirmDateBtn: {
    backgroundColor: C.blue,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
});
