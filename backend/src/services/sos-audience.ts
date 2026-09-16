import prisma from './db';
import { haversineKm } from '../lib/india-city-coords';
import { boundingBox } from '../lib/trip-coordinates';
import { logger } from '../lib/logger';

/**
 * Who sees a given user's SOS alert.
 *
 * The audience is: the people travelling with them right now (fellow trip
 * members and the organizer), any guide the organizer assigned to a
 * checkpoint on those trips, their emergency contacts who are app users,
 * and admins.
 *
 * Two notes on what this can and cannot resolve:
 *
 *  - Assigned guides ARE resolvable now. This file used to state that Trip
 *    had no assigned-guide field (only a `guideIncluded` boolean) so the
 *    guide could not be found at all; TripTimelineStopGuide now links
 *    guides to a trip's checkpoints, so they are included.
 *  - EmergencyContact still has no relation to a User row, only a free-text
 *    name and phone number, so "is this contact an app user" remains a
 *    best-effort match on phoneNumber. A number stored in another format
 *    (spacing, +91 prefix) is missed. That is a schema gap, not something
 *    to guess at — notifying the wrong person on a safety feature is worse
 *    than a narrower audience.
 *
 * "Active trip" is any trip the user is on that has not ended yet, rather
 * than a strict start-date window: a group travelling together the day
 * before the official start date is still exactly who should be told.
 */

export interface SosAudience {
  /** Everyone to notify, including the alerting user. */
  userIds: string[];
  /** Trips the alert is relevant to, for posting into their group chats. */
  tripIds: string[];
  /** Those trips' chat rooms, where the alert is persisted as a message. */
  chatRooms: { chatRoomId: string; tripId: string; tripName: string }[];
  /** What the alerting user's own setting resolved to, for the response. */
  reach: { mode: 'TRIP_GROUP' | 'NEARBY'; radiusKm: number; nearbyCount: number };
}

/**
 * A position older than this is not where the person is now, so it cannot
 * be used to decide who is "nearby". Same window the live map uses to stop
 * drawing stale pins (routes/map.ts).
 */
const LIVE_POSITION_MAX_AGE_MS = 30 * 60 * 1000;

/** No setting may broadcast someone's location further than this. */
export const MAX_SOS_RADIUS_KM = 50;

/**
 * Other app users close enough to physically help, when the alerting user
 * has opted into that reach.
 *
 * Three deliberate limits, all of them safety/privacy rather than
 * performance:
 *  - Only users with `locationSharing` on are considered. Someone who
 *    switched location sharing off has not agreed to be found this way.
 *  - Only positions fresher than LIVE_POSITION_MAX_AGE_MS count. A
 *    three-hour-old fix would summon someone who left long ago, and would
 *    reveal an alert to them for no benefit.
 *  - The radius is capped, so a mis-set preference cannot page a whole
 *    region.
 */
async function findNearbyUserIds(
  origin: { lat: number; lng: number },
  radiusKm: number,
  excludeUserId: string,
): Promise<string[]> {
  const bounded = Math.min(Math.max(radiusKm, 1), MAX_SOS_RADIUS_KM);
  const box = boundingBox(origin, bounded);
  const freshAfter = new Date(Date.now() - LIVE_POSITION_MAX_AGE_MS);

  // Bounding box in SQL (indexable, no PostGIS), exact circle in JS — a box
  // alone would reach ~27% further at its corners than the radius promises.
  const candidates = await prisma.liveLocation.findMany({
    where: {
      updatedAt: { gte: freshAfter },
      userId: { not: excludeUserId },
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
      user: { profile: { locationSharing: true } },
    },
    select: { userId: true, latitude: true, longitude: true },
  });

  return candidates
    .filter((c) => haversineKm(origin, { lat: c.latitude, lng: c.longitude }) <= bounded)
    .map((c) => c.userId);
}

export async function resolveSosAudience(
  alertingUserId: string,
  /**
   * Where the alert was raised. Required for the NEARBY reach — without a
   * position there is no circle to search, and the audience quietly falls
   * back to the trip group rather than guessing at a location.
   */
  origin?: { lat: number; lng: number } | null,
): Promise<SosAudience> {
  const audience = new Set<string>();
  audience.add(alertingUserId);

  const now = new Date();

  const [alertingProfile, emergencyContacts, tripMemberships, organizedTrips, admins] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: alertingUserId },
      select: { sosAudienceMode: true, sosRadiusKm: true },
    }),
    prisma.emergencyContact.findMany({
      where: { userId: alertingUserId },
      select: { phoneNumber: true },
    }),
    prisma.tripMember.findMany({
      where: { userId: alertingUserId, trip: { endDate: { gte: now }, status: { not: 'CANCELLED' } } },
      select: { tripId: true },
    }),
    // Someone leading a trip has no TripMember row of their own, so their
    // own alert would otherwise reach nobody on the trip they organize.
    prisma.trip.findMany({
      where: { creatorId: alertingUserId, endDate: { gte: now }, status: { not: 'CANCELLED' } },
      select: { id: true },
    }),
    prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
  ]);

  admins.forEach((a) => audience.add(a.id));

  const contactPhones = emergencyContacts.map((c) => c.phoneNumber).filter(Boolean);
  if (contactPhones.length > 0) {
    const matchedUsers = await prisma.user.findMany({
      where: { phoneNumber: { in: contactPhones } },
      select: { id: true },
    });
    matchedUsers.forEach((u) => audience.add(u.id));
  }

  const tripIds = [...new Set([...tripMemberships.map((m) => m.tripId), ...organizedTrips.map((t) => t.id)])];

  const chatRooms: SosAudience['chatRooms'] = [];

  if (tripIds.length > 0) {
    const [fellowMembers, trips, checkpointGuides] = await Promise.all([
      prisma.tripMember.findMany({ where: { tripId: { in: tripIds } }, select: { userId: true } }),
      prisma.trip.findMany({
        where: { id: { in: tripIds } },
        select: { id: true, name: true, creatorId: true, chatRoom: { select: { id: true } } },
      }),
      prisma.tripTimelineStopGuide.findMany({
        where: { tripTimelineStop: { tripId: { in: tripIds } } },
        select: { guideProfile: { select: { userId: true } } },
      }),
    ]);

    fellowMembers.forEach((m) => audience.add(m.userId));
    checkpointGuides.forEach((g) => audience.add(g.guideProfile.userId));
    trips.forEach((t) => {
      audience.add(t.creatorId);
      if (t.chatRoom) chatRooms.push({ chatRoomId: t.chatRoom.id, tripId: t.id, tripName: t.name });
    });
  }

  // The trip group above is never traded away for the nearby circle — an
  // SOS that reaches strangers but not the people you are actually
  // travelling with would be a worse alert, not a wider one. NEARBY adds
  // to that audience.
  const mode = alertingProfile?.sosAudienceMode ?? 'TRIP_GROUP';
  const radiusKm = Math.min(Math.max(alertingProfile?.sosRadiusKm ?? 5, 1), MAX_SOS_RADIUS_KM);
  let nearbyCount = 0;

  if (mode === 'NEARBY' && origin) {
    try {
      const nearbyIds = await findNearbyUserIds(origin, radiusKm, alertingUserId);
      // Counted before the Set merge so it reports people this reach
      // genuinely added, not ones already in the trip group.
      nearbyCount = nearbyIds.filter((id) => !audience.has(id)).length;
      nearbyIds.forEach((id) => audience.add(id));
    } catch (err) {
      // A failed proximity lookup must never swallow the alert itself —
      // the trip group is already resolved and is the audience that
      // matters most.
      logger.error('[SOS] Nearby audience lookup failed; falling back to the trip group:', err);
    }
  }

  return {
    userIds: [...audience],
    tripIds,
    chatRooms,
    reach: { mode, radiusKm, nearbyCount },
  };
}

/** Back-compatible shape for callers that only need the user ids. */
export async function getSosAudienceUserIds(
  alertingUserId: string,
  origin?: { lat: number; lng: number } | null,
): Promise<string[]> {
  const { userIds } = await resolveSosAudience(alertingUserId, origin);
  return userIds;
}
