import { MONSOON_ALERTS } from '@/constants/alerts';
import { useApp, UserRole } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  Car,
  Check,
  ChevronRight,
  Clock,
  CloudRain,
  CloudSnow,
  Globe,
  Heart,
  Map,
  MapPin,
  MessageSquare,
  Mountain,
  Plane,
  Star,
  Sun,
  Users,
  Wallet,
  Waves
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
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

function RotatingMonsoonAlertCard() {
  const router = useRouter();
  const [alertIndex, setAlertIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      // 1. Fade out smoothly
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // 2. Change content
          setAlertIndex((prev) => (prev + 1) % MONSOON_ALERTS.length);

          // 3. Fade back in
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }).start(() => {
            isAnimatingRef.current = false;
          });
        }
      });
    }, 5000); // 5 seconds interval

    return () => clearInterval(timer);
  }, []);

  const activeAlert = MONSOON_ALERTS[alertIndex];

  const getCategoryIcon = (category: string, severity: string) => {
    const iconColor = severity === 'CRITICAL' ? '#EF4444' : severity === 'WARNING' ? '#F59E0B' : '#0066FF';
    switch (category) {
      case 'LANDSLIDE':
        return <Mountain size={14} color={iconColor} />;
      case 'FLOOD & RAIN':
        return <Waves size={14} color={iconColor} />;
      case 'SNOWFALL':
        return <CloudSnow size={14} color={iconColor} />;
      case 'CLOUDBURST':
        return <CloudRain size={14} color={iconColor} />;
      case 'TRAFFIC RUSH':
        return <Car size={14} color={iconColor} />;
      default:
        return <AlertTriangle size={14} color={iconColor} />;
    }
  };

  const getAlertColors = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return { text: '#EF4444', iconBg: 'rgba(239, 68, 68, 0.15)' };
      case 'WARNING':
        return { text: '#F59E0B', iconBg: 'rgba(245, 158, 11, 0.15)' };
      default:
        return { text: '#0066FF', iconBg: 'rgba(0, 102, 255, 0.15)' };
    }
  };

  const colors = getAlertColors(activeAlert.severity);

  return (
    <Animated.View style={[styles.alertCard, styles.monsoonCard, { flex: 1, opacity: fadeAnim, overflow: 'hidden', position: 'relative', padding: 0 }]}>
      <Image source={{ uri: activeAlert.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(21,17,14,0.3)', 'rgba(21,17,14,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ flex: 1, padding: 10, justifyContent: 'space-between', zIndex: 2 }}>
        <View style={[styles.alertIconWrap, { backgroundColor: colors.iconBg }]}>
          {getCategoryIcon(activeAlert.category, activeAlert.severity)}
        </View>
        <Text style={[styles.alertTitle, { color: colors.text }]} numberOfLines={1}>
          {activeAlert.title}
        </Text>
        <Text style={[styles.alertDesc, { color: '#E2E8F0', textShadowColor: '#000', textShadowOffset: { width: 0.5, height: 0.5 }, textShadowRadius: 1 }]} numberOfLines={3}>
          {activeAlert.desc}
        </Text>
        <TouchableOpacity
          style={styles.alertLink}
          activeOpacity={0.8}
          onPress={() => router.push('/monsoon-advisory' as any)}
        >
          <Text style={[styles.alertLinkText, { color: colors.text }]}>View Details</Text>
          <ChevronRight size={11} color={colors.text} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function FeaturedTripsCarousel() {
  const { trips, setActiveRoomId } = useApp();
  const router = useRouter();
  const carouselRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const isInteracting = useRef(false);

  const organizerTrips = trips;

  useEffect(() => {
    if (organizerTrips.length <= 1) return;

    let animFrameId: number;
    const cardWidth = SCREEN_WIDTH - 40; // width of each card + padding margin
    const totalWidth = (cardWidth + 10) * organizerTrips.length; // include gap

    const animate = () => {
      if (!isInteracting.current) {
        scrollX.current += 0.8;
        if (scrollX.current >= totalWidth) {
          scrollX.current = 0;
        }
        carouselRef.current?.scrollTo({ x: scrollX.current, animated: false });
      }
      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameId);
  }, [organizerTrips]);

  const getTripImage = (id: string, name: string) => {
    if (id === 'trip-1') return 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80';
    if (id === 'trip-2') return 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80';
    if (id === 'trip-3') return 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80';

    const lowerName = name.toLowerCase();
    if (lowerName.includes('sikkim')) return 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80';
    if (lowerName.includes('rajasthan') || lowerName.includes('jaipur') || lowerName.includes('heritage')) return 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=600&q=80';
    if (lowerName.includes('kerala')) return 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80';
    return 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80';
  };

  const getRoomId = (id: string) => {
    if (id === 'trip-1') return 'room-vrindavan-group';
    if (id === 'trip-2') return 'room-ladakh-group';
    if (id === 'trip-3') return 'room-kerala-group';
    return `room-${id}`;
  };

  return (
    <View style={styles.carouselContainer}>
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => { isInteracting.current = true; }}
        onTouchEnd={() => { setTimeout(() => { isInteracting.current = false; }, 1200); }}
        onScrollBeginDrag={() => { isInteracting.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { isInteracting.current = false; }, 1200); }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {organizerTrips.map((trip) => {
          const imageUri = getTripImage(trip.id, trip.name);
          const durationText = trip.id === 'trip-1' ? '7 Nights / 8 Days' :
            trip.id === 'trip-2' ? '10 Nights / 11 Days' :
              trip.id === 'trip-3' ? '5 Nights / 6 Days' : '5 Nights / 6 Days';
          const transportText = trip.id === 'trip-2' ? 'Bike + Stay' : 'AC Transport';

          return (
            <TouchableOpacity
              key={trip.id}
              activeOpacity={0.85}
              onPress={() => {
                router.push('/search');
              }}
              style={[styles.tripCard, { width: SCREEN_WIDTH - 40 }]}
            >
              {/* Left side: Image */}
              <View style={styles.tripImageContainer}>
                <Image source={{ uri: imageUri }} style={styles.tripImage} />
                <LinearGradient
                  colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.tripBadge, { backgroundColor: '#6C5CE7' }]}>
                  <Text style={styles.tripBadgeText}>Featured</Text>
                </View>
              </View>

              {/* Right side: Detailed trip content */}
              <View style={styles.tripContent}>
                <Text style={styles.tripName} numberOfLines={2}>
                  {trip.name}
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
                  <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#10B981' }}>{trip.availableSeats} left</Text>
                </View>

                {/* Route cities with arrow */}
                <View style={styles.routeCities}>
                  {trip.cities.map((city, i) => (
                    <React.Fragment key={city}>
                      <Text style={styles.cityText}>{city}</Text>
                      {i < trip.cities.length - 1 && (
                        <Text style={styles.routeArrow}>→</Text>
                      )}
                    </React.Fragment>
                  ))}
                </View>

                {/* Subtitle / capsules */}
                <View style={styles.capsulesRow}>
                  <View style={styles.capsule}>
                    <Clock size={8} color="#7E8494" />
                    <Text style={styles.capsuleText} numberOfLines={1}>{durationText}</Text>
                  </View>
                  <View style={styles.capsule}>
                    <Plane size={8} color="#7E8494" />
                    <Text style={styles.capsuleText} numberOfLines={1}>{transportText}</Text>
                  </View>
                </View>

                {/* Price and Action Buttons */}
                <View style={styles.priceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>Total Package</Text>
                    <Text style={styles.priceAmount}>₹{trip.budget}</Text>
                  </View>
                  <View style={{ gap: 4, width: 110 }}>
                    <TouchableOpacity
                      style={styles.joinBtn}
                      onPress={() => {
                        router.push('/search');
                      }}
                    >
                      <Text style={styles.joinBtnText}>Join Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.joinBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0066FF', paddingVertical: 4 }]}
                      onPress={() => {
                        setActiveRoomId(getRoomId(trip.id));
                        router.push('/chat');
                      }}
                    >
                      <MessageSquare size={9} color="#0066FF" style={{ marginRight: 2 }} />
                      <Text style={[styles.joinBtnText, { color: '#0066FF' }]}>Join Chat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Component ──────────────────────────────────────────────────────
export default function HomeScreen() {
  const { currentRole, setCurrentRole, profile, setNavbarHidden, trips, setActiveRoomId } = useApp();
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
                  if (role.value === 'GUIDE') {
                    router.push('/travel-guide' as any);
                  }
                  if (role.value === 'ORGANIZER') {
                    router.push('/group-organizer' as any);
                  }
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
            <TouchableOpacity
              key={story.id}
              style={styles.storyItem}
              activeOpacity={0.8}
              onPress={() => {
                router.push({
                  pathname: '/stories',
                  params: { location: story.name }
                });
              }}
            >
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

          {/* Alerts Stack — Stretched Monsoon Card */}
          <View style={styles.alertsColumn}>
            {/* Monsoon Warning (Full Height in Column) */}
            <RotatingMonsoonAlertCard />
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            FEATURED GROUP TRIPS CAROUSEL
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Group Trips</Text>
        </View>
        <FeaturedTripsCarousel />

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
            <TouchableOpacity
              key={`${dest.id}-${index}`}
              style={styles.trendingCard}
              activeOpacity={0.9}
              onPress={() => {
                router.push({
                  pathname: '/destination-details' as any,
                  params: { id: String(dest.id) }
                });
              }}
            >
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
  carouselContainer: {
    marginBottom: 24,
  },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: '#111322',
    borderColor: '#1A1D30',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 180,
    marginHorizontal: 20,
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
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 16,
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
    color: '#7E8494',
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
    backgroundColor: '#1B1E30',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 2,
  },
  capsuleText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#7E8494',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#1A1D30',
    paddingTop: 6,
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: '#7E8494',
  },
  priceAmount: {
    fontSize: 16,
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
