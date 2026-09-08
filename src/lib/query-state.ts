// Maps a TanStack Query result onto CONVENTIONS.md §6's four states.
//
// The naive mapping — `isPending` means loading, `isError` means error — has
// a hole that shows up the moment the API is unreachable. TanStack's default
// `networkMode: 'online'` pauses a query's retries when it decides the device
// is offline: the query settles on `status: 'pending'` with
// `fetchStatus: 'paused'` and simply stays there. `isPending` is true, and
// `isError` never becomes true, so a screen that trusts those two renders a
// spinner that never resolves — precisely what §6 forbids ("no screen may
// show a spinner forever"). Defaulting the data to `[]` instead, as this
// codebase used to, is worse rather than better: an empty-state card that
// says "no destinations yet" when the truth is "we could not ask" is a
// claim the app has no basis for.
//
// A paused query is therefore classified as an error with an offline flag,
// so the caller renders <ScreenError> with honest copy and a retry.

/** The subset of a `useQuery` result this needs. */
export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  /** 'fetching' | 'paused' | 'idle' */
  fetchStatus: string;
}

export type SectionState =
  | { kind: 'loading' }
  /** `offline` picks the "you appear to be offline" copy over a server error. */
  | { kind: 'error'; offline: boolean }
  | { kind: 'ready' };

/**
 * Classifies one section's remote data.
 *
 * `hasData` wins over a failed refetch on purpose: content that was really
 * fetched and is still cached is real data, not an invention, and blanking it
 * because a background refresh failed would fight this app's offline cache
 * (src/lib/query-persister.ts). The no-fabrication rule is about substituting
 * content the server never sent — not about discarding content it did.
 */
export function sectionState(query: QueryLike, hasData: boolean): SectionState {
  if (hasData) return { kind: 'ready' };
  if (query.isError) return { kind: 'error', offline: false };
  if (query.fetchStatus === 'paused') return { kind: 'error', offline: true };
  if (query.isPending) return { kind: 'loading' };
  return { kind: 'ready' };
}
