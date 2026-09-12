import { Trip, useApp } from '@/store/AppContext';
import { parseMoney } from '@/lib/money';
import { logger } from '@/lib/logger';
import { toast, errorToastMessage } from '@/lib/feedback';
import { apiService } from '@/services/api';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import TripDetailModal from '@/components/TripDetailModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation, type ErrorBoundaryProps } from 'expo-router';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import { BlurView } from 'expo-blur';
import Bell from 'lucide-react-native/icons/bell';
import Bike from 'lucide-react-native/icons/bike';
import Bus from 'lucide-react-native/icons/bus';
import Calendar from 'lucide-react-native/icons/calendar';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Grid2x2 from 'lucide-react-native/icons/grid-2x2';
import Heart from 'lucide-react-native/icons/heart';
import HomeIcon from 'lucide-react-native/icons/house';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mountain from 'lucide-react-native/icons/mountain';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Search from 'lucide-react-native/icons/search';
import Shield from 'lucide-react-native/icons/shield';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Sparkles from 'lucide-react-native/icons/sparkles';
import UserCheck from 'lucide-react-native/icons/user-check';
import Users from 'lucide-react-native/icons/users';
import Wallet from 'lucide-react-native/icons/wallet';
import X from 'lucide-react-native/icons/x';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { eventBus } from '@/services/event-bus';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { CoverImage, ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

// Category definitions matching the screenshot. `key` drives filter logic
// (compared against trip.category/name text) and stays a stable English
// literal; `labelKey` is what's shown, resolved via t() at render time —
// these two are deliberately different now (docs/REMEDIATION.md §9.4).
const CATEGORIES = [
  { key: 'All', labelKey: 'search.categoryAll', Icon: Grid2x2 },
  { key: 'Religious', labelKey: 'search.categoryReligious', Icon: HomeIcon },
  { key: 'Adventure', labelKey: 'search.categoryAdventure', Icon: Mountain },
  { key: 'Family Friendly', labelKey: 'search.categoryFamilyFriendly', Icon: Users },
  { key: 'Bike', labelKey: 'search.categoryBike', Icon: Bike },
];

// Duration/transport filter codes stay stable English literals (drive
// filter logic); these map each to its translated display label.
const DURATION_LABEL_KEYS: Record<string, string> = {
  ALL: 'search.durationAny',
  SHORT: 'search.duration1to3',
  MEDIUM: 'search.duration4to7',
  LONG: 'search.duration8plus',
};
const TRANSPORT_LABEL_KEYS: Record<string, string> = {
  ALL: 'search.transportAllModes',
  BUS: 'search.transportBus',
  BIKE: 'search.transportBike',
};

// Quick access grid items with vector icons
const QUICK_ACCESS = [
  { key: 'custom', labelKey: 'search.quickCustomTrips', subKey: 'search.quickCustomTripsSub', Icon: Sparkles, color: '#FFB300' },
  { key: 'nearby', labelKey: 'search.quickNearbyTrips', subKey: 'search.quickNearbyTripsSub', Icon: MapPin, color: '#0066FF' },
  { key: 'budget', labelKey: 'search.quickBudgetTrips', subKey: 'search.quickBudgetTripsSub', Icon: Wallet, color: '#FFCC00' },
];

// Helper: derive a badge from trip category or travelStyle (DB-driven).
// Plain functions, not components, so they use i18next's singleton
// directly rather than the useTranslation() hook (same pattern as
// datetime.ts).
const getCategoryBadge = (trip: Trip): { labelKey: string; color: string; bg: string } | null => {
  const cat = (trip.category || trip.travelStyle || '').toLowerCase();
  if (cat.includes('religious') || cat.includes('spiritual'))
    return { labelKey: 'search.badgePopular', color: '#FFFFFF', bg: '#6C5CE7' };
  if (cat.includes('adventure') || cat.includes('bike')) return { labelKey: 'search.badgeAdventure', color: '#FFFFFF', bg: '#2ECC71' };
  if (cat.includes('nature') || cat.includes('scenic')) return { labelKey: 'search.badgeScenic', color: '#FFFFFF', bg: '#00B894' };
  if (cat.includes('heritage')) return { labelKey: 'search.badgeHeritage', color: '#FFFFFF', bg: '#E17055' };
  if (cat.includes('family')) return { labelKey: 'search.badgeFamily', color: '#FFFFFF', bg: '#0984E3' };
  return null;
};

// Helper: format date string for display
const formatTripDate = (dateStr: string | undefined): string => {
  if (!dateStr) return i18n.t('search.dateTBD');
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Helper: raw day count from start/end dates. Kept separate from the
// translated display string below — the duration filter used to regex-
// parse the literal English word "Day" back out of computeDuration()'s
// formatted output, which would have silently broken the moment that
// output started rendering in Hindi (docs/REMEDIATION.md §9.4).
const computeDurationDays = (startDate: string | undefined, endDate: string | undefined): number | null => {
  if (!startDate || !endDate) return null;
  try {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
};

// Helper: compute duration text from start/end dates
const computeDuration = (startDate: string | undefined, endDate: string | undefined): string => {
  const days = computeDurationDays(startDate, endDate);
  if (days === null) return i18n.t('search.multiDay');
  const nights = Math.max(0, days - 1);
  return i18n.t('search.nightsAndDays', { count: nights, nights, days });
};

// Helper: a stable, untranslated transport code derived from trip name/
// category — this is what the Transport Mode filter matches against.
// Kept separate from the translated label below for the same reason as
// computeDurationDays: matching substrings of translated display text is
// exactly the kind of thing that silently breaks in a second language.
const deriveTransportCode = (trip: Trip): 'BIKE' | 'BUS' | 'AC' => {
  const name = (trip.name || '').toLowerCase();
  if (name.includes('bike') || name.includes('expedition')) return 'BIKE';
  if (name.includes('houseboat') || name.includes('backwaters')) return 'BUS';
  return 'AC';
};

// Helper: derive transport label from trip name / category
const deriveTransport = (trip: Trip): string => {
  switch (deriveTransportCode(trip)) {
    case 'BIKE':
      return i18n.t('search.transportBikeFuelStay');
    case 'BUS':
      return i18n.t('search.transportBusHouseboat');
    default:
      return i18n.t('search.transportAC');
  }
};

// This screen used to carry its own local DARK/LIGHT palette pair and a
// `useColorScheme()`-driven light-mode branch, in parallel with the real
// design tokens (docs/REMEDIATION.md §9.1) that every other migrated screen
// already reads from '@/theme/tokens'. Two bugs came with that duplication:
// it was exactly the "same idea styled a dozen different ways" problem
// tokens.ts exists to close (missed by that pass because this file's local
// object was named `DARK`/`LIGHT`, not `const C = {...}`), and this app is
// dark-only by design (§1.3) — the LIGHT branch was dead UI nobody could
// reach, kept alive as real code. It also reused a single #0066FF for both
// fills/borders (fine at 3:1) and body text (fails AA at 4.13:1) in the
// same places tokens.ts's blue/blueText split exists to prevent. Removed;
// the component now reads the real `C` import from '@/theme/tokens' like
// every other screen, splitting former `accent` usages into `C.blue` for
// fills/borders/large glyphs and `C.blueText` for text/small icons.

// One search result. This is the app's main browse list, and the card is
// expensive: a cover image, two gradients, an optional BlurView and ~20
// nested views. It used to live in a `ScrollView` + `.map()`, so every trip
// in the result set was mounted at once — the FlatList below is the fix
// (docs/REMEDIATION.md Phase 10).
//
// Rows are a separate component so the React Compiler
// (app.json > experiments.reactCompiler) can memoize them independently.
// There is deliberately no hand-written React.memo/useCallback: when the
// compiler cannot prove manual memoization matches what it would infer, it
// skips optimizing the component entirely.
function TripResultCard({
  trip,
  isLiked,
  isMyTrip,
  isRequested,
  onToggleLike,
  onOpenTrip,
}: {
  trip: Trip;
  isLiked: boolean;
  isMyTrip: boolean;
  isRequested: boolean;
  onToggleLike: (id: string) => void;
  onOpenTrip: (trip: Trip) => void;
}) {
  const { t } = useTranslation();
  // All display data comes from the trip object (populated from DB)
  const duration = computeDuration(trip.startDate, trip.endDate);
  const transport = deriveTransport(trip);
  const displayCities = trip.cities;
  const displayPrice = trip.budget;
  const displayMeeting = trip.meetingPoint;
  const displayDate = formatTripDate(trip.startDate);
  const badge = getCategoryBadge(trip);

  return (
    <TouchableOpacity
      activeOpacity={isMyTrip ? 1 : 0.85}
      disabled={isMyTrip}
      onPress={() => onOpenTrip(trip)}
      style={[styles.tripCard, { backgroundColor: C.card, borderColor: C.border }, isMyTrip && { opacity: 0.65 }]}
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      accessibilityHint={t('search.tripCardHint')}
    >
      {isMyTrip && (
        <LinearGradient
          colors={['#141629', '#101220', '#0A0B14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
      )}
      {/* Left side: Image */}
      <View style={styles.tripImageContainer}>
        <CoverImage uri={trip.coverImage} name={trip.name} style={styles.tripImage} />
        {/* Subtle dark vignette overlay to make borders darker and enhance readability */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* Pill Badge */}
        {isMyTrip ? (
          <View style={[styles.tripBadge, { backgroundColor: C.blue }]}>
            <Text style={[styles.tripBadgeText, { color: '#FFF', fontWeight: '800' }]}>{t('search.yours')}</Text>
          </View>
        ) : (
          badge && (
            <View style={[styles.tripBadge, { backgroundColor: badge.bg }]}>
              <Text style={styles.tripBadgeText}>{t(badge.labelKey)}</Text>
            </View>
          )
        )}
        {/* Heart button */}
        {!isMyTrip && (
          <TouchableOpacity
            style={[styles.heartBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            onPress={() => onToggleLike(trip.id)}
            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            accessibilityRole="button"
            accessibilityLabel={t('search.favoriteHint')}
            accessibilityState={{ selected: isLiked }}
          >
            <Heart size={14} color={isLiked ? '#FF3B30' : '#FFF'} fill={isLiked ? '#FF3B30' : 'transparent'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Right side: Detailed trip content */}
      <View style={styles.tripContent}>
        {/* Title and Verified badge */}
        <View style={styles.tripHeaderRow}>
          <Text style={[styles.tripName, { color: C.white }]} numberOfLines={3}>
            {trip.name}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 4 }}>
          <View
            style={[
              styles.verifiedBadge,
              { backgroundColor: isMyTrip ? C.cardAlt : C.accentLight, marginTop: 0, marginBottom: 0 },
            ]}
          >
            <Check size={9} color={isMyTrip ? C.textSec : C.blueText} strokeWidth={3} />
            <Text style={[styles.verifiedText, { color: isMyTrip ? C.textSec : C.blueText }]}>{t('search.verifiedRoute')}</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isMyTrip ? C.textSec : C.greenText }}>
            {t('search.seatsLeft', { count: trip.availableSeats ?? 0 })}
          </Text>
        </View>

        {/* Route cities with arrow */}
        <View style={styles.routeCities}>
          {displayCities.map((city: string, i: number) => (
            <React.Fragment key={city}>
              <Text style={[styles.cityText, { color: isMyTrip ? C.textSec : C.blueText }]}>{city}</Text>
              {i < displayCities.length - 1 && <Text style={[styles.routeArrow, { color: C.textSec }]}>→</Text>}
            </React.Fragment>
          ))}
        </View>

        {/* 2x2 grid of pill capsules */}
        <View style={styles.capsulesContainer}>
          <View style={styles.capsulesRow}>
            <View style={[styles.capsule, { backgroundColor: C.cardAlt }]}>
              <MapPin size={9} color={C.textSec} />
              <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                {displayMeeting}
              </Text>
            </View>
            <View style={[styles.capsule, { backgroundColor: C.cardAlt }]}>
              <Calendar size={9} color={C.textSec} />
              <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                {displayDate}
              </Text>
            </View>
          </View>
          <View style={styles.capsulesRow}>
            <View style={[styles.capsule, { backgroundColor: C.cardAlt }]}>
              <Clock size={9} color={C.textSec} />
              <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                {duration}
              </Text>
            </View>
            <View style={[styles.capsule, { backgroundColor: C.cardAlt }]}>
              {trip.name.toLowerCase().includes('bike') ? (
                <Bike size={9} color={C.textSec} />
              ) : (
                <Bus size={9} color={C.textSec} />
              )}
              <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                {transport}
              </Text>
            </View>
          </View>
        </View>

        {/* Price and Action Button row */}
        <View style={[styles.priceRow, { borderTopColor: C.border }]}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={[styles.priceLabel, { color: C.textSec }]} numberOfLines={1}>
              {t('search.fullTripCost')}
            </Text>
            <Text style={[styles.priceAmount, { color: isMyTrip ? C.textSec : C.blueText }]} numberOfLines={1}>
              ₹{displayPrice}
            </Text>
            <Text style={[styles.pricePer, { color: C.textSec, marginTop: -2 }]} numberOfLines={1}>
              {t('search.perPerson')}
            </Text>
          </View>
          <View style={{ gap: 4, flexShrink: 0, width: 120 }}>
            {isMyTrip ? (
              <View
                style={[
                  styles.myTripBadge,
                  {
                    backgroundColor: 'rgba(0, 102, 255, 0.12)',
                    borderColor: 'rgba(0, 102, 255, 0.35)',
                  },
                ]}
              >
                <Sparkles size={11} color={C.blueText} style={{ marginRight: 4 }} />
                <Text style={[styles.myTripBadgeText, { color: C.blueText, fontWeight: '800' }]}>{t('search.yourCreation')}</Text>
              </View>
            ) : isRequested ? (
              <View style={[styles.joinBtn, styles.joinBtnRequested]}>
                <Check size={11} color="#2ECC71" style={{ marginRight: 4 }} />
                <Text style={[styles.joinBtnText, styles.joinBtnRequestedText]} numberOfLines={1}>
                  {t('search.requested')}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() => onOpenTrip(trip)}
                accessibilityRole="button"
                accessibilityLabel={t('search.requestToJoin')}
              >
                <Text style={styles.joinBtnText} numberOfLines={1}>
                  {t('search.requestToJoin')}
                </Text>
                <ChevronRight size={11} color="#FFF" style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isMyTrip && (
        <BlurView
          intensity={55}
          tint="dark"
          style={[styles.myTripOverlay, { backgroundColor: 'rgba(10, 12, 22, 0.35)' }]}
        />
      )}
    </TouchableOpacity>
  );
}

const keyExtractor = (t: Trip) => t.id;

function SearchScreen() {
  const { t } = useTranslation();
  useEffect(() => {
    logger.log('Screen mounted: SearchScreen');
  }, []);
  const router = useRouter();
  const navigation = useNavigation();
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);
  const { profile, isLoggedIn, requestedTrips, reloadJoinRequests } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [likedTrips, setLikedTrips] = useState<Set<string>>(new Set());

  // REMEDIATION.md §6.3: via useQuery for caching/retry — refetched on
  // screen focus to match the previous behaviour exactly.
  const { data: unreadNotifCount = 0, refetch: refetchUnreadNotifs } = useQuery({
    queryKey: queryKeys.unreadNotificationCount(),
    queryFn: async () => (await apiService.getUnreadNotificationCount()).count,
  });
  const hasUnreadNotifs = unreadNotifCount > 0;

  // Load liked trips and join requests on focus / mount. (Liked trips stay
  // hand-rolled state, not useQuery — toggleLike below already implements a
  // correct optimistic-update+rollback against it; see docs/REMEDIATION.md
  // progress notes for why that wasn't converted this pass.)
  useEffect(() => {
    const fetchStates = () => {
      apiService
        .getLikedTrips()
        .then((ids) => {
          if (ids && ids.length > 0) {
            setLikedTrips(new Set(ids));
          } else {
            setLikedTrips(new Set());
          }
        })
        .catch((e) => logger.warn('[Search] Liked trips fetch failed:', e));

      reloadJoinRequests();
      void refetchUnreadNotifs();
    };

    fetchStates();
    const unsubscribe = navigation.addListener('focus', fetchStates);
    return unsubscribe;
  }, [navigation, reloadJoinRequests, refetchUnreadNotifs]);

  // Join modal state — the actual join flow (including midway-join) lives
  // entirely inside <TripDetailModal>, which only takes visible/trip/onClose;
  // this screen just owns which trip is selected and whether it's shown.
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Animations
  const fadeAnim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const openTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setShowJoinModal(true);
  };

  const toggleLike = (id: string) => {
    let wasLiked = false;
    setLikedTrips((prev) => {
      const next = new Set(prev);
      wasLiked = next.has(id);
      if (wasLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    // Persist to backend
    apiService.toggleLikeTrip(id).catch((e) => {
      logger.warn('[Search] Like toggle failed, rolling back:', e);
      setLikedTrips((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      toast(errorToastMessage(e, 'Could not update like.'), 'error');
    });
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

  // Debounce the free-text search so every keystroke doesn't fire a new
  // server request — 350ms is long enough to skip intermediate keystrokes
  // during normal typing, short enough not to feel laggy.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // docs/REMEDIATION.md §8.3: this list used to be `useApp().trips` — a
  // fixed 20-row page fetched once by AppContext for the whole app — with
  // every filter below applied to that same truncated page. A trip past
  // row 20 was invisible to search no matter what was typed. These four
  // filters (search text, budget, guide-included, verified-organizer) now
  // go to the server as real query params and page in via cursor-based
  // infinite scroll, so the full result set is reachable. Category,
  // duration, transport, and midway stay client-side refinements over
  // whatever pages have loaded so far — they're compound heuristics over
  // trip.name text (see computeDuration/deriveTransport/getCategoryBadge
  // above) rather than single real columns, and porting that same
  // heuristic into SQL faithfully was judged higher-risk than the value it
  // added for this pass.
  const searchFilters = {
    search: debouncedSearch || undefined,
    maxBudget: maxBudget < 50000 ? maxBudget : undefined,
    guideRequired: guideRequired || undefined,
    verifiedOnly: verifiedOnly || undefined,
  };

  const {
    data: tripsPages,
    isLoading: tripsLoading,
    isError: tripsError,
    error: tripsFetchError,
    refetch: refetchTrips,
    isRefetching: tripsRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.tripsSearch(searchFilters),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      apiService.getTripsPage({ ...searchFilters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const trips: Trip[] = tripsPages?.pages.flatMap((page) => page.trips) ?? [];

  const getPopularityScore = (t: Trip) => {
    const total = t.totalSeats || 10;
    const available = t.availableSeats !== undefined ? t.availableSeats : total;
    const filled = total - available;
    return filled / total;
  };

  // Search text, budget, verified-organizer, and guide-included are now
  // real server-side query params (see searchFilters/useInfiniteQuery
  // above) — `trips` already satisfies all four, so re-checking them here
  // would be redundant at best. What's left is the filters that stayed
  // client-side: category (a compound name/category-text heuristic),
  // duration and transport (derived from dates/name text, no dedicated
  // columns), and midway-eligibility.
  const filteredTrips = trips
    .filter((t) => {
      // Category Chip Filter — uses trip.category from DB
      if (selectedCategory !== 'All') {
        const tripCat = (t.category || '').toLowerCase();
        const tripName = (t.name || '').toLowerCase();
        if (selectedCategory === 'Religious') {
          if (!tripCat.includes('religious') && !tripName.includes('spiritual') && !tripName.includes('varanasi'))
            return false;
        } else if (selectedCategory === 'Adventure') {
          if (!tripCat.includes('adventure') && !tripName.includes('bike') && !tripName.includes('expedition'))
            return false;
        } else if (selectedCategory === 'Family Friendly') {
          if (!tripCat.includes('family') && !tripCat.includes('heritage') && !tripCat.includes('nature')) return false;
        } else if (selectedCategory === 'Bike') {
          if (!tripName.includes('bike') && !tripName.includes('expedition')) return false;
        }
      }

      // Duration Filter — compute from dates
      const totalDays = computeDurationDays(t.startDate, t.endDate) ?? 5;
      if (selectedDuration === 'SHORT' && totalDays > 3) return false;
      if (selectedDuration === 'MEDIUM' && (totalDays < 4 || totalDays > 7)) return false;
      if (selectedDuration === 'LONG' && totalDays < 8) return false;

      // Transport Mode Filter
      const transportCode = deriveTransportCode(t);
      if (selectedTransport === 'BIKE' && transportCode !== 'BIKE') return false;
      if (selectedTransport === 'BUS' && transportCode === 'BIKE') return false;

      // Midway Join Filter
      if (midwayOnly && t.cities.length < 3) return false;

      return true;
    })
    .sort((a, b) => {
      // budget is Money (a string over the wire), so it has to be parsed
      // before it can be compared numerically.
      const priceA = parseMoney(a.budget) ?? 0;
      const priceB = parseMoney(b.budget) ?? 0;

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
          <View style={[styles.searchContainer, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
            <Search size={20} color={C.textSecondary} />
            <TextInput
              placeholder={t('search.searchPlaceholder')}
              placeholderTextColor={C.textSecondary}
              style={[styles.searchInput, { color: C.white }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel={t('search.searchPlaceholder')}
            />
            <TouchableOpacity
              style={[
                styles.filterIconBtn,
                activeFilterCount > 0 && { backgroundColor: C.accentLight, borderColor: C.accent },
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => setShowFilterModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('search.filtersLabel')}
              accessibilityHint={activeFilterCount > 0 ? t('search.activeFilterCount', { count: activeFilterCount }) : undefined}
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
            style={[styles.notifBtn, { backgroundColor: C.card, borderColor: C.cardBorder }]}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={t('search.notificationsLabel')}
            accessibilityHint={hasUnreadNotifs ? t('home.notificationsUnreadHint') : undefined}
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
                      backgroundColor: isActive ? (isAllGradient ? 'transparent' : C.blue) : C.card,
                      borderColor: isActive ? (isAllGradient ? '#0A0B10' : C.blue) : C.cardBorder,
                      shadowColor: isAllGradient ? '#0055ff' : 'transparent',
                      shadowOffset: isAllGradient ? { width: 0, height: 2 } : { width: 0, height: 0 },
                      shadowOpacity: isAllGradient ? 0.35 : 0,
                      shadowRadius: isAllGradient ? 6 : 0,
                      elevation: isAllGradient ? 3 : 0,
                      overflow: 'hidden',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t(cat.labelKey)}
                  accessibilityState={{ selected: isActive }}
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
                    {t(cat.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── ACTIVE FILTER TAGS ROW ─────────────────────────── */}
        {activeFilterCount > 0 && (
          <View style={styles.activeFilterTagsRow}>
            <Text style={[styles.activeFilterLabel, { color: C.textSecondary }]}>{t('search.filtersColon')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {sortOption !== 'popularity' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>{t('search.sortLabel', { value: sortOption.replace('_', ' ') })}</Text>
                  <TouchableOpacity onPress={() => setSortOption('popularity')} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {maxBudget < 50000 && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>
                    {t('search.maxBudget', { value: maxBudget.toLocaleString('en-IN') })}
                  </Text>
                  <TouchableOpacity onPress={() => setMaxBudget(50000)} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {selectedDuration !== 'ALL' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>{t('search.durationLabel', { value: t(DURATION_LABEL_KEYS[selectedDuration]) })}</Text>
                  <TouchableOpacity onPress={() => setSelectedDuration('ALL')} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {verifiedOnly && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>{t('search.verifiedOrganizers')}</Text>
                  <TouchableOpacity onPress={() => setVerifiedOnly(false)} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {guideRequired && (
                <View
                  style={[
                    styles.filterTagPill,
                    { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' },
                  ]}
                >
                  <Text style={[styles.filterTagText, { color: '#10B981' }]}>{t('search.guideIncludedFilter')}</Text>
                  <TouchableOpacity onPress={() => setGuideRequired(false)} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color="#10B981" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {selectedTransport !== 'ALL' && (
                <View style={[styles.filterTagPill, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
                  <Text style={[styles.filterTagText, { color: C.accent }]}>{t('search.transportLabel', { value: t(TRANSPORT_LABEL_KEYS[selectedTransport]) })}</Text>
                  <TouchableOpacity onPress={() => setSelectedTransport('ALL')} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color={C.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              {midwayOnly && (
                <View
                  style={[
                    styles.filterTagPill,
                    { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' },
                  ]}
                >
                  <Text style={[styles.filterTagText, { color: '#F59E0B' }]}>{t('search.midwayJoin')}</Text>
                  <TouchableOpacity onPress={() => setMidwayOnly(false)} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t('search.removeFilterHint')}>
                    <X size={12} color="#F59E0B" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={styles.clearAllPill}
                onPress={resetFilters}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('search.clearAll')}
              >
                <RotateCcw size={12} color="#FF3B30" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF3B30', marginLeft: 4 }}>{t('search.clearAll')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        <FlatList
          data={filteredTrips}
          keyExtractor={keyExtractor}
          refreshControl={<RefreshControl refreshing={tripsRefetching} onRefresh={refetchTrips} tintColor={C.accent} />}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <TripResultCard
              trip={item}
              isLiked={likedTrips.has(item.id)}
              isMyTrip={
                isLoggedIn &&
                (item.isMyTrip === true || !!(profile && profile.id && item.creatorId && item.creatorId === profile.id))
              }
              isRequested={requestedTrips.has(item.id)}
              onToggleLike={toggleLike}
              onOpenTrip={openTrip}
            />
          )}
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
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {/* ─── QUICK ACCESS GRID (VECTOR ICONS) ────────────────── */}
              <View style={styles.quickGrid}>
                {QUICK_ACCESS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.7}
                    style={[styles.quickCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
                    onPress={() => {
                      if (item.key === 'custom') {
                        router.navigate('/create');
                      } else if (item.key === 'nearby') {
                        router.push('/nearby-trips');
                      } else if (item.key === 'budget') {
                        router.push('/budget-trips');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t(item.labelKey)}
                  >
                    <View style={[styles.quickIconCircle, { backgroundColor: item.color + '15' }]}>
                      <item.Icon size={18} color={item.color} />
                    </View>
                    <Text style={[styles.quickLabel, { color: C.text }]}>{t(item.labelKey)}</Text>
                    <Text style={[styles.quickSub, { color: C.textSecondary }]}>{t(item.subKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ─── POPULARITY HEADER ───────────────────────────────── */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
                  {t('search.tripsByPopularity', { count: filteredTrips.length })}
                </Text>
                {activeFilterCount > 0 && (
                  <TouchableOpacity
                    style={styles.resetInlineBtn}
                    onPress={resetFilters}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('search.resetFilters')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF3B30' }}>{t('search.resetFilters')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          }
          ListEmptyComponent={
            tripsLoading ? (
              <ScreenLoading label={t('search.findingTrips')} />
            ) : tripsError ? (
              <ScreenError
                title={t('search.couldNotLoadTrips')}
                message={
                  tripsFetchError instanceof Error
                    ? tripsFetchError.message
                    : t('search.checkConnection')
                }
                onRetry={() => refetchTrips()}
              />
            ) : (
              <ScreenEmpty
                title={t('search.noMatchingTrips')}
                message={t('search.noMatchingTripsMessage')}
                actionLabel={t('search.resetPreferences')}
                onAction={resetFilters}
              />
            )
          }
          ListFooterComponent={
            <>
              {isFetchingNextPage && (
                <View style={styles.loadMoreRow}>
                  <ActivityIndicator color={C.accent} />
                </View>
              )}

              {/* ─── CTA BANNER ────────────────────────────────────── */}
              <View style={styles.ctaBannerContainer}>
                <Image source={require('@/assets/images/cta-banner.png')} style={styles.ctaBannerImage} />
                <Pressable
                  onPress={() => {
                    router.navigate('/create');
                  }}
                  style={({ pressed }) => [
                    styles.ctaHotspot,
                    pressed && {
                      backgroundColor: 'rgba(255, 255, 255, 0.16)',
                      transform: [{ scale: 0.94 }],
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.createATrip')}
                />
              </View>

              {/* Padding at the bottom for tab bar safety */}
              <View style={{ height: 100 }} />
            </>
          }
        />
      </Animated.View>

      <TripDetailModal visible={showJoinModal} trip={selectedTrip} onClose={() => setShowJoinModal(false)} />

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
            accessibilityRole="button"
            accessibilityLabel={t('search.closeLabel')}
          />
          <View style={[styles.filterSheet, { backgroundColor: C.card }]}>
            {/* Header */}
            <View style={[styles.filterHeader, { borderBottomColor: C.divider }]}>
              <View style={styles.filterTitleRow}>
                <SlidersHorizontal size={20} color={C.accent} />
                <Text style={[styles.filterSheetTitle, { color: C.text }]}>{t('search.filtersAndPreferences')}</Text>
                {activeFilterCount > 0 && (
                  <View style={styles.activeFilterCountBadge}>
                    <Text style={styles.activeFilterCountText}>{t('search.activeCount', { count: activeFilterCount })}</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity
                    onPress={resetFilters}
                    activeOpacity={0.7}
                    hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('search.resetAll')}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FF3B30' }}>{t('search.resetAll')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowFilterModal(false)}
                  style={[
                    styles.closeIconBtn,
                    { backgroundColor: 'rgba(255,255,255,0.08)' },
                  ]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <X size={18} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {/* Section 1: SORT BY */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>{t('search.sortResultsBy')}</Text>
                <View style={styles.filterChipsWrap}>
                  {(
                    [
                      { key: 'popularity', labelKey: 'search.sortPopularity' },
                      { key: 'price_low', labelKey: 'search.sortPriceLow' },
                      { key: 'price_high', labelKey: 'search.sortPriceHigh' },
                      { key: 'rating', labelKey: 'search.sortHighestRated' },
                    ] as const
                  ).map((opt) => {
                    const isSelected = sortOption === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setSortOption(opt.key)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.blue : C.border,
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t(opt.labelKey)}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {t(opt.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 2: MAXIMUM BUDGET */}
              <View style={styles.filterSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>{t('search.maxBudgetPerPerson')}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent }}>
                    {maxBudget >= 50000 ? t('search.anyBudget') : `₹${maxBudget.toLocaleString('en-IN')}`}
                  </Text>
                </View>
                <View style={styles.filterChipsWrap}>
                  {[
                    { val: 50000, labelKey: 'search.budgetAny' },
                    { val: 10000, labelKey: 'search.budgetUnder10k' },
                    { val: 15000, labelKey: 'search.budgetUnder15k' },
                    { val: 20000, labelKey: 'search.budgetUnder20k' },
                    { val: 30000, labelKey: 'search.budgetUnder30k' },
                  ].map((b) => {
                    const isSelected = maxBudget === b.val;
                    return (
                      <TouchableOpacity
                        key={b.val}
                        onPress={() => setMaxBudget(b.val)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.blue : C.border,
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t(b.labelKey)}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {t(b.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 3: TRIP DURATION */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>{t('search.tripDuration')}</Text>
                <View style={styles.filterChipsWrap}>
                  {(
                    [
                      { key: 'ALL', labelKey: 'search.durationAny' },
                      { key: 'SHORT', labelKey: 'search.duration1to3' },
                      { key: 'MEDIUM', labelKey: 'search.duration4to7' },
                      { key: 'LONG', labelKey: 'search.duration8plus' },
                    ] as const
                  ).map((dur) => {
                    const isSelected = selectedDuration === dur.key;
                    return (
                      <TouchableOpacity
                        key={dur.key}
                        onPress={() => setSelectedDuration(dur.key)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.blue : C.border,
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t(dur.labelKey)}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {t(dur.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 4: TRANSPORT MODE */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>{t('search.transportMode')}</Text>
                <View style={styles.filterChipsWrap}>
                  {(
                    [
                      { key: 'ALL', labelKey: 'search.transportAllModes' },
                      { key: 'BUS', labelKey: 'search.transportBus' },
                      { key: 'BIKE', labelKey: 'search.transportBike' },
                    ] as const
                  ).map((tr) => {
                    const isSelected = selectedTransport === tr.key;
                    return (
                      <TouchableOpacity
                        key={tr.key}
                        onPress={() => setSelectedTransport(tr.key)}
                        style={[
                          styles.filterSelectChip,
                          {
                            backgroundColor: isSelected ? C.blue : C.border,
                            borderColor: isSelected ? C.accent : C.cardBorder,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t(tr.labelKey)}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={[styles.filterSelectChipText, { color: isSelected ? '#FFF' : C.text }]}>
                          {t(tr.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 5: SPECIAL PREFERENCES */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: C.textSecondary }]}>{t('search.preferencesAndHosting')}</Text>

                {/* Switch 1: Verified Hosts Only */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: C.border }]}
                  onPress={() => setVerifiedOnly(!verifiedOnly)}
                  accessibilityRole="switch"
                  accessibilityLabel={t('search.verifiedOrganizersOnly')}
                  accessibilityState={{ checked: verifiedOnly }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Shield size={18} color={C.accent} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>{t('search.verifiedOrganizersOnly')}</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>
                        {t('search.verifiedOrganizersOnlySub')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.toggleTrack,
                      verifiedOnly ? { backgroundColor: C.blue } : { backgroundColor: 'rgba(120,120,128,0.3)' },
                    ]}
                  >
                    <View style={[styles.toggleCircle, verifiedOnly ? styles.circleOn : styles.circleOff]} />
                  </View>
                </TouchableOpacity>

                {/* Switch 2: Local Guide Included */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: C.border, marginTop: 8 }]}
                  onPress={() => setGuideRequired(!guideRequired)}
                  accessibilityRole="switch"
                  accessibilityLabel={t('search.certifiedGuideIncluded')}
                  accessibilityState={{ checked: guideRequired }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <UserCheck size={18} color="#10B981" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>{t('search.certifiedGuideIncluded')}</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>
                        {t('search.certifiedGuideIncludedSub')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.toggleTrack,
                      guideRequired ? { backgroundColor: '#10B981' } : { backgroundColor: 'rgba(120,120,128,0.3)' },
                    ]}
                  >
                    <View style={[styles.toggleCircle, guideRequired ? styles.circleOn : styles.circleOff]} />
                  </View>
                </TouchableOpacity>

                {/* Switch 3: Midway Segment Join Option */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.prefToggleRow, { backgroundColor: C.border, marginTop: 8 }]}
                  onPress={() => setMidwayOnly(!midwayOnly)}
                  accessibilityRole="switch"
                  accessibilityLabel={t('search.midwaySegmentJoin')}
                  accessibilityState={{ checked: midwayOnly }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <MapPin size={18} color="#F59E0B" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prefToggleTitle, { color: C.text }]}>{t('search.midwaySegmentJoin')}</Text>
                      <Text style={[styles.prefToggleSub, { color: C.textSecondary }]}>
                        {t('search.midwaySegmentJoinSub')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.toggleTrack,
                      midwayOnly ? { backgroundColor: '#F59E0B' } : { backgroundColor: 'rgba(120,120,128,0.3)' },
                    ]}
                  >
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
                accessibilityRole="button"
                accessibilityLabel={t('search.applyPreferences', { count: filteredTrips.length })}
              >
                <LinearGradient
                  colors={['#0047C4', '#0066FF', '#00D0FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyFilterBtnGradient}
                >
                  <Text style={styles.applyFilterBtnText}>
                    {t('search.applyPreferences', { count: filteredTrips.length })}
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
    fontSize: 12,
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
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    minHeight: MIN_TOUCH_TARGET,
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
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickSub: {
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '700',
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  routeArrow: {
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '600',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.blue,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 3,
    flexShrink: 0,
    minHeight: MIN_TOUCH_TARGET,
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 12,
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
    left: '6.2%',
    top: '59.0%',
    width: '37.2%',
    height: '18.4%',
    borderRadius: 999,
    backgroundColor: 'transparent',
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  selectorGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
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
    backgroundColor: C.blue,
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
    backgroundColor: C.blue,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeFilterTagsRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeFilterLabel: {
    fontSize: 12,
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
    fontSize: 12,
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
  loadMoreRow: {
    paddingVertical: 20,
    alignItems: 'center',
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
    fontSize: 12,
    fontWeight: '600',
    color: C.blue,
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
    fontSize: 12,
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
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
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
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  citySelectChipText: {
    fontSize: 12,
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
    fontSize: 12,
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
    color: C.green,
    marginBottom: 2,
  },
  requestedStatusSub: {
    fontSize: 12,
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
    color: C.red,
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
    fontSize: 12,
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

export default React.memo(SearchScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Search" />;
}
