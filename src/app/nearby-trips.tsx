import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { getCurrentDeviceLocation } from '@/lib/device-location';
import { formatDateRange } from '@/lib/datetime';
import TripDetailModal from '@/components/TripDetailModal';
import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import MapPin from 'lucide-react-native/icons/map-pin';
import Navigation from 'lucide-react-native/icons/navigation';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Chip, Input, ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';
import type { NearbyTrip } from '@/types/api';

// The 28 states + 8 union territories, spelled exactly as
// backend/src/lib/india-city-coords.ts's INDIA_CITY_COORDS table does (the
// server matches this case-insensitively, but the canonical spelling still
// has to agree — e.g. "Odisha" not "Orissa"). This is real, stable, public
// reference data, not a fabricated business fact, so hardcoding it here
// (rather than a picker built from whatever cities happen to be loaded) is
// fine.
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

const RADIUS_PRESETS_KM = [5, 10, 25, 50, 100, 250] as const;

type FilterMode = 'ALL' | 'RADIUS' | 'CITY' | 'STATE';
const FILTER_MODES: FilterMode[] = ['ALL', 'RADIUS', 'CITY', 'STATE'];
const FILTER_MODE_LABEL_KEYS: Record<FilterMode, string> = {
  ALL: 'nearbyTrips.filterAll',
  RADIUS: 'nearbyTrips.filterByRadius',
  CITY: 'nearbyTrips.filterByCity',
  STATE: 'nearbyTrips.filterByState',
};

// docs/REMEDIATION.md §8.13: this screen previously rendered a hardcoded
// list of Delhi-area "places" with a fake "CURRENT GPS LOCATION" banner and
// fabricated cost breakdowns, then handed a made-up trip object (id
// 'place-1') to the join modal — which POSTed a join request for a
// nonexistent trip. It now asks for the real device location, fetches real
// upcoming public trips from GET /trips/nearby sorted by straight-line
// distance, and only ever opens the join modal on a real trip.

// Each row is its own component so the React Compiler
// (app.json > experiments.reactCompiler) can memoize rows independently —
// which is why there is no hand-written React.memo/useCallback here. The
// compiler does NOT virtualize, though, so the FlatList below is the actual
// Phase 10 win: this list used to be a ScrollView + .map() that mounted
// every trip at once (docs/REMEDIATION.md Phase 10).
function NearbyTripCard({ trip, onPress }: { trip: NearbyTrip; onPress: (trip: NearbyTrip) => void }) {
  const { t } = useTranslation();
  const distance =
    trip.distanceKm === null
      ? (trip.cities[0] ?? t('nearbyTrips.routeTBD'))
      : t('nearbyTrips.distanceAway', { km: trip.distanceKm.toLocaleString('en-IN') });

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.tripCard} onPress={() => onPress(trip)}>
      <View style={styles.tripImgWrap}>
        <Image source={{ uri: trip.coverImage }} style={styles.tripImg} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        <LinearGradient colors={['rgba(6,8,20,0.15)', 'rgba(6,8,20,0.9)']} style={StyleSheet.absoluteFill} />
        <View style={styles.distBadge}>
          <Navigation size={11} color={C.white} />
          <Text style={styles.distBadgeText}>{distance}</Text>
        </View>
      </View>
      <View style={styles.tripBody}>
        <Text style={styles.tripTitle} numberOfLines={1}>
          {trip.name}
        </Text>
        <View style={styles.tripRow}>
          <MapPin size={12} color={C.green} />
          <Text style={styles.tripRowText} numberOfLines={1}>
            {trip.cities.join(' → ')}
          </Text>
        </View>
        <View style={styles.tripMetaRow}>
          <View style={styles.tripRow}>
            <Users size={12} color={C.textMuted} />
            <Text style={styles.tripMetaText}>
              {t('nearbyTrips.joinedCount', { joined: trip.membersCount, total: trip.totalSeats })}
            </Text>
          </View>
          <Text style={styles.tripPrice}>₹{Number(trip.budget).toLocaleString('en-IN')}</Text>
        </View>
        <Text style={styles.tripDates}>{formatDateRange(trip.startDate, trip.endDate)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// No getItemLayout: the card's height is only *mostly* fixed (a user with a
// large system font scale grows the text rows), and a getItemLayout that
// lies about row height produces scroll jumps worse than the measurement it
// saves.
const keyExtractor = (t: NearbyTrip) => t.id;
const listFooter = <View style={{ height: 100 }} />;

type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' | 'unavailable' };

export default function NearbyTripsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [selectedTrip, setSelectedTrip] = useState<NearbyTrip | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [cityInput, setCityInput] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateSheetOpen, setStateSheetOpen] = useState(false);

  // Debounced so every keystroke doesn't trigger its own GET /trips/nearby.
  useEffect(() => {
    const handle = setTimeout(() => setCityQuery(cityInput.trim()), 400);
    return () => clearTimeout(handle);
  }, [cityInput]);

  const clearFilter = () => {
    setFilterMode('ALL');
    setRadiusKm(null);
    setCityInput('');
    setCityQuery('');
    setSelectedState(null);
  };

  const requestLocation = async () => {
    setLocation({ status: 'loading' });
    const res = await getCurrentDeviceLocation();
    if (res.ok) {
      setLocation({
        status: 'granted',
        latitude: res.latitude,
        longitude: res.longitude,
      });
    } else {
      setLocation({
        status: res.reason === 'PERMISSION_DENIED' ? 'denied' : 'unavailable',
      });
    }
  };

  const coords = location.status === 'granted' ? { lat: location.latitude, lng: location.longitude } : null;

  // radiusKm requires an origin, same as the backend requires — the chips
  // that set it are disabled until coords exist, but guard here too in case
  // location is lost (denied mid-session) while RADIUS is still selected.
  const activeRadiusKm = filterMode === 'RADIUS' && coords ? radiusKm : null;
  const activeCity = filterMode === 'CITY' ? cityQuery : '';
  const activeState = filterMode === 'STATE' ? selectedState : null;

  const {
    data: trips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: [...queryKeys.nearbyPlaces(), coords?.lat ?? null, coords?.lng ?? null, activeRadiusKm, activeCity, activeState],
    queryFn: async (): Promise<NearbyTrip[]> => {
      const params = new URLSearchParams();
      if (coords) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
      }
      if (activeRadiusKm) params.set('radiusKm', String(activeRadiusKm));
      if (activeCity) params.set('city', activeCity);
      if (activeState) params.set('state', activeState);
      const qsString = params.toString();
      const res = await apiService.getNearbyTrips(qsString ? `?${qsString}` : '');
      return res ?? [];
    },
  });

  const openTrip = (trip: NearbyTrip) => {
    setSelectedTrip(trip);
    setShowJoinModal(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.topNavRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel={t('nearbyTrips.goBack')}
        >
          <ArrowLeft size={18} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>{t('nearbyTrips.title')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      {/* Location banner */}
      <View style={styles.locBanner}>
        <View style={styles.locIconCircle}>
          <MapPin size={16} color={location.status === 'granted' ? C.green : C.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          {location.status === 'granted' ? (
            <>
              <Text style={styles.locTitle}>{t('nearbyTrips.usingCurrentLocation')}</Text>
              <Text style={styles.locSub}>
                {t('nearbyTrips.coordsDistanceNote', {
                  lat: location.latitude.toFixed(3),
                  lng: location.longitude.toFixed(3),
                })}
              </Text>
            </>
          ) : location.status === 'loading' ? (
            <Text style={styles.locSub}>{t('nearbyTrips.gettingLocation')}</Text>
          ) : location.status === 'denied' || location.status === 'unavailable' ? (
            <>
              <Text style={styles.locTitle}>
                {location.status === 'denied' ? t('nearbyTrips.locationDenied') : t('nearbyTrips.locationUnavailable')}
              </Text>
              <Text style={styles.locSub}>{t('nearbyTrips.showingAllUnsorted')}</Text>
            </>
          ) : (
            <Text style={styles.locSub}>{t('nearbyTrips.shareLocationPrompt')}</Text>
          )}
        </View>
        {location.status !== 'granted' && location.status !== 'loading' && (
          <TouchableOpacity
            style={styles.locBtn}
            onPress={requestLocation}
            accessibilityRole="button"
            accessibilityLabel={t('nearbyTrips.useMyLocationLabel')}
          >
            <Navigation size={13} color={C.blue} />
            <Text style={styles.locBtnText}>{t('nearbyTrips.useLocation')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters: radius / city / state — independently combinable on the
          backend, but the UI exposes one at a time via a segmented mode
          picker for simplicity. */}
      <View style={styles.filterModeRow}>
        {FILTER_MODES.map((mode) => (
          <Chip
            key={mode}
            label={t(FILTER_MODE_LABEL_KEYS[mode])}
            selected={filterMode === mode}
            onPress={() => setFilterMode(mode)}
            style={styles.filterModeChip}
          />
        ))}
        {filterMode !== 'ALL' && (
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={clearFilter}
            accessibilityRole="button"
            accessibilityLabel={t('nearbyTrips.clearFilter')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={14} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {filterMode === 'RADIUS' && (
        <View style={styles.filterPanel}>
          {coords ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {RADIUS_PRESETS_KM.map((km) => (
                <Chip
                  key={km}
                  label={t('nearbyTrips.radiusKmLabel', { km })}
                  selected={radiusKm === km}
                  onPress={() => setRadiusKm(km)}
                />
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.filterHintText}>{t('nearbyTrips.radiusRequiresLocation')}</Text>
          )}
        </View>
      )}

      {filterMode === 'CITY' && (
        <View style={styles.filterPanel}>
          <Input
            value={cityInput}
            onChangeText={setCityInput}
            placeholder={t('nearbyTrips.cityPlaceholder')}
            accessibilityLabel={t('nearbyTrips.cityFilterLabel')}
            containerStyle={styles.filterInputWrap}
          />
        </View>
      )}

      {filterMode === 'STATE' && (
        <View style={styles.filterPanel}>
          <TouchableOpacity
            style={styles.stateTrigger}
            onPress={() => setStateSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={selectedState ?? t('nearbyTrips.statePlaceholder')}
            accessibilityHint={t('common.opensChoiceListHint')}
          >
            <Text style={[styles.stateTriggerText, !selectedState && styles.stateTriggerPlaceholder]}>
              {selectedState ?? t('nearbyTrips.statePlaceholder')}
            </Text>
            <ChevronDown size={16} color={C.textMuted} />
          </TouchableOpacity>
          <Sheet visible={stateSheetOpen} onClose={() => setStateSheetOpen(false)} title={t('nearbyTrips.stateFilterLabel')}>
            {INDIAN_STATES.map((s) => {
              const isSelected = selectedState === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={styles.stateOption}
                  onPress={() => {
                    setSelectedState(s);
                    setStateSheetOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.stateOptionText, isSelected && styles.stateOptionTextSelected]}>{s}</Text>
                  {isSelected ? <Check size={16} color={C.blueText} /> : null}
                </TouchableOpacity>
              );
            })}
          </Sheet>
        </View>
      )}

      {isLoading ? (
        <ScreenLoading label={t('nearbyTrips.findingTrips')} />
      ) : isError ? (
        <ScreenError
          message={error instanceof Error ? error.message : t('nearbyTrips.couldNotLoadNearbyTrips')}
          onRetry={() => refetch()}
        />
      ) : trips.length === 0 ? (
        <ScreenEmpty title={t('nearbyTrips.noTripsNearbyTitle')} message={t('nearbyTrips.noTripsNearbyMessage')} />
      ) : (
        <FlatList
          data={trips}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <NearbyTripCard trip={item} onPress={openTrip} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.blue} />}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          ListFooterComponent={listFooter}
        />
      )}

      <TripDetailModal visible={showJoinModal} trip={selectedTrip} onClose={() => setShowJoinModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  topNavTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  locIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: { fontSize: 12, fontWeight: '700', color: C.white },
  locSub: { fontSize: 12, color: C.textSec, lineHeight: 15 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    minHeight: MIN_TOUCH_TARGET,
  },
  locBtnText: { fontSize: 12, fontWeight: '700', color: C.blue },
  filterModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  filterModeChip: { flex: 1 },
  clearFilterBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterPanel: { marginHorizontal: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filterHintText: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },
  filterInputWrap: { gap: 0 },
  stateTrigger: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
  },
  stateTriggerText: { fontSize: 14, fontWeight: '600', color: C.text },
  stateTriggerPlaceholder: { color: C.textMuted, fontWeight: '400' },
  stateOption: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  stateOptionText: { fontSize: 14, color: C.text },
  stateOptionTextSelected: { color: C.blueText, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  tripCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  tripImgWrap: { height: 140, position: 'relative' },
  tripImg: { width: '100%', height: '100%' },
  distBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(59,130,246,0.9)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  distBadgeText: { fontSize: 12, fontWeight: '800', color: C.white },
  tripBody: { padding: 14, gap: 7 },
  tripTitle: { fontSize: 14.5, fontWeight: '800', color: C.text },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripRowText: { fontSize: 12, fontWeight: '600', color: C.greenText, flex: 1 },
  tripMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripMetaText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  tripPrice: { fontSize: 13.5, fontWeight: '800', color: C.amberText },
  tripDates: { fontSize: 12, color: C.textMuted },
});
