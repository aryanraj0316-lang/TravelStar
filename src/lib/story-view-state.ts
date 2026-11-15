import { safeStorage } from '@/services/storage';
import { logger } from '@/lib/logger';

const EMPTY = new Set<string>();
const states = new Map<string, {
  viewed: Set<string>;
  times: Record<string, number>;
  loaded?: Promise<void>;
  writes: Promise<void>;
}>();
const listeners = new Set<() => void>();
const storageKey = (userId: string) => `@viewed_stories:${userId}`;
function stateFor(userId: string) {
  let state = states.get(userId);
  if (!state) {
    state = { viewed: new Set(), times: {}, writes: Promise.resolve() };
    states.set(userId, state);
  }
  return state;
}
const notify = () => listeners.forEach((listener) => listener());

export function subscribeStoryViews(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getViewedStories(userId?: string) {
  return userId ? stateFor(userId).viewed : EMPTY;
}

export function loadStoryViews(userId: string): Promise<void> {
  const state = stateFor(userId);
  if (!state.loaded) {
    state.loaded = safeStorage.getItem(storageKey(userId)).then((raw) => {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const saved: Record<string, number> = {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, time] of Object.entries(parsed)) {
          if (typeof time === 'number' && time > Date.now() - 86_400_000) saved[id] = time;
        }
      }
      // A story can be opened before storage finishes loading.
      state.times = { ...saved, ...state.times };
      state.viewed = new Set(Object.keys(state.times).sort((a, b) => state.times[a] - state.times[b]));
      notify();
    }).catch((error) => logger.warn('[Stories] Could not load viewed stories:', error));
  }
  return state.loaded;
}

export function markStoryViewed(userId: string, storyId: string) {
  const state = stateFor(userId);
  if (state.viewed.has(storyId)) return;
  state.times = { ...state.times, [storyId]: Date.now() };
  state.viewed = new Set([...state.viewed, storyId]);
  notify();
  state.writes = state.writes.then(() => loadStoryViews(userId))
    .then(() => safeStorage.setItem(storageKey(userId), JSON.stringify(state.times)))
    .catch((error) => logger.warn('[Stories] Could not save viewed stories:', error));
}

/** Keep unseen feed order; newly viewed stories move to the far end. */
export function unseenStoriesFirst<T extends { id: string }>(stories: T[], viewed: Set<string>): T[] {
  const rank = new Map([...viewed].map((id, index) => [id, index]));
  return [...stories].sort((a, b) => {
    const aRank = rank.get(a.id);
    const bRank = rank.get(b.id);
    if (aRank === undefined) return bRank === undefined ? 0 : -1;
    if (bRank === undefined) return 1;
    return aRank - bRank;
  });
}
