// Direct Search Mode for the map tab: the Google-Maps-style From/To route
// planner shown when the map is opened without a trip.
//
// Split in three so the map screen can place each piece where it belongs:
//   useRoutePlanner()  — all state: endpoints, debounced place search,
//                        debounced route resolution, current location.
//   RoutePlannerCard   — the floating From/To/mode card at the top.
//   RouteMetricsCard   — the distance/ETA banner at the bottom.
// The screen turns the planner's state into a WebView message; nothing in
// here knows about Leaflet.
import { getCurrentDeviceLocation } from '@/lib/device-location';
import { logger } from '@/lib/logger';
import {
  formatDistanceKm,
  formatEta,
  ROUTE_STYLES,
  ROUTE_TRAVEL_MODES,
  type LatLng,
  type RouteTravelMode,
} from '@/lib/map-geometry';
import { resolveRoute, searchPlaces, type PlaceResult, type ResolvedRoute } from '@/services/map-routing';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import Bike from 'lucide-react-native/icons/bike';
import Car from 'lucide-react-native/icons/car';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import Clock from 'lucide-react-native/icons/clock';
import Locate from 'lucide-react-native/icons/locate';
import MapPinIcon from 'lucide-react-native/icons/map-pin';
import Plane from 'lucide-react-native/icons/plane';
import Route from 'lucide-react-native/icons/route';
import TrainFront from 'lucide-react-native/icons/train-front';
import X from 'lucide-react-native/icons/x';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Minimum debounce for anything that can hit a paid or rate-limited API. */
const SEARCH_DEBOUNCE_MS = 350;
const ROUTE_DEBOUNCE_MS = 300;

export type RouteEndpoint = LatLng & { label: string; isCurrentLocation?: boolean };
type Field = 'from' | 'to';

const MODE_ICON = { car: Car, bike: Bike, train: TrainFront, flight: Plane } as const;
const MODE_LABEL_KEY: Record<RouteTravelMode, [string, string]> = {
  car: ['map.modeCar', 'Car'],
  bike: ['map.modeBike', 'Bike'],
  train: ['map.modeTRAIN', 'Train'],
  flight: ['map.modeFLIGHT', 'Flight'],
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function useRoutePlanner({
  enabled,
  localPlaces = [],
}: {
  enabled: boolean;
  /** Places the map already knows about (its pins), suggested ahead of geocoder hits. */
  localPlaces?: PlaceResult[];
}) {
  const { t } = useTranslation();
  const [from, setFromState] = useState<RouteEndpoint | null>(null);
  const [to, setToState] = useState<RouteEndpoint | null>(null);
  // Mirrors of the endpoints, written synchronously. Choosing a result
  // dismisses the keyboard, and the input's onBlur fires before React has
  // re-rendered with the new endpoint — reading state there would restore
  // the previous place's name over the one just picked.
  const endpointsRef = useRef<{ from: RouteEndpoint | null; to: RouteEndpoint | null }>({ from: null, to: null });
  const setFrom = useCallback((e: RouteEndpoint | null) => {
    endpointsRef.current.from = e;
    setFromState(e);
  }, []);
  const setTo = useCallback((e: RouteEndpoint | null) => {
    endpointsRef.current.to = e;
    setToState(e);
  }, []);
  const [mode, setMode] = useState<RouteTravelMode>('car');
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [activeField, setActiveField] = useState<Field | null>(null);
  // Geocoder answers and resolved routes are stored with the input they
  // answer, and only shown while that input is still current — so a slow
  // reply for an old query or an old endpoint pair can never land on top
  // of a newer one, and nothing has to be reset by hand when inputs change.
  const [geo, setGeo] = useState<{ query: string; rows: PlaceResult[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [resolved, setResolved] = useState<{ key: string; route: ResolvedRoute } | null>(null);
  const triedLocation = useRef(false);

  const currentLocationLabel = t('map.currentLocation', 'Current location');

  const locateFrom = useCallback(async () => {
    setLocating(true);
    setLocationFailed(false);
    const fix = await getCurrentDeviceLocation();
    setLocating(false);
    if (!fix.ok) {
      setLocationFailed(true);
      return;
    }
    setFrom({
      latitude: fix.latitude,
      longitude: fix.longitude,
      label: currentLocationLabel,
      isCurrentLocation: true,
    });
    setFromQuery(currentLocationLabel);
  }, [currentLocationLabel, setFrom]);

  // "From" defaults to the device's position the first time the planner is
  // shown. Only attempted once — a denied permission is not re-prompted on
  // every visit; the user can still pick "Use my location" explicitly.
  useEffect(() => {
    if (!enabled || triedLocation.current) return;
    triedLocation.current = true;
    void locateFrom();
  }, [enabled, locateFrom]);

  // Place autocomplete for whichever field is being edited.
  const activeQuery = activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '';
  const selectedLabel = activeField === 'from' ? from?.label : activeField === 'to' ? to?.label : undefined;
  const debouncedQuery = useDebounced(activeQuery.trim(), SEARCH_DEBOUNCE_MS);

  // Nothing to look up when the box is empty, too short, or just showing
  // the chosen place's own name.
  const lookupQuery =
    activeField && debouncedQuery.length >= 3 && debouncedQuery !== selectedLabel ? debouncedQuery : null;

  useEffect(() => {
    if (!lookupQuery) return;
    const controller = new AbortController();
    searchPlaces(lookupQuery, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setGeo({ query: lookupQuery, rows });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        // A failed lookup shows "no match" rather than a guessed place.
        logger.warn('[RoutePlanner] Place search failed:', e);
        setGeo({ query: lookupQuery, rows: [] });
      });
    return () => controller.abort();
  }, [lookupQuery]);

  const geoResults = useMemo(
    () => (lookupQuery && geo?.query === lookupQuery ? geo.rows : []),
    [lookupQuery, geo],
  );
  const searching = !!lookupQuery && geo?.query !== lookupQuery;

  // Route resolution, debounced so flipping through modes or swapping
  // endpoints quickly costs one lookup, not one per tap. The previous line
  // disappears as soon as the inputs change (it no longer matches routeKey),
  // so the map never shows a stale route under new metrics.
  const routeKey =
    from && to ? `${mode}|${from.latitude},${from.longitude}|${to.latitude},${to.longitude}` : null;

  useEffect(() => {
    if (!routeKey || !from || !to) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void resolveRoute(mode, from, to).then((route) => {
        if (!cancelled) setResolved({ key: routeKey, route });
      });
    }, ROUTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [routeKey, from, to, mode]);

  const route = routeKey && resolved?.key === routeKey ? resolved.route : null;
  const routing = !!routeKey && !route;

  const results = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    if (q.length < 2 || q === selectedLabel?.toLowerCase()) return geoResults;
    const local = localPlaces
      .filter((p) => p.name.toLowerCase().includes(q) || p.detail.toLowerCase().includes(q))
      .slice(0, 3);
    return [...local, ...geoResults].slice(0, 7);
  }, [activeQuery, selectedLabel, localPlaces, geoResults]);

  const selectPlace = useCallback((field: Field, place: PlaceResult) => {
    Keyboard.dismiss();
    const endpoint: RouteEndpoint = { latitude: place.latitude, longitude: place.longitude, label: place.name };
    if (field === 'from') {
      setFrom(endpoint);
      setFromQuery(place.name);
    } else {
      setTo(endpoint);
      setToQuery(place.name);
    }
    setActiveField(null);
  }, [setFrom, setTo]);

  const clearField = useCallback(
    (field: Field) => {
      if (field === 'from') {
        setFrom(null);
        setFromQuery('');
      } else {
        setTo(null);
        setToQuery('');
      }
      },
    [setFrom, setTo],
  );

  const swap = useCallback(() => {
    setFrom(to);
    setTo(from);
    setFromQuery(to?.label ?? toQuery);
    setToQuery(from?.label ?? fromQuery);
  }, [from, to, fromQuery, toQuery, setFrom, setTo]);

  // Leaving a field without choosing a result puts the chosen place's name
  // back, so the box never shows text the route isn't actually using.
  const blurField = useCallback((field: Field) => {
    const { from: currentFrom, to: currentTo } = endpointsRef.current;
    if (field === 'from') setFromQuery(currentFrom?.label ?? '');
    else setToQuery(currentTo?.label ?? '');
    setActiveField((current) => (current === field ? null : current));
  }, []);

  return {
    from,
    to,
    mode,
    setMode,
    fromQuery,
    setFromQuery,
    toQuery,
    setToQuery,
    activeField,
    setActiveField,
    results,
    searching,
    locating,
    locationFailed,
    locateFrom,
    route,
    routing,
    selectPlace,
    clearField,
    swap,
    blurField,
  };
}

export type RoutePlanner = ReturnType<typeof useRoutePlanner>;

export function RoutePlannerCard({ planner }: { planner: RoutePlanner }) {
  const { t } = useTranslation();
  const {
    activeField,
    fromQuery,
    toQuery,
    from,
    results,
    searching,
    locating,
    locationFailed,
    mode,
  } = planner;

  const renderField = (field: Field) => {
    const isFrom = field === 'from';
    const value = isFrom ? fromQuery : toQuery;
    const placeholder = isFrom
      ? locating
        ? t('map.locatingYou', 'Getting your location…')
        : t('map.chooseStart', 'Choose starting point')
      : t('map.chooseDestination', 'Choose destination');
    return (
      <View style={styles.fieldRow}>
        {isFrom ? (
          <CircleDot size={14} color="#0066FF" />
        ) : (
          <MapPinIcon size={14} color="#EF4444" />
        )}
        <TextInput
          style={[styles.fieldInput, isFrom && from?.isCurrentLocation && value === from.label && styles.fieldInputCurrent]}
          value={value}
          onChangeText={isFrom ? planner.setFromQuery : planner.setToQuery}
          onFocus={() => planner.setActiveField(field)}
          onBlur={() => planner.blurField(field)}
          placeholder={placeholder}
          placeholderTextColor="#8B949E"
          returnKeyType="search"
          selectTextOnFocus
          accessibilityLabel={isFrom ? t('map.planFrom', 'From') : t('map.planTo', 'To')}
        />
        {isFrom && locating ? (
          <ActivityIndicator size={12} color="#0066FF" />
        ) : value.length > 0 ? (
          <TouchableOpacity
            onPress={() => planner.clearField(field)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear', 'Clear')}
          >
            <X size={13} color="#8B949E" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const query = (activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '').trim();
  const showUseLocation = activeField === 'from' && !from?.isCurrentLocation;

  return (
    <View style={styles.card}>
      <View style={styles.fieldsWrap}>
        <View style={styles.fieldsCol}>
          {renderField('from')}
          <View style={styles.fieldDivider} />
          {renderField('to')}
        </View>
        <TouchableOpacity
          style={styles.swapBtn}
          onPress={planner.swap}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('map.swapEndpoints', 'Swap start and destination')}
        >
          <ArrowUpDown size={15} color="#C9D1D9" />
        </TouchableOpacity>
      </View>

      {locationFailed && !from && activeField === null && (
        <Text style={styles.hintText}>
          {t('map.locationUnavailable', "Couldn't get your location — choose a starting point.")}
        </Text>
      )}

      {activeField !== null && (showUseLocation || query.length >= 3 || results.length > 0) && (
        <View style={styles.results}>
          {showUseLocation && (
            <TouchableOpacity
              style={styles.resultRow}
              onPress={() => {
                Keyboard.dismiss();
                planner.setActiveField(null);
                void planner.locateFrom();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('map.useMyLocation', 'Use my location')}
            >
              <Locate size={13} color="#0066FF" />
              <Text style={styles.resultName}>{t('map.useMyLocation', 'Use my location')}</Text>
            </TouchableOpacity>
          )}
          {query.length >= 3 && results.length === 0 && (
            <View style={styles.resultRow}>
              <Text style={styles.resultDetail}>
                {searching ? t('map.searching', 'Searching...') : t('map.noPlacesFound', 'No matching place found')}
              </Text>
            </View>
          )}
          {results.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={styles.resultRow}
              onPress={() => planner.selectPlace(activeField, place)}
              accessibilityRole="button"
              accessibilityLabel={place.name}
            >
              <MapPinIcon size={13} color="#0066FF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName} numberOfLines={1}>{place.name}</Text>
                {!!place.detail && (
                  <Text style={styles.resultDetail} numberOfLines={1}>{place.detail}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.modeRow} accessibilityRole="tablist">
        {ROUTE_TRAVEL_MODES.map((m) => {
          const Icon = MODE_ICON[m];
          const isActive = m === mode;
          const [key, fallback] = MODE_LABEL_KEY[m];
          const color = isActive ? ROUTE_STYLES[m].color : '#8B949E';
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, isActive && { backgroundColor: `${ROUTE_STYLES[m].color}22`, borderColor: `${ROUTE_STYLES[m].color}66` }]}
              onPress={() => planner.setMode(m)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t(key, fallback)}
              accessibilityState={{ selected: isActive }}
            >
              <Icon size={15} color={color} />
              <Text style={[styles.modeText, { color }]} numberOfLines={1}>{t(key, fallback)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function RouteMetricsCard({ planner }: { planner: RoutePlanner }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { from, to, route, routing, mode } = planner;

  const footnote = useMemo(() => {
    if (!route) return null;
    if (route.source === 'straight') {
      return t('map.straightLineFallback', 'No route found for this mode — showing a straight line.');
    }
    if (route.source === 'curve') {
      return t('map.approximatePath', 'Approximate path — rail track data unavailable.');
    }
    if (route.source === 'geodesic') {
      return t('map.greatCirclePath', 'Great-circle flight path.');
    }
    return null;
  }, [route, t]);

  if (!from || !to) return null;

  const Icon = MODE_ICON[mode];
  const eta = route ? formatEta(route.durationMinutes) : null;
  const [modeKey, modeFallback] = MODE_LABEL_KEY[mode];

  // The tab bar floats over the map (AppTabBar: 48pt tall, offset by the
  // bottom inset), so the card sits just above it.
  const bottom = Math.max(insets.bottom, 12) + 48 + 12;

  return (
    <View style={[styles.metricsCard, { bottom }]}>
      <View style={styles.metricsHeader}>
        <View style={[styles.metricsModeBadge, { backgroundColor: `${ROUTE_STYLES[mode].color}26` }]}>
          <Icon size={16} color={ROUTE_STYLES[mode].color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metricsTitle} numberOfLines={1}>
            {from.label} ➔ {to.label}
          </Text>
          <Text style={styles.metricsSub}>{t(modeKey, modeFallback)}</Text>
        </View>
        {routing && <ActivityIndicator size="small" color="#0066FF" />}
      </View>

      {route && !routing ? (
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Route size={13} color="#8B949E" />
            <View>
              <Text style={styles.metricLabel}>{t('map.routeDistance', 'Distance')}</Text>
              <Text style={styles.metricVal}>
                {route.isApproximate ? '≈ ' : ''}
                {formatDistanceKm(route.distanceKm)}
              </Text>
            </View>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Clock size={13} color="#8B949E" />
            <View>
              <Text style={styles.metricLabel}>{t('map.routeEta', 'Travel time')}</Text>
              <Text style={styles.metricVal}>
                {eta ? `${route.durationIsEstimate ? '≈ ' : ''}${eta}` : '—'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.metricsPending}>{t('map.calculatingRoute', 'Finding route…')}</Text>
      )}

      {route && !routing && (footnote || route.durationIsEstimate) && (
        <Text style={styles.metricsFootnote}>
          {[footnote, route.durationIsEstimate ? t('map.etaEstimated', 'Time estimated from average speed.') : null]
            .filter(Boolean)
            .join(' ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(13, 17, 23, 0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    padding: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  fieldsWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldsCol: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  fieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(139, 148, 158, 0.35)', marginLeft: 22 },
  fieldInput: { flex: 1, fontSize: 13, fontWeight: '600', color: C.white, padding: 0 },
  fieldInputCurrent: { color: '#58A6FF' },
  swapBtn: {
    width: 36,
    height: MIN_TOUCH_TARGET,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  hintText: { fontSize: 11, color: '#F59E0B', paddingHorizontal: 4 },
  results: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.8)',
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(48, 54, 61, 0.8)',
  },
  resultName: { fontSize: 12.5, fontWeight: '700', color: C.white },
  resultDetail: { fontSize: 11, color: '#8B949E', marginTop: 1 },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeText: { fontSize: 11.5, fontWeight: '700' },

  metricsCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 15,
    backgroundColor: 'rgba(13, 17, 23, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.5)',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  metricsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricsModeBadge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricsTitle: { fontSize: 14, fontWeight: '800', color: C.white },
  metricsSub: { fontSize: 11.5, color: '#8B949E', marginTop: 1 },
  metricsRow: { flexDirection: 'row', alignItems: 'center' },
  metricItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricDivider: { width: 1, height: 28, backgroundColor: 'rgba(48, 54, 61, 0.8)', marginHorizontal: 10 },
  metricLabel: { fontSize: 10.5, color: '#8B949E', fontWeight: '600' },
  metricVal: { fontSize: 16, color: C.white, fontWeight: '800', marginTop: 1 },
  metricsPending: { fontSize: 12, color: '#8B949E' },
  metricsFootnote: { fontSize: 10.5, color: '#8B949E', lineHeight: 14 },
});
