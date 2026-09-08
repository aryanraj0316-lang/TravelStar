import { sectionState, type QueryLike } from './query-state';

const q = (over: Partial<QueryLike> = {}): QueryLike => ({
  isPending: false,
  isError: false,
  fetchStatus: 'idle',
  ...over,
});

describe('sectionState', () => {
  it('is loading while the first fetch is in flight', () => {
    expect(sectionState(q({ isPending: true, fetchStatus: 'fetching' }), false)).toEqual({ kind: 'loading' });
  });

  it('is ready once data has arrived', () => {
    expect(sectionState(q(), true)).toEqual({ kind: 'ready' });
  });

  it('is an error when the fetch failed with no data', () => {
    expect(sectionState(q({ isError: true }), false)).toEqual({ kind: 'error', offline: false });
  });

  // The regression this module exists for: TanStack's networkMode 'online'
  // parks an unreachable query on pending/paused, which read as "loading"
  // forever (CONVENTIONS.md §6 forbids exactly that).
  it('treats a paused query as an offline error, never as loading', () => {
    expect(sectionState(q({ isPending: true, fetchStatus: 'paused' }), false)).toEqual({
      kind: 'error',
      offline: true,
    });
  });

  it('prefers a real error over the offline flag when both could apply', () => {
    expect(sectionState(q({ isError: true, fetchStatus: 'paused' }), false)).toEqual({
      kind: 'error',
      offline: false,
    });
  });

  it('keeps cached content on screen when a background refetch fails', () => {
    // Real data that was really fetched is not a fabricated fallback, and the
    // app deliberately persists its query cache for offline reads.
    expect(sectionState(q({ isError: true }), true)).toEqual({ kind: 'ready' });
    expect(sectionState(q({ isPending: true, fetchStatus: 'paused' }), true)).toEqual({ kind: 'ready' });
  });

  it('is ready for a settled query with an empty (but real) result', () => {
    // An empty list the server actually returned is a legitimate answer; the
    // caller renders its own <ScreenEmpty> from the data, not from here.
    expect(sectionState(q(), true)).toEqual({ kind: 'ready' });
  });
});
