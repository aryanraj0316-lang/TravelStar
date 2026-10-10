// Route geometry, distance and ETA for the map screen.
//
// Provider order per mode:
//   car / bike — Google Directions (when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is
//                set) → OSRM on the FOSSGIS OpenStreetMap routing servers →
//                straight line.
//   train      — Google Directions transit/rail (key required) → a smooth,
//                dashed approximate curve.
//   flight     — always a great-circle arc; there is no road to route.
//
// `resolveRoute` never throws and never hangs: every network call is capped
// by a timeout, and any failure (no key, HTTP error, ZERO_RESULTS, a
// malformed body) falls through to the next provider and finally to local
// geometry. The result says where it came from, so the UI can label an
// approximate line or an estimated ETA as such instead of passing it off
// as routed data.
//
// Billing: successful results are cached in memory per (mode, origin,
// destination), and identical concurrent requests share one fetch. The
// map screen additionally debounces every input that can trigger a lookup.
import {
  downsample,
  decodePolyline,
  estimateDurationMinutes,
  greatCircleArc,
  haversineKm,
  isValidLatLng,
  pathLengthKm,
  smoothCurve,
  type LatLng,
  type RouteTravelMode,
} from '@/lib/map-geometry';
import { logger } from '@/lib/logger';

export type RouteSource = 'google' | 'osrm' | 'geodesic' | 'curve' | 'straight';

export type ResolvedRoute = {
  mode: RouteTravelMode;
  coords: LatLng[];
  distanceKm: number;
  /** Minutes, or null when nothing trustworthy can be said about time. */
  durationMinutes: number | null;
  /** True when the duration is an average-speed estimate, not a routed time. */
  durationIsEstimate: boolean;
  /** True when the line is not a real routed path (curve / straight fallback). */
  isApproximate: boolean;
  source: RouteSource;
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_POINTS = 4000;
const CACHE_LIMIT = 60;

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';

// OSRM's public demo server only serves cars; the FOSSGIS instances serve
// both profiles behind the same OSRM API (the path segment after /v1/ is
// ignored by them, so it stays `driving`).
const OSRM_BASE: Partial<Record<RouteTravelMode, string>> = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
};

const cache = new Map<string, ResolvedRoute>();
const inFlight = new Map<string, Promise<ResolvedRoute>>();

const keyOf = (mode: RouteTravelMode, a: LatLng, b: LatLng) =>
  `${mode}|${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}|${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}`;

function remember(key: string, route: ResolvedRoute) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, route);
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

type GoogleDirections = {
  status?: string;
  routes?: {
    overview_polyline?: { points?: string };
    legs?: { distance?: { value?: number }; duration?: { value?: number } }[];
  }[];
};

const GOOGLE_MODE: Record<Exclude<RouteTravelMode, 'flight'>, string> = {
  car: 'mode=driving',
  bike: 'mode=bicycling',
  train: 'mode=transit&transit_mode=rail',
};

async function fromGoogle(
  mode: Exclude<RouteTravelMode, 'flight'>,
  a: LatLng,
  b: LatLng,
): Promise<ResolvedRoute | null> {
  if (!GOOGLE_KEY) return null;
  const url =
    'https://maps.googleapis.com/maps/api/directions/json' +
    `?origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}` +
    `&${GOOGLE_MODE[mode]}&key=${encodeURIComponent(GOOGLE_KEY)}`;
  const body = (await fetchJson(url)) as GoogleDirections;
  const route = body?.status === 'OK' ? body.routes?.[0] : undefined;
  const encoded = route?.overview_polyline?.points;
  if (!route || !encoded) return null;
  const coords = decodePolyline(encoded);
  if (coords.length < 2) return null;
  const legs = route.legs ?? [];
  const meters = legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0);
  const seconds = legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0);
  return {
    mode,
    coords: downsample(coords, MAX_POINTS),
    distanceKm: meters > 0 ? meters / 1000 : pathLengthKm(coords),
    durationMinutes: seconds > 0 ? seconds / 60 : null,
    durationIsEstimate: false,
    isApproximate: false,
    source: 'google',
  };
}

type OsrmResponse = {
  code?: string;
  routes?: { geometry?: string; distance?: number; duration?: number }[];
};

async function fromOsrm(
  mode: RouteTravelMode,
  a: LatLng,
  b: LatLng,
): Promise<ResolvedRoute | null> {
  const base = OSRM_BASE[mode];
  if (!base) return null;
  const url =
    `${base}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
    '?overview=full&geometries=polyline&alternatives=false&steps=false';
  const body = (await fetchJson(url)) as OsrmResponse;
  const route = body?.code === 'Ok' ? body.routes?.[0] : undefined;
  if (!route?.geometry) return null;
  const coords = decodePolyline(route.geometry);
  if (coords.length < 2) return null;
  return {
    mode,
    coords: downsample(coords, MAX_POINTS),
    distanceKm: route.distance && route.distance > 0 ? route.distance / 1000 : pathLengthKm(coords),
    durationMinutes: route.duration && route.duration > 0 ? route.duration / 60 : null,
    durationIsEstimate: false,
    isApproximate: false,
    source: 'osrm',
  };
}

/** Local geometry for when no routing service answered. Never fails. */
export function fallbackRoute(mode: RouteTravelMode, a: LatLng, b: LatLng): ResolvedRoute {
  if (mode === 'flight') {
    const coords = greatCircleArc(a, b);
    const distanceKm = haversineKm(a, b);
    return {
      mode,
      coords,
      distanceKm,
      durationMinutes: estimateDurationMinutes('flight', distanceKm),
      durationIsEstimate: true,
      // A great-circle arc IS the flight path, not a stand-in for one.
      isApproximate: false,
      source: 'geodesic',
    };
  }
  if (mode === 'train') {
    const coords = smoothCurve(a, b);
    const distanceKm = pathLengthKm(coords);
    return {
      mode,
      coords,
      distanceKm,
      durationMinutes: estimateDurationMinutes('train', distanceKm),
      durationIsEstimate: true,
      isApproximate: true,
      source: 'curve',
    };
  }
  return {
    mode,
    coords: [a, b],
    distanceKm: haversineKm(a, b),
    durationMinutes: null,
    durationIsEstimate: false,
    isApproximate: true,
    source: 'straight',
  };
}

async function resolveUncached(mode: RouteTravelMode, a: LatLng, b: LatLng): Promise<ResolvedRoute> {
  if (mode === 'flight') return fallbackRoute(mode, a, b);

  const providers = [() => fromGoogle(mode, a, b), () => fromOsrm(mode, a, b)];
  for (const provider of providers) {
    try {
      const route = await provider();
      if (route) return route;
    } catch (e) {
      // Expected on timeouts, offline use and unsupported regions — the
      // next provider or the local fallback takes over.
      logger.warn(`[MapRouting] ${mode} provider failed:`, e);
    }
  }
  return fallbackRoute(mode, a, b);
}

/**
 * Best available route between two points for a travel mode. Resolves to
 * local fallback geometry on any failure; never rejects. There is no abort
 * parameter on purpose: identical requests share one in-flight fetch, so
 * one caller giving up must not cancel it for the others — a caller that
 * no longer wants the answer simply ignores it (each fetch is still capped
 * by REQUEST_TIMEOUT_MS).
 */
export function resolveRoute(
  mode: RouteTravelMode,
  origin: LatLng,
  destination: LatLng,
): Promise<ResolvedRoute> {
  if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
    return Promise.resolve({
      mode,
      coords: [],
      distanceKm: 0,
      durationMinutes: null,
      durationIsEstimate: false,
      isApproximate: true,
      source: 'straight',
    });
  }
  const key = keyOf(mode, origin, destination);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = resolveUncached(mode, origin, destination)
    .then((route) => {
      // Only routed answers are cached: a fallback produced by a timeout
      // or a blip should be retried next time, not pinned for the session.
      if (route.source === 'google' || route.source === 'osrm' || route.source === 'geodesic') {
        remember(key, route);
      }
      return route;
    })
    .catch(() => fallbackRoute(mode, origin, destination))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export type PlaceResult = {
  id: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
};

/**
 * Geocodes free text with OpenStreetMap Nominatim — the same lookup the
 * map's place search and the create screen already use. Callers must
 * debounce: Nominatim's usage policy forbids a request per keystroke.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const rows = (await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
    signal,
    { 'User-Agent': 'YatrenzoApp/1.0' },
  )) as { place_id: number; display_name: string; lat: string; lon: string; name?: string }[];
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const latitude = parseFloat(r.lat);
      const longitude = parseFloat(r.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const parts = String(r.display_name ?? '').split(',').map((x) => x.trim());
      return {
        id: `osm-${r.place_id}`,
        name: r.name || parts[0] || r.display_name,
        detail: parts.slice(1).join(', '),
        latitude,
        longitude,
      };
    })
    .filter((x): x is PlaceResult => x !== null);
}
