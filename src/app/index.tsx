import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  Text,
  StatusBar,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Search,
  SlidersHorizontal,
  MapPin,
  Plane,
  CalendarCheck,
  Wallet,
  Sparkles,
  Sun,
  CloudRain,
  Shield,
  ChevronRight,
  ChevronDown,
  Heart,
  Star,
  Globe,
  Map,
  Users,
  Bot,
  Clock,
} from 'lucide-react-native';
import { useApp, UserRole } from '@/store/AppContext';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRENDING_CARD_WIDTH = SCREEN_WIDTH * 0.52;

// ─── Dark Theme Color Palette ───────────────────────────────────────
const C = {
  bg: '#0D0F1A',
  card: '#161829',
  cardAlt: '#1C1E30',
  border: '#252740',
  white: '#FFFFFF',
  textSec: '#8B8D9E',
  textMuted: '#5A5C6E',
  purple: '#0066FF',
  blue: '#3B82F6',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  star: '#FBBF24',
  pink: '#EC4899',
};

// ─── Data ───────────────────────────────────────────────────────────
const roles: { value: UserRole; label: string; sub: string; Icon: typeof Globe }[] = [
  { value: 'TOURIST', label: 'Tourist', sub: 'Explore places', Icon: Globe },
  { value: 'GUIDE', label: 'Travel Guide', sub: 'Guide travelers', Icon: Map },
  { value: 'ORGANIZER', label: 'Group Organizer', sub: 'Plan together', Icon: Users },
  { value: 'FAMILY_TRAVELER', label: 'Family', sub: 'Travel safely', Icon: Heart },
];

const quickAccessItems = [
  { label: 'Nearby', Icon: MapPin, color: C.green, isNew: false },
  { label: 'Trips', Icon: Plane, color: C.blue, isNew: false },
  { label: 'Bookings', Icon: CalendarCheck, color: C.orange, isNew: false },
  { label: 'Budget Tracker', Icon: Wallet, color: C.purple, isNew: true },
];

const storyData = [
  { id: 1, name: 'Sikkim', image: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=150&q=80', hasReel: true },
  { id: 2, name: 'Jaipur', image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=150&q=80', hasReel: false },
  { id: 3, name: 'Goa', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&q=80', hasReel: false },
  { id: 4, name: 'Manali', image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=150&q=80', hasReel: true },
  { id: 5, name: 'Munnar', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=150&q=80', hasReel: false },
];

const trendingDests = [
  {
    id: 1,
    name: 'Ladakh',
    tags: 'Adventure • Mountains',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=400&q=80',
  },
  {
    id: 2,
    name: 'Andaman',
    tags: 'Beaches • Relaxation',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
  },
  {
    id: 3,
    name: 'Goa',
    tags: 'Nightlife • Beaches',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=400&q=80',
  },
];

const TOURIST_WEATHER_LOCATIONS = [
  {
    id: 1,
    name: 'New Delhi',
    place: 'India Gate',
    temp: '32°C',
    condition: 'Partly Sunny',
    aqi: 'Good AQI • 42',
    humidity: '48%',
    image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80',
  },
  {
    id: 2,
    name: 'Agra',
    place: 'Taj Mahal',
    temp: '34°C',
    condition: 'Sunny & Clear',
    aqi: 'Moderate AQI • 58',
    humidity: '42%',
    image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=80',
  },
  {
    id: 3,
    name: 'Jaipur',
    place: 'Hawa Mahal',
    temp: '35°C',
    condition: 'Warm & Sunny',
    aqi: 'Moderate AQI • 65',
    humidity: '35%',
    image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=500&q=80',
  },
  {
    id: 4,
    name: 'Srinagar',
    place: 'Dal Lake',
    temp: '21°C',
    condition: 'Pleasant Breeze',
    aqi: 'Excellent AQI • 18',
    humidity: '60%',
    image: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=500&q=80',
  },
  {
    id: 5,
    name: 'Varanasi',
    place: 'Kashi Ghats',
    temp: '30°C',
    condition: 'Clear Sky',
    aqi: 'Good AQI • 45',
    humidity: '52%',
    image: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=500&q=80',
  },
  {
    id: 6,
    name: 'Munnar',
    place: 'Tea Gardens',
    temp: '22°C',
    condition: 'Mist & Clouds',
    aqi: 'Pure AQI • 12',
    humidity: '75%',
    image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&q=80',
  },
];

function FloatingTouristWeatherCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % TOURIST_WEATHER_LOCATIONS.length);
        Animated.spring(anim, {
          toValue: 1,
          tension: 45,
          friction: 7,
          useNativeDriver: true,
        }).start();
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [anim]);

  const item = TOURIST_WEATHER_LOCATIONS[currentIndex];
  // 0: left slide, 1: top slide, 2: right slide, 3: bottom slide
  const transitionType = currentIndex % 4;

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: transitionType === 0 ? [-70, 0] : transitionType === 2 ? [70, 0] : [0, 0],
  });

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: transitionType === 1 ? [-50, 0] : transitionType === 3 ? [50, 0] : [0, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  return (
    <View style={styles.weatherCard}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: anim,
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
      >
        <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(13,15,26,0.35)', 'rgba(13,15,26,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.weatherContent}>
          <View style={styles.locationRow}>
            <MapPin size={13} color={C.green} />
            <Text style={styles.locationText}>{item.name}</Text>
            <Text style={styles.placeText}>• {item.place}</Text>
          </View>
          <View style={styles.tempRow}>
            <Text style={styles.tempText}>{item.temp}</Text>
            <Sun size={32} color={C.orange} />
          </View>
          <Text style={styles.weatherCondition}>{item.condition}</Text>
          <Text style={styles.aqiText}>{item.aqi}</Text>
          <View style={styles.weatherBottom}>
            <Text style={styles.weatherDetail}>Humidity {item.humidity}</Text>
            <View style={styles.badgeLive}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
}

function OngoingTripNotificationCard() {
  const [secondsLeft, setSecondsLeft] = useState(8140); // 2 hours, 15 mins, 40 secs

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 8140));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.alertCard}>
      <View style={styles.tripHeaderRow}>
        <View style={[styles.alertIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)', marginBottom: 0 }]}>
          <Plane size={14} color={C.green} />
        </View>
        <View style={styles.tripLiveBadge}>
          <View style={styles.tripLiveDot} />
          <Text style={styles.tripLiveText}>STARTS SOON</Text>
        </View>
      </View>

      <Text style={styles.alertTitle} numberOfLines={1}>Ranchi → Vrindavan</Text>

      <View style={styles.timerWrap}>
        <Clock size={10} color={C.orange} />
        <Text style={styles.timerText}>{`${hours}h : ${minutes}m : ${seconds}s`}</Text>
      </View>

      <TouchableOpacity style={styles.alertLink}>
        <Text style={[styles.alertLinkText, { color: C.green }]}>Track Trip</Text>
        <ChevronRight size={11} color={C.green} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Component ──────────────────────────────────────────────────────
export default function HomeScreen() {
  const { currentRole, setCurrentRole } = useApp();
  const router = useRouter();
  const [activeDot, setActiveDot] = useState(0);

  const handleTrendingScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / (TRENDING_CARD_WIDTH + 12));
    setActiveDot(index);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ════════════════════════════════════════════════
            HEADER — Greeting + Avatar
            ════════════════════════════════════════════════ */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Namaste 🙏</Text>
            <Text style={styles.userName}>Aarav Sharma</Text>
            <Text style={styles.userSub}>Explore more. Experience better.</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bellWrap}>
              <Bell size={22} color={C.white} strokeWidth={1.8} />
              <View style={styles.bellDot} />
            </TouchableOpacity>
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80' }}
                style={styles.avatar}
              />
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>Pro</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            ROLE TABS — Horizontal scroll
            ════════════════════════════════════════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roleTabs}
        >
          {roles.map((role) => {
            const isActive = currentRole === role.value;
            return (
              <TouchableOpacity
                key={role.value}
                activeOpacity={0.8}
                onPress={() => setCurrentRole(role.value)}
              >
                {isActive ? (
                  <LinearGradient
                    colors={['#0066FF', '#0047C4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.roleTab}
                  >
                    <role.Icon size={18} color={C.white} strokeWidth={2} />
                    <View>
                      <Text style={styles.roleLabel}>{role.label}</Text>
                      <Text style={styles.roleSub}>{role.sub}</Text>
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.roleTab, styles.roleTabInactive]}>
                    <role.Icon size={18} color={C.textSec} strokeWidth={1.8} />
                    <View>
                      <Text style={[styles.roleLabel, { color: C.white }]}>{role.label}</Text>
                      <Text style={styles.roleSub}>{role.sub}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ════════════════════════════════════════════════
            TRAVEL REELS & STORIES
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Travel Reels & Stories</Text>
          <TouchableOpacity style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={14} color={C.blue} />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesRow}
        >
          {storyData.map((story) => (
            <TouchableOpacity key={story.id} style={styles.storyItem} activeOpacity={0.8}>
              <LinearGradient
                colors={['#0047C4', '#0066FF', '#00D0FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.storyBorder}
              >
                <View style={styles.storyInner}>
                  <Image source={{ uri: story.image }} style={styles.storyImage} />
                </View>
              </LinearGradient>
              {story.hasReel && (
                <View style={styles.reelBadge}>
                  <Text style={styles.reelBadgeText}>▶ REEL</Text>
                </View>
              )}
              <Text style={styles.storyName}>{story.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ════════════════════════════════════════════════
            QUICK ACCESS GRID
            ════════════════════════════════════════════════ */}
        <LinearGradient
          colors={['#1E223D', '#121426']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickCard}
        >
          {quickAccessItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.quickItem} activeOpacity={0.7}>
              <View
                style={[
                  styles.quickIcon,
                  {
                    backgroundColor: `${item.color}22`,
                    borderColor: `${item.color}45`,
                    borderWidth: 1,
                  },
                ]}
              >
                <item.Icon size={18} color={item.color} strokeWidth={2} />
                {item.isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </LinearGradient>

        {/* ════════════════════════════════════════════════
            WEATHER & ALERTS — Two column
            ════════════════════════════════════════════════ */}
        <View style={styles.weatherAlertRow}>
          {/* Animated Floating Weather Card */}
          <FloatingTouristWeatherCard />

          {/* Alerts Stack — Two Half Cards */}
          <View style={styles.alertsColumn}>
            {/* Monsoon Warning (Half Box) */}
            <View style={styles.alertCard}>
              <View style={[styles.alertIconWrap, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <CloudRain size={14} color={'#FF6B6B'} />
              </View>
              <Text style={[styles.alertTitle, { color: '#FF6B6B' }]} numberOfLines={1}>Monsoon Warning</Text>
              <Text style={styles.alertDesc} numberOfLines={1}>Heavy rain in Ladakh route</Text>
              <TouchableOpacity style={styles.alertLink}>
                <Text style={styles.alertLinkText}>View Details</Text>
                <ChevronRight size={11} color={C.blue} />
              </TouchableOpacity>
            </View>

            {/* Ongoing/Upcoming Trip Notification (Half Box) */}
            <OngoingTripNotificationCard />
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            TRENDING DESTINATIONS — Carousel + dots
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Destinations</Text>
          <TouchableOpacity style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={14} color={C.blue} />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingRow}
          snapToInterval={TRENDING_CARD_WIDTH + 12}
          decelerationRate="fast"
          onMomentumScrollEnd={handleTrendingScroll}
        >
          {trendingDests.map((dest) => (
            <TouchableOpacity key={dest.id} style={styles.trendingCard} activeOpacity={0.9}>
              <Image
                source={{ uri: dest.image }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.78)']}
                style={styles.trendingOverlay}
              />
              {/* Rank Badge */}
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{dest.id}</Text>
              </View>
              {/* Heart Button */}
              <TouchableOpacity style={styles.heartBtn} activeOpacity={0.7}>
                <Heart size={16} color={C.white} strokeWidth={2} />
              </TouchableOpacity>
              {/* Bottom Info */}
              <View style={styles.trendingInfo}>
                <Text style={styles.trendingName}>{dest.name}</Text>
                <Text style={styles.trendingTags}>{dest.tags}</Text>
                <View style={styles.ratingRow}>
                  <Star size={12} color={C.star} fill={C.star} />
                  <Text style={styles.ratingText}>{dest.rating}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* Pagination Dots */}
        <View style={styles.dotsRow}>
          {trendingDests.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                activeDot === idx ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    color: C.textSec,
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  userSub: {
    fontSize: 13,
    color: C.textSec,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 4,
  },
  bellWrap: {
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: C.purple,
  },
  proBadge: {
    position: 'absolute',
    bottom: -3,
    right: -6,
    backgroundColor: C.green,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.bg,
  },
  proBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: C.white,
  },

  // ── Role Tabs ───────────────────────────────────────
  roleTabs: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  roleTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    minWidth: 140,
  },
  roleTabInactive: {
    backgroundColor: C.card,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
  roleSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },

  // ── Search Bar ──────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
    gap: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: C.textSec,
  },

  // ── Quick Access Grid ───────────────────────────────
  quickCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.white,
    textAlign: 'center',
  },
  newBadge: {
    position: 'absolute',
    top: -3,
    right: -6,
    backgroundColor: C.green,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  newBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: C.white,
  },

  // ── Weather & Alerts ────────────────────────────────
  weatherAlertRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 24,
  },
  weatherCard: {
    flex: 1,
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  weatherContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: C.white,
    fontWeight: '700',
  },
  placeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  tempText: {
    fontSize: 38,
    fontWeight: '800',
    color: C.white,
  },
  weatherCondition: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: -6,
  },
  aqiText: {
    fontSize: 10,
    color: C.green,
    marginTop: 2,
  },
  weatherBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherDetail: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#EF4444',
  },
  liveText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },

  // ── Alerts ──
  alertsColumn: {
    flex: 1,
    gap: 10,
  },
  alertCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 10,
    justifyContent: 'space-between',
  },
  alertIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  alertTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
    marginTop: 1,
  },
  alertDesc: {
    fontSize: 9,
    color: C.textSec,
    lineHeight: 11,
  },
  alertLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  alertLinkText: {
    fontSize: 9,
    fontWeight: '600',
    color: C.blue,
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  tripLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.green,
  },
  tripLiveText: {
    fontSize: 7,
    fontWeight: '800',
    color: C.green,
    letterSpacing: 0.3,
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  timerText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: C.orange,
  },

  // ── Section Headers ─────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 12,
    color: C.blue,
    fontWeight: '600',
  },

  // ── Stories ─────────────────────────────────────────
  storiesRow: {
    paddingHorizontal: 20,
    gap: 18,
    marginBottom: 28,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  storyBorder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInner: {
    width: 63,
    height: 63,
    borderRadius: 31.5,
    backgroundColor: C.bg,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyImage: {
    width: 59,
    height: 59,
    borderRadius: 29.5,
  },
  reelBadge: {
    position: 'absolute',
    bottom: 18,
    backgroundColor: C.red,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  reelBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: C.white,
  },
  storyName: {
    marginTop: 6,
    fontSize: 11,
    color: C.textSec,
    fontWeight: '500',
  },

  // ── Trending Destinations ───────────────────────────
  trendingRow: {
    paddingHorizontal: 20,
    gap: 12,
  },
  trendingCard: {
    width: TRENDING_CARD_WIDTH,
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  trendingOverlay: {
    ...StyleSheet.absoluteFill,
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  heartBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingInfo: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
  },
  trendingName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
    marginBottom: 2,
  },
  trendingTags: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.star,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 28,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: C.blue,
  },
  dotInactive: {
    width: 6,
    backgroundColor: C.textMuted,
  },

  // ── AI CTA Card ─────────────────────────────────────
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  aiIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiContent: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
    marginBottom: 3,
  },
  aiSub: {
    fontSize: 10,
    color: C.textSec,
  },
  aiBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  aiBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
});
