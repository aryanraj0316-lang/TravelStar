import { useApp, UserRole } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Bell,
  CalendarCheck,
  ChevronRight,
  Clock,
  CloudRain,
  Globe,
  Heart,
  Map,
  MapPin,
  Plane,
  Star,
  Sun,
  Users,
  Wallet
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRENDING_CARD_WIDTH = SCREEN_WIDTH * 0.52;

// ─── Color Palette synchronized with search page theme ───────────────
const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1A1D30',
  white: '#FFFFFF',
  textSec: '#7E8494',
  textMuted: '#64748B',
  purple: '#0066FF',
  blue: '#0066FF',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  star: '#FBBF24',
  pink: '#EC4899',
};

// ─── Data ───────────────────────────────────────────────────────────
const roles: { value: UserRole; label: string; sub: string; Icon: typeof Globe; borderColors: [string, string] }[] = [
  { value: 'TOURIST', label: 'Tourist', sub: 'Explore places', Icon: Globe, borderColors: ['#0066FF', '#00F2FE'] },
  { value: 'GUIDE', label: 'Travel Guide', sub: 'Guide travelers', Icon: Map, borderColors: ['#0066FF', '#6366F1'] },
  { value: 'ORGANIZER', label: 'Group Organizer', sub: 'Plan together', Icon: Users, borderColors: ['#0066FF', '#7C3AED'] },
  { value: 'FAMILY_TRAVELER', label: 'Family', sub: 'Travel safely', Icon: Heart, borderColors: ['#0066FF', '#BA68C8'] },
];

const quickAccessItems: { label: string; Icon: typeof MapPin; gradient: [string, string]; iconColor: string; isNew: boolean; route?: string }[] = [
  { label: 'Nearby', Icon: MapPin, gradient: ['#111322', '#1B1E30'], iconColor: '#38BDF8', isNew: false, route: '/nearby-trips' },
  { label: 'Trips', Icon: Plane, gradient: ['#111322', '#1B1E30'], iconColor: '#818CF8', isNew: false, route: '/search' },
  { label: 'Bookings', Icon: CalendarCheck, gradient: ['#111322', '#1B1E30'], iconColor: '#34D399', isNew: false, route: '/bookings' },
  { label: 'Budget Tracker', Icon: Wallet, gradient: ['#111322', '#1B1E30'], iconColor: '#F59E0B', isNew: true, route: '/budget-tracker' },
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
  {
    id: 4,
    name: 'Kerala',
    tags: 'Nature • Backwaters',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=400&q=80',
  },
  {
    id: 5,
    name: 'Manali',
    tags: 'Snow • Hill Station',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=400&q=80',
  },
  {
    id: 6,
    name: 'Varanasi',
    tags: 'Ghats • Ganga River',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80',
  },
  {
    id: 7,
    name: 'Udaipur',
    tags: 'Palaces • Romance',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=400&q=80',
  },
  {
    id: 8,
    name: 'Darjeeling',
    tags: 'Tea Gardens • Views',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80',
  },
];

const infiniteTrendingDests = [...trendingDests, ...trendingDests];

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
    image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80',
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
  {
    id: 7,
    name: 'Mumbai',
    place: 'Gateway of India',
    temp: '29°C',
    condition: 'Sea Breeze',
    aqi: 'Moderate AQI • 55',
    humidity: '70%',
    image: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=500&q=80',
  },
  {
    id: 8,
    name: 'Leh-Ladakh',
    place: 'Pangong Tso',
    temp: '14°C',
    condition: 'Chilly & Sunny',
    aqi: 'Pure AQI • 10',
    humidity: '25%',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80',
  },
  {
    id: 9,
    name: 'Goa',
    place: 'Baga Beach',
    temp: '31°C',
    condition: 'Tropical Sun',
    aqi: 'Good AQI • 35',
    humidity: '68%',
    image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500&q=80',
  },
  {
    id: 10,
    name: 'Shimla',
    place: 'The Ridge',
    temp: '18°C',
    condition: 'Cool Mountain Air',
    aqi: 'Excellent AQI • 15',
    humidity: '55%',
    image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=500&q=80',
  },
  {
    id: 11,
    name: 'Rishikesh',
    place: 'Laxman Jhula',
    temp: '26°C',
    condition: 'Pleasant & Calm',
    aqi: 'Good AQI • 28',
    humidity: '50%',
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=500&q=80',
  },
  {
    id: 12,
    name: 'Udaipur',
    place: 'Lake Pichola',
    temp: '33°C',
    condition: 'Sunny Horizon',
    aqi: 'Moderate AQI • 48',
    humidity: '38%',
    image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=500&q=80',
  },
];

// ─── Apple-Style Live Character Formation Greeting Component ────────
function AppleMultilingualGreeting() {
  const wordSequences = [
    ['N', 'Na', 'Nam', 'Nama', 'Namas', 'Namast', 'Namaste', 'Namaste 🙏'],
    ['न', 'नम', 'नमस्', 'नमस्त', 'नमस्ते', 'नमस्ते 🙏'],
  ];

  const [wordIdx, setWordIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let isMounted = true;
    const currentSequence = wordSequences[wordIdx];

    setStepIdx(0);
    fadeAnim.setValue(1);

    let charTimer: ReturnType<typeof setInterval>;
    let stepCounter = 0;

    const animateNextChar = () => {
      if (!isMounted) return;

      if (stepCounter < currentSequence.length - 1) {
        stepCounter++;
        setStepIdx(stepCounter);
        charTimer = setTimeout(animateNextChar, 85);
      } else {
        // Hold for 1.4s when word is fully formed
        setTimeout(() => {
          if (!isMounted) return;

          // Dissolve word smoothly
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 450,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished || !isMounted) return;

            // Switch language
            setWordIdx((prev) => (prev + 1) % wordSequences.length);
          });
        }, 1400);
      }
    };

    charTimer = setTimeout(animateNextChar, 85);

    return () => {
      isMounted = false;
      clearTimeout(charTimer);
    };
  }, [wordIdx]);

  const currentText = wordSequences[wordIdx][stepIdx] || '';

  return (
    <View style={styles.appleGreetingContainer}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <Text style={styles.appleGreetingText}>{currentText}</Text>
      </Animated.View>
    </View>
  );
}

function FloatingTouristWeatherCard() {
  // Base image: always static at (0,0), fully visible
  const [baseIndex, setBaseIndex] = useState(0);
  // Sliding image: only exists while animating, starts off-screen and slides to (0,0)
  const [slidingIndex, setSlidingIndex] = useState<number | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const baseIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isAnimatingRef.current) return; // guard against overlap
      isAnimatingRef.current = true;

      const nextIdx = (baseIndexRef.current + 1) % TOURIST_WEATHER_LOCATIONS.length;

      // 1. Add the sliding layer (starts off-screen because slideAnim is 0)
      slideAnim.setValue(0);
      setSlidingIndex(nextIdx);

      // 2. Animate it from off-screen to (0,0)
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // 3. Animation done — sliding layer now fully covers base.
          //    Promote: make base show this image, remove sliding layer.
          //    Both layers show the same image at (0,0), so swap is invisible.
          baseIndexRef.current = nextIdx;
          setBaseIndex(nextIdx);
          setSlidingIndex(null);
        }
        isAnimatingRef.current = false;
      });
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  // Slide direction alternates based on the sliding image index
  const dir = slidingIndex !== null ? slidingIndex % 4 : 0;

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: dir === 0 ? [-200, 0] : dir === 2 ? [200, 0] : [0, 0],
  });

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: dir === 1 ? [-200, 0] : dir === 3 ? [200, 0] : [0, 0],
  });

  const renderWeatherContent = (loc: typeof TOURIST_WEATHER_LOCATIONS[0]) => (
    <>
      <Image source={{ uri: loc.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(13,15,26,0.35)', 'rgba(13,15,26,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.weatherContent}>
        <View style={styles.locationRow}>
          <MapPin size={13} color={C.green} />
          <Text style={styles.locationText}>{loc.name}</Text>
          <Text style={styles.placeText}>• {loc.place}</Text>
        </View>
        <View style={styles.tempRow}>
          <Text style={styles.tempText}>{loc.temp}</Text>
          <Sun size={32} color={C.orange} />
        </View>
        <Text style={styles.weatherCondition}>{loc.condition}</Text>
        <Text style={styles.aqiText}>{loc.aqi}</Text>
        <View style={styles.weatherBottom}>
          <Text style={styles.weatherDetail}>Humidity {loc.humidity}</Text>
          <View style={styles.badgeLive}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </View>
    </>
  );

  const baseItem = TOURIST_WEATHER_LOCATIONS[baseIndex];
  const slidingItem = slidingIndex !== null ? TOURIST_WEATHER_LOCATIONS[slidingIndex] : null;

  return (
    <View style={styles.weatherCard}>
      {/* Base layer: always static, always visible, never animates */}
      <View style={StyleSheet.absoluteFill}>
        {renderWeatherContent(baseItem)}
      </View>

      {/* Sliding layer: only rendered while animating, slides from off-screen to (0,0) */}
      {slidingItem && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX }, { translateY }],
              zIndex: 10,
            },
          ]}
        >
          {renderWeatherContent(slidingItem)}
        </Animated.View>
      )}
    </View>
  );
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
    <View style={[styles.alertCard, styles.tripCardWrap]}>
      <View style={styles.tripHeaderRow}>
        <View style={[styles.alertIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)', marginBottom: 0 }]}>
          <Plane size={14} color={C.green} />
        </View>
        <View style={styles.tripLiveBadge}>
          <Text style={styles.tripLiveText}>STARTS SOON</Text>
        </View>
      </View>

      <View style={styles.tripTitleRow}>
        <View style={{ flex: 1, paddingRight: 4 }}>
          <Text style={styles.alertTitle} numberOfLines={1}>Ranchi → Vrindavan</Text>
        </View>
        <View style={styles.routeGraphic}>
          <View style={styles.routeDotBlue} />
          <View style={styles.routeLinePath} />
          <View style={styles.routeDotGreen} />
        </View>
      </View>

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
  const { currentRole, setCurrentRole, profile, setNavbarHidden } = useApp();
  const router = useRouter();
  const [activeDot, setActiveDot] = useState(0);
  const trendingRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const isInteractingRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);

  useEffect(() => {
    let animFrameId: number;
    const itemWidth = TRENDING_CARD_WIDTH + 12;
    const singleSetWidth = itemWidth * trendingDests.length;

    const animate = () => {
      if (!isInteractingRef.current) {
        scrollXRef.current += 0.8;
        if (scrollXRef.current >= singleSetWidth) {
          scrollXRef.current -= singleSetWidth;
        }
        trendingRef.current?.scrollTo({ x: scrollXRef.current, animated: false });

        const currentDot = Math.floor(scrollXRef.current / itemWidth) % trendingDests.length;
        setActiveDot(currentDot);
      }
      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const diff = y - lastScrollYRef.current;
          if (diff > 10 && !navbarHiddenRef.current) {
            // Scrolling down — hide navbar
            navbarHiddenRef.current = true;
            setNavbarHidden(true);
          } else if (diff < -8 && navbarHiddenRef.current) {
            // Scrolling up — show navbar
            navbarHiddenRef.current = false;
            setNavbarHidden(false);
          }
          lastScrollYRef.current = y;
        }}
      >
        {/* ════════════════════════════════════════════════
            HEADER — Greeting + Avatar
            ════════════════════════════════════════════════ */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppleMultilingualGreeting />
            <Text style={styles.userName}>{profile.name}</Text>
            <Text style={styles.userSub}>Explore more. Experience better.</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.bellWrap}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => router.push('/notifications')}
            >
              <Bell size={16} color={C.white} strokeWidth={1.8} />
              <View style={styles.bellDot} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.avatarWrap}
              onPress={() => router.push('/profile')}
            >
              <LinearGradient
                colors={['#0066FF', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarBorder}
              >
                <Image
                  source={{ uri: profile.avatar }}
                  style={styles.avatar}
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            ROLE TABS — Horizontal scroll with gradient borders
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
                onPress={() => {
                  setCurrentRole(role.value);
                  // Update the profile context role to mirror this change globally
                  profile.role = role.value;
                }}
              >
                <LinearGradient
                  colors={
                    isActive
                      ? ['#0066FF', '#6366F1', '#8B5CF6']
                      : ['#1A1D30', '#1A1D30']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.roleTabBorder}
                >
                  <View style={[styles.roleTabInner, isActive && { backgroundColor: 'rgba(0, 102, 255, 0.12)' }]}>
                    <role.Icon size={18} color={isActive ? C.white : C.textSec} strokeWidth={2} />
                    <View>
                      <Text style={[styles.roleLabel, { color: C.white }]}>{role.label}</Text>
                      <Text style={styles.roleSub}>{role.sub}</Text>
                    </View>
                  </View>
                </LinearGradient>
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
            <TouchableOpacity key={story.id} style={styles.storyItem} activeOpacity={0.8} onPress={() => router.push('/stories')}>
              <LinearGradient
                colors={['#00E5FF', '#0066FF', '#0891B2']}
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
            QUICK ACCESS GRID — Squircle tiles
            ════════════════════════════════════════════════ */}
        <LinearGradient
          colors={['#111322', '#0A0C16']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickCard}
        >
          {quickAccessItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickItem}
              activeOpacity={0.7}
              onPress={() => {
                if (item.route) {
                  router.push(item.route as any);
                }
              }}
            >
              <View style={{ position: 'relative' }}>
                <LinearGradient
                  colors={item.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickIconTile}
                >
                  <item.Icon size={19} color={item.iconColor} strokeWidth={2.2} />
                </LinearGradient>
                {item.isNew && (
                  <View style={styles.newBadgeGold}>
                    <Text style={styles.newBadgeGoldText}>NEW</Text>
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
            <View style={[styles.alertCard, styles.monsoonCard]}>
              <View style={[styles.alertIconWrap, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                <CloudRain size={14} color={'#FBBF24'} />
              </View>
              <Text style={[styles.alertTitle, { color: '#FBBF24' }]} numberOfLines={1}>Monsoon Warning</Text>
              <Text style={styles.alertDesc} numberOfLines={1}>Heavy rain in Ladakh route</Text>
              <TouchableOpacity style={styles.alertLink}>
                <Text style={[styles.alertLinkText, { color: '#F59E0B' }]}>View Details</Text>
                <ChevronRight size={11} color={'#F59E0B'} />
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
          ref={trendingRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingRow}
          scrollEventThrottle={16}
          onTouchStart={() => {
            isInteractingRef.current = true;
          }}
          onTouchEnd={() => {
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 1200);
          }}
          onScrollBeginDrag={() => {
            isInteractingRef.current = true;
          }}
          onScrollEndDrag={(e) => {
            scrollXRef.current = e.nativeEvent.contentOffset.x;
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 1200);
          }}
        >
          {infiniteTrendingDests.map((dest, index) => (
            <TouchableOpacity key={`${dest.id}-${index}`} style={styles.trendingCard} activeOpacity={0.9}>
              <Image
                source={{ uri: dest.image }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.78)']}
                style={styles.trendingOverlay}
              />
              {/* Hanging Vertical Ribbon Tag for Rank */}
              <View style={styles.rankRibbonWrap}>
                <LinearGradient
                  colors={['#475569', '#334155', '#1E293B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.rankRibbonBody}
                >
                  <Text style={styles.rankRibbonText}>{dest.id}</Text>
                </LinearGradient>
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
  appleGreetingContainer: {
    height: 24,
    justifyContent: 'center',
    marginBottom: 3,
  },
  appleGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appleGreetingText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSec,
    letterSpacing: 0.2,
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
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 0,
  },
  bellWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    alignSelf: 'flex-end',
  },
  bellDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F59E0B',
    borderWidth: 1.2,
    borderColor: C.bg,
  },
  avatarWrap: {
    marginTop: 2,
  },
  avatarBorder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: C.bg,
  },

  // ── Role Tabs Gradient Outline ──────────────────────
  roleTabs: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 18,
  },
  roleTabBorder: {
    borderRadius: 16,
    padding: 1.5,
  },
  roleTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14.5,
    backgroundColor: '#111322',
    minWidth: 140,
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
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1A1D30',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickIconTile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  quickLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.white,
    textAlign: 'center',
  },
  newBadgeGold: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0F1224',
  },
  newBadgeGoldText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#111827',
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
  monsoonCard: {
    backgroundColor: '#24160E',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  tripCardWrap: {
    backgroundColor: '#131726',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  alertIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
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
  tripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  routeGraphic: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 44,
    height: 14,
  },
  routeDotBlue: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
  },
  routeLinePath: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(59, 130, 246, 0.45)',
    marginHorizontal: 2,
  },
  routeDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
    borderWidth: 1.5,
    borderColor: '#131726',
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
  rankRibbonWrap: {
    position: 'absolute',
    top: 0,
    left: 14,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
  },
  rankRibbonBody: {
    width: 26,
    height: 38,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  rankRibbonText: {
    fontSize: 13,
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
