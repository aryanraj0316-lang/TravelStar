import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
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
  Home as HomeIcon,
  MapPin,
  Mountain,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  X
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
import { SafeAreaView } from 'react-native-safe-area-context';

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

// Trip images mapping
const TRIP_IMAGES: Record<string, any> = {
  'trip-1': require('@/assets/images/spiritual-journey.png'),
  'trip-2': require('@/assets/images/leh-expedition.jpg'),
  'trip-3': require('@/assets/images/kerala.jpg'),
};

const TRIP_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  'trip-1': { label: 'Popular', color: '#FFFFFF', bg: '#6C5CE7' },
  'trip-2': { label: 'Adventure', color: '#FFFFFF', bg: '#2ECC71' },
  'trip-3': { label: 'Scenic', color: '#FFFFFF', bg: '#00B894' },
};

// Exact details for each trip matching the screenshot
const TRIP_EXTRA: Record<string, { duration: string; transport: string; displayCities: string[]; displayPrice: number; displayMeeting: string; displayDate: string }> = {
  'trip-1': {
    duration: '7 Nights / 8 Days',
    transport: 'AC Transport',
    displayCities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    displayPrice: 8500,
    displayMeeting: 'Ranchi Jn. PF 1',
    displayDate: '25 May 2025',
  },
  'trip-2': {
    duration: '10 Nights / 11 Days',
    transport: 'Bike + Fuel + Stay',
    displayCities: ['Delhi', 'Manali', 'Leh', 'Pangong', 'Nubra'],
    displayPrice: 16500,
    displayMeeting: 'Delhi Aerocity',
    displayDate: '10 Jun 2025',
  },
  'trip-3': {
    duration: '5 Nights / 6 Days',
    transport: 'AC Bus + Houseboat',
    displayCities: ['Kochi', 'Munnar', 'Alleppey'],
    displayPrice: 15000,
    displayMeeting: 'Kochi Airport T1',
    displayDate: '25 Aug 2025',
  },
};

// Color theme system matching dark/light mode
const DARK = {
  bg: '#060814',
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
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const C = isDark ? DARK : LIGHT;
  const { trips } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [likedTrips, setLikedTrips] = useState<Set<string>>(new Set());

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

  const toggleLike = (id: string) => {
    setLikedTrips((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    setJoinedMsg(true);
    setTimeout(() => {
      setJoinedMsg(false);
      setShowJoinModal(false);
      setSelectedTrip(null);
      setMidwayJoin(false);
    }, 2500);
  };

  const filteredTrips = trips.filter((t) => {
    if (selectedCategory === 'All') return true;
    if (selectedCategory === 'Religious' && t.name.toLowerCase().includes('spiritual')) return true;
    if (selectedCategory === 'Adventure' && t.name.toLowerCase().includes('bike')) return true;
    if (selectedCategory === 'Family Friendly' && t.cities.includes('Vrindavan')) return true;
    if (selectedCategory === 'Bike' && t.name.toLowerCase().includes('bike')) return true;
    return false;
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
            <TouchableOpacity style={styles.filterIcon}>
              <SlidersHorizontal size={18} color={C.accent} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.notifBtn, { backgroundColor: C.searchBg, borderColor: C.cardBorder }]}>
            <Bell size={20} color={C.textSecondary} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        {/* ─── CATEGORIES CHIPS ───────────────────────────────────── */}
        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.key;
              const isAllGradient = cat.key === 'All' && isActive;
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

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* ─── QUICK ACCESS GRID (VECTOR ICONS) ────────────────── */}
          <View style={styles.quickGrid}>
            {QUICK_ACCESS.map((item) => (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.7}
                style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
              >
                <View style={[styles.quickIconCircle, { backgroundColor: item.color + '15' }]}>
                  <item.Icon size={18} color={item.color} />
                </View>
                <Text style={[styles.quickLabel, { color: C.text }]}>{item.label}</Text>
                <Text style={[styles.quickSub, { color: C.textSecondary }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ─── RECOMMENDED HEADER ─────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>RECOMMENDED FOR YOU</Text>
            <TouchableOpacity style={styles.viewAllBtn}>
              <Text style={[styles.viewAllText, { color: C.accent }]}>View all</Text>
              <ChevronRight size={14} color={C.accent} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          </View>

          {/* ─── TRIP CARDS (MATCHING THE SCREENSHOT EXACTLY) ───── */}
          {filteredTrips.map((trip) => {
            const extra = TRIP_EXTRA[trip.id] || {
              duration: '5 Nights / 6 Days',
              transport: 'AC Transport',
              displayCities: trip.cities,
              displayPrice: trip.budget,
              displayMeeting: trip.meetingPoint,
              displayDate: trip.startDate,
            };
            const badge = TRIP_BADGES[trip.id];
            const imageUri = TRIP_IMAGES[trip.id] || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&q=80';
            const imageSource = typeof imageUri === 'string' ? { uri: imageUri } : imageUri;
            const isLiked = likedTrips.has(trip.id);

            return (
              <TouchableOpacity
                key={trip.id}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedTrip(trip);
                  setShowJoinModal(true);
                }}
                style={[styles.tripCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
              >
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
                  {badge && (
                    <View style={[styles.tripBadge, { backgroundColor: badge.bg }]}>
                      <Text style={styles.tripBadgeText}>{badge.label}</Text>
                    </View>
                  )}
                  {/* Heart button */}
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
                </View>

                {/* Right side: Detailed trip content */}
                <View style={styles.tripContent}>
                  {/* Title and Verified badge */}
                  <View style={styles.tripHeaderRow}>
                    <Text style={[styles.tripName, { color: C.text }]} numberOfLines={3}>
                      {trip.name}
                    </Text>
                  </View>

                  <View style={[styles.verifiedBadge, { backgroundColor: C.accentLight, marginTop: 2, marginBottom: 4 }]}>
                    <Check size={9} color={C.accent} strokeWidth={3} />
                    <Text style={[styles.verifiedText, { color: C.accent }]}>Verified Route</Text>
                  </View>

                  {/* Route cities with arrow */}
                  <View style={styles.routeCities}>
                    {extra.displayCities.map((city, i) => (
                      <React.Fragment key={city}>
                        <Text style={[styles.cityText, { color: C.routeColor }]}>{city}</Text>
                        {i < extra.displayCities.length - 1 && (
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
                          {extra.displayMeeting}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        <Calendar size={9} color={C.textSecondary} />
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {extra.displayDate}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.capsulesRow}>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        <Clock size={9} color={C.textSecondary} />
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {extra.duration}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: C.capsuleBg }]}>
                        {trip.name.toLowerCase().includes('bike') ? (
                          <Bike size={9} color={C.textSecondary} />
                        ) : (
                          <Bus size={9} color={C.textSecondary} />
                        )}
                        <Text style={[styles.capsuleText, { color: C.textSecondary }]} numberOfLines={1}>
                          {extra.transport}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Price and Action Button row */}
                  <View style={[styles.priceRow, { borderTopColor: C.divider }]}>
                    <View style={{ flex: 1, marginRight: 4 }}>
                      <Text style={[styles.priceLabel, { color: C.textSecondary }]} numberOfLines={1}>Full Trip Cost</Text>
                      <Text style={[styles.priceAmount, { color: C.priceColor }]} numberOfLines={1}>
                        ₹{extra.displayPrice}
                      </Text>
                      <Text style={[styles.pricePer, { color: C.textSecondary, marginTop: -2 }]} numberOfLines={1}>per person</Text>
                    </View>
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
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* ─── CTA BANNER ────────────────────────────────────── */}
          <View style={styles.ctaBannerContainer}>
            <Image
              source={require('@/assets/images/cta-banner.png')}
              style={styles.ctaBannerImage}
            />
            {/* Clickable hotspot aligned precisely with the 'Plan My Trip' button on the image */}
            <Pressable
              onPress={() => {
                alert("Plan My Trip clicked! Connecting to our travel experts...");
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

      {/* ─── JOIN MODAL ─────────────────────────────────────────── */}
      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#111322' : '#FFF', borderColor: C.cardBorder }]}>
            {joinedMsg ? (
              <View style={styles.successContainer}>
                <CheckCircle size={54} color="#2ECC71" />
                <Text style={[styles.successTitle, { color: C.text }]}>Request Submitted!</Text>
                <Text style={[styles.successSub, { color: C.textSecondary }]}>
                  {midwayJoin
                    ? `Midway request (${startCity} → ${endCity}) sent to organizer. Adjusted price: ₹${selectedTrip ? calculateMidwayPrice(selectedTrip) : 0}.`
                    : 'Join request sent to the group organizer.'}
                </Text>
              </View>
            ) : (
              selectedTrip && (
                <View style={{ flex: 1 }}>
                  {/* Modal Header */}
                  <View style={styles.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalTripName, { color: C.text }]}>{selectedTrip.name}</Text>
                      <Text style={[styles.modalOrganizerText, { color: C.textSecondary }]}>
                        Organized by {selectedTrip.creator}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowJoinModal(false); setMidwayJoin(false); }}
                      style={styles.closeBtn}
                    >
                      <X size={20} color={C.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
                    {/* Itinerary */}
                    <Text style={[styles.formSectionTitle, { color: C.textSecondary }]}>ITINERARY PATH</Text>
                    <View style={styles.modalItineraryRow}>
                      {selectedTrip.cities.map((city: string, i: number) => (
                        <View key={city} style={[styles.itineraryCityCard, { backgroundColor: C.accentLight }]}>
                          <Text style={[styles.itineraryCityText, { color: C.text }]}>{city}</Text>
                          <Text style={{ fontSize: 9, color: C.textSecondary }}>City #{i + 1}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Midway Toggle */}
                    <View style={[styles.toggleRow, { borderColor: C.divider }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.toggleLabel, { color: C.text }]}>Family Connect Midway Join</Text>
                        <Text style={{ fontSize: 10, color: C.textSecondary }}>
                          Already at a midway stop? Join from there and pay only for remaining cities!
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (!midwayJoin) handleMidwayJoinSelect(selectedTrip);
                          else setMidwayJoin(false);
                        }}
                        style={[
                          styles.toggleSwitch,
                          midwayJoin ? styles.toggleSwitchOn : styles.toggleSwitchOff,
                        ]}
                      >
                        <View style={[styles.toggleCircle, midwayJoin ? styles.circleOn : styles.circleOff]} />
                      </TouchableOpacity>
                    </View>

                    {/* Midway Selectors */}
                    {midwayJoin && (
                      <View style={[styles.midwaySection, { borderColor: C.accent + '20' }]}>
                        <Text style={[styles.midwaySectionTitle, { color: C.accent }]}>SELECT SEGMENT</Text>
                        <View style={styles.selectorGrid}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Start Joining From</Text>
                            <View style={[styles.pickerBox, { backgroundColor: isDark ? '#1B1E30' : '#F0F0F3' }]}>
                              <TextInput
                                style={[styles.pickerInput, { color: C.text }]}
                                value={startCity}
                                onChangeText={setStartCity}
                                placeholder="e.g. Delhi"
                                placeholderTextColor={C.textSecondary}
                              />
                            </View>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Travel End Point</Text>
                            <View style={[styles.pickerBox, { backgroundColor: isDark ? '#1B1E30' : '#F0F0F3' }]}>
                              <TextInput
                                style={[styles.pickerInput, { color: C.text }]}
                                value={endCity}
                                onChangeText={setEndCity}
                                placeholder="e.g. Vrindavan"
                                placeholderTextColor={C.textSecondary}
                              />
                            </View>
                          </View>
                        </View>
                        <View style={[styles.priceCalcRow, { borderTopColor: C.divider }]}>
                          <Text style={{ fontSize: 12, color: C.textSecondary }}>Automatic Price Adjustment</Text>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: '#2ECC71' }}>
                            ₹{calculateMidwayPrice(selectedTrip)}{' '}
                            <Text style={{ fontSize: 11, color: C.textSecondary }}>(vs ₹{selectedTrip.budget})</Text>
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Meta grid */}
                    <View style={styles.tripMetaGrid}>
                      <View style={[styles.metaCell, { backgroundColor: isDark ? '#1B1E30' : '#F5F5F8' }]}>
                        <Text style={{ fontSize: 11, color: C.textSecondary }}>Seats Available</Text>
                        <Text style={[styles.metaCellValue, { color: C.text }]}>{selectedTrip.availableSeats}</Text>
                      </View>
                      <View style={[styles.metaCell, { backgroundColor: isDark ? '#1B1E30' : '#F5F5F8' }]}>
                        <Text style={{ fontSize: 11, color: C.textSecondary }}>Food Included</Text>
                        <Text style={[styles.metaCellValue, { color: C.text }]}>{selectedTrip.foodIncluded ? 'Yes' : 'No'}</Text>
                      </View>
                    </View>

                    <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleRequestJoin}>
                      <Text style={styles.modalSubmitBtnText}>
                        {midwayJoin ? 'Request Segment Join' : 'Request Instant Join'}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )
            )}
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
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '90%',
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
    marginBottom: 16,
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
});
