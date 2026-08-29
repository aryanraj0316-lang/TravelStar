import { z } from 'zod';

/**
 * The shared list-pagination contract (docs/REMEDIATION.md §5.9 — "Add a
 * global default page size and a hard maximum on every list endpoint").
 *
 * Before this, most list routes called `findMany` with no `take` at all, so
 * the response size was whatever the table happened to hold: every alert
 * ever published, every notification a user had ever received, every guide
 * on the platform. That is unbounded work per request on the server, an
 * unbounded payload on an Indian mobile connection, and an unbounded render
 * on the client — and it degrades silently as the table grows rather than
 * failing anywhere you would notice in development.
 *
 * Cursor pagination (`createdAt`-keyed, matching feed.ts's existing
 * convention) rather than offset, because offset pagination skips or repeats
 * rows whenever anything is inserted between two page fetches — which for a
 * feed ordered by recency is the common case, not the edge case.
 */

/** Applied when a route does not specify its own. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The hard ceiling a client cannot exceed regardless of what it asks for.
 * A caller passing ?limit=100000 gets a 400, not a full table scan.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Query schema for a `createdAt`-descending cursor list. `cursor` is the
 * `createdAt` of the last item the client already has.
 */
export const cursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.coerce.date().optional(),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

/** The `where` fragment for a cursor page. Spread into an existing filter. */
export function cursorFilter(cursor: Date | undefined): { createdAt?: { lt: Date } } {
  return cursor ? { createdAt: { lt: cursor } } : {};
}

/**
 * Trims an over-fetched page down to `limit` and reports the next cursor.
 *
 * Fetch `limit + 1` rows and pass them here: the extra row is how we know
 * whether another page exists without a second COUNT query. `nextCursor` is
 * null on the last page, which is what tells the client to stop.
 */
export function buildPage<T extends { createdAt: Date }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
  };
}

/** `take` for the over-fetch described above. */
export function takeWithLookahead(limit: number): number {
  return limit + 1;
}
