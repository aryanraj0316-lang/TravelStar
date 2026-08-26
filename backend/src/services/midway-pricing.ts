// Single source of truth for the Family Connect midway-join pricing rule
// (REMEDIATION.md §8.6). Previously this formula existed in three places
// that had already drifted: the client's TripDetailModal (proportional ×
// 0.9), the client's now-deleted duplicate in search.tsx (same), and the
// backend's /trips/:id/midway-join preview endpoint (proportional, no
// discount). The client's number was also never verified server-side —
// POST /interactions/join-request stored whatever `adjustedPrice` the
// request body contained. Confirmed with the product owner: keep the
// existing proportional-by-segment-count formula with a flat 10% discount,
// now computed authoritatively here and nowhere else.
export type MidwayPriceResult =
  | { ok: true; adjustedPrice: number; segmentsTraversed: string[] }
  | { ok: false; reason: 'INVALID_SEGMENT' };

export function calculateMidwayPrice(
  cities: string[],
  fullPrice: number,
  fromCity: string,
  toCity: string
): MidwayPriceResult {
  const fromIndex = cities.indexOf(fromCity);
  const toIndex = cities.indexOf(toCity);

  if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
    return { ok: false, reason: 'INVALID_SEGMENT' };
  }

  const totalSegments = cities.length - 1;
  const requestedSegments = toIndex - fromIndex;
  const ratio = totalSegments > 0 ? requestedSegments / totalSegments : 1;
  const adjustedPrice = Math.round(fullPrice * ratio * 0.9);

  return { ok: true, adjustedPrice, segmentsTraversed: cities.slice(fromIndex, toIndex + 1) };
}
