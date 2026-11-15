import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getViewedStories, loadStoryViews, markStoryViewed, subscribeStoryViews } from '@/lib/story-view-state';

export function useViewedStories(userId?: string) {
  const snapshot = useCallback(() => getViewedStories(userId), [userId]);
  const viewedStoryIds = useSyncExternalStore(subscribeStoryViews, snapshot, snapshot);
  useEffect(() => { if (userId) void loadStoryViews(userId); }, [userId]);
  const markViewed = useCallback((storyId: string) => {
    if (userId) markStoryViewed(userId, storyId);
  }, [userId]);
  return { viewedStoryIds, markViewed };
}
