import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import TripDetailModal from '@/components/TripDetailModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import { BlurView } from 'expo-blur';
import {
  BadgePercent,
  Bell,
  Bike,
  Bus,
  Calendar,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Flame,
  Grid2x2,
  Headphones,
  Heart,
  Hotel,
  Home as HomeIcon,
  MapPin,
  Mountain,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
  Utensils,
  Wallet,
  X,
  Star,
  MessageSquare
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Category definitions matching the screenshot
const CATEGORIES = [
  { key: 'All', label: 'All', Icon: Grid2x2 },
  { key: 'Religious', label: 'Religious', Icon: HomeIcon },
  { key: 'Adventure', label: 'Adventure', Icon: Mountain },
  { key: 'Family Friendly', label: 'Family Friendly', Icon: Users },
  { key: 'Bike', label: 'Bike', Icon: Bike },
];

// Quick access grid items with vector icons
const QUICK_ACCESS = [
  { key: 'custom', label: 'Custom Trips', sub: 'Plan your own', Icon: Sparkles, color: '#FFB300' },
  { key: 'nearby', label: 'Nearby Trips', sub: 'Around you', Icon: MapPin, color: '#0066FF' },
  { key: 'budget', label: 'Budget Trips', sub: 'Best deals', Icon: Wallet, color: '#FFCC00' },
  { key: 'top', label: 'Top Reviewed', Icon: Flame, sub: 'Highly rated', color: '#FF3B30' },
];

// Helper: derive a badge from trip category or travelStyle (DB-driven)
const getCategoryBadge = (trip: any): { label: string; color: string; bg: string } | null => {
  const cat = (trip.category || trip.travelStyle || '').toLowerCase();
  if (cat.includes('religious') || cat.includes('spiritual')) return { label: 'Popular', color: '#FFFFFF', bg: '#6C5CE7' };
  if (cat.includes('adventure') || cat.includes('bike')) return { label: 'Adventure', color: '#FFFFFF', bg: '#2ECC71' };
  if (cat.includes('nature') || cat.includes('scenic')) return { label: 'Scenic', color: '#FFFFFF', bg: '#00B894' };
  if (cat.includes('heritage')) return { label: 'Heritage', color: '#FFFFFF', bg: '#E17055' };
  if (cat.includes('family')) return { label: 'Family', color: '#FFFFFF', bg: '#0984E3' };
  return null;
};

// Helper: format date string for display
const formatTripDate = (dateStr: string | undefined): string => {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Helper: compute duration text from start/end dates
const computeDuration = (startDate: string | undefined, endDate: string | undefined): string => {
  if (!startDate || !endDate) return 'Multi-Day';
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const nights = Math.max(0, days - 1);
    return `${nights} Night${nights !== 1 ? 's' : ''} / ${days} Day${days !== 1 ? 's' : ''}`;
  } catch {
    return 'Multi-Day';
  }
};

// Helper: derive transport label from trip name / category
const deriveTransport = (trip: any): string => {
  const name = (trip.name || '').toLowerCase();
  if (name.includes('bike') || name.includes('expedition')) return 'Bike + Fuel + Stay';
  if (name.includes('houseboat') || name.includes('backwaters')) return 'AC Bus + Houseboat';
  return 'AC Transport';
};

// Color theme system matching dark/light mode
const DARK = {
  bg: '#000000',
  card: '#111322',
  cardBorder: '#1A1D30',
  searchBg: '#111322',
  chipBg: '#111322',
  chipActive: '#0066FF',
  text: '#FFFFFF',
  textSecondary: '#7E8494',
  accent: '#0066FF',
  accentLight: 'rgba(0, 102, 255, 0.08)',
  routeColor: '#0066FF',
  priceColor: '#0066FF',
  divider: '#1A1D30',
  heartBg: 'rgba(0,0,0,0.4)',
  capsuleBg: '#1B1E30',
};

const LIGHT = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  cardBorder: '#E1E4ED',
  searchBg: '#FFFFFF',
  chipBg: '#FFFFFF',
  chipActive: '#0066FF',
  text: '#000000',
  textSecondary: '#6B7280',
  accent: '#0066FF',
  accentLight: 'rgba(0, 102, 255, 0.08)',
  routeColor: '#0066FF',
  priceColor: '#0066FF',
  divider: '#E1E4ED',
  heartBg: 'rgba(255,255,255,0.7)',
  capsuleBg: '#EEF1F6',
};

export default function SearchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const C = isDark ? DARK : LIGHT;
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);
  const { trips, joinTrip, setActiveRoomId, profile, isLoggedIn, requestedTrips, setRequestedTrips, reloadJoinRequests, setNavbarHidden } = useApp();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [likedTrips, setLikedTrips] = useState<Set<string>>(new Set());
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  // Load liked trips, join requests, and notification dot on focus / mount
  useEffect(() => {
    const fetchStates = () => {
      apiService.getLikedTrips().then((ids) => {
        if (ids && ids.length > 0) {
          setLikedTrips(new Set(ids));
        } else {
          setLikedTrips(new Set());
        }
      });

      reloadJoinRequests();

      apiService.getUnreadNotificationCount().then((res) => {
        if (res && res.count > 0) {
          setHasUnreadNotifs(true);
        } else {
          setHasUnreadNotifs(false);
        }
      });
    };

    fetchStates();
    const unsubscribe = navigation.addListener('focus', fetchStates);
    return unsubscribe;
  }, [navigation]);

  // Join modal state
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [midwayJoin, setMidwayJoin] = useState(false);
  const [startCity, setStartCity] = useState('');
  const [endCity, setEndCity] = useState('');
  const [joinedMsg, setJoinedMsg] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const handleJoinGroupChat = (tripId: string) => {
    const trip = trips.find(t => t.id === tripId);
    const roomId = trip?.chatRoomId || `room-${tripId}`;
    setActiveRoomId(roomId);
    router.push('/chat');
  };

  const toggleLike = (id: string) => {
    setLikedTrips((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Persist to backend
    apiService.toggleLikeTrip(id);
  };

  const handleMidwayJoinSelect = (trip: any) => {
    setStartCity(trip.cities[1] || '');
    setEndCity(trip.cities[trip.cities.length - 1] || '');
    setMidwayJoin(true);
  };

  const calculateMidwayPrice = (trip: any) => {
    if (!startCity || !endCity) return trip.budget;
    const startIndex = trip.cities.indexOf(startCity);
    const endIndex = trip.cities.indexOf(endCity);
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return trip.budget;
    const segmentCount = trip.cities.length - 1;
    const travelledSegments = endIndex - startIndex;
    return Math.round((trip.budget / segmentCount) * travelledSegments);
  };

  const handleRequestJoin = () => {
    if (selectedTrip) {
      joinTrip(selectedTrip.id);
      setRequestedTrips((prev) => {
        const next = new Set(prev);
        next.add(selectedTrip.id);
        return next;
      });
      // Persist join request to DB
      apiService.createJoinRequest(selectedTrip.id, {
        midway: midwayJoin,
        fromCity: midwayJoin ? startCity : undefined,
        toCity: midwayJoin ? endCity : undefined,
        adjustedPrice: midwayJoin ? calculateMidwayPrice(selectedTrip) : undefined,
      });
    }
    setJoinedMsg(true);
    setTimeout(() => {
      setJoinedMsg(false);
      setShowJoinModal(false);
      setSelectedTrip(null);
      setMidwayJoin(false);
    }, 2500);
  };

  const handleCancelRequest = () => {
    if (selectedTrip) {
      setRequestedTrips((prev) => {
        const next = new Set(prev);
        next.delete(selectedTrip.id);
        return next;
      });
      // Remove from DB
      apiService.cancelJoinRequest(selectedTrip.id);
    }
    setShowJoinModal(false);
    setSelectedTrip(null);
    setMidwayJoin(false);
  };

  // Filter & Preference Modal State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sortOption, setSortOption] = useState<'popularity' | 'price_low' | 'price_high' | 'rating'>('popularity');
  const [maxBudget, setMaxBudget] = useState<number>(50000);
  const [selectedDuration, setSelectedDuration] = useState<'ALL' | 'SHORT' | 'MEDIUM' | 'LONG'>('ALL');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [guideRequired, setGuideRequired] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<'ALL' | 'BUS' | 'BIKE'>('ALL');
  const [midwayOnly, setMidwayOnly] = useState(false);

  // Active filter count
  const activeFilterCount =
    (sortOption !== 'popularity' ? 1 : 0) +
    (maxBudget < 50000 ? 1 : 0) +
    (selectedDuration !== 'ALL' ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (guideRequired ? 1 : 0) +
    (selectedTransport !== 'ALL' ? 1 : 0) +
    (midwayOnly ? 1 : 0);

  const resetFilters = () => {
    setSortOption('popularity');
    setMaxBudget(50000);
    setSelectedDuration('ALL');
    setVerifiedOnly(false);
    setGuideRequired(false);
    setSelectedTransport('ALL');
    setMidwayOnly(false);
  };

  const getPopularityScore = (t: any) => {
    const total = t.totalSeats || 10;
    const available = t.availableSeats !== undefined ? t.availableSeats : total;
    const filled = total - available;
    return filled / total;
  };

  const filteredTrips = trips
    .filter((t) => {
      const price = t.budget;

      // Search Query Filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = t.name.toLowerCase().includes(q);
        const matchCities = t.cities.some((c) => c.toLowerCase().includes(q));
        const matchCreator = t.creator.toLowerCase().includes(q);
        const matchMeeting = t.meetingPoint.toLowerCase().includes(q);
        if (!matchName && !matchCities && !matchCreator && !matchMeeting) return false;
      }

      // Category Chip Filter — uses trip.category from DB
      if (selectedCategory !== 'All') {
        const tripCat = (t.category || '').toLowerCase();
        const tripName = (t.name || '').toLowerCase();
        if (selectedCategory === 'Religious') {
          if (!tripCat.includes('religious') && !tripName.includes('spiritual') && !tripName.includes('varanasi')) return false;
        } else if (selectedCategory === 'Adventure') {
          if (!tripCat.includes('adventure') && !tripName.includes('bike') && !tripName.includes('expedition')) return false;
        } else if (selectedCategory === 'Family Friendly') {
          if (!tripCat.includes('family') && !tripCat.includes('heritage') && !tripCat.includes('nature')) return false;
        } else if (selectedCategory === 'Bike') {
          if (!tripName.includes('bike') && !tripName.includes('expedition')) return false;
        }
      }

      // Max Budget Filter
      if (maxBudget < 50000 && price > maxBudget) return false;

      // Verified Organizers Filter — check for (Organizer) tag from DB
      if (verifiedOnly && !t.creator.includes('Organizer') && !t.creator.includes('Guide')) return false;

      // Guide Included Filter
      if (guideRequired && !t.guideIncluded) return false;

      // Duration Filter — compute from dates
      const duration = computeDuration(t.startDate, t.endDate);
      const dayMatch = duration.match(/(\d+)\s*Day/);
      const totalDays = dayMatch ? parseInt(dayMatch[1], 10) : 5;
      if (selectedDuration === 'SHORT' && totalDays > 3) return false;
      if (selectedDuration === 'MEDIUM' && (totalDays < 4 || totalDays > 7)) return false;
      if (selectedDuration === 'LONG' && totalDays < 8) return false;

      // Transport Mode Filter
      const transport = deriveTransport(t);
      if (selectedTransport === 'BIKE' && !transport.toLowerCase().includes('bike')) return false;
      if (selectedTransport === 'BUS' && !transport.toLowerCase().includes('bus') && !transport.toLowerCase().includes('ac')) return false;

      // Midway Join Filter
      if (midwayOnly && t.cities.length < 3) return false;

      return true;
    })
    .sort((a, b) => {
      const priceA = a.budget;
      const priceB = b.budget;

      if (sortOption === 'price_low') {
        return priceA - priceB;
      } else if (sortOption === 'price_high') {
        return priceB - priceA;
      } else if (sortOption === 'rating') {
        return (b.membersCount || 0) - (a.membersCount || 0);
      }

      const scoreA = getPopularityScore(a);
      const scoreB = getPopularityScore(b);
      
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      
      return (a.membersCount || 0) - (b.membersCount || 0);
    });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: C.bg }]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* ─── SEARCH INPUT AND BELL ─────────────────────────────── */}
        <View style={styles.searchBarRow}>
          <View style={[styles.searchContainer, { backgroundColor: C.searchBg, borderColor: C.cardBorder }]}>
            <Search size={20} color={C.textSecondary} />
            <TextInput
              placeholder="Search by state, city, guide..."
              placeholderTextColor={C.textSecondary}
              style={[styles.searchInput, { color: C.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              style={[styles.filterIconBtn, activeFilterCount > 0 && { backgroundColor: C.accentLight, borderColor: C.accent }]}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => setShowFilterModal(true)}
            >
              <SlidersHorizontal size={18} color={activeFilterCount > 0 ? C.accent : C.textSecondary} />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.notifBtn, { backgroundColor: C.searchBg, borderColor: C.cardBorder }]}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => router.push('/notifications')}
          >
            <Bell size={20} color={C.textSecondary} />
            {hasUnreadNotifs && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>

        {/* ─── CATEGORIES CHIPS ───────────────────────────────────── */}
        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.key;
              const isAllGradient = isActive;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setSelectedCategory(cat.key)}
                  activeOpacity={0.7}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? (isAllGradient ? 'transparent' : C.chipActive) : C.chipBg,
                      borderColor: isActive ? (isAllGradient ? '#0A0B10' : C.chipActive) : C.cardBorder,
                      shadowColor: isAllGradient ? '#0055ff' : 'transparent',
                      shadowOffset: isAllGradient ? { width: 0, height: 2 } : { width: 0, height: 0 },
                      shadowOpacity: isAllGradient ? 0.35 : 0,
                      shadowRadius: isAllGradient ? 6 : 0,
                      elevation: isAllGradient ? 3 : 0,
                      overflow: 'hidden',
                    },
                  ]}
                >
                  {isAllGradient && (
                    <LinearGradient
                      colors={['#07080E', '#001D6E', '#0047C4', '#0066FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <cat.Icon size={14} color={isActive ? '#FFF' : C.textSecondary} style={{ zIndex: 1 }} />
                  <Text style={[styles.chipText, { color: isActive ? '#FFF' : C.textSecondary, zIndex: 1 }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── ACTIVE FILTER TAGS ROW ─────────────────────────── */}
        {activeFilterCount > 0 && (
          <View style={styles.activeFilterTagsRow}>
            <Text style={[styles.activeFilterLabel, { color: C.textSecondary }]}>Filters:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {sortOption !== 'popularity' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>Sort: {sortOption.replace('_', ' ')}</Text>
                  <TouchableOpacity onPress={() => setSortOption('popularity')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {maxBudget < 50000 && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>Max ₹{maxBudget.toLocaleString('en-IN')}</Text>
                  <TouchableOpacity onPress={() => setMaxBudget(50000)}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {selectedDuration !== 'ALL' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>Duration: {selectedDuration}</Text>
                  <TouchableOpacity onPress={() => setSelectedDuration('ALL')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {verifiedOnly && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>Verified Organizers</Text>
                  <TouchableOpacity onPress={() => setVerifiedOnly(false)}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {guideRequired && (
                <View style={[styles.filterTagPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
                  <Text style={[styles.filterTagText, { color: '#10B981' }]}>Guide Included</Text>
                  <TouchableOpacity onPress={() => setGuideRequired(false)}>
                    <X size={12} color="#10B981" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {selectedTransport !== 'ALL' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>Transport: {selectedTransport}</Text>
                  <TouchableOpacity onPress={() => setSelectedTransport('ALL')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {midwayOnly && (
                <View style={[styles.filterTagPill, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]}>
                  <Text style={[styles.filterTagText, { color: '#F59E0B' }]}>Midway Join</Text>
                  <TouchableOpacity onPress={() => setMidwayOnly(false)}>
                    <X size={12} color="#F59E0B" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={styles.clearAllPill} onPress={resetFilters}>
                <RotateCcw size={12} color="#FF3B30" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#FF3B30', marginLeft: 4 }}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const diff = y - lastScrollYRef.current;
            if (diff > 10 && !navbarHiddenRef.current) {
              navbarHiddenRef.current = true;
              setNavbarHidden(true);
            } else if (diff < -8 && navbarHiddenRef.current) {
              navbarHiddenRef.current = false;
              setNavbarHidden(false);
            }
            lastScrollYRef.current = y;
          }}
        >
          {/* ─── QUICK ACCESS GRID (VECTOR ICONS) ────────────────── */}
          <View style={styles.quickGrid}>
            {QUICK_ACCESS.map((item) => (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.7}
                style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
                onPress={() => {
                  if (item.key === 'custom') {
                    router.push('/create');
                  } else if (item.key === 'nearby') {
                    router.push('/nearby-trips');
                  } else if (item.key === 'budget') {
                    router.push('/budget-trips');
                  } else if (item.key === 'top') {
                    router.push('/top-reviewed');
                  }
                }}
              >
                <View style={[styles.quickIconCircle, { backgroundColor: item.color + '15' }]}>
                  <item.Icon size={18} color={item.color} />
                </View>
                <Text style={[styles.quickLabel, { color: C.text }]}>{item.label}</Text>
                <Text style={[styles.quickSub, { color: C.textSecondary }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ─── POPULARITY HEADER ───────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              TRIPS BY POPULARITY ({filteredTrips.length} {filteredTrips.length === 1 ? 'TRIP' : 'TRIPS'})
            </Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.resetInlineBtn} onPress={resetFilters}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF3B30' }}>Reset Filters</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ─── EMPTY STATE WHEN NO TRIPS MATCH FILTERS ────────── */}
          {filteredTrips.length === 0 && (
            <View style={[styles.emptyStateCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
              <SlidersHorizontal size={36} color={C.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyStateTitle, { color: C.text }]}>No Matching Trips Found</Text>
              <Text style={[styles.emptyStateSub, { color: C.textSecondary }]}>
                No tour routes match your current search query or filter preferences. Try adjusting budget or resetting filters.
              </Text>
              <TouchableOpacity style={styles.resetEmptyBtn} onPress={resetFilters}>
                <Text style={styles.resetEmptyBtnText}>Reset Preferences</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── TRIP CARDS (MATCHING THE SCREENSHOT EXACTLY) ───── */}
          {filteredTrips.map((trip) => {
            // All display data comes from the trip object (populated from DB)
            const duration = computeDuration(trip.startDate, trip.endDate);
            const transport = deriveTransport(trip);
            const displayCities = trip.cities;
            const displayPrice = trip.budget;
            const displayMeeting = trip.meetingPoint;
            const displayDate = formatTripDate(trip.startDate);
            const badge = getCategoryBadge(trip);
            // Use coverImage from DB, fallback to generic scenic photo
            const imageUri = trip.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&q=80';
            const imageSource = typeof imageUri === 'string' ? { uri: imageUri } : imageUri;
            const isLiked = likedTrips.has(trip.id);
            const isMyTrip = isLoggedIn && (trip.isMyTrip === true || !!(profile && profile.id && trip.creatorId && trip.creatorId === profile.id));


            return (
              <TouchableOpacity
                key={trip.id}
                activeOpacity={isMyTrip ? 1 : 0.85}
                disabled={isMyTrip}
                onPress={() => {
                  setSelectedTrip(trip);
                  setShowJoinModal(true);
                }}
                style={[
                  styles.tripCard,
                  { backgroundColor: C.card, borderColor: C.cardBorder },
                  isMyTrip && { opacity: 0.65 }
                ]}
              >
                {isMyTrip && (
                  <LinearGradient
                    colors={isDark ? ['#141629', '#101220', '#0A0B14'] : ['#F2F5FA', '#FAFBFD', '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                  />
                )}
                {/* Left side: Image */}
                <View style={styles.tripImageContainer}>
                  <Image source={imageSource} style={styles.tripImage} />
                  {/* Subtle dark vignette overlay to make borders darker and enhance readability */}
                  <LinearGradient
                    colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Pill Badge */}
                  {isMyTrip ? (
                    <View style={[styles.tripBadge, { backgroundColor: C.accent }]}>
                      <Text style={[styles.tripBadgeText, { color: '#FFF', fontWeight: '800' }]}>Yours</Text>
                    </View>
                  ) : badge && (
                    <View style={[styles.tripBadge, { backgroundColor: badge.bg }]}>
                      <Text style={styles.tripBadgeText}>{badge.label}</Text>
                    </View>
                  )}
                  {/* Heart button */}
                  {!isMyTrip && (
                    <TouchableOpacity
                      style={[styles.heartBtn, { backgroundColor: C.heartBg }]}
                      onPress={() => toggleLike(trip.id)}
                    >
                      <Heart
                        size={14}
                        color={isLiked ? '#FF3B30' : '#FFF'}
                        fill={isLiked ? '#FF3B30' : 'transparent'}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Right side: Detailed trip content */}
                <View style={styles.tripContent}>
                  {/* Title and Verified badge */}
                  <View style={styles.tripHeaderRow}>
                    <Text style={[styles.tripName, { color: C.text }]} numberOfLines={3}>
                      {trip.name}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 4 }}>
                    <View style={[styles.verifiedBadge, { backgroundColor: isMyTrip ? C.capsuleBg : C.accentLight, marginTop: 0, marginBottom: 0 }]}>
                      <Check size={9} color={isMyTrip ? C.textSecondary : C.accent} strokeWidth={3} />
                      <Text style={[styles.verifiedText, { color: isMyTrip ? C.textSecondary : C.accent }]}>Verified Route</Text>
                    </View>
                    <Text style={{ fontSize: 9.5, fontWeight: '600', color: isMyTrip ? C.textSecondary : '#10B981' }}>{trip.availableSeats ?? 0} left</Text>
                  </View>

                  {/* Route cities with arrow */}
                  <View style={styles.routeCities}>
                    {displayCities.map((city, i) => (
                      <React.Fragment key={city}>
                        <Text style={[styles.cityText, { color: isMyTrip ? C.textSecondary : C.routeColor }]}>{city}</Text>
                        {i < displayCities.length - 1 && (
                          <Text style={[styles.routeArrow, { color: C.textSecondary }]}>→</Text>
                        )}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* 2x2 grid of pill capsules */}
                  <View style={styles.capsulesContainer}>
                    <View style={styles.capsulesRow}>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        <MapPin size={9} color={C.textSecondary} />
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {displayMeeting}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        <Calendar size={9} color={C.textSecondary} />
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {displayDate}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.capsulesRow}>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        <Clock size={9} color={C.textSecondary} />
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {duration}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        {trip.name.toLowerCase().includes('bike') ? (
                          <Bike size={9} color={C.textSecondary} />
                        ) : (
                          <Bus size={9} color={C.textSecondary} />
                        )}
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {transport}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Price and Action Button row */}
                  <View style={[styles.priceRow, { borderTopColor: C.divider }]}>
                    <View style={{ flex: 1, marginRight: 4 }}>
                      <Text style={[styles.priceLabel, { color: C.textSecondary }]} numberOfLines={1}>Full Trip Cost</Text>
                      <Text style={[styles.priceAmount, { color: isMyTrip ? C.textSecondary : C.priceColor }]} numberOfLines={1}>
                        ₹{displayPrice}
                      </Text>
                      <Text style={[styles.pricePer, { color: C.textSecondary, marginTop: -2 }]} numberOfLines={1}>per person</Text>
                    </View>
                    <View style={{ gap: 4, flexShrink: 0, width: 120 }}>
                      {isMyTrip ? (
                        <View style={[styles.myTripBadge, { backgroundColor: isDark ? 'rgba(0, 102, 255, 0.12)' : 'rgba(0, 102, 255, 0.06)', borderColor: isDark ? 'rgba(0, 102, 255, 0.35)' : 'rgba(0, 102, 255, 0.22)' }]}>
                          <Sparkles size={11} color={C.accent} style={{ marginRight: 4 }} />
                          <Text style={[styles.myTripBadgeText, { color: C.accent, fontWeight: '800' }]}>Your Creation</Text>
                        </View>
                      ) : requestedTrips.has(trip.id) ? (
                        <View style={[styles.joinBtn, styles.joinBtnRequested]}>
                          <Check size={11} color="#2ECC71" style={{ marginRight: 4 }} />
                          <Text style={[styles.joinBtnText, styles.joinBtnRequestedText]} numberOfLines={1}>
                            Requested
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.joinBtn}
                          onPress={() => {
                            setSelectedTrip(trip);
                            setShowJoinModal(true);
                          }}
                        >
                          <Text style={styles.joinBtnText} numberOfLines={1}>Request to Join</Text>
                          <ChevronRight size={11} color="#FFF" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
                {isMyTrip && (
                  <BlurView
                    intensity={isDark ? 55 : 45}
                    tint={isDark ? "dark" : "light"}
                    style={[styles.myTripOverlay, { backgroundColor: isDark ? 'rgba(10, 12, 22, 0.35)' : 'rgba(255, 255, 255, 0.4)' }]}
                  />
                )}
              </TouchableOpacity>
            );
          })}

          {/* ─── CTA BANNER ────────────────────────────────────── */}
          <View style={styles.ctaBannerContainer}>
            <Image
              source={require('@/assets/images/cta-banner.png')}
              style={styles.ctaBannerImage}
            />
            <Pressable
              onPress={() => {
                router.push('/create');
              }}
              style={({ pressed }) => [
                styles.ctaHotspot,
                pressed && {
                  backgroundColor: 'rgba(255, 255, 255, 0.16)',
                  transform: [{ scale: 0.94 }],
                },
              ]}
            />
          </View>

          {/* ─── TRUST BADGES ──────────────────────────────────── */}
          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <View style={[styles.trustIcon, { backgroundColor: C.accentLight }]}>
                <Shield size={16} color={C.accent} />
              </View>
              <Text style={[styles.trustLabel, { color: C.text }]}>Verified Routes</Text>
              <Text style={[styles.trustSub, { color: C.textSecondary }]}>Safe & Trusted</Text>
            </View>
            <View style={styles.trustItem}>
              <View style={[styles.trustIcon, { backgroundColor: 'rgba(46, 204, 113, 0.08)' }]}>
                <UserCheck size={16} color="#2ECC71" />
              </View>
              <Text style={[styles.trustLabel, { color: C.text }]}>Expert Trip Leaders</Text>
              <Text style={[styles.trustSub, { color: C.textSecondary }]}>Experienced Guides</Text>
            </View>
            <View style={styles.trustItem}>
              <View style={[styles.trustIcon, { backgroundColor: 'rgba(255, 204, 0, 0.08)' }]}>
                <BadgePercent size={16} color="#FFCC00" />
              </View>
              <Text style={[styles.trustLabel, { color: C.text }]}>Best Price Guarantee</Text>
              <Text style={[styles.trustSub, { color: C.textSecondary }]}>No Hidden Costs</Text>
            </View>
            <View style={styles.trustItem}>
              <View style={[styles.trustIcon, { backgroundColor: 'rgba(108, 92, 231, 0.08)' }]}>
                <Headphones size={16} color="#6C5CE7" />
              </View>
              <Text style={[styles.trustLabel, { color: C.text }]}>24/7 Support</Text>
              <Text style={[styles.trustSub, { color: C.textSecondary }]}>We're Here</Text>
            </View>
          </View>

          {/* Padding at the bottom for safety */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </Animated.View>

      <TripDetailModal
        visible={showJoinModal}
        trip={selectedTrip}
        onClose={() => setShowJoinModal(false)}
      />

      {/* ─── FILTER & PREFERENCES MODAL ───────────────────────── */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterModal(false)}
          />
          <View style={[styles.filterSheet, { backgroundColor: isDark ? '#111322' : '#FFFFFF' }]}>
            {/* Header */}
            <View style={[styles.filterHeader, { borderBottomColor: C.divider }]}>
              <View style={styles.filterTitleRow}>
                <SlidersHorizontal size={20} color={C.accent} />
                <Text style={[styles.filterSheetTitle, { color: C.text }]}>Filters & Preferences</Text>
                {activeFilterCount > 0 && (
                  <View style={styles.activeFilterCountBadge}>
                    <Text style={styles.activeFilterCountText}>{activeFilterCount} active</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity onPress={resetFilters} activeOpacity={0.7}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FF3B30' }}>Reset All</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowFilterModal(false)}
                  style={[styles.closeIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                >
                  <X size={18} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {/* Section 1: SORT BY */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>SORT RESULTS BY</Text>
                <View style={styles.filterChipsWrap}>
                  {[
                    { key: 'popularity', label: 'Popularity: Low to High' },
                    { key: 'price_low', label: 'Price: Low to High' },
                    { key: 'price_high', label: 'Price: High to Low' },
                    { key: 'rating', label: 'Highest Rated' },
                  ].map((opt) => {
                    const isSelected = sortOption === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setSortOption(opt.key as any)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.accent : (isDark ? '#1A1D30' : '#F0F2F6'),
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 2: MAXIMUM BUDGET */}
              <View style={styles.filterSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>MAXIMUM BUDGET PER PERSON</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent }}>
                    {maxBudget >= 50000 ? 'Any Budget' : `₹${maxBudget.toLocaleString('en-IN')}`}
                  </Text>
                </View>
                <View style={styles.filterChipsWrap}>
                  {[
                    { val: 50000, label: 'Any' },
                    { val: 10000, label: 'Under ₹10k' },
                    { val: 15000, label: 'Under ₹15k' },
                    { val: 20000, label: 'Under ₹20k' },
                    { val: 30000, label: 'Under ₹30k' },
                  ].map((b) => {
                    const isSelected = maxBudget === b.val;
                    return (
                      <TouchableOpacity
                        key={b.val}
                        onPress={() => setMaxBudget(b.val)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.accent : (isDark ? '#1A1D30' : '#F0F2F6'),
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {b.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 3: TRIP DURATION */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>TRIP DURATION</Text>
                <View style={styles.filterChipsWrap}>
                  {[
                    { key: 'ALL', label: 'Any Duration' },
                    { key: 'SHORT', label: '1 - 3 Days' },
                    { key: 'MEDIUM', label: '4 - 7 Days' },
                    { key: 'LONG', label: '8+ Days' },
                  ].map((dur) => {
                    const isSelected = selectedDuration === dur.key;
                    return (
                      <TouchableOpacity
                        key={dur.key}
                        onPress={() => setSelectedDuration(dur.key as any)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.accent : (isDark ? '#1A1D30' : '#F0F2F6'),
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {dur.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 4: TRANSPORT MODE */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>TRANSPORT MODE</Text>
                <View style={styles.filterChipsWrap}>
                  {[
                    { key: 'ALL', label: 'All Modes' },
                    { key: 'BUS', label: 'AC Bus / Coach' },
                    { key: 'BIKE', label: 'Bike Expedition' },
                  ].map((tr) => {
                    const isSelected = selectedTransport === tr.key;
                    return (
                      <TouchableOpacity
                        key={tr.key}
                        onPress={() => setSelectedTransport(tr.key as any)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.accent : (isDark ? '#1A1D30' : '#F0F2F6'),
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {tr.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 5: SPECIAL PREFERENCES */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>PREFERENCES & HOSTING</Text>

                {/* Switch 1: Verified Hosts Only */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: isDark ? '#1A1D30' : '#F0F2F6' }]}
                  onPress={() => setVerifiedOnly(!verifiedOnly)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Shield size={18} color={C.accent} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>Verified Organizers Only</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>Only show background-verified group leaders</Text>
                    </View>
                  </View>
                  <View style={[styles.toggleTrack, verifiedOnly ? { backgroundColor: C.accent } : { backgroundColor: 'rgba(120,120,128,0.3)' }]}>
                    <View style={[styles.toggleCircle, verifiedOnly ? styles.circleOn : styles.circleOff]} />
                  </View>
                </TouchableOpacity>

                {/* Switch 2: Local Guide Included */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: isDark ? '#1A1D30' : '#F0F2F6', marginTop: 8 }]}
                  onPress={() => setGuideRequired(!guideRequired)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <UserCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>Certified Guide Included</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>Trips with expert local travel guide on board</Text>
                    </View>
                  </View>
                  <View style={[styles.toggleTrack, guideRequired ? { backgroundColor: '#10B981' } : { backgroundColor: 'rgba(120,120,128,0.3)' }]}>
                    <View style={[styles.toggleCircle, guideRequired ? styles.circleOn : styles.circleOff]} />
                  </View>
                </TouchableOpacity>

                {/* Switch 3: Midway Segment Join Option */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: isDark ? '#1A1D30' : '#F0F2F6', marginTop: 8 }]}
                  onPress={() => setMidwayOnly(!midwayOnly)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <MapPin size={18} color="#F59E0B" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>Midway Segment Join Available</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>Allows joining route from intermediate cities</Text>
                    </View>
                  </View>
                  <View style={[styles.toggleTrack, midwayOnly ? { backgroundColor: '#F59E0B' } : { backgroundColor: 'rgba(120,120,128,0.3)' }]}>
                    <View style={[styles.toggleCircle, midwayOnly ? styles.circleOn : styles.circleOff]} />
                  </View>
                </TouchableOpacity>
              </View>

            </ScrollView>

            {/* Footer */}
            <View style={[styles.filterFooter, { borderTopColor: C.divider }]}>
              <TouchableOpacity
                style={styles.applyFilterBtn}
                activeOpacity={0.85}
                onPress={() => setShowFilterModal(false)}
              >
                <LinearGradient
                  colors={['#0047C4', '#0066FF', '#00D0FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyFilterBtnGradient}
                >
                  <Text style={styles.applyFilterBtnText}>
                    Apply Preferences ({filteredTrips.length} {filteredTrips.length === 1 ? 'Trip' : 'Trips'})
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Style Declarations ─────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  myTripBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    alignSelf: 'flex-end',
  },
  myTripBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  myTripOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },

  // Search input bar row
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },
  filterIcon: {
    padding: 4,
  },
  notifBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF3B30',
  },

  // Category horizontal scroll
  chipRow: {
    marginBottom: 16,
  },
  chipScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  scrollContent: {
    paddingHorizontal: 16,
  },

  // 4x1 Column grid for Quick Access
  quickGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
  },
  quickCard: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    gap: 2,
  },
  quickIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  quickLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickSub: {
    fontSize: 8,
    textAlign: 'center',
  },

  // Section titles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Customized Horizontal Card Design
  tripCard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    minHeight: 200,
  },
  tripImageContainer: {
    width: 115,
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
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFF',
  },
  heartBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tripContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: 4,
  },
  tripName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  verifiedText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  routeArrow: {
    fontSize: 10,
    marginHorizontal: 3,
  },
  capsulesContainer: {
    gap: 4,
    marginVertical: 4,
  },
  capsulesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    borderRadius: 6,
    gap: 3,
  },
  capsuleText: {
    fontSize: 8.5,
    fontWeight: '600',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 1,
  },
  priceInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '900',
  },
  pricePer: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 3,
    flexShrink: 0,
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  ctaBannerContainer: {
    width: '100%',
    aspectRatio: 3.0,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 24,
    position: 'relative',
  },
  ctaBannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  ctaHotspot: {
    position: 'absolute',
    left: '4.2%',
    bottom: '25.5%',
    width: '20.8%',
    height: '18.5%',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },

  // Bottom Trust badges
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  trustItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trustIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  trustLabel: {
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
  },
  trustSub: {
    fontSize: 7,
    textAlign: 'center',
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  modalContent: {
    width: '100%',
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  successSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTripName: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalOrganizerText: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modalForm: {
    flex: 1,
    marginBottom: 0,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  formSectionTitle: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 10,
  },
  modalItineraryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  itineraryCityCard: {
    padding: 8,
    borderRadius: 8,
  },
  itineraryCityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  toggleSwitch: {
    width: 48,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchOn: {
    backgroundColor: '#2ECC71',
  },
  toggleSwitchOff: {
    backgroundColor: '#555',
  },
  toggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  circleOn: {
    alignSelf: 'flex-end',
  },
  circleOff: {
    alignSelf: 'flex-start',
  },
  midwaySection: {
    backgroundColor: 'rgba(0,102,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
  },
  midwaySectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  selectorGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 10,
    marginBottom: 4,
  },
  pickerBox: {
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  pickerInput: {
    fontSize: 12,
    padding: 0,
  },
  priceCalcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  tripMetaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metaCell: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
  },
  metaCellValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  modalSubmitBtn: {
    backgroundColor: '#0066FF',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalSubmitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // ─── Filter & Preferences Modal Styles ───────────
  filterIconBtn: {
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0066FF',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  activeFilterTagsRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeFilterLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 6,
  },
  filterTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearAllPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  emptyStateCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginVertical: 16,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyStateSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  resetEmptyBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  resetEmptyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  resetInlineBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  filterSheet: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  filterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  activeFilterCountBadge: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  activeFilterCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066FF',
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterSelectChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  prefToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
  },
  prefToggleTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  prefToggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  filterFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  applyFilterBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  applyFilterBtnGradient: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFilterBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  citySelectScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  citySelectChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  citySelectChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  citySelectChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalOrganizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  organizerAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOrganizerName: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 16,
  },
  detailCardHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailCardVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  detailCardDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 12,
  },
  meetingPointInfoCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  meetingPointValText: {
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  inclusionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  inclusionCell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    padding: 10,
    borderRadius: 12,
    gap: 6,
  },
  inclusionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  joinBtnRequested: {
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderColor: '#2ECC71',
    borderWidth: 1,
  },
  joinBtnRequestedText: {
    color: '#2ECC71',
    fontWeight: '700',
  },

  // Cancel request action area in expanded modal
  requestedActionArea: {
    gap: 10,
    marginTop: 4,
  },
  requestedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  requestedStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestedStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 2,
  },
  requestedStatusSub: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  cancelRequestBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  cancelRequestBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    letterSpacing: 0.2,
  },

  // Pricing bar
  pricingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
  },
  pricingBarLeft: {
    flex: 1,
  },
  pricingBarRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  pricingBarLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pricingBarAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  pricingBarCurrency: {
    fontSize: 14,
    fontWeight: '700',
  },
  pricingBarAmount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pricingBarSeatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  pricingBarSeats: {
    fontSize: 12,
    fontWeight: '700',
  },
  pricingBarDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 16,
  },

  // Legacy — kept for safety
  requestedStatusBadge: {},
  requestedStatusText: {},
});
