import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { coordsForCity } from '../../lib/india-city-coords';

const router = Router();

/**
 * Real map data (docs/REMEDIATION.md §8.8).
 *
 * map.tsx and map.web.tsx each rendered the same four hardcoded pins — a
 * guide called "Rajesh Kumar", a "Ranchi-Vrindavan Group", a solo tourist
 * "Neha Mehta", and Prem Mandir — at fixed coordinates, for every user,
 * forever, alongside a hardcoded Mathura→Vrindavan route. None of it came
 * from the database. The `MapPin` model existed with no route behind it.
 *
 * Honest v1, on the same terms as §8.13's nearby-trips: this project has
 * no geocoding credentials and Trip rows have no coordinates of their own,
 * so positions are resolved from the static India city table. Anything
 * whose city is not in that table is omitted rather than guessed at — a
 * pin in the wrong place is worse than no pin, especially for the live
 * people ones.
 */

// A live position older than this is stale — the user closed the app or
// stopped sharing. Showing it would put a person somewhere they are not.
const LIVE_POSITION_MAX_AGE_MS = 30 * 60 * 1000;

export type MapPinType = 'GUIDE' | 'GROUP' | 'TOURIST' | 'ATTRACTION';

interface MapPinDto {
  id: string;
  type: MapPinType;
  name: string;
  latitude: number;
  longitude: number;
  detail: string;
  /** The trip a GROUP pin belongs to, so tapping it can open that trip. */
  tripId?: string;
}

function displayName(user: {
  email: string | null;
  profile: { firstName: string; lastName: string } | null;
}): string {
  return user.profile
    ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
    : (user.email?.split('@')[0] ?? 'Traveler');
}

/**
 * Every pin the map should show, from real rows.
 *
 * Live people (GUIDE/TOURIST) appear only with a fresh LiveLocation *and*
 * `locationSharing` on their profile — the same consent gate the socket
 * layer applies to emission (§3.4). The caller is never included: they
 * already have their own GPS marker.
 */
router.get('/pins', async (req, res) => {
  const callerId = requireUserId(req);
  try {
    const freshAfter = new Date(Date.now() - LIVE_POSITION_MAX_AGE_MS);

    const [liveLocations, trips, destinations] = await Promise.all([
      prisma.liveLocation.findMany({
        where: { updatedAt: { gte: freshAfter }, userId: { not: callerId } },
        orderBy: { updatedAt: 'desc' },
        include: { user: { include: { profile: true, guideProfile: true } } },
      }),
      prisma.trip.findMany({
        where: { status: 'ACTIVE', privacy: 'PUBLIC', endDate: { gte: new Date() } },
        orderBy: { startDate: 'asc' },
        take: 100,
        select: {
          id: true,
          name: true,
          cities: true,
          meetingPoint: true,
          availableSeats: true,
          totalSeats: true,
          startDate: true,
        },
      }),
      prisma.destination.findMany({ select: { id: true, name: true, tags: true } }),
    ]);

    const pins: MapPinDto[] = [];

    // One pin per user, newest position wins (the query is already ordered,
    // so the first row for a user is their current one).
    const seenUsers = new Set<string>();
    for (const loc of liveLocations) {
      if (seenUsers.has(loc.userId)) continue;
      seenUsers.add(loc.userId);
      if (loc.user.profile?.locationSharing === false) continue;

      const isGuide = loc.user.role === 'GUIDE' && loc.user.guideProfile !== null;
      pins.push({
        id: `user-${loc.userId}`,
        type: isGuide ? 'GUIDE' : 'TOURIST',
        name: displayName(loc.user),
        latitude: loc.latitude,
        longitude: loc.longitude,
        detail: isGuide
          ? `Guide · ${loc.user.guideProfile?.experienceYears ?? 0} yrs experience`
          : 'Traveller sharing their location',
      });
    }

    // A trip sits at its meeting point when that resolves, otherwise at its
    // first city. Trips whose location resolves to neither are left off the
    // map rather than dropped at an arbitrary default.
    for (const trip of trips) {
      const coords = coordsForCity(trip.meetingPoint) ?? coordsForCity(trip.cities[0]);
      if (!coords) continue;
      pins.push({
        id: `trip-${trip.id}`,
        type: 'GROUP',
        name: trip.name,
        latitude: coords.lat,
        longitude: coords.lng,
        detail:
          trip.availableSeats > 0
            ? `${trip.availableSeats} of ${trip.totalSeats} seats left · departs ${trip.startDate.toISOString().slice(0, 10)}`
            : `Full · departs ${trip.startDate.toISOString().slice(0, 10)}`,
        tripId: trip.id,
      });
    }

    // Destinations are the app's only real place data, and they carry no
    // coordinates — only the ones whose name is a city we have real coords
    // for can be placed.
    for (const destination of destinations) {
      const coords = coordsForCity(destination.name);
      if (!coords) continue;
      pins.push({
        id: `destination-${destination.id}`,
        type: 'ATTRACTION',
        name: destination.name,
        latitude: coords.lat,
        longitude: coords.lng,
        detail: destination.tags,
      });
    }

    return res.status(200).json({ ok: true, data: pins });
  } catch (err) {
    logger.error('[Map] Pins error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load map data' } });
  }
});

/**
 * Active hazard alerts placed on the map. `Alert.location` is a free-text
 * city name, so an alert whose location we cannot resolve is returned with
 * null coordinates rather than dropped — the alerts list still needs it,
 * and the map simply skips the ones it cannot place.
 */
router.get('/hazards', async (_req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, title: true, severity: true, category: true, location: true, affectedRoute: true },
    });

    return res.status(200).json({
      ok: true,
      data: alerts.map((a) => {
        const coords = coordsForCity(a.location);
        return {
          id: a.id,
          title: a.title,
          severity: a.severity,
          category: a.category,
          location: a.location,
          affectedRoute: a.affectedRoute,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        };
      }),
    });
  } catch (err) {
    logger.error('[Map] Hazards error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load hazard alerts' } });
  }
});

const tripIdParamSchema = z.object({ tripId: z.string().uuid() });

/**
 * A trip's route as an ordered list of points, derived from its `cities`
 * array. This is a straight-line join between city centres, not a driving
 * route: there is no routing-service credential in this project, and the
 * response says so in `approximate` so the UI can label it honestly rather
 * than implying a real road path.
 */
router.get('/trips/:tripId/route', async (req, res) => {
  const parsed = tripIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid trip id.' } });
  }
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: parsed.data.tripId },
      select: {
        id: true,
        name: true,
        cities: true,
        meetingPoint: true,
        startDate: true,
        timeline: { orderBy: { order: 'asc' } },
      },
    });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }

    // Prefer the organizer's own timeline when the trip has one: it carries
    // the stay length, transit leg and planned activities for each stop,
    // and its own stored coordinates. Fall back to the plain `cities` array
    // for trips created before the Timeline tab was wired to the backend.
    const orderedStops =
      trip.timeline.length > 0
        ? trip.timeline.map((s) => ({
            city: s.city,
            stayDays: s.stayDays,
            transitTimeMinutes: s.transitTimeMinutes,
            transitMode: s.transitMode,
            activities: s.activities,
            // A stop stored without coordinates still gets one last chance
            // from the city lookup — but never an invented one.
            coords:
              s.latitude !== null && s.longitude !== null
                ? { lat: s.latitude, lng: s.longitude }
                : coordsForCity(s.city),
          }))
        : trip.cities.map((city) => ({
            city,
            stayDays: null,
            transitTimeMinutes: null,
            transitMode: null,
            activities: '',
            coords: coordsForCity(city),
          }));

    // Day 1 of the trip is the arrival day at the first stop; each stop's
    // stay pushes the next one out. Computed here so every client shows the
    // same dates rather than each re-deriving them.
    let dayCursor = 1;
    const points = orderedStops
      .map((stop) => {
        const arrivalDay = dayCursor;
        const stay = stop.stayDays ?? 0;
        dayCursor += stay;
        return { ...stop, arrivalDay, departureDay: arrivalDay + Math.max(0, stay - 1) };
      })
      .filter((p) => p.coords !== null)
      .map((p, index) => ({
        name: p.city,
        latitude: p.coords!.lat,
        longitude: p.coords!.lng,
        order: index,
        stayDays: p.stayDays,
        arrivalDay: p.stayDays === null ? null : p.arrivalDay,
        departureDay: p.stayDays === null ? null : p.departureDay,
        transitTimeMinutes: p.transitTimeMinutes,
        transitMode: p.transitMode,
        activities: p.activities,
      }));

    return res.status(200).json({
      ok: true,
      data: {
        tripId: trip.id,
        name: trip.name,
        meetingPoint: trip.meetingPoint,
        startDate: trip.startDate.toISOString().split('T')[0],
        // True whenever we plotted anything: these are straight lines
        // between city centres, never a real road route.
        approximate: points.length > 0,
        // Whether the stops carry the organizer's real timeline detail, so
        // the client shows stay/transit chips only when they mean something.
        hasTimeline: trip.timeline.length > 0,
        // How many of the trip's cities we could not place, so the client
        // can say "3 of 5 stops shown" instead of quietly drawing a
        // shorter route than the trip really has.
        unplacedCities: orderedStops.length - points.length,
        points,
      },
    });
  } catch (err) {
    logger.error('[Map] Trip route error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load the trip route' } });
  }
});

export default router;
