import prisma from './db';

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
}

export async function resolveSosAudience(alertingUserId: string): Promise<SosAudience> {
  const audience = new Set<string>();
  audience.add(alertingUserId);

  const now = new Date();

  const [emergencyContacts, tripMemberships, organizedTrips, admins] = await Promise.all([
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

  return { userIds: [...audience], tripIds, chatRooms };
}

/** Back-compatible shape for callers that only need the user ids. */
export async function getSosAudienceUserIds(alertingUserId: string): Promise<string[]> {
  const { userIds } = await resolveSosAudience(alertingUserId);
  return userIds;
}
