import { coordsForCity } from './india-city-coords';

/**
 * Resolving a trip's representative position.
 *
 * A trip has no single location — it is a route through several cities. For
 * "trips near me" the useful answer is the point a traveller would actually
 * start from, so this prefers, in order:
 *
 *   1. the first timeline stop the organizer geocoded on the create screen
 *      (real coordinates, entered for that specific place),
 *   2. the static India city table, for a route whose stops carry no
 *      coordinates (older trips, or cities the client could not geocode),
 *
 * and returns null when neither can place the route. Null is deliberate: a
 * trip that cannot be located is left out of radius results rather than
 * pinned to an invented point (docs/REMEDIATION.md §0.2 rule 4).
 *
 * This exists so creation and the nearby query cannot disagree about where
 * a trip is — the route used to re-derive a position from city *names* on
 * every request, which silently dropped any trip whose city was missing
 * from that table.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

interface StopLike {
  city: string;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
}

export function resolveTripCoordinates(
  cities: string[],
  stops: StopLike[] | undefined | null,
): LatLng | null {
  for (const stop of stops ?? []) {
    if (stop.latitude !== null && stop.latitude !== undefined && stop.longitude !== null && stop.longitude !== undefined) {
      return { lat: stop.latitude, lng: stop.longitude };
    }
  }

  for (const stop of stops ?? []) {
    const fromStopCity = coordsForCity(stop.city);
    if (fromStopCity) return { lat: fromStopCity.lat, lng: fromStopCity.lng };
  }

  for (const city of cities) {
    const fromCity = coordsForCity(city);
    if (fromCity) return { lat: fromCity.lat, lng: fromCity.lng };
  }

  return null;
}

/** Kilometres per degree of latitude. Constant everywhere on the globe. */
const KM_PER_DEG_LAT = 110.574;

/**
 * A latitude/longitude box that fully contains `radiusKm` around `origin`,
 * used as a cheap indexed prefilter before the exact haversine pass. It is
 * deliberately generous — a box always contains its inscribed circle, so
 * this can return extra candidates but never misses a real one.
 *
 * Longitude degrees shrink toward the poles, hence the cos(lat) term; it is
 * clamped so a near-polar origin cannot divide by ~0 and produce an
 * infinite span. India sits far from either pole, so this is a guard rather
 * than a case that arises in practice.
 */
export function boundingBox(origin: LatLng, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.max(0.01, Math.cos((origin.lat * Math.PI) / 180));
  const lngDelta = radiusKm / (KM_PER_DEG_LAT * cosLat);

  return {
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };
}
