import prisma from '../src/services/db';
import { refreshTrendingRanks } from '../src/lib/destination-trends';

/**
 * refreshTrendingRanks — re-orders the app's own curated Destination rows
 * by real Wikipedia page-view volume. There is no reliable free API for
 * "trending this season", so this is the live signal both GET /destinations
 * and GET /weather/trending's shared `rank` ordering are built on.
 *
 * The exact resulting order is not pinned — it depends on Wikipedia's real,
 * changing traffic, so asserting a specific order would make this suite
 * depend on a third party's live data the same way weather-live.test.ts
 * reasons about not pinning a real upstream reading. What is pinned is the
 * one thing that must always hold regardless of what the real data says:
 * this can only ever reorder rows that already exist, never invent one.
 */
describe('refreshTrendingRanks', () => {
  it('only ever assigns rank to Destination rows that already existed', async () => {
    const before = await prisma.destination.findMany({ select: { id: true } });
    const beforeIds = new Set(before.map((d) => d.id));

    await refreshTrendingRanks();

    const after = await prisma.destination.findMany({ select: { id: true } });
    expect(after).toHaveLength(before.length);
    for (const d of after) {
      expect(beforeIds.has(d.id)).toBe(true);
    }
  });

  it('leaves every rank as a real positive integer, never null or fabricated', async () => {
    await refreshTrendingRanks();
    const destinations = await prisma.destination.findMany({ select: { rank: true } });
    for (const d of destinations) {
      expect(Number.isInteger(d.rank)).toBe(true);
      expect(d.rank).toBeGreaterThan(0);
    }
  });
});
