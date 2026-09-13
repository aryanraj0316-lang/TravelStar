import prisma from './db';
import { coordsForCity, haversineKm } from '../lib/india-city-coords';
import { boundingBox, type LatLng } from '../lib/trip-coordinates';

/**
 * Matching a trip's route against the guides who actually work it.
 *
 * Two halves:
 *
 *   1. Waypoint extraction — turn the organizer's itinerary into an ordered
 *      list of placed stops. The organizer's own timeline is preferred
 *      because those coordinates were geocoded for that specific place; the
 *      static city table is the fallback for routes that carry none, and a
 *      stop that can be placed by neither is reported as unplaced rather
 *      than dropped silently, so the caller can say so.
 *
 *   2. Zone matching — a guide covers a stop when that stop falls inside one
 *      of their GuideServiceZone circles. Guides declare those circles
 *      themselves; `expertisePlaces` is free text and cannot answer "does
 *      this guide cover a village 40km outside Jaipur".
 *
 * A guide who covers every placed stop is flagged as covering the whole
 * route, which is what lets the organizer hire one guide for the journey
 * instead of one per checkpoint.
 */

export interface RouteWaypoint {
  /** Null for a trip with no saved timeline — those come from cities[]. */
  stopId: string | null;
  order: number;
  city: string;
  coords: LatLng;
}

export interface ExtractedRoute {
  waypoints: RouteWaypoint[];
  /** Cities on the route that could not be placed, named so the UI can say. */
  unplacedCities: string[];
}

/**
 * The organizer's itinerary as placed waypoints. Falls back to the plain
 * `cities` array for trips created before the Timeline tab existed.
 */
export async function extractRouteWaypoints(tripId: string): Promise<ExtractedRoute | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      cities: true,
      timeline: {
        orderBy: { order: 'asc' },
        select: { id: true, order: true, city: true, latitude: true, longitude: true },
      },
    },
  });
  if (!trip) return null;

  const waypoints: RouteWaypoint[] = [];
  const unplacedCities: string[] = [];

  if (trip.timeline.length > 0) {
    for (const stop of trip.timeline) {
      const coords =
        stop.latitude !== null && stop.longitude !== null
          ? { lat: stop.latitude, lng: stop.longitude }
          : coordsForCity(stop.city);
      if (!coords) {
        unplacedCities.push(stop.city);
        continue;
      }
      waypoints.push({ stopId: stop.id, order: stop.order, city: stop.city, coords: { lat: coords.lat, lng: coords.lng } });
    }
  } else {
    trip.cities.forEach((city, index) => {
      const coords = coordsForCity(city);
      if (!coords) {
        unplacedCities.push(city);
        return;
      }
      waypoints.push({ stopId: null, order: index, city, coords: { lat: coords.lat, lng: coords.lng } });
    });
  }

  return { waypoints, unplacedCities };
}

export interface MatchedZone {
  zoneId: string;
  label: string;
  radiusKm: number;
  /** Distance from the waypoint to this zone's centre. */
  distanceKm: number;
}

export interface GuideRouteMatch {
  guideProfileId: string;
  name: string;
  avatar: string | null;
  verifiedStatus: string;
  rating: number | null;
  reviewCount: number;
  languages: string[];
  dailyRate: string;
  /** Stop ids (or route positions, for timeline-less trips) this guide covers. */
  coveredStopIds: string[];
  coveredOrders: number[];
  /** True when the guide's zones cover every placed waypoint on the route. */
  coversEntireRoute: boolean;
  matchedZones: MatchedZone[];
}

/**
 * The guides whose service zones intersect this route, annotated with which
 * stops each one covers.
 *
 * The database query is bounded by a box around the whole route, widened by
 * the largest radius any zone declares, so the scan stays on the
 * (latitude, longitude) index. The box only ever admits extra candidates —
 * the exact per-waypoint distance check below is what decides coverage.
 */
export async function findGuidesForRoute(waypoints: RouteWaypoint[]): Promise<GuideRouteMatch[]> {
  if (waypoints.length === 0) return [];

  const maxRadius = await prisma.guideServiceZone.aggregate({ _max: { radiusKm: true } });
  const widestZoneKm = maxRadius._max.radiusKm ?? 0;
  if (widestZoneKm === 0) return [];

  const lats = waypoints.map((w) => w.coords.lat);
  const lngs = waypoints.map((w) => w.coords.lng);
  const routeCentre: LatLng = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  // Half the route's own diagonal, plus the widest zone anyone declares:
  // any zone that could touch any waypoint has its centre inside this box.
  const routeSpanKm = haversineKm(
    { lat: Math.min(...lats), lng: Math.min(...lngs) },
    { lat: Math.max(...lats), lng: Math.max(...lngs) },
  );
  const box = boundingBox(routeCentre, routeSpanKm / 2 + widestZoneKm);

  const zones = await prisma.guideServiceZone.findMany({
    where: {
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    },
    include: {
      guide: {
        include: {
          user: { include: { profile: true } },
          _count: { select: { reviews: true } },
        },
      },
    },
  });

  const byGuide = new Map<string, GuideRouteMatch>();

  for (const zone of zones) {
    const zoneCentre = { lat: zone.latitude, lng: zone.longitude };

    for (const waypoint of waypoints) {
      const distanceKm = haversineKm(zoneCentre, waypoint.coords);
      if (distanceKm > zone.radiusKm) continue;

      let match = byGuide.get(zone.guideProfileId);
      if (!match) {
        const profile = zone.guide.user.profile;
        match = {
          guideProfileId: zone.guideProfileId,
          name: profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : 'Guide',
          avatar: profile?.avatarUrl ?? null,
          verifiedStatus: zone.guide.verifiedStatus,
          rating: zone.guide.rating,
          reviewCount: zone.guide._count.reviews,
          languages: zone.guide.languagesSpoken,
          dailyRate: zone.guide.dailyRate.toString(),
          coveredStopIds: [],
          coveredOrders: [],
          coversEntireRoute: false,
          matchedZones: [],
        };
        byGuide.set(zone.guideProfileId, match);
      }

      if (waypoint.stopId && !match.coveredStopIds.includes(waypoint.stopId)) {
        match.coveredStopIds.push(waypoint.stopId);
      }
      if (!match.coveredOrders.includes(waypoint.order)) {
        match.coveredOrders.push(waypoint.order);
      }
      if (!match.matchedZones.some((z) => z.zoneId === zone.id)) {
        match.matchedZones.push({
          zoneId: zone.id,
          label: zone.label,
          radiusKm: zone.radiusKm,
          distanceKm: Math.round(distanceKm),
        });
      }
    }
  }

  const results = [...byGuide.values()];
  for (const match of results) {
    match.coveredOrders.sort((a, b) => a - b);
    match.coversEntireRoute = match.coveredOrders.length === waypoints.length;
  }

  // Widest coverage first, then the better-reviewed guide — an organizer
  // picking one guide for the journey wants the ones who can actually do it
  // at the top.
  return results.sort((a, b) => {
    if (b.coveredOrders.length !== a.coveredOrders.length) {
      return b.coveredOrders.length - a.coveredOrders.length;
    }
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
}
