import prisma from '../services/db';
import { logger } from '../lib/logger';
import { resolveTripCoordinates } from '../lib/trip-coordinates';

/**
 * One-off backfill for Trip.latitude/longitude, added when "trips near me"
 * moved off re-deriving a position from city names on every request.
 *
 * Safe to re-run: it only touches rows whose coordinates are still null, and
 * leaves a trip untouched when nothing on its route can be placed rather
 * than writing an invented point.
 *
 *   npx ts-node src/scripts/backfill-trip-coordinates.ts
 */
async function main() {
  const trips = await prisma.trip.findMany({
    where: { latitude: null },
    select: {
      id: true,
      name: true,
      cities: true,
      timeline: { select: { city: true, latitude: true, longitude: true }, orderBy: { order: 'asc' } },
    },
  });

  logger.log(`[backfill-trip-coordinates] ${trips.length} trip(s) without coordinates`);

  let placed = 0;
  let unplaceable = 0;

  for (const trip of trips) {
    const coords = resolveTripCoordinates(trip.cities, trip.timeline);
    if (!coords) {
      unplaceable += 1;
      logger.warn(`[backfill-trip-coordinates] Could not place "${trip.name}" (${trip.cities.join(', ') || 'no cities'})`);
      continue;
    }
    await prisma.trip.update({
      where: { id: trip.id },
      data: { latitude: coords.lat, longitude: coords.lng },
    });
    placed += 1;
  }

  logger.log(`[backfill-trip-coordinates] Done — ${placed} placed, ${unplaceable} left null`);
}

main()
  .catch((err) => {
    logger.error('[backfill-trip-coordinates] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
