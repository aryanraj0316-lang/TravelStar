// One place for the display strings derived from a Trip's real columns.
//
// These used to exist in three disagreeing copies (search.tsx,
// budget-trips.tsx, home-screen.tsx), and home-screen's version was not a
// derivation at all — it looked the trip id up in a hardcoded table
// (`trip-1` -> '7 Nights / 8 Days') and fell back to a fixed
// '5 Nights / 6 Days' for every real trip, which is the §8.15 bug that was
// fixed for budget-trips but never for the home carousel.
//
// Everything here is computed from fields the API actually returns. Nothing
// is inferred from an id, and nothing is invented when a field is missing —
// callers get null and render an honest absence instead.
import type { Trip } from '@/store/AppContext';

/** Whole nights between two ISO dates; 0 when either is missing or invalid. */
export function nightsBetween(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / (24 * 60 * 60 * 1000));
}

/**
 * "5 Nights / 6 Days". Returns null rather than a placeholder when the trip
 * has no usable date range — the caller decides what to show instead.
 */
export function formatTripDuration(trip: Pick<Trip, 'startDate' | 'endDate'>): string | null {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  if (nights <= 0) return null;
  const days = nights + 1;
  return `${nights} Night${nights === 1 ? '' : 's'} / ${days} Day${days === 1 ? '' : 's'}`;
}

/**
 * The trip's inclusions, from the real boolean columns. Used for the
 * "what you get" line on trip cards.
 */
export function tripInclusions(
  trip: Pick<Trip, 'guideIncluded' | 'foodIncluded' | 'hotelIncluded' | 'cabIncluded'>,
): string[] {
  const out: string[] = [];
  if (trip.guideIncluded) out.push('Guide');
  if (trip.hotelIncluded) out.push('Hotel');
  if (trip.foodIncluded) out.push('Meals');
  if (trip.cabIncluded) out.push('Transport');
  return out;
}

/**
 * A transport label derived only from the trip's real `cabIncluded` column.
 *
 * The previous versions of this guessed from the title text — "bike" in the
 * name meant "Bike + Fuel + Stay" — which is a heuristic over free-form user
 * input presented to other users as a fact about what they are buying. There
 * is no transport-mode column on Trip, so this now says only what the data
 * supports, and returns null when it supports nothing.
 */
export function tripTransportLabel(trip: Pick<Trip, 'cabIncluded'>): string | null {
  return trip.cabIncluded ? 'Transport included' : null;
}

/**
 * The trip's own cover image, or null.
 *
 * Callers must render a real placeholder (a gradient, an initial) for null
 * rather than substituting a stock photo of somewhere the trip does not go —
 * home-screen used to pick an Unsplash URL by matching words in the title,
 * so a "Kerala Heritage Walk" showed a photo of Rajasthan.
 */
export function tripCoverImage(trip: Pick<Trip, 'coverImage'>): string | null {
  const uri = trip.coverImage?.trim();
  if (!uri) return null;
  // A device-local URI belongs to whoever picked it and resolves for nobody
  // else (docs/REMEDIATION.md §8.4). Treat it as absent.
  if (uri.startsWith('file:') || uri.startsWith('blob:') || uri.startsWith('data:')) return null;
  return uri;
}

/** "Delhi -> Agra -> Jaipur", or the meeting point when no cities are set. */
export function tripRouteLabel(trip: Pick<Trip, 'cities' | 'meetingPoint'>): string {
  if (trip.cities && trip.cities.length > 0) return trip.cities.join(' → ');
  return trip.meetingPoint || 'Route to be announced';
}
