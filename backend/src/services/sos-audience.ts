import prisma from './db';

/**
 * Who is allowed to see a given user's SOS alert.
 *
 * docs/REMEDIATION.md §3.4 asks for: the alerting user's registered
 * emergency contacts who are app users, the members of their active trip,
 * their assigned guide, and admins/responders.
 *
 * Two of those are not fully answerable with the current schema:
 *  - EmergencyContact has no link to a User row, only a free-text name and
 *    phone number, so "is this contact an app user" is a best-effort match
 *    on phoneNumber, not a real relation. A contact stored in a different
 *    format (e.g. spacing, +91 prefix) will be missed.
 *  - Trip has no assigned-guide field (only a `guideIncluded` boolean), so
 *    there is no reliable way to resolve "their assigned guide" at all.
 * Both are schema gaps for Phase 4, not something to fabricate a guess for
 * here — notifying the wrong person on a safety feature is worse than a
 * narrower audience.
 *
 * "Active trip" is approximated as any trip the user is a TripMember of that
 * hasn't ended yet, rather than a strict date-window check, since a group
 * traveling together the day before a trip's start date is still the
 * relevant audience for a safety alert.
 */
export async function getSosAudienceUserIds(alertingUserId: string): Promise<string[]> {
  const audience = new Set<string>();
  audience.add(alertingUserId);

  const [emergencyContacts, tripMemberships, admins] = await Promise.all([
    prisma.emergencyContact.findMany({
      where: { userId: alertingUserId },
      select: { phoneNumber: true },
    }),
    prisma.tripMember.findMany({
      where: { userId: alertingUserId, trip: { endDate: { gte: new Date() } } },
      select: { tripId: true },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    }),
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

  const tripIds = tripMemberships.map((m) => m.tripId);
  if (tripIds.length > 0) {
    const fellowMembers = await prisma.tripMember.findMany({
      where: { tripId: { in: tripIds } },
      select: { userId: true },
    });
    fellowMembers.forEach((m) => audience.add(m.userId));

    const trips = await prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: { creatorId: true },
    });
    trips.forEach((t) => audience.add(t.creatorId));
  }

  return Array.from(audience);
}
