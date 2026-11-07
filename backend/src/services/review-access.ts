import prisma from './db';
import { ApiError } from '../lib/http';

/** Trusted moderator setup only. Creates complimentary private scenarios;
 * never calls payment capture, grants admin, or fabricates a transaction. */
export async function prepareReviewAccess(reviewerId: string, operatorId: string) {
  if (reviewerId === operatorId) throw new ApiError(400, 'VALIDATION_FAILED', 'Use a separate reviewer account.');
  const existing = await prisma.reviewAccess.findUnique({ where: { userId: reviewerId } });
  if (existing) return existing;
  const date = new Date(Date.now() + 45 * 86400_000);
  return prisma.$transaction(async tx => {
    const trips: string[] = [];
    for (const [index, creatorId] of [operatorId, reviewerId].entries()) {
      const traveller = index === 0 ? reviewerId : operatorId;
      const trip = await tx.trip.create({ data: {
        creatorId, name: index === 0 ? 'Review sample: complimentary traveller booking' : 'Review sample: organizer tools',
        description: 'Private product-review scenario. No real trip, service, payment or refund is offered. No payment was collected.',
        cities: ['Jaipur'], startDate: date, endDate: new Date(date.getTime() + 86400_000), durationDays: 2,
        budget: 0, totalSeats: 4, availableSeats: index === 0 ? 3 : 4,
        meetingPoint: 'Review sample only — no meeting scheduled', privacy: 'PRIVATE', languages: ['English'],
        rules: 'Complimentary review scenario. Do not make payments or attend a meeting.',
      } });
      trips.push(trip.id);
      await tx.tripTimelineStop.create({ data: { tripId: trip.id, order: 0, city: 'Jaipur', stayDays: 1, activities: 'Inspect itinerary and booking controls. No real journey.' } });
      await tx.tripMember.create({ data: { tripId: trip.id, userId: creatorId, role: 'ORGANIZER' } });
      await tx.joinRequest.create({ data: { tripId: trip.id, userId: traveller, status: index === 0 ? 'CONFIRMED' : 'PENDING', adjustedPrice: 0, message: 'Complimentary review scenario; no payment collected.' } });
      if (index === 0) await tx.tripMember.create({ data: { tripId: trip.id, userId: traveller, role: 'MEMBER', seatAllocated: 'Sample A1', roomAllocated: 'Sample room' } });
      const room = await tx.chatRoom.create({ data: { tripId: trip.id, isGroup: true, name: trip.name, members: { create: [{ userId: creatorId }, ...(index === 0 ? [{ userId: traveller }] : [])] } } });
      await tx.message.create({ data: { chatRoomId: room.id, senderId: creatorId, content: 'Review sample: this is a complimentary scenario. No payment was collected.', mediaType: 'NONE' } });
    }
    const profile = await tx.guideProfile.upsert({ where: { userId: reviewerId }, update: {}, create: {
      userId: reviewerId, reviewOnly: true, licenseNumber: `REVIEW-ONLY-${reviewerId}`, verifiedStatus: 'PENDING', experienceYears: 0,
      expertisePlaces: ['Jaipur'], languagesSpoken: ['English'], hourlyRate: 0, dailyRate: 0, availability: {},
    } });
    if (profile.reviewOnly) {
      await tx.guidePackage.create({ data: { guideProfileId: profile.id, title: 'Complimentary review sample — no real service', description: 'Private review scenario; not available for purchase.', price: 0, durationDays: 1, citiesIncluded: ['Jaipur'] } });
      await tx.booking.create({ data: { userId: operatorId, guideProfileId: profile.id, type: 'GUIDE', travelDate: date, amount: 0, status: 'PENDING', paymentStatus: 'PENDING', note: 'Complimentary review request. No payment or real service.' } });
    }
    return tx.reviewAccess.create({ data: { userId: reviewerId, travellerTripId: trips[0]!, organizerTripId: trips[1]! } });
  });
}
