// Pure geometry for the map's route polylines: decoding routing-service
// polylines, great-circle arcs for flights, and the smooth fallback curve
// used for rail legs when no track data is available.
//
// Nothing here touches the network or React, so the whole file is unit
// tested in isolation (map-geometry.test.ts). The routing service
// (src/services/map-routing.ts) decides *which* geometry a leg gets; this
// file only computes it.
import type { TransitMode } from '@/services/api';

export type LatLng = { latitude: number; longitude: number };

/** The four travel modes the map can draw. Trip transit modes map onto these. */
export type RouteTravelMode = 'car' | 'bike' | 'train' | 'flight';

export const ROUTE_TRAVEL_MODES: readonly RouteTravelMode[] = ['car', 'bike', 'train', 'flight'];

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function isValidLatLng(p: LatLng | null | undefined): p is LatLng {
  return (
    !!p &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

/** Great-circle distance in kilometres (unrounded). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Summed length of a polyline in kilometres. */
export function pathLengthKm(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += haversineKm(coords[i - 1], coords[i]);
  return total;
}

/**
 * Decodes a Google-format encoded polyline (also what OSRM returns with
 * `geometries=polyline`). `precision` is 5 for both of those; polyline6
 * sources pass 6. Malformed input yields whatever decoded cleanly before
 * the bad byte rather than throwing, so a corrupt response degrades to the
 * caller's fallback instead of crashing the map.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = readValue();
    const dLng = readValue();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    coords.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return coords;
}

/**
 * Points along the great-circle path between two coordinates (spherical
 * linear interpolation), which is what a flight actually follows. On the
 * Web-Mercator map it renders as the familiar curved flight arc.
 */
export function greatCircleArc(a: LatLng, b: LatLng, segments = 64): LatLng[] {
  const lat1 = toRad(a.latitude);
  const lon1 = toRad(a.longitude);
  const lat2 = toRad(b.latitude);
  const lon2 = toRad(b.longitude);
  const d = haversineKm(a, b) / EARTH_RADIUS_KM;
  if (d < 1e-9) return [a, b];

  const sinD = Math.sin(d);
  const points: LatLng[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push({
      latitude: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      longitude: toDeg(Math.atan2(y, x)),
    });
  }
  return points;
}

/**
 * A gentle quadratic-Bézier curve between two points, bowed sideways by
 * `bulge` × the span. Used for rail legs when no track geometry is
 * available: it reads as "a line on the ground, path approximate" rather
 * than a ruler-straight line, and the map draws it dashed so it is never
 * mistaken for a surveyed track.
 */
export function smoothCurve(a: LatLng, b: LatLng, bulge = 0.08, segments = 48): LatLng[] {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [a, b];
  // Control point: the midpoint pushed along the perpendicular.
  const cx = (a.longitude + b.longitude) / 2 - dy * bulge;
  const cy = (a.latitude + b.latitude) / 2 + dx * bulge;
  const points: LatLng[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      latitude: u * u * a.latitude + 2 * u * t * cy + t * t * b.latitude,
      longitude: u * u * a.longitude + 2 * u * t * cx + t * t * b.longitude,
    });
  }
  return points;
}

/**
 * Evenly thins a long polyline to at most `maxPoints`, always keeping the
 * first and last point. A cross-country road route can decode to tens of
 * thousands of points, which costs real time to serialise into the
 * WebView for no visible gain.
 */
export function downsample(coords: LatLng[], maxPoints = 4000): LatLng[] {
  if (coords.length <= maxPoints || maxPoints < 2) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < maxPoints - 1; i += 1) out.push(coords[Math.round(i * step)]);
  out.push(coords[coords.length - 1]);
  return out;
}

/** How a trip leg's organizer-chosen transit mode is drawn. */
export function travelModeForTransit(mode: TransitMode | null | undefined): RouteTravelMode {
  switch (mode) {
    case 'TRAIN':
      return 'train';
    case 'FLIGHT':
      return 'flight';
    // Cabs and buses both travel by road; a leg with no recorded mode is
    // drawn as road too, the overwhelmingly common case for these trips.
    default:
      return 'car';
  }
}

/** Stroke styling per mode, shared by trip legs and the direct-search route. */
export const ROUTE_STYLES: Record<
  RouteTravelMode,
  { color: string; weightScale: number; dashArray: string | null }
> = {
  car: { color: '#8B5CF6', weightScale: 1, dashArray: null },
  bike: { color: '#10B981', weightScale: 0.9, dashArray: null },
  train: { color: '#F59E0B', weightScale: 1, dashArray: '10 8' },
  flight: { color: '#38BDF8', weightScale: 0.85, dashArray: '2 9' },
};

// Average door-to-door speeds used ONLY when no routing service supplied a
// duration — every such figure is flagged `durationIsEstimate` and the UI
// prefixes it with "≈". Car and bike have no entry on purpose: without a
// road route their straight-line distance says nothing reliable about time,
// so no ETA is shown rather than a made-up one.
const ESTIMATE = {
  train: { kmh: 55, overheadMin: 0 },
  // Cruise speed plus a fixed allowance for taxi, climb and descent.
  flight: { kmh: 750, overheadMin: 30 },
} as const;

export function estimateDurationMinutes(mode: RouteTravelMode, distanceKm: number): number | null {
  if (mode !== 'train' && mode !== 'flight') return null;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  const { kmh, overheadMin } = ESTIMATE[mode];
  return Math.round((distanceKm / kmh) * 60 + overheadMin);
}

/** "124 km" / "850 m" / "1,240 km". */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '—';
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

/** "2 hr 45 min" / "45 min" / "3 hr". */
export function formatEta(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.max(1, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
