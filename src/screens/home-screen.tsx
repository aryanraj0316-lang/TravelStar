import TripDetailModal from '@/components/TripDetailModal';
import { CoverImage, ScreenEmpty, ScreenError, Skeleton, SkeletonCard } from '@/components/ui';
import { logger } from '@/lib/logger';
import { formatINR } from '@/lib/money';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import { formatTripDuration, tripCoverImage, tripTransportLabel } from '@/lib/trip-display';
import { weatherGlyph } from '@/lib/weather-display';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { useApp, UserRole, type Trip } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { FeedItem, HazardAlert, TrendingWeatherDestination } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter, type Href } from 'expo-router';
import Activity from 'lucide-react-native/icons/activity';
import Bell from 'lucide-react-native/icons/bell';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Cloud from 'lucide-react-native/icons/cloud';
import CloudFog from 'lucide-react-native/icons/cloud-fog';
import CloudLightning from 'lucide-react-native/icons/cloud-lightning';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import CloudSnow from 'lucide-react-native/icons/cloud-snow';
import CloudSun from 'lucide-react-native/icons/cloud-sun';
import Flame from 'lucide-react-native/icons/flame';
import Globe from 'lucide-react-native/icons/globe';
import Map from 'lucide-react-native/icons/map';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mountain from 'lucide-react-native/icons/mountain';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import Star from 'lucide-react-native/icons/star';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Sun from 'lucide-react-native/icons/sun';
import Tornado from 'lucide-react-native/icons/tornado';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import Users from 'lucide-react-native/icons/users';
import Wallet from 'lucide-react-native/icons/wallet';
import Waves from 'lucide-react-native/icons/waves-horizontal';
import X from 'lucide-react-native/icons/x';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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

// ─── Data ───────────────────────────────────────────────────────────
const roles: { value: UserRole; labelKey: string; subKey: string; Icon: typeof Globe }[] = [
  { value: 'TOURIST', labelKey: 'home.roleTourist', subKey: 'home.roleTouristSub', Icon: Globe },
  { value: 'GUIDE', labelKey: 'home.roleGuide', subKey: 'home.roleGuideSub', Icon: Map },
  { value: 'ORGANIZER', labelKey: 'home.roleOrganizer', subKey: 'home.roleOrganizerSub', Icon: Users },
];

const quickAccessItems: { labelKey: string; Icon: typeof MapPin; isNew: boolean; route: Href }[] = [
  { labelKey: 'home.quickNearby', Icon: MapPin, isNew: false, route: '/nearby-trips' },
  { labelKey: 'home.quickFindGuide', Icon: Map, isNew: false, route: '/find-guides' },
  { labelKey: 'home.quickBookings', Icon: CalendarCheck, isNew: false, route: '/bookings' },
  { labelKey: 'home.quickBudgetTracker', Icon: Wallet, isNew: false, route: '/budget-tracker' },
];

/**
 * Why the auth modal was opened. Every guest-gated action on this screen
 * routes through one modal (`AuthPromptModal` below) rather than failing a
 * request with a 401 or silently no-op-ing — the app is deliberately
 * browse-before-login, so the boundary has to be a prompt, not an error.
 */
type AuthReason = 'STORY' | 'CREATE_TRIP' | 'JOIN_TRIP' | 'GUIDE_ROLE' | 'ORGANIZER_ROLE';

const AUTH_REASON_COPY: Record<AuthReason, { titleKey: string; descKey: string; Icon: typeof Camera }> = {
  STORY: { titleKey: 'home.shareStoryModalTitle', descKey: 'home.shareStoryModalDesc', Icon: Camera },
  CREATE_TRIP: { titleKey: 'home.createTripAuthTitle', descKey: 'home.createTripAuthDesc', Icon: Plus },
  JOIN_TRIP: { titleKey: 'home.joinTripAuthTitle', descKey: 'home.joinTripAuthDesc', Icon: Users },
  GUIDE_ROLE: { titleKey: 'home.guideAuthTitle', descKey: 'home.guideAuthDesc', Icon: Map },
  ORGANIZER_ROLE: { titleKey: 'home.organizerAuthTitle', descKey: 'home.organizerAuthDesc', Icon: Users },
};

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

// ─── Weather ────────────────────────────────────────────────────────

const WEATHER_GLYPH_ICON = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  fog: CloudFog,
  storm: CloudLightning,
} as const;

const TRENDING_WEATHER_SLIDE_MS = 3200;

/**
 * A single card that slides between this app's curated trending
 * destinations (GET /weather/trending — real weather + air quality per
 * destination, never a per-user current-location reading). Two-layer
 * base/sliding trick, same mechanic this card originally shipped with:
 * the base layer is always visible and never animates, and a second copy
 * slides in from off-screen to replace it, so the swap underneath is
 * invisible once the sliding layer finishes covering the base.
 */
const CAROUSEL_SLOT_OFFSET = 260;

function slotOffscreenOffset(dir: number): { x: number; y: number } {
  if (dir === 0) return { x: -CAROUSEL_SLOT_OFFSET, y: 0 };
  if (dir === 2) return { x: CAROUSEL_SLOT_OFFSET, y: 0 };
  if (dir === 1) return { x: 0, y: -CAROUSEL_SLOT_OFFSET };
  return { x: 0, y: CAROUSEL_SLOT_OFFSET };
}

function TrendingWeatherCardBase({ isFocused }: { isFocused: boolean }) {
  const { t } = useTranslation();
  // Two permanently-mounted card slots instead of conditionally mounting a
  // "sliding" one each cycle. Mounting a fresh expo-image Image always costs
  // one native round trip before its bitmap paints — even when the URL is
  // already cache-resident — which is what read as a once-per-swap flicker.
  // Keeping both slots alive for the component's whole lifetime means only
  // their `source` prop ever changes, and that change always happens while
  // the slot is fully hidden (positioned off-card and z-ordered underneath
  // the visible one), so there is nothing left to flicker.
  const [slotContentIdx, setSlotContentIdx] = useState<[number, number]>([0, 1]);
  const [topSlot, setTopSlot] = useState<0 | 1>(0);
  const slot0X = useState(() => new Animated.Value(0))[0];
  const slot0Y = useState(() => new Animated.Value(0))[0];
  const slot1X = useState(() => new Animated.Value(CAROUSEL_SLOT_OFFSET))[0];
  const slot1Y = useState(() => new Animated.Value(0))[0];
  const slotAnims = useState(() => [
    { x: slot0X, y: slot0Y },
    { x: slot1X, y: slot1Y },
  ])[0];
  const topSlotRef = useRef<0 | 1>(0);
  const visibleContentIdxRef = useRef(0);
  const isAnimatingRef = useRef(false);

  const weatherQuery = useQuery({
    queryKey: queryKeys.trendingWeather(),
    queryFn: async () => (await apiService.getTrendingWeather()) ?? [],
    // Matches the server's own weather/AQI cache window — a reading newer
    // than this is the same upstream answer.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const { data: destinations, refetch } = weatherQuery;
  const weatherState = sectionState(weatherQuery, destinations != null);
  const destinationCount = destinations?.length ?? 0;

  useEffect(() => {
    // Warm expo-image's cache for every card up front too, so even a slot's
    // very first (off-screen) content swap has nothing left to fetch.
    for (const d of destinations ?? []) {
      void ExpoImage.prefetch(d.image);
    }
  }, [destinations]);

  useEffect(() => {
    if (!isFocused || destinationCount <= 1) return;
    const interval = setInterval(() => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      const mover = topSlotRef.current === 0 ? 1 : 0;
      const nextIdx = (visibleContentIdxRef.current + 1) % destinationCount;
      const dir = nextIdx % 4;
      const { x, y } = slotOffscreenOffset(dir);

      // The mover slot is currently hidden underneath the visible one, so
      // repositioning and re-pointing it at the next destination here is
      // invisible — only the animation below is ever seen.
      slotAnims[mover].x.setValue(x);
      slotAnims[mover].y.setValue(y);
      setSlotContentIdx((prev) => {
        const next: [number, number] = [...prev];
        next[mover] = nextIdx;
        return next;
      });
      topSlotRef.current = mover;
      setTopSlot(mover);

      Animated.parallel([
        Animated.timing(slotAnims[mover].x, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slotAnims[mover].y, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          visibleContentIdxRef.current = nextIdx;
        }
        isAnimatingRef.current = false;
      });
    }, TRENDING_WEATHER_SLIDE_MS);

    return () => clearInterval(interval);
  }, [destinationCount, isFocused, slotAnims]); // slotAnims' identity is stable for the component's lifetime

  if (weatherState.kind === 'loading') {
    return (
      <View style={styles.weatherCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderBadge}>
            <View style={[styles.cardLiveDot, styles.cardDotInactive]} />
            <Text style={styles.cardHeaderText} numberOfLines={1}>
              {t('home.trendingWeatherTitle')}
            </Text>
          </View>
          <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#EFF6FF' }]}>
            <CloudSun size={13} color="#2563EB" />
          </View>
        </View>
        <View style={styles.cardStateCenter}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.cardStateMessage}>{t('home.weatherLoading')}</Text>
        </View>
        <View style={styles.cardFooterSpacer} />
      </View>
    );
  }

  if (weatherState.kind === 'error' || !destinations) {
    return (
      <View style={styles.weatherCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderBadge}>
            <View style={[styles.cardLiveDot, styles.cardDotInactive]} />
            <Text style={styles.cardHeaderText} numberOfLines={1}>
              {t('home.trendingWeatherTitle')}
            </Text>
          </View>
          <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AlertTriangle size={13} color={C.redText} />
          </View>
        </View>
        <View style={styles.cardStateCenter}>
          <View style={[styles.cardCenterIconCircle, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
            <AlertTriangle size={18} color={C.amberText} strokeWidth={2.2} />
          </View>
          <Text style={styles.cardPromptTitle}>{t('home.weatherErrorTitle')}</Text>
          <Text style={styles.cardPromptMessage} numberOfLines={2}>
            {weatherState.kind === 'error' && weatherState.offline
              ? t('common.offlineMessage')
              : t('home.weatherErrorMessage')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.cardSecondaryCta}
          activeOpacity={0.8}
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text style={styles.cardSecondaryCtaText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (destinations.length === 0) {
    return (
      <View style={styles.weatherCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderBadge}>
            <View style={[styles.cardLiveDot, styles.cardDotInactive]} />
            <Text style={styles.cardHeaderText} numberOfLines={1}>
              {t('home.trendingWeatherTitle')}
            </Text>
          </View>
          <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#F1F5F9' }]}>
            <CloudSun size={13} color={C.textMuted} />
          </View>
        </View>
        <View style={styles.cardStateCenter}>
          <Text style={styles.cardPromptMessage} numberOfLines={3}>
            {t('home.trendingWeatherEmpty')}
          </Text>
        </View>
        <View style={styles.cardFooterSpacer} />
      </View>
    );
  }

  const slotItems: [TrendingWeatherDestination, TrendingWeatherDestination] = [
    destinations[slotContentIdx[0] % destinations.length]!,
    destinations[slotContentIdx[1] % destinations.length]!,
  ];

  const renderCard = (item: TrendingWeatherDestination) => {
    const GlyphIcon = WEATHER_GLYPH_ICON[weatherGlyph(item.condition)];
    return (
      <>
        <CoverImage uri={item.image} name={item.name} style={StyleSheet.absoluteFill} showInitial={false} transition={0} />
        <LinearGradient colors={['rgba(13,15,26,0.35)', 'rgba(13,15,26,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={styles.weatherContent}>
          <View style={styles.locationRow}>
            <MapPin size={13} color={C.green} />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View style={styles.tempRow}>
            <Text style={styles.tempText}>{item.temp}</Text>
            <GlyphIcon size={30} color={C.orange} />
          </View>
          <Text style={styles.weatherCondition} numberOfLines={1}>
            {item.condition}
          </Text>
          {item.aqi && <Text style={styles.aqiText}>{t('home.trendingWeatherAqi', { level: item.aqi })}</Text>}
          <View style={styles.weatherBottom}>
            <Text style={styles.weatherDetail}>{t('home.trendingWeatherHumidity', { value: item.humidity })}</Text>
            <View style={styles.badgeLive}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('home.live')}</Text>
            </View>
          </View>
        </View>
      </>
    );
  };

  return (
    <View style={[styles.weatherCard, styles.weatherCardPhoto]}>
      {([0, 1] as const).map((slot) => (
        <Animated.View
          key={slot}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX: slotAnims[slot].x }, { translateY: slotAnims[slot].y }],
              zIndex: topSlot === slot ? 2 : 1,
            },
          ]}
        >
          {renderCard(slotItems[slot])}
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Route safety ───────────────────────────────────────────────────

function AllClearCard({ onViewDetails }: { onViewDetails: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.allClearCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderBadge}>
          <View style={[styles.cardLiveDot, styles.cardDotGreen]} />
          <Text style={styles.cardHeaderText} numberOfLines={1}>
            {t('home.routeSafety')}
          </Text>
        </View>
        <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#ECFDF5' }]}>
          <ShieldCheck size={14} color="#059669" strokeWidth={2.2} />
        </View>
      </View>

      <View style={styles.allClearCenter}>
        <View style={styles.allClearIconCircle}>
          <Check size={20} color="#059669" strokeWidth={2.6} />
        </View>
        <Text style={styles.allClearTitle}>{t('home.allClear')}</Text>
        <Text style={styles.allClearSubtitle} numberOfLines={2}>
          {t('home.allClearMinimalDesc')}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.allClearFooterBtn}
        activeOpacity={0.75}
        onPress={onViewDetails}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('home.viewDetails')}
      >
        <Text style={styles.allClearFooterBtnText}>{t('home.viewDetails')}</Text>
        <ChevronRight size={12} color={C.greenText} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
}

const ALERT_CATEGORY_ICON = {
  LANDSLIDE: Mountain,
  FLOOD_RAIN: Waves,
  CLOUDBURST: CloudRain,
  TRAFFIC_RUSH: Car,
  CYCLONE: Tornado,
  EARTHQUAKE: Activity,
  WILDFIRE: Flame,
} as const;

function RouteSafetyCardBase({ isFocused }: { isFocused: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [alertIndex, setAlertIndex] = useState(0);
  const fadeAnim = useState(() => new Animated.Value(1))[0];
  const isAnimatingRef = useRef(false);

  const alertsQuery = useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: async () => (await apiService.getAlerts()) ?? [],
  });
  const { data: alerts, refetch } = alertsQuery;
  const alertsState = sectionState(alertsQuery, alerts != null);

  const alertCount = alerts?.length ?? 0;

  useEffect(() => {
    if (!isFocused || alertCount <= 1) return;
    const timer = setInterval(() => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setAlertIndex((prev) => (prev + 1) % alertCount);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }).start(() => {
            isAnimatingRef.current = false;
          });
        }
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [alertCount, isFocused, fadeAnim]);

  const openAdvisory = useCallback(() => router.push('/monsoon-advisory'), [router]);

  if (alertsState.kind === 'loading') {
    return (
      <View style={styles.allClearCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderBadge}>
            <View style={[styles.cardLiveDot, styles.cardDotInactive]} />
            <Text style={styles.cardHeaderText} numberOfLines={1}>
              {t('home.routeSafety')}
            </Text>
          </View>
          <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#ECFDF5' }]}>
            <ShieldCheck size={14} color="#059669" strokeWidth={2.2} />
          </View>
        </View>

        <View style={styles.cardStateCenter}>
          <ActivityIndicator size="small" color="#10B981" />
          <Text style={styles.cardStateMessage}>{t('home.checkingRoutes')}</Text>
        </View>

        <View style={styles.cardFooterSpacer} />
      </View>
    );
  }

  // Distinct from the all-clear state below on purpose. A failed hazard
  // fetch rendering "all monitored routes are safe" is not a cosmetic bug —
  // it is the safety card asserting something it does not know. That applies
  // just as much when the reason is "we are offline" as when the server
  // returned a 500.
  if (alertsState.kind === 'error' || !alerts) {
    return (
      <View style={styles.allClearCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderBadge}>
            <View style={[styles.cardLiveDot, styles.cardDotInactive]} />
            <Text style={styles.cardHeaderText} numberOfLines={1}>
              {t('home.routeSafety')}
            </Text>
          </View>
          <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AlertTriangle size={13} color={C.redText} />
          </View>
        </View>

        <View style={styles.cardStateCenter}>
          <View style={[styles.cardCenterIconCircle, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
            <AlertTriangle size={18} color={C.amberText} strokeWidth={2.2} />
          </View>
          <Text style={styles.cardPromptTitle}>{t('home.couldNotLoadAlerts')}</Text>
          <Text style={styles.cardPromptMessage} numberOfLines={2}>
            {alertsState.kind === 'error' && alertsState.offline
              ? t('common.offlineMessage')
              : t('home.couldNotLoadAlertsMessage')}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.cardSecondaryCta}
          activeOpacity={0.8}
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text style={styles.cardSecondaryCtaText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Zero active alerts is the real, good answer from GET /alerts (synced
  // hourly from GDACS), not an absence of data — so it gets a deliberate
  // "all clear" card rather than a generic empty state.
  if (alerts.length === 0) {
    return <AllClearCard onViewDetails={openAdvisory} />;
  }

  const activeAlert: HazardAlert = alerts[alertIndex % alerts.length];
  const CategoryIcon = ALERT_CATEGORY_ICON[activeAlert.category] ?? AlertTriangle;

  return (
    <Animated.View style={[styles.advisoryCard, { opacity: fadeAnim }]}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderBadge}>
          <View style={[styles.cardLiveDot, styles.cardDotRed]} />
          <Text style={[styles.cardHeaderText, { color: C.redText }]} numberOfLines={1}>
            {t('home.routeSafety')}
          </Text>
        </View>
        {/* GDACS's own live map-marker icon for this event category, not a
            stock photo — it's small and transparent by design, so it sits in
            the same circular badge the CategoryIcon fallback uses rather
            than being stretched to fill the card. The lucide icon renders
            underneath so a broken/expired GDACS icon URL still leaves a
            real icon visible instead of an empty badge. transition=0 for
            the same reason as the weather card: this Image already lives
            inside an Animated opacity fade, and letting expo-image run its
            own cross-fade on top of that is what read as a flicker. */}
        <View style={[styles.cardHeaderIconCircle, { backgroundColor: '#FEE2E2' }]}>
          <View style={[StyleSheet.absoluteFill, styles.advisoryIconFallback]}>
            <CategoryIcon size={13} color={C.redText} />
          </View>
          <CoverImage
            uri={activeAlert.image}
            name={activeAlert.title}
            style={styles.advisoryIcon}
            showInitial={false}
            transition={0}
          />
        </View>
      </View>

      <View style={styles.advisoryCenter}>
        <Text style={styles.advisoryTitle} numberOfLines={2}>
          {activeAlert.title}
        </Text>
        <View style={styles.locationRowDark}>
          <MapPin size={11} color={C.redText} />
          <Text style={styles.advisoryLocation} numberOfLines={1}>
            {activeAlert.location}
          </Text>
          <Text style={styles.advisoryTime} numberOfLines={1}>
            · {activeAlert.time}
          </Text>
        </View>
        <Text style={styles.advisoryDesc} numberOfLines={2}>
          {activeAlert.desc}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.advisoryFooterBtn}
        activeOpacity={0.8}
        onPress={openAdvisory}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('home.viewDetails')}
      >
        <Text style={styles.advisoryFooterBtnText}>{t('home.viewDetails')}</Text>
        <ChevronRight size={12} color={C.redText} strokeWidth={2.4} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Featured group trips ───────────────────────────────────────────

function FeaturedTripsCarouselBase({
  isFocused,
  onOpenTrip,
  onRequestAuth,
}: {
  isFocused: boolean;
  onOpenTrip: (trip: Trip) => void;
  onRequestAuth: (reason: AuthReason) => void;
}) {
  const { t } = useTranslation();
  const { trips, dataStatus, refreshTrips, isLoggedIn, joinTrip, requestedTrips } = useApp();
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

  const handleJoin = (trip: Trip) => {
    if (!isLoggedIn) {
      onRequestAuth('JOIN_TRIP');
      return;
    }
    // The real join flow: POST /interactions/join-request through
    // AppContext, which owns the optimistic `requestedTrips` entry, the
    // rollback on failure and the offline queue.
    joinTrip(trip.id);
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
      <View style={styles.emptyTripCard}>
        <View style={styles.emptyTripIconCircle}>
          <Users size={20} color="#64748B" strokeWidth={1.8} />
        </View>
        <Text style={styles.emptyTripTitle}>{t('home.noTripsYet')}</Text>
        <Text style={styles.emptyTripSubtitle}>{t('home.noTripsYetMessage')}</Text>
        <TouchableOpacity
          style={styles.emptyTripBtn}
          activeOpacity={0.8}
          onPress={() => {
            if (isLoggedIn) {
              router.navigate('/create');
            } else {
              onRequestAuth('CREATE_TRIP');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={isLoggedIn ? t('home.createATrip') : t('home.signInToCreate')}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.emptyTripBtnText}>
            {isLoggedIn ? t('home.createATrip') : t('home.signInToCreate')}
          </Text>
        </TouchableOpacity>
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
          const alreadyRequested = requestedTrips.has(trip.id);

          return (
            <TouchableOpacity
              key={`${trip.id}-${idx}`}
              activeOpacity={0.85}
              onPress={() => onOpenTrip(trip)}
              style={[styles.tripCard, { width: SCREEN_WIDTH - 40 }]}
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
                <View style={styles.tripBadge}>
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
                      <Check size={8} color={C.blueText} strokeWidth={3} />
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
                  {/* The join CTA reflects `requestedTrips`, so a trip this
                      user has already asked to join never offers to ask
                      again. There is no "Join Chat" shortcut here any more:
                      the trip chat is for confirmed members, and the button
                      opened a client-invented `room-<tripId>` (CONVENTIONS
                      §5) that a non-member cannot post in. */}
                  <TouchableOpacity
                    style={[styles.joinBtn, alreadyRequested && styles.joinBtnRequested]}
                    disabled={alreadyRequested}
                    onPress={() => handleJoin(trip)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: alreadyRequested }}
                    accessibilityLabel={alreadyRequested ? t('home.joinRequested') : t('home.joinNow')}
                  >
                    <Text style={[styles.joinBtnText, alreadyRequested && styles.joinBtnRequestedText]}>
                      {alreadyRequested ? t('home.joinRequested') : t('home.joinNow')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Trending destinations ──────────────────────────────────────────

/**
 * Curated reference content (`GET /destinations`, seeded once by
 * `npm run seed:reference`), deliberately public and shown to guests — it
 * is admin-written catalog copy about real places, not a claim about live
 * conditions or anyone's trip, so it is neither dummy data nor a leak of
 * private content. Cards open the real destination by its database id.
 */
function TrendingDestinationsBase({ isFocused }: { isFocused: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const trendingRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const isInteractingRef = useRef(false);
  const [activeDot, setActiveDot] = useState(0);

  const destinationsQuery = useQuery({
    queryKey: queryKeys.destinations(),
    queryFn: async () => (await apiService.getDestinations()) ?? [],
  });
  const { data: destinations, refetch } = destinationsQuery;
  const destinationsState = sectionState(destinationsQuery, destinations != null);

  const destinationCount = destinations?.length ?? 0;

  useEffect(() => {
    if (!isFocused || destinationCount <= 1) return;
    const itemWidth = TRENDING_CARD_WIDTH + 12;

    // `activeDot` is read through the state updater rather than the closure,
    // so this interval is armed once for the life of the carousel. With it in
    // the dependency array the effect tore down and re-armed a fresh timer on
    // every tick — three timers a second of pure churn, for an animation that
    // only moves once every three seconds.
    const interval = setInterval(() => {
      if (isInteractingRef.current) return;
      setActiveDot((prev) => {
        const nextDot = prev + 1 >= destinationCount ? 0 : prev + 1;
        scrollXRef.current = nextDot * itemWidth;
        trendingRef.current?.scrollTo({ x: scrollXRef.current, animated: true });
        return nextDot;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [destinationCount, isFocused]);

  if (destinationsState.kind === 'loading') {
    return (
      <View style={styles.sectionStateWrap}>
        <SkeletonCard />
      </View>
    );
  }

  if (destinationsState.kind === 'error' || !destinations) {
    return (
      <View style={styles.sectionStateWrap}>
        <ScreenError
          title={t('home.couldNotLoadDestinations')}
          message={
            destinationsState.kind === 'error' && destinationsState.offline
              ? t('common.offlineMessage')
              : t('home.couldNotLoadDestinationsMessage')
          }
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (destinations.length === 0) {
    return (
      <View style={styles.sectionStateWrap}>
        <ScreenEmpty title={t('home.destinationsEmptyTitle')} message={t('home.destinationsEmpty')} />
      </View>
    );
  }

  const infiniteTrendingDests = [...destinations, ...destinations];

  return (
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
            accessibilityRole="button"
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
                <Text style={styles.rankRibbonText}>#{(index % destinations.length) + 1}</Text>
              </LinearGradient>
            </View>
            {/* No heart/favourite button: there is no save-a-destination
                endpoint in this API (only /interactions/like, which likes a
                Trip), so the control could never do anything. */}
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
        {destinations.map((dest) => (
          <View
            key={dest.id}
            style={[
              styles.dot,
              activeDot === destinations.indexOf(dest) ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </>
  );
}

// ─── Stories / feed rail ────────────────────────────────────────────

/**
 * What to call a feed tile. A reel carries no location and may carry no
 * caption - the server used to fill both in with the literal strings
 * 'Guide Tour' and 'Travel Reel', so every reel in the rail claimed to be
 * somewhere it was not. Falls back to the author, then to a plain label.
 */
function feedItemLabel(item: FeedItem, t: (key: string) => string): string {
  return item.location || item.title || item.authorName || t('home.untitledFeedItem');
}

function StoriesRailBase({
  avatarUri,
  onAddStory,
}: {
  avatarUri: string | null;
  onAddStory: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  // The merged feed (stories + guide reels). There is deliberately no
  // stories-only fallback: GET /feed already degrades to whichever of the
  // two sources has rows, and swapping endpoints on failure hid real
  // outages behind a partial list.
  const feedQuery = useQuery({
    queryKey: queryKeys.feed(),
    queryFn: async () => {
      const page = await apiService.getFeed(20);
      return page.items;
    },
  });
  const { data: feed, refetch } = feedQuery;
  const feedState = sectionState(feedQuery, feed != null);

  const addStoryTile = (
    <TouchableOpacity
      style={styles.storyItem}
      activeOpacity={0.8}
      onPress={onAddStory}
      accessibilityRole="button"
      accessibilityLabel={t('home.addStory')}
    >
      <View style={styles.addStoryRing}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.storyImage} />
        ) : (
          <View style={styles.addStoryAvatarFallback}>
            <Camera size={24} color={C.blueText} strokeWidth={1.8} />
          </View>
        )}
        <View style={styles.addStoryPlusBadge}>
          <Plus size={12} color={C.white} strokeWidth={3} />
        </View>
      </View>
      <Text style={styles.storyName} numberOfLines={1}>
        {t('home.yourStory')}
      </Text>
    </TouchableOpacity>
  );

  if (feedState.kind === 'loading') {
    return (
      <View style={styles.storiesRow}>
        {addStoryTile}
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.storyItem}>
            <Skeleton width={64} height={64} borderRadius={32} />
            <Skeleton width={52} height={10} />
          </View>
        ))}
      </View>
    );
  }

  if (feedState.kind === 'error' || !feed) {
    return (
      <View style={styles.sectionStateWrap}>
        <ScreenError
          title={t('home.couldNotLoadFeed')}
          message={
            feedState.kind === 'error' && feedState.offline
              ? t('common.offlineMessage')
              : t('home.couldNotLoadFeedMessage')
          }
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (feed.length === 0) {
    return (
      <View style={styles.storiesEmptyRow}>
        {addStoryTile}
        <TouchableOpacity
          style={styles.emptyStoryCard}
          onPress={onAddStory}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('home.addStory')}
          accessibilityHint={t('home.beTheFirstStory')}
        >
          <View style={styles.emptyStoryIconWrap}>
            <Camera size={20} color={C.blueText} strokeWidth={2} />
          </View>
          <View style={styles.emptyStoryTextWrap}>
            <Text style={styles.emptyStoryTitle} numberOfLines={1}>
              {t('home.noStoriesYet')}
            </Text>
            <Text style={styles.emptyStorySubtitle} numberOfLines={2}>
              {t('home.beTheFirstStory')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.storiesRow}
    >
      {addStoryTile}
      {feed.map((item: FeedItem) => (
        <TouchableOpacity
          key={item.id}
          style={styles.storyItem}
          activeOpacity={0.8}
          onPress={() => {
            // By id, not by location text: the rail shows merged feed items
            // and a REEL has no matching TravelStory row, so the old
            // `?location=` filter opened an empty screen for half the rail.
            router.push({ pathname: '/stories', params: { id: item.id } });
          }}
          accessibilityRole="button"
          accessibilityLabel={t('home.storyLabel', { location: feedItemLabel(item, t) })}
        >
          <View style={styles.storyRing}>
            {item.coverImg ? (
              <Image source={{ uri: item.coverImg }} style={styles.storyImage} />
            ) : (
              <View style={[styles.storyImage, styles.storyImageFallback]}>
                <Camera size={20} color={C.textMuted} strokeWidth={1.8} />
              </View>
            )}
          </View>
          <Text style={styles.storyName} numberOfLines={2}>
            {feedItemLabel(item, t)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// Each of these owns its own query (or context slice) and drives its own
// animation loop, and none of them read anything from the parent beyond the
// props above. Memoising them means one section's data settling no longer
// re-renders — and so no longer interrupts the animation of — every other
// section on the screen.
const AppleMultilingualGreeting = React.memo(AppleMultilingualGreetingBase);
const TrendingWeatherCard = React.memo(TrendingWeatherCardBase);
const RouteSafetyCard = React.memo(RouteSafetyCardBase);
const FeaturedTripsCarousel = React.memo(FeaturedTripsCarouselBase);
const TrendingDestinations = React.memo(TrendingDestinationsBase);
const StoriesRail = React.memo(StoriesRailBase);

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

  const {
    currentRole,
    setCurrentRole,
    profile,
    isLoggedIn,
    sessionRestored,
    hasUnreadNotification,
    checkUnreadNotifications,
  } = useApp();
  const router = useRouter();
  const [authReason, setAuthReason] = useState<AuthReason | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);

  const requestAuth = useCallback((reason: AuthReason) => setAuthReason(reason), []);

  const handleAddStoryPress = useCallback(() => {
    if (!isLoggedIn) {
      setAuthReason('STORY');
    } else {
      router.push('/create');
    }
  }, [isLoggedIn, router]);

  const handleOpenTrip = useCallback((trip: Trip) => setSelectedTrip(trip), []);

  const handleRoleSelect = useCallback(
    (role: UserRole) => {
      // The Guide and Organizer dashboards are account-scoped (they call
      // GET /guides/me and read the caller's own trips), so a guest landing
      // on either used to get an error screen implying a capability they do
      // not have. Prompt instead, and leave `currentRole` alone — a role
      // change while logged out would also be a role write from a
      // logged-out session once the user signs in.
      if (!isLoggedIn && role !== 'TOURIST') {
        setAuthReason(role === 'GUIDE' ? 'GUIDE_ROLE' : 'ORGANIZER_ROLE');
        return;
      }
      // setCurrentRole is the only writer: AppContext mirrors it onto
      // `profile.role` during render and syncs it to the server *only* when
      // logged in. Assigning `profile.role` here directly (as this used to)
      // mutated context state in place, so nothing re-rendered from it.
      setCurrentRole(role);
      if (role === 'GUIDE') router.push('/travel-guide');
      if (role === 'ORGANIZER') router.push('/group-organizer');
    },
    [isLoggedIn, router, setCurrentRole],
  );

  useEffect(() => {
    // One source for the badge. This used to fetch GET /notifications here
    // and then call checkUnreadNotifications(), which fetches the same
    // endpoint again — two identical requests on every mount.
    checkUnreadNotifications();

    // Listen for real-time notifications to refresh the badge
    const unsubNotif = eventBus.on('inAppNotification', () => {
      checkUnreadNotifications();
    });

    return () => {
      unsubNotif();
    };
  }, [checkUnreadNotifications]);

  // Nothing about the signed-in identity is rendered until the local session
  // read has settled, so a cold launch never flashes a guest identity at a
  // returning user (or the reverse).
  const identityResolved = sessionRestored;
  const displayName = isLoggedIn ? profile.name : t('home.guestTraveler');
  const avatarUri = isLoggedIn && profile.avatar ? profile.avatar : null;

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
              {identityResolved ? (
                <Text style={styles.userName} numberOfLines={1}>
                  {displayName}
                </Text>
              ) : (
                <Skeleton width={140} height={20} style={styles.userNameSkeleton} />
              )}
              <Text style={styles.userSub} numberOfLines={1}>
                {t('home.userSub')}
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
                  <Bell size={18} color={C.textSec} strokeWidth={1.8} />
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
                  accessibilityLabel={isLoggedIn ? t('home.profileLabel') : t('home.loginSignUp')}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.anonymousAvatarSmall}>
                      <User size={18} color={C.textMuted} strokeWidth={2} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {identityResolved && !isLoggedIn && (
                <TouchableOpacity
                  style={styles.loginPillBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push('/auth')}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.loginSignUp')}
                >
                  <Text style={styles.loginPillText}>{t('home.loginSignUp')}</Text>
                  <ChevronRight size={12} color={C.blueText} />
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
                ? isActive ? C.blue : '#EFF6FF'
                : role.value === 'GUIDE'
                  ? '#ECFDF5'
                  : '#FFF7ED';
            const iconColor =
              role.value === 'TOURIST'
                ? isActive ? C.white : C.blueText
                : role.value === 'GUIDE'
                  ? C.greenText
                  : C.amberText;

            return (
              <TouchableOpacity
                key={role.value}
                activeOpacity={0.85}
                onPress={() => handleRoleSelect(role.value)}
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
            TRAVEL REELS & STORIES
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.reelsAndStories')}</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
            onPress={() => router.push('/stories')}
            accessibilityRole="button"
            accessibilityLabel={t('home.viewAll')}
          >
            <Text style={styles.viewAllText}>{t('home.viewAll')}</Text>
            <ChevronRight size={14} color={C.blueText} />
          </TouchableOpacity>
        </View>

        <StoriesRail avatarUri={avatarUri} onAddStory={handleAddStoryPress} />

        {/* ════════════════════════════════════════════════
            QUICK ACCESS ROW — 3 White Cards
            ════════════════════════════════════════════════ */}
        <View style={styles.quickAccessRow}>
          {quickAccessItems.map((item, index) => {
            const iconBg = index === 0 ? '#EFF6FF' : index === 1 ? '#ECFDF5' : '#FFF7ED';
            const iconCol = index === 0 ? C.blueText : index === 1 ? C.greenText : C.amberText;

            return (
              <TouchableOpacity
                key={item.labelKey}
                style={styles.quickCardItem}
                activeOpacity={0.8}
                onPress={() => router.push(item.route)}
                accessibilityRole="button"
                accessibilityLabel={t(item.labelKey)}
                accessibilityHint={t('home.quickAccessHint', { label: t(item.labelKey) })}
              >
                <View style={{ position: 'relative' }}>
                  <View style={[styles.quickIconCircle, { backgroundColor: iconBg }]}>
                    <item.Icon size={20} color={iconCol} strokeWidth={2.2} />
                  </View>
                  {item.isNew && (
                    <View style={styles.newBadgePill}>
                      <Text style={styles.newBadgeText}>{t('home.new')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.quickLabel}>{t(item.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════════════════════════════════════
            WEATHER & ROUTE SAFETY — Two column
            ════════════════════════════════════════════════ */}
        <View style={styles.weatherAlertRow}>
          <TrendingWeatherCard isFocused={isFocused} />
          <View style={styles.alertsColumn}>
            <RouteSafetyCard isFocused={isFocused} />
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            FEATURED GROUP TRIPS CAROUSEL
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.featuredGroupTrips')}</Text>
        </View>
        <FeaturedTripsCarousel
          isFocused={isFocused}
          onOpenTrip={handleOpenTrip}
          onRequestAuth={requestAuth}
        />

        {/* ════════════════════════════════════════════════
            TRENDING DESTINATIONS — Carousel + dots
            ════════════════════════════════════════════════ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.trendingDestinations')}</Text>
        </View>
        <TrendingDestinations isFocused={isFocused} />

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Real trip detail + the real join flow (POST /interactions/join-request),
          the same sheet search/nearby-trips/budget-trips open. */}
      <TripDetailModal
        visible={selectedTrip !== null}
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
      />

      <AuthPromptModal reason={authReason} onClose={() => setAuthReason(null)} />
    </SafeAreaView>
  );
}

// ─── Auth prompt ────────────────────────────────────────────────────

/**
 * The single guest boundary on this screen. Every action that needs an
 * account opens this instead of firing a request that would 401.
 */
function AuthPromptModal({ reason, onClose }: { reason: AuthReason | null; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const copy = reason ? AUTH_REASON_COPY[reason] : null;

  return (
    <Modal visible={reason !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        {copy ? (
          <View style={styles.authModalCard}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={18} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.modalIconWrap}>
              <LinearGradient
                colors={['#2563EB', '#38BDF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalIconGradient}
              >
                <copy.Icon size={28} color={C.white} strokeWidth={2} />
              </LinearGradient>
            </View>

            <Text style={styles.authModalTitle}>{t(copy.titleKey)}</Text>
            <Text style={styles.authModalDesc}>{t(copy.descKey)}</Text>

            {/* The perks are specific to posting a story; they are not shown
                for the other reasons rather than restated generically. */}
            {reason === 'STORY' ? (
              <View style={styles.authModalPerks}>
                {['home.shareStoryBenefit1', 'home.shareStoryBenefit2', 'home.shareStoryBenefit3'].map((key) => (
                  <View key={key} style={styles.authModalPerkRow}>
                    <View style={styles.perkCheckCircle}>
                      <Check size={12} color={C.greenText} strokeWidth={3} />
                    </View>
                    <Text style={styles.perkText}>{t(key)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.authModalPrimaryBtn}
              activeOpacity={0.85}
              onPress={() => {
                onClose();
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
                <Text style={styles.authModalPrimaryText}>{t('home.continueToSignUp')}</Text>
                <ChevronRight size={16} color={C.white} strokeWidth={2.5} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.authModalSecondaryBtn}
              activeOpacity={0.7}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('home.maybeLater')}
            >
              <Text style={styles.authModalSecondaryText}>{t('home.maybeLater')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
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
  emptyTripCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyTripIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTripTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptyTripSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
    maxWidth: 290,
  },
  emptyTripBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  emptyTripBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Holds a <ScreenLoading>/<ScreenError>/<ScreenEmpty> where a horizontal
  // rail would otherwise be, so the section keeps its vertical rhythm
  // instead of collapsing to nothing while it loads or fails.
  sectionStateWrap: {
    marginBottom: 24,
    minHeight: 220,
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
    // C.indigo, not C.purple: white on #6366F1 measures 4.47:1 and misses
    // AA by a hair; on #4F46E5 it is 6.29:1.
    backgroundColor: C.indigo,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  tripContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  tripName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.text,
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
    color: C.blueText,
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
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
    backgroundColor: C.cardAlt,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 2,
  },
  capsuleText: {
    fontSize: 12,
    fontWeight: '600',
    // textSec, not textMuted: this sits on `cardAlt`, where textMuted is
    // 4.34:1 and misses AA (see the token's own note).
    color: C.textSec,
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
    color: C.blueText,
    marginTop: -2,
  },
  joinBtn: {
    backgroundColor: C.blue,
    minHeight: MIN_TOUCH_TARGET,
    width: 110,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  // The already-requested state of the join CTA. Filled grey rather than
  // brand blue, so it does not read as a second chance to request.
  joinBtnRequested: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  joinBtnRequestedText: {
    color: C.textSec,
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
  // Occupies the line the name will land on, so the header does not reflow
  // when the local session read settles.
  userNameSkeleton: {
    marginBottom: 6,
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
    marginBottom: 16,
    marginTop: -18,
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
    paddingVertical: 12,
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
    width: 28,
    height: 28,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 10,
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
    minHeight: 196,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 13,
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1.5,
  },
  allClearCard: {
    flex: 1,
    minHeight: 196,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 13,
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1.5,
  },
  advisoryCard: {
    flex: 1,
    minHeight: 196,
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 13,
    justifyContent: 'space-between',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1.5,
  },
  alertsColumn: {
    flex: 1,
  },

  // ── Card Header (Shared by Weather & Route Safety) ──
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  cardLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardDotBlue: {
    backgroundColor: '#2563EB',
  },
  cardDotGreen: {
    backgroundColor: '#10B981',
  },
  cardDotRed: {
    backgroundColor: '#EF4444',
  },
  cardDotInactive: {
    backgroundColor: '#94A3B8',
  },
  cardHeaderText: {
    fontSize: 10.5,
    color: C.textSec,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardHeaderIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Trending Weather Card (photo background, loaded state) ──
  weatherCardPhoto: {
    padding: 0,
    overflow: 'hidden',
  },
  weatherContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 13,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tempText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  weatherCondition: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  aqiText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 3,
  },
  weatherBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  weatherDetail: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34D399',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.4,
  },

  // ── All Clear Center ──
  allClearCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  allClearIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  allClearTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  allClearSubtitle: {
    fontSize: 10.5,
    color: C.textMuted,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 2,
  },

  // ── All Clear Footer ──
  allClearFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  allClearFooterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.greenText,
  },

  // ── Generic Card State Helpers (Loading / Prompt / Error) ──
  cardStateCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  cardCenterIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 4,
  },
  cardPromptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  cardPromptMessage: {
    fontSize: 10.5,
    color: C.textMuted,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 2,
  },
  cardStateMessage: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  cardPrimaryCta: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPrimaryCtaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardSecondaryCta: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSecondaryCtaText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
  },
  cardFooterSpacer: {
    height: 28,
  },

  // ── Advisory (Hazard) Center & Footer ──
  advisoryIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  advisoryIcon: {
    width: 16,
    height: 16,
  },
  advisoryCenter: {
    paddingVertical: 2,
    justifyContent: 'center',
  },
  advisoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.redText,
    lineHeight: 17,
  },
  locationRowDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  advisoryLocation: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.redText,
    flexShrink: 1,
  },
  advisoryTime: {
    fontSize: 10.5,
    color: C.textMuted,
  },
  advisoryDesc: {
    fontSize: 11,
    color: C.textSec,
    lineHeight: 15,
    marginTop: 3,
  },
  advisoryFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  advisoryFooterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.redText,
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
  // The empty feed keeps the "Your Story" tile beside an aligned, compact
  // card matching the 72px ring height, guiding the user to tap + and add moments.
  storiesEmptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    gap: 14,
    marginBottom: 24,
  },
  emptyStoryCard: {
    flex: 1,
    height: 72,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyStoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  emptyStoryTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyStoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  emptyStorySubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
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
  // A feed item with no cover image gets a neutral placeholder, never a
  // stock photo of somewhere the post is not about.
  storyImageFallback: {
    backgroundColor: C.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
});

export default React.memo(HomeScreen);
