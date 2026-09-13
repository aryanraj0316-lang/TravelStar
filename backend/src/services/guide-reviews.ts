import prisma from './db';

/**
 * Who is allowed to review a guide, and keeping the guide's headline rating
 * honest.
 *
 * A review has to be earned: the reviewer must have actually travelled with
 * the guide, and that engagement must be over. Two shapes count, because
 * this app has two ways to end up with a guide on your trip:
 *
 *   - a guide Booking the traveller made (POST /bookings), once it is
 *     COMPLETED or its travel date has passed on a CONFIRMED booking, and
 *   - a Trip the organizer assigned the guide to at a checkpoint, once the
 *     trip's end date has passed, for the organizer and its members.
 *
 * Anything else is refused. Before this, Review carried only a free-text
 * `reviewerName`, so nothing stopped a guide's competitor — or the guide —
 * from writing any number of reviews without having met anyone.
 */

export type ReviewEligibility =
  | { ok: true; kind: 'BOOKING'; bookingId: string; tripId: null }
  | { ok: true; kind: 'TRIP'; bookingId: null; tripId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_YOURS' | 'NOT_CONCLUDED' | 'SELF_REVIEW' | 'NO_ENGAGEMENT' };

/** A guide cannot review themselves, whatever engagement they point at. */
async function isSelfReview(guideProfileId: string, userId: string): Promise<boolean> {
  const guide = await prisma.guideProfile.findUnique({
    where: { id: guideProfileId },
    select: { userId: true },
  });
  return guide?.userId === userId;
}

export async function checkBookingEligibility(
  guideProfileId: string,
  userId: string,
  bookingId: string,
): Promise<ReviewEligibility> {
  if (await isSelfReview(guideProfileId, userId)) return { ok: false, reason: 'SELF_REVIEW' };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.guideProfileId !== guideProfileId) return { ok: false, reason: 'NOT_FOUND' };
  if (booking.userId !== userId) return { ok: false, reason: 'NOT_YOURS' };

  const concluded =
    booking.status === 'COMPLETED' ||
    (booking.status === 'CONFIRMED' && booking.travelDate.getTime() < Date.now());
  if (!concluded) return { ok: false, reason: 'NOT_CONCLUDED' };

  return { ok: true, kind: 'BOOKING', bookingId, tripId: null };
}

export async function checkTripEligibility(
  guideProfileId: string,
  userId: string,
  tripId: string,
): Promise<ReviewEligibility> {
  if (await isSelfReview(guideProfileId, userId)) return { ok: false, reason: 'SELF_REVIEW' };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      creatorId: true,
      endDate: true,
      members: { where: { userId }, select: { id: true } },
      timeline: {
        where: { assignedGuides: { some: { guideProfileId } } },
        select: { id: true },
      },
    },
  });
  if (!trip) return { ok: false, reason: 'NOT_FOUND' };

  // The guide has to have actually been on this trip.
  if (trip.timeline.length === 0) return { ok: false, reason: 'NO_ENGAGEMENT' };

  const travelledOnIt = trip.creatorId === userId || trip.members.length > 0;
  if (!travelledOnIt) return { ok: false, reason: 'NOT_YOURS' };

  // A trip ends at the close of its end date, not midnight at the start of
  // it — the same rule GET /trips/mine uses to derive COMPLETED.
  const endMs = trip.endDate.getTime() + 24 * 60 * 60 * 1000 - 1;
  if (Date.now() <= endMs) return { ok: false, reason: 'NOT_CONCLUDED' };

  return { ok: true, kind: 'TRIP', bookingId: null, tripId };
}

export interface EligibleEngagement {
  kind: 'BOOKING' | 'TRIP';
  id: string;
  label: string;
  concludedOn: string;
  alreadyReviewed: boolean;
}

/**
 * Everything this user could review this guide for. The client uses it to
 * decide whether to offer a "write a review" action at all, rather than
 * letting someone compose one and then be refused on submit.
 */
export async function listEligibleEngagements(
  guideProfileId: string,
  userId: string,
): Promise<EligibleEngagement[]> {
  if (await isSelfReview(guideProfileId, userId)) return [];

  const now = new Date();

  const [bookings, trips, existingReviews] = await Promise.all([
    prisma.booking.findMany({
      where: {
        guideProfileId,
        userId,
        OR: [{ status: 'COMPLETED' }, { status: 'CONFIRMED', travelDate: { lt: now } }],
      },
      select: { id: true, travelDate: true },
      orderBy: { travelDate: 'desc' },
    }),
    prisma.trip.findMany({
      where: {
        endDate: { lt: now },
        timeline: { some: { assignedGuides: { some: { guideProfileId } } } },
        OR: [{ creatorId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true, name: true, endDate: true },
      orderBy: { endDate: 'desc' },
    }),
    prisma.review.findMany({
      where: { guideProfileId, reviewerId: userId },
      select: { tripId: true, bookingId: true },
    }),
  ]);

  const reviewedBookingIds = new Set(existingReviews.map((r) => r.bookingId).filter(Boolean));
  const reviewedTripIds = new Set(existingReviews.map((r) => r.tripId).filter(Boolean));

  return [
    ...bookings.map((b) => ({
      kind: 'BOOKING' as const,
      id: b.id,
      label: 'Guide booking',
      concludedOn: b.travelDate.toISOString(),
      alreadyReviewed: reviewedBookingIds.has(b.id),
    })),
    ...trips.map((t) => ({
      kind: 'TRIP' as const,
      id: t.id,
      label: t.name,
      concludedOn: t.endDate.toISOString(),
      alreadyReviewed: reviewedTripIds.has(t.id),
    })),
  ];
}

/**
 * Recomputes the guide's headline rating from its reviews.
 *
 * GuideProfile.rating is a denormalised average so guide lists don't have to
 * aggregate per row. It stays null while there are no reviews — null means
 * "nobody has rated this guide", which is not the same as a score of 0 (or,
 * as this field once defaulted to, a perfect 5.0 for every unrated guide).
 */
export async function recomputeGuideRating(guideProfileId: string): Promise<number | null> {
  const agg = await prisma.review.aggregate({
    where: { guideProfileId },
    _avg: { rating: true },
    _count: true,
  });

  const average = agg._count === 0 ? null : Math.round((agg._avg.rating ?? 0) * 10) / 10;
  await prisma.guideProfile.update({ where: { id: guideProfileId }, data: { rating: average } });
  return average;
}
