import { ScreenEmpty, ScreenError, SkeletonCard } from '@/components/ui';
import { logger } from '@/lib/logger';
import { formatINR } from '@/lib/money';
import { queryKeys } from '@/lib/query-keys';
import { formatTripDuration, tripCoverImage, tripTransportLabel } from '@/lib/trip-display';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { useApp, UserRole, type Trip } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { WeatherLocation } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter, type Href } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import Compass from 'lucide-react-native/icons/compass';
import Film from 'lucide-react-native/icons/film';
import Flame from 'lucide-react-native/icons/flame';
import Globe from 'lucide-react-native/icons/globe';
import Heart from 'lucide-react-native/icons/heart';
import Map from 'lucide-react-native/icons/map';
import MapPin from 'lucide-react-native/icons/map-pin';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Mountain from 'lucide-react-native/icons/mountain';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import Star from 'lucide-react-native/icons/star';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Sun from 'lucide-react-native/icons/sun';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import Users from 'lucide-react-native/icons/users';
import Wallet from 'lucide-react-native/icons/wallet';
import Waves from 'lucide-react-native/icons/waves-horizontal';
import X from 'lucide-react-native/icons/x';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_BANNER_WIDTH = SCREEN_WIDTH;
const HERO_BANNER_HEIGHT = Math.round(SCREEN_WIDTH * (355 / 1024));
const TRENDING_CARD_WIDTH = SCREEN_WIDTH * 0.52;

// ─── Color Palette synchronized with search page theme ───────────────

// ─── Data ───────────────────────────────────────────────────────────
const roles: { value: UserRole; labelKey: string; subKey: string; Icon: typeof Globe; borderColors: [string, string] }[] = [
  { value: 'TOURIST', labelKey: 'home.roleTourist', subKey: 'home.roleTouristSub', Icon: Globe, borderColors: ['#0066FF', '#00F2FE'] },
  { value: 'GUIDE', labelKey: 'home.roleGuide', subKey: 'home.roleGuideSub', Icon: Map, borderColors: ['#0066FF', '#6366F1'] },
  { value: 'ORGANIZER', labelKey: 'home.roleOrganizer', subKey: 'home.roleOrganizerSub', Icon: Users, borderColors: ['#0066FF', '#7C3AED'] },
];

const quickAccessItems: { labelKey: string; Icon: typeof MapPin; gradient: [string, string]; iconColor: string; isNew: boolean; route?: Href }[] = [
  { labelKey: 'home.quickNearby', Icon: MapPin, gradient: ['#111322', '#1B1E30'], iconColor: '#38BDF8', isNew: false, route: '/nearby-trips' },
  { labelKey: 'home.quickBookings', Icon: CalendarCheck, gradient: ['#111322', '#1B1E30'], iconColor: '#34D399', isNew: false, route: '/bookings' },
  { labelKey: 'home.quickBudgetTracker', Icon: Wallet, gradient: ['#111322', '#1B1E30'], iconColor: '#F59E0B', isNew: true, route: '/budget-tracker' },
];

// ─── Instagram Stories Prompt Data (Empty State Highlights) ───────────
interface InstagramStoryPrompt {
  id: string;
  title: string;
  badge?: string;
  Icon: typeof Camera;
  gradient: [string, string, ...string[]];
  action: 'CREATE_STORY' | 'VIEW_STORIES' | 'EXPLORE_NEARBY' | 'BUDGET_TRIPS' | 'GROUP_ORGANIZER';
}

const INSTAGRAM_PROMPTS: InstagramStoryPrompt[] = [
  {
    id: 'prompt-add-yours',
    title: 'Add Yours',
    badge: 'NEW',
    Icon: Camera,
    gradient: ['#F58529', '#DD2A7B', '#8134AF'],
    action: 'CREATE_STORY',
  },
  {
    id: 'prompt-reels',
    title: 'Top Reels',
    badge: 'HOT',
    Icon: Film,
    gradient: ['#8B5CF6', '#3B82F6', '#06B6D4'],
    action: 'VIEW_STORIES',
  },
  {
    id: 'prompt-gems',
    title: 'Hidden Gems',
    badge: 'EXPLORE',
    Icon: Compass,
    gradient: ['#06B6D4', '#10B981', '#34D399'],
    action: 'EXPLORE_NEARBY',
  },
  {
    id: 'prompt-trending',
    title: 'Trending',
    badge: '🔥',
    Icon: Flame,
    gradient: ['#F59E0B', '#EF4444', '#EC4899'],
    action: 'BUDGET_TRIPS',
  },
  {
    id: 'prompt-solo',
    title: 'Solo Vibes',
    badge: 'TRIPS',
    Icon: Globe,
    gradient: ['#2563EB', '#6366F1', '#8B5CF6'],
    action: 'GROUP_ORGANIZER',
  },
];

// The merged feed (getFeed) returns real FeedItems (sourceType STORY|REEL);
// getStories() falls back to plain Storys. This captures only the fields
// the story rail below actually reads.
interface HomeFeedItem {
  id: string;
  coverImg?: string | null;
  location?: string | null;
  title?: string;
}

// ─── Apple-Style Live Character Formation Greeting Component ────────
const GREETING_WORD_SEQUENCES = [
  ['N', 'Na', 'Nam', 'Nama', 'Namas', 'Namast', 'Namaste', 'Namaste 🙏'],
  ['न', 'नम', 'नमस्', 'नमस्त', 'नमस्ते', 'नमस्ते 🙏'],
];

function AppleMultilingualGreetingBase({ isFocused }: { isFocused: boolean }) {
  const wordSequences = GREETING_WORD_SEQUENCES;

  const [wordIdx, setWordIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const fadeAnim = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (!isFocused) return;
    let isMounted = true;
    const currentSequence = wordSequences[wordIdx];

    // Deferred to a timer rather than called synchronously here, so this
    // effect body itself never calls setState directly (react-hooks/set-state-in-effect).
    const resetTimer = setTimeout(() => {
      if (!isMounted) return;
      setStepIdx(0);
      fadeAnim.setValue(1);
    }, 0);

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
      clearTimeout(resetTimer);
      clearTimeout(charTimer);
    };
  }, [wordIdx, isFocused, fadeAnim, wordSequences]);

  const currentText = wordSequences[wordIdx][stepIdx] || '';

  return (
    <View style={styles.appleGreetingContainer}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <Text style={styles.appleGreetingText}>{currentText}</Text>
      </Animated.View>
    </View>
  );
}

// Far enough that a card is fully off the (max ~220pt wide) weather card
// before the incoming one lands, so neither is ever half-visible mid-slide.
const SLIDE_DISTANCE = 260;

/** Stable empty default for the alerts query — see its use site. */
const EMPTY_ALERTS: HomeAlertCard[] = [];

function FloatingTouristWeatherCardBase({ locations, isFocused }: { locations: WeatherLocation[]; isFocused: boolean }) {
  const { t } = useTranslation();
  // Base image: at (0,0) at rest, slides out while the next one slides in.
  const [baseIndex, setBaseIndex] = useState(0);
  // Sliding image: only exists while animating, starts off-screen and slides to (0,0)
  const [slidingIndex, setSlidingIndex] = useState<number | null>(null);
  // Two values, not one. The base layer's transform prop must never be
  // removed: with useNativeDriver the native side owns that view's
  // transform, and dropping the prop (the old `slidingItem ? … : null`)
  // does not push a reset back down — the layer stayed parked at the
  // exit position (-SLIDE_DISTANCE, i.e. off-screen behind `overflow:
  // hidden`) after every slide, which is the card "going white" once the
  // incoming layer unmounted. Giving the outgoing layer its own value
  // means it can be snapped back to rest the moment it is promoted.
  const enterAnim = useState(() => new Animated.Value(0))[0];
  const exitAnim = useState(() => new Animated.Value(0))[0];
  const baseIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (!isFocused || locations.length <= 1) return;
    const interval = setInterval(() => {
      if (isAnimatingRef.current) return; // guard against overlap
      isAnimatingRef.current = true;

      const nextIdx = (baseIndexRef.current + 1) % locations.length;

      // 1. Add the sliding layer (starts off-screen because enterAnim is 0)
      enterAnim.setValue(0);
      exitAnim.setValue(0);
      setSlidingIndex(nextIdx);

      // 2. Slide the new one in while the old one slides out.
      Animated.parallel([
        Animated.timing(enterAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(exitAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          // 3. Promote: base takes over the image the sliding layer is
          //    already showing at (0,0), and snaps back to rest in the same
          //    tick. The sliding layer is still mounted on top for this
          //    frame, so the base moving underneath it is never seen.
          baseIndexRef.current = nextIdx;
          setBaseIndex(nextIdx);
          setSlidingIndex(null);
          exitAnim.setValue(0);
        }
        isAnimatingRef.current = false;
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [locations, isFocused, enterAnim, exitAnim]);

  // Slide direction alternates based on the sliding image index. The
  // outgoing card exits along the same axis the incoming one enters on, so
  // the two never occupy the card at once — the previous card is gone by
  // the time the new one lands.
  const dir = slidingIndex !== null ? slidingIndex % 4 : 0;
  const axis = dir === 0 || dir === 2 ? 'x' : 'y';
  const from = dir === 0 || dir === 1 ? -SLIDE_DISTANCE : SLIDE_DISTANCE;

  // Home screen re-renders often (feed/destinations/weather/alerts/guides/
  // stories/notifications are all separate useQuery hooks living in the
  // same component, so any one of them settling re-renders everyone).
  // Recomputing .interpolate() on every one of those incidental re-renders
  // handed the native-driven Animated.View a brand-new node mid-slide, and
  // re-attaching a native transform to a fresh node while it's animating is
  // exactly the kind of thing that flashes to a default/extreme position
  // for a frame — which, inside this card's `overflow: hidden`, reads as a
  // blank flash. Memoizing keeps the same node across re-renders that don't
  // actually change the slide direction/distance.
  const { enterTransform, exitTransform } = useMemo(() => {
    const enterTranslate = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
    const exitTranslate = exitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -from] });
    return {
      enterTransform: axis === 'x' ? [{ translateX: enterTranslate }] : [{ translateY: enterTranslate }],
      exitTransform: axis === 'x' ? [{ translateX: exitTranslate }] : [{ translateY: exitTranslate }],
    };
  }, [axis, from, enterAnim, exitAnim]);

  const renderWeatherContent = (loc: WeatherLocation) => (
    <View style={styles.weatherCardInner}>
      <View style={styles.locationRow}>
        <MapPin size={12} color="#10B981" />
        <Text style={styles.locationText} numberOfLines={1}>{loc.name} • {loc.place}</Text>
      </View>
      <View style={styles.tempRow}>
        <Text style={styles.tempText}>{loc.temp}</Text>
        <Sun size={26} color="#F59E0B" />
      </View>
      <Text style={styles.weatherCondition}>{loc.condition}</Text>
      <View style={styles.aqiRow}>
        <Text style={styles.aqiLabel}>Air Quality </Text>
        <Text style={styles.aqiValue}>{loc.aqi.replace(' AQI', '')}</Text>
      </View>
      <Text style={styles.weatherDetail}>{t('home.humidity', { value: loc.humidity })}</Text>
      <View style={styles.weatherThumbWrap}>
        <Image source={{ uri: loc.image }} style={styles.weatherThumb} resizeMode="cover" />
        <View style={styles.badgeLive}>
          <Text style={styles.liveText}>• LIVE</Text>
        </View>
      </View>
    </View>
  );

  if (locations.length === 0) {
    // Real "no weather data yet" state — never a fabricated temperature/AQI
    // reading for a city nobody configured (see the query above).
    return (
      <View style={[styles.weatherCard, styles.weatherEmptyWrap]}>
        <CloudRain size={22} color="#94A3B8" strokeWidth={1.8} />
        <Text style={styles.weatherEmptyText}>{t('home.weatherEmpty')}</Text>
      </View>
    );
  }
  const baseItem = locations[baseIndex % locations.length];
  const slidingItem = slidingIndex !== null ? locations[slidingIndex % locations.length] : null;

  return (
    <View style={styles.weatherCard}>
      {/* elevation (for the drop shadow) and overflow: hidden (to clip the
          sliding layers) must not live on the same view — Android disposes
          of that combination by intermittently failing to composite
          animated children, which is exactly the "goes blank" flash. The
          shadow stays on weatherCard; clipping moves to this inner view. */}
      <View style={styles.weatherClip}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.weatherLayer, { transform: exitTransform }]}>
          {renderWeatherContent(baseItem)}
        </Animated.View>
        {slidingItem && (
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.weatherLayer, { transform: enterTransform, zIndex: 10 }]}
          >
            {renderWeatherContent(slidingItem)}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

interface HomeAlertCard {
  id: string;
  severity: string;
  title: string;
  category: string;
  desc: string;
  image: string;
}

function RotatingMonsoonAlertCardBase({ alerts, isFocused }: { alerts: HomeAlertCard[]; isFocused: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [alertIndex, setAlertIndex] = useState(0);
  const fadeAnim = useState(() => new Animated.Value(1))[0];
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (!isFocused || alerts.length <= 1) return;
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
          setAlertIndex((prev) => (prev + 1) % alerts.length);

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
  }, [alerts, isFocused, fadeAnim]);

  // No fake "Monsoon Warning" placeholder here — an empty active-alerts
  // response is real, good news, not something to paper over with sample
  // hazard data (that would be actively misleading on a safety card).
  if (alerts.length === 0) {
    return (
      <View style={styles.allClearCard}>
        {/* Top Header Row */}
        <View style={styles.allClearHeaderRow}>
          <View style={styles.allClearHeaderBadge}>
            <View style={styles.allClearLiveDot} />
            <Text style={styles.allClearHeaderText}>{t('home.routeSafety') || 'Route Safety'}</Text>
          </View>
          <ShieldCheck size={16} color="#059669" strokeWidth={2.2} />
        </View>

        {/* Minimal Center Content */}
        <View style={styles.allClearCenter}>
          <View style={styles.allClearIconCircle}>
            <Check size={20} color="#059669" strokeWidth={2.6} />
          </View>
          <Text style={styles.allClearTitle}>{t('home.allClear') || 'All Clear'}</Text>
          <Text style={styles.allClearSubtitle}>
            {t('home.allClearMinimalDesc') || 'All monitored routes are safe and running normally.'}
          </Text>
        </View>

        {/* Minimal Action Link */}
        <TouchableOpacity
          style={styles.allClearLink}
          activeOpacity={0.7}
          onPress={() => router.push('/monsoon-advisory')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('home.viewDetails')}
        >
          <Text style={styles.allClearLinkText}>{t('home.viewDetails')}</Text>
          <ChevronRight size={13} color="#059669" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
    );
  }
  const activeAlert = alerts[alertIndex % alerts.length];

  const getCategoryIcon = (category: string, severity: string) => {
    const iconColor = severity === 'CRITICAL' ? '#EF4444' : severity === 'WARNING' ? '#F59E0B' : '#0066FF';
    // Matches the API's actual coded category values (AlertCategory in
    // @/types/api / the createAlertSchema enum in backend/alerts.ts), not
    // display-formatted strings — those never came back from a real alert.
    switch (category) {
      case 'LANDSLIDE':
        return <Mountain size={14} color={iconColor} />;
      case 'FLOOD_RAIN':
        return <Waves size={14} color={iconColor} />;
      case 'CLOUDBURST':
        return <CloudRain size={14} color={iconColor} />;
      case 'TRAFFIC_RUSH':
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
    <Animated.View style={[styles.advisoryCard, { opacity: fadeAnim }]}>
      <View style={styles.advisoryIconWrap}>
        <AlertTriangle size={18} color="#DC2626" />
      </View>
      <Text style={styles.advisoryTitle} numberOfLines={2}>
        {activeAlert.title}
      </Text>
      <Text style={styles.advisoryDesc} numberOfLines={4}>
        {activeAlert.desc}
      </Text>
      <TouchableOpacity
        style={styles.advisoryLink}
        activeOpacity={0.8}
        onPress={() => router.push('/monsoon-advisory')}
        hitSlop={{ top: 8, bottom: 10, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('home.viewDetails')}
      >
        <Text style={styles.advisoryLinkText}>{t('home.viewDetails')} &gt;</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function FeaturedTripsCarouselBase({ isFocused }: { isFocused: boolean }) {
  const { t } = useTranslation();
  const { trips, setActiveRoomId, dataStatus, refreshTrips } = useApp();
  const router = useRouter();
  const carouselRef = useRef<ScrollView>(null);
  const isInteracting = useRef(false);
  const scrollX = useRef(0);

  const organizerTrips = trips;
  const infiniteTrips = [...organizerTrips, ...organizerTrips, ...organizerTrips];

  useEffect(() => {
    if (!isFocused || organizerTrips.length <= 1) return;

    const cardWidth = SCREEN_WIDTH - 40;
    const stepWidth = cardWidth + 10;
    const singleSetWidth = stepWidth * organizerTrips.length;

    // Frame-aligned rather than a 30ms setInterval. The old timer fired ~33
    // times a second whether or not the device could paint that often, so on
    // a phone it queued scrollTo work faster than the JS thread could drain
    // it and competed with every other interaction. requestAnimationFrame
    // runs at most once per frame and stops while the app is backgrounded.
    // Speed is unchanged: the previous 0.85px per 30ms is 28.33px/second,
    // now expressed as distance × elapsed time so it stays constant at any
    // frame rate instead of drifting with timer lag.
    const PX_PER_MS = 0.85 / 30;
    const MIN_STEP_MS = 30; // keep the original 33/s cadence, not 60/s
    let raf = 0;
    let last = Date.now();

    const step = () => {
      const now = Date.now();
      const elapsed = now - last;
      // Only move on frames at least a step apart, so this does the same
      // amount of scroll work per second as the old timer did — never more.
      if (elapsed >= MIN_STEP_MS) {
        last = now;
        if (!isInteracting.current) {
          scrollX.current += PX_PER_MS * elapsed;
          if (scrollX.current >= singleSetWidth) {
            scrollX.current -= singleSetWidth;
          }
          carouselRef.current?.scrollTo({ x: scrollX.current, animated: false });
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => cancelAnimationFrame(raf);
  }, [organizerTrips, isFocused]);

  // The trip's own cover image or nothing. This used to look the id up in a
  // hardcoded table and otherwise match words in the title against stock
  // Unsplash photos, so a Kerala trip could be illustrated with Rajasthan
  // (docs/REMEDIATION.md §8.15 / §9.5).
  const getRoomId = (trip: Trip) => {
    return trip?.chatRoomId || `room-${trip.id}`;
  };

  if (dataStatus.trips === 'loading') {
    return (
      <View style={styles.carouselContainer}>
        <SkeletonCard />
      </View>
    );
  }

  if (dataStatus.trips === 'error') {
    return (
      <View style={styles.carouselContainer}>
        <ScreenError
          title={t('home.couldNotLoadTrips')}
          message={t('home.couldNotLoadTripsMessage')}
          onRetry={refreshTrips}
        />
      </View>
    );
  }

  if (organizerTrips.length === 0) {
    return (
      <View style={styles.carouselContainer}>
        <ScreenEmpty
          title={t('home.noTripsYet')}
          message={t('home.noTripsYetMessage')}
          actionLabel={t('home.createATrip')}
          onAction={() => router.navigate('/create')}
        />
      </View>
    );
  }

  return (
    <View style={styles.carouselContainer}>
      <ScrollView
        ref={carouselRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => { isInteracting.current = true; }}
        onTouchEnd={() => { setTimeout(() => { isInteracting.current = false; }, 1200); }}
        onScrollBeginDrag={() => { isInteracting.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { isInteracting.current = false; }, 1200); }}
        onScroll={(e) => {
          if (isInteracting.current) {
            scrollX.current = e.nativeEvent.contentOffset.x;
          }
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {infiniteTrips.map((trip, idx) => {
          const imageUri = tripCoverImage(trip);
          const durationText = formatTripDuration(trip);
          const transportText = tripTransportLabel(trip);

          return (
            <TouchableOpacity
              key={`${trip.id}-${idx}`}
              activeOpacity={0.85}
              onPress={() => {
                router.navigate('/search');
              }}
              style={[styles.tripCard, { width: SCREEN_WIDTH - 40 }]}
              accessibilityRole="button"
              accessibilityLabel={trip.name}
              accessibilityHint={t('home.tripCardHint')}
            >
              {/* Left side: Image */}
              <View style={styles.tripImageContainer}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.tripImage} />
                ) : (
                  <View style={[styles.tripImage, styles.tripImageFallback]}>
                    <MapPin size={18} color={C.textMuted} />
                  </View>
                )}
                <LinearGradient
                  colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.tripBadge, { backgroundColor: '#6C5CE7' }]}>
                  <Text style={styles.tripBadgeText}>{t('home.featured')}</Text>
                </View>
              </View>

              {/* Right side: Detailed trip content */}
              <View style={styles.tripContent}>
                <Text style={styles.tripName} numberOfLines={2}>
                  {trip.name}
                </Text>

                {/* No star rating and no "Verified Route" badge here: this app
                    has no review system and no rating column on Trip
                    (docs/REMEDIATION.md §8.14), so both were fabricated trust
                    signals shown identically on every trip. Seats and members
                    are real columns. */}
                <View style={styles.tripDetailsMetaRow}>
                  {trip.guideIncluded ? (
                    <View style={styles.verifiedBadge}>
                      <Check size={8} color={C.blue} strokeWidth={3} />
                      <Text style={styles.verifiedText}>{t('home.guideIncluded')}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.tripMetaText}>
                    {t('home.joined', { count: trip.membersCount })}
                  </Text>
                  <Text style={styles.tripMetaDot}>•</Text>
                  <Text style={styles.tripMetaSeats}>{t('home.seatsLeft', { count: trip.availableSeats })}</Text>
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
                  {durationText ? (
                    <View style={styles.capsule}>
                      <Clock size={8} color={C.textMuted} />
                      <Text style={styles.capsuleText} numberOfLines={1}>{durationText}</Text>
                    </View>
                  ) : null}
                  {transportText ? (
                    <View style={styles.capsule}>
                      <Plane size={8} color={C.textMuted} />
                      <Text style={styles.capsuleText} numberOfLines={1}>{transportText}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Price and Action Buttons */}
                <View style={styles.priceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>{t('home.totalPackage')}</Text>
                    <Text style={styles.priceAmount}>{formatINR(trip.budget)}</Text>
                  </View>
                  <View style={{ gap: 4, width: 110 }}>
                    <TouchableOpacity
                      style={styles.joinBtn}
                      onPress={() => {
                        router.navigate('/search');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.joinNow')}
                    >
                      <Text style={styles.joinBtnText}>{t('home.joinNow')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.joinBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0066FF', paddingVertical: 4 }]}
                      onPress={() => {
                        setActiveRoomId(getRoomId(trip));
                        router.navigate('/chat');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.joinChat')}
                    >
                      <MessageSquare size={9} color="#0066FF" style={{ marginRight: 2 }} />
                      <Text style={[styles.joinBtnText, { color: '#0066FF' }]}>{t('home.joinChat')}</Text>
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

// This screen runs six independent useQuery hooks (feed, stories,
// destinations, weather, alerts, guides) plus the AppContext subscription,
// and they settle at different times. Every one of those settling used to
// re-render all four of these children — each of which drives its own
// animation loop and rebuilds its Animated interpolations on render. None of
// them read anything from the parent beyond the props below, so memoising
// them means a query resolving no longer interrupts an animation mid-flight.
const AppleMultilingualGreeting = React.memo(AppleMultilingualGreetingBase);
const FloatingTouristWeatherCard = React.memo(FloatingTouristWeatherCardBase);
const RotatingMonsoonAlertCard = React.memo(RotatingMonsoonAlertCardBase);
const FeaturedTripsCarousel = React.memo(FeaturedTripsCarouselBase);

// ─── Component ──────────────────────────────────────────────────────
function HomeScreen() {
  const { t } = useTranslation();
  useEffect(() => {
    logger.log('Screen mounted: HomeScreen');
  }, []);
  const navigation = useNavigation();
  const [isFocused, setIsFocused] = useState(() => navigation.isFocused());

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      setIsFocused(true);
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsFocused(false);
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  const { currentRole, setCurrentRole, profile, isLoggedIn, hasUnreadNotification, checkUnreadNotifications } = useApp();
  const router = useRouter();
  const [activeDot, setActiveDot] = useState(0);
  const [showAuthPromptModal, setShowAuthPromptModal] = useState(false);
  const trendingRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const isInteractingRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);

  const handleAddStoryPress = () => {
    if (!isLoggedIn) {
      setShowAuthPromptModal(true);
    } else {
      router.push('/create');
    }
  };

  // ── Dynamic DB state (REMEDIATION.md §6.3: via TanStack Query) ─────
  // Stories, alerts, destinations and weather all show a real empty state
  // (storiesEmptyWrap / "All Clear" / trendingEmptyWrap / the weather
  // card's own empty branch) instead of a fabricated fallback — a backend
  // that has no destinations or weather rows yet is a true "nothing here",
  // not something to paper over with invented content.
  const { data: stories = [] } = useQuery({
    queryKey: queryKeys.feed(),
    queryFn: async () => {
      // Unified feed (stories + guide reels merged) from backend, falling
      // back to stories-only if the feed endpoint itself is unavailable.
      try {
        const res = await apiService.getFeed(20);
        if (res && Array.isArray(res.items) && res.items.length > 0) return res.items;
      } catch (e) {
        logger.warn('[Home] Feed fetch failed, falling back to stories only:', e);
      }
      const data = await apiService.getStories();
      return data ?? [];
    },
  });

  const { data: destinations = [] } = useQuery({
    queryKey: queryKeys.destinations(),
    queryFn: async () => {
      const data = await apiService.getDestinations();
      return data ?? [];
    },
  });

  const { data: weatherLocations = [] } = useQuery({
    queryKey: queryKeys.weatherLocations(),
    queryFn: async () => {
      const data = await apiService.getWeatherLocations();
      return data ?? [];
    },
  });

  // EMPTY_ALERTS, not a `[]` literal: a fresh array on each render is a new
  // reference, which would defeat the React.memo on RotatingMonsoonAlertCard
  // every time this screen re-rendered while the query was still pending.
  const { data: alerts = EMPTY_ALERTS } = useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: async () => {
      const data = await apiService.getAlerts();
      return data ?? [];
    },
  });

  useEffect(() => {
    if (isLoggedIn) {
      apiService.getNotifications().then((data) => {
        if (data) checkUnreadNotifications();
      }).catch((e) => logger.warn('[Home] Notification badge check failed:', e));
    }

    // Listen for real-time notifications to refresh the badge
    const unsubNotif = eventBus.on('inAppNotification', () => {
      if (isLoggedIn) checkUnreadNotifications();
    });

    return () => {
      unsubNotif();
    };
  }, [checkUnreadNotifications, isLoggedIn]);

  const infiniteTrendingDests = [...destinations, ...destinations];

  useEffect(() => {
    if (!isFocused || destinations.length <= 1) return;
    const itemWidth = TRENDING_CARD_WIDTH + 12;

    // `activeDot` is read through the state updater rather than the closure,
    // so this interval is armed once for the life of the carousel. With it in
    // the dependency array the effect tore down and re-armed a fresh timer on
    // every tick — three timers a second of pure churn, for an animation that
    // only moves once every three seconds.
    const interval = setInterval(() => {
      if (isInteractingRef.current) return;
      setActiveDot((prev) => {
        const nextDot = prev + 1 >= destinations.length ? 0 : prev + 1;
        scrollXRef.current = nextDot * itemWidth;
        trendingRef.current?.scrollTo({ x: scrollXRef.current, animated: true });
        return nextDot;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [destinations, isFocused]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const diff = y - lastScrollYRef.current;

          if (y <= 15) {
            if (navbarHiddenRef.current) {
              navbarHiddenRef.current = false;
              eventBus.emit('toggleNavbar', false);
            }
            lastScrollYRef.current = y;
            return;
          }

          if (diff > 0.01 && !navbarHiddenRef.current) {
            navbarHiddenRef.current = true;
            eventBus.emit('toggleNavbar', true);
          } else if (diff < -0.01 && navbarHiddenRef.current) {
            navbarHiddenRef.current = false;
            eventBus.emit('toggleNavbar', false);
          }

          lastScrollYRef.current = y;
        }}
      >
        {/* ════════════════════════════════════════════════
            HERO BANNER — Image at Top Behind Header
            ════════════════════════════════════════════════ */}
        <ImageBackground
          source={require('@/assets/images/hero-banner.jpg')}
          style={styles.heroBannerWrap}
          imageStyle={styles.heroBannerImage}
          resizeMode="contain"
        >
          <View style={styles.topHeader}>
            <View style={{ flex: 1 }}>
              <AppleMultilingualGreeting isFocused={isFocused} />
              <Text style={styles.userName} numberOfLines={1}>
                {profile.name || 'Guest Traveler'}
              </Text>
              <Text style={styles.userSub} numberOfLines={1}>
                Explore more. Experience better.
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.headerIconsRow}>
                <TouchableOpacity
                  style={styles.bellWrap}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => router.push('/notifications')}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.notificationsLabel')}
                  accessibilityHint={hasUnreadNotification ? t('home.notificationsUnreadHint') : undefined}
                >
                  <Bell size={18} color="#334155" strokeWidth={1.8} />
                  {hasUnreadNotification && <View style={styles.bellDot} />}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.avatarWrap}
                  onPress={() => {
                    if (!isLoggedIn) {
                      router.push('/auth?mode=SIGNUP');
                    } else {
                      router.navigate('/profile');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.profileLabel')}
                >
                  {isLoggedIn && profile.avatar ? (
                    <Image
                      source={{ uri: profile.avatar }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.anonymousAvatarSmall}>
                      <User size={18} color="#64748B" strokeWidth={2} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {!isLoggedIn && (
                <TouchableOpacity
                  style={styles.loginPillBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push('/auth')}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.loginSignUp')}
                >
                  <Text style={styles.loginPillText}>
                    Login / Sign Up
                  </Text>
                  <ChevronRight size={12} color="#2563EB" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ImageBackground>

        {/* ════════════════════════════════════════════════
            ROLE CARDS — Overlapping Lower Half of Hero Image Banner
            ════════════════════════════════════════════════ */}
        <View style={styles.roleTabsRow}>
          {roles.map((role) => {
            const isActive = currentRole === role.value;
            const iconBg =
              role.value === 'TOURIST'
                ? isActive ? '#2563EB' : '#EFF6FF'
                : role.value === 'GUIDE'
                  ? '#ECFDF5'
                  : '#FFF7ED';
            const iconColor =
              role.value === 'TOURIST'
                ? isActive ? '#FFFFFF' : '#2563EB'
                : role.value === 'GUIDE'
                  ? '#10B981'
                  : '#F97316';

            return (
              <TouchableOpacity
                key={role.value}
                activeOpacity={0.85}
                onPress={() => {
                  setCurrentRole(role.value);
                  profile.role = role.value;
                  if (role.value === 'GUIDE') {
                    router.push('/travel-guide');
                  }
                  if (role.value === 'ORGANIZER') {
                    router.push('/group-organizer');
                  }
                }}
                style={[styles.roleCard, isActive && styles.roleCardActive]}
                accessibilityRole="button"
                accessibilityLabel={`${t(role.labelKey)}, ${t(role.subKey)}`}
                accessibilityHint={t('home.roleSelectHint')}
                accessibilityState={{ selected: isActive }}
              >
                <View style={[styles.roleIconCircle, { backgroundColor: iconBg }]}>
                  <role.Icon size={18} color={iconColor} strokeWidth={2.2} />
                </View>
                <Text style={styles.roleLabel}>{t(role.labelKey)}</Text>
                <Text style={styles.roleSub}>{t(role.subKey)}</Text>
                {isActive && <View style={styles.roleActiveIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════════════════════════════════════
            TRAVEL REELS & STORIES — Blue Ring Story Circles & Add Story
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.reelsAndStories') || 'Travel Reels & Stories'}</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
            onPress={() => router.push('/stories')}
            accessibilityRole="button"
            accessibilityLabel={t('home.viewAll')}
          >
            <Text style={styles.viewAllText}>{t('home.viewAll')}</Text>
            <ChevronRight size={14} color="#2563EB" />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesRow}
        >
          {/* Your Story circle with Plus badge */}
          <TouchableOpacity
            style={styles.storyItem}
            activeOpacity={0.8}
            onPress={handleAddStoryPress}
            accessibilityRole="button"
            accessibilityLabel={t('home.addStory')}
          >
            <View style={styles.addStoryRing}>
              {profile?.avatar ? (
                <Image source={{ uri: profile.avatar }} style={styles.storyImage} />
              ) : (
                <View style={styles.addStoryAvatarFallback}>
                  <Camera size={24} color="#2563EB" strokeWidth={1.8} />
                </View>
              )}
              <View style={styles.addStoryPlusBadge}>
                <Plus size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>
            <Text style={styles.storyName} numberOfLines={1}>
              {t('home.yourStory')}
            </Text>
          </TouchableOpacity>

          {stories.map((story: HomeFeedItem) => (
            <TouchableOpacity
              key={story.id}
              style={styles.storyItem}
              activeOpacity={0.8}
              onPress={() => {
                router.push({
                  pathname: '/stories',
                  params: { location: story.location || story.title }
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('home.storyLabel', { location: story.location || story.title })}
            >
              <View style={styles.storyRing}>
                <Image source={{ uri: story.coverImg ?? undefined }} style={styles.storyImage} />
              </View>
              <Text style={styles.storyName} numberOfLines={2}>
                {story.location || story.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ════════════════════════════════════════════════
            QUICK ACCESS ROW — 3 White Cards
            ════════════════════════════════════════════════ */}
        <View style={styles.quickAccessRow}>
          {quickAccessItems.map((item, index) => {
            const iconBg = index === 0 ? '#EFF6FF' : index === 1 ? '#ECFDF5' : '#FFF7ED';
            const iconCol = index === 0 ? '#2563EB' : index === 1 ? '#10B981' : '#F59E0B';

            return (
              <TouchableOpacity
                key={index}
                style={styles.quickCardItem}
                activeOpacity={0.8}
                onPress={() => {
                  if (item.route) {
                    router.push(item.route!);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={t(item.labelKey)}
              >
                <View style={{ position: 'relative' }}>
                  <View style={[styles.quickIconCircle, { backgroundColor: iconBg }]}>
                    <item.Icon size={20} color={iconCol} strokeWidth={2.2} />
                  </View>
                  {item.isNew && (
                    <View style={styles.newBadgePill}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.quickLabel}>{t(item.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════════════════════════════════════
            WEATHER & ALERTS — Two column
            ════════════════════════════════════════════════ */}
        <View style={styles.weatherAlertRow}>
          {/* Animated Floating Weather Card */}
          <FloatingTouristWeatherCard locations={weatherLocations} isFocused={isFocused} />

          {/* Alerts Stack — Stretched Monsoon Card */}
          <View style={styles.alertsColumn}>
            {/* Monsoon Warning (Full Height in Column) */}
            <RotatingMonsoonAlertCard alerts={alerts} isFocused={isFocused} />
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            FEATURED GROUP TRIPS CAROUSEL
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.featuredGroupTrips')}</Text>
        </View>
        <FeaturedTripsCarousel isFocused={isFocused} />

        {/* ════════════════════════════════════════════════
            TRENDING DESTINATIONS — Carousel + dots
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.trendingDestinations')}</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('home.viewAll')}
          >
            <Text style={styles.viewAllText}>{t('home.viewAll')}</Text>
            <ChevronRight size={14} color={C.blue} />
          </TouchableOpacity>
        </View>
        {destinations.length === 0 ? (
          // No fabricated Ladakh/Goa/Kerala cards here — an empty backend
          // destinations list is shown as empty, not stood in for.
          <View style={styles.storiesEmptyWrap}>
            <Text style={styles.storiesEmptyText}>{t('home.destinationsEmpty')}</Text>
          </View>
        ) : (
          <>
            <ScrollView
              ref={trendingRef}
              horizontal
              snapToInterval={TRENDING_CARD_WIDTH + 12}
              decelerationRate="fast"
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
              onMomentumScrollEnd={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                scrollXRef.current = x;
                const currentIdx = Math.round(x / (TRENDING_CARD_WIDTH + 12)) % destinations.length;
                setActiveDot(currentIdx);
                isInteractingRef.current = false;
              }}
            >
              {infiniteTrendingDests.map((dest, index) => (
                // No accessibilityRole="button" here (unlike other cards) — this
                // one has its own nested button (the heart, below), and
                // react-native-web renders that role as a literal <button>. Two
                // nested <button> elements is invalid HTML; the browser's own
                // DOM validation rejects it, which is a web-only crash with no
                // native-side symptom (there's no such DOM rule on iOS/Android).
                // onPress/activeOpacity below are unaffected — only the ARIA
                // role/HTML tag choice changes.
                <TouchableOpacity
                  key={`${dest.id}-${index}`}
                  style={styles.trendingCard}
                  activeOpacity={0.9}
                  onPress={() => {
                    router.push({
                      pathname: '/destination-details',
                      params: { id: String(dest.id) }
                    });
                  }}
                  accessibilityLabel={t('home.destinationCardLabel', { name: dest.name, rating: dest.rating })}
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
                      colors={['#FFD700', '#F59E0B', '#B45309']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.rankRibbonBody}
                    >
                      <Text style={styles.rankRibbonText}>
                        #{destinations.length > 0 ? (index % destinations.length) + 1 : index + 1}
                      </Text>
                    </LinearGradient>
                  </View>
                  {/* Heart Button */}
                  <TouchableOpacity
                    style={styles.heartBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.favoriteHint')}
                  >
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
              {destinations.map((_, idx: number) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    activeDot === idx ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          </>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Add Story / Sign Up Prompt Modal ── */}
      <Modal
        visible={showAuthPromptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuthPromptModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAuthPromptModal(false)}
          />
          <View style={styles.authModalCard}>
            {/* Close button */}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowAuthPromptModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>

            {/* Header Icon */}
            <View style={styles.modalIconWrap}>
              <LinearGradient
                colors={['#2563EB', '#38BDF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalIconGradient}
              >
                <Camera size={28} color="#FFFFFF" strokeWidth={2} />
              </LinearGradient>
            </View>

            {/* Modal Title & Desc */}
            <Text style={styles.authModalTitle}>
              {t('home.shareStoryModalTitle')}
            </Text>
            <Text style={styles.authModalDesc}>
              {t('home.shareStoryModalDesc')}
            </Text>

            {/* Value props / perks */}
            <View style={styles.authModalPerks}>
              <View style={styles.authModalPerkRow}>
                <View style={styles.perkCheckCircle}>
                  <Check size={12} color="#10B981" strokeWidth={3} />
                </View>
                <Text style={styles.perkText}>{t('home.shareStoryBenefit1')}</Text>
              </View>
              <View style={styles.authModalPerkRow}>
                <View style={styles.perkCheckCircle}>
                  <Check size={12} color="#10B981" strokeWidth={3} />
                </View>
                <Text style={styles.perkText}>{t('home.shareStoryBenefit2')}</Text>
              </View>
              <View style={styles.authModalPerkRow}>
                <View style={styles.perkCheckCircle}>
                  <Check size={12} color="#10B981" strokeWidth={3} />
                </View>
                <Text style={styles.perkText}>{t('home.shareStoryBenefit3')}</Text>
              </View>
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={styles.authModalPrimaryBtn}
              activeOpacity={0.85}
              onPress={() => {
                setShowAuthPromptModal(false);
                router.push('/auth');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('home.continueToSignUp')}
            >
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.authModalPrimaryGradient}
              >
                <Text style={styles.authModalPrimaryText}>
                  {t('home.continueToSignUp')}
                </Text>
                <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.authModalSecondaryBtn}
              activeOpacity={0.7}
              onPress={() => setShowAuthPromptModal(false)}
              accessibilityRole="button"
              accessibilityLabel={t('home.maybeLater')}
            >
              <Text style={styles.authModalSecondaryText}>
                {t('home.maybeLater')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tripImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  tripMetaText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  tripMetaDot: { fontSize: 12, color: C.textMuted },
  tripMetaSeats: { fontSize: 12, fontWeight: '600', color: C.greenText },
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
    backgroundColor: C.card,
    borderColor: C.border,
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '700',
    color: C.blue,
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blue,
  },
  routeArrow: {
    fontSize: 12,
    color: C.textMuted,
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
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingTop: 6,
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  priceAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: C.blue,
    marginTop: -2,
  },
  joinBtn: {
    backgroundColor: C.blue,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Top Header (Inside ImageBackground) ─────────────
  topHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  appleGreetingContainer: {
    height: 22,
    justifyContent: 'center',
    marginBottom: 2,
  },
  appleGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appleGreetingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  userSub: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginPillBtn: {
    marginTop: 0,
    marginRight: -20,
    transform: [{ scale: 0.8 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  loginPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginRight: 4,
  },
  bellWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  anonymousAvatarSmall: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hero Banner (Full Length, Exact Aspect Ratio, Zero Distortion) ──
  heroBannerWrap: {
    width: HERO_BANNER_WIDTH,
    height: HERO_BANNER_HEIGHT,
    backgroundColor: 'transparent',
  },
  heroBannerImage: {
    width: HERO_BANNER_WIDTH,
    height: HERO_BANNER_HEIGHT,
  },

  // ── Role Cards ──────────────────────────────────────
  roleTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
    marginTop: 14,
    zIndex: 10,
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  roleCardActive: {
    borderColor: '#BFDBFE',
  },
  roleIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  roleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  roleActiveIndicator: {
    height: 3,
    width: 32,
    backgroundColor: '#2563EB',
    borderRadius: 2,
    marginTop: 8,
  },

  // ── Search Bar ──────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#64748B',
  },

  // ── Quick Access Row ────────────────────────────────
  quickAccessRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  quickCardItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quickIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  newBadgePill: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#C2410C',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
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
    minHeight: 210,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  weatherEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  weatherEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // Carries the border + overflow: hidden that used to live on weatherCard
  // itself — see the comment at its JSX usage for why elevation and
  // overflow: hidden can't share one view on Android.
  weatherClip: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  // Opaque: without a background the outgoing card reads straight through
  // the incoming one mid-slide and both are visible at once.
  weatherLayer: {
    backgroundColor: '#FFFFFF',
  },
  storiesEmptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  storiesEmptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  weatherCardInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  tempText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
  },
  weatherCondition: {
    fontSize: 12,
    color: '#64748B',
    marginTop: -2,
  },
  aqiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  aqiLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  aqiValue: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
  },
  weatherDetail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  weatherThumbWrap: {
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
    position: 'relative',
  },
  weatherThumb: {
    width: '100%',
    height: '100%',
  },
  badgeLive: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Advisory / Alerts ──
  alertsColumn: {
    flex: 1,
  },
  allClearCard: {
    flex: 1,
    minHeight: 210,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  allClearHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  allClearHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  allClearLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  allClearHeaderText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  allClearCenter: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  allClearIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  allClearTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  allClearSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  allClearLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  allClearLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  advisoryCard: {
    flex: 1,
    minHeight: 210,
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  advisoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advisoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 8,
    lineHeight: 17,
  },
  advisoryDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
    marginTop: 4,
  },
  advisoryLink: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  advisoryLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },

  // ── Stories & Add Story ──────────────────────────────
  storiesRow: {
    paddingHorizontal: 20,
    gap: 14,
    marginBottom: 24,
    alignItems: 'center',
  },
  storyItem: {
    alignItems: 'center',
    width: 76,
  },
  addStoryRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#EFF6FF',
  },
  addStoryAvatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStoryPlusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  storyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#2563EB',
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  storyName: {
    marginTop: 6,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Auth Prompt Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  authModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modalIconWrap: {
    marginBottom: 16,
    marginTop: 4,
  },
  modalIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  authModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  authModalDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  authModalPerks: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  authModalPerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  perkCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  authModalPrimaryBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  authModalPrimaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  authModalPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  authModalSecondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  authModalSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
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
    fontSize: 12,
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
    fontSize: 12,
    color: C.textSec,
  },
  aiBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  aiBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
});

export default React.memo(HomeScreen);
