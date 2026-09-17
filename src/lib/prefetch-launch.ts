import { Image } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { apiService } from '@/services/api';
import type { ChatRoomSummary, FeedItem } from '@/types/api';
import { logger } from '@/lib/logger';

/** Shared page size so home, the story viewer, and "all stories" share one cache. */
export const FEED_PREFETCH_LIMIT = 50;
export const FEED_STALE_TIME_MS = 5 * 60_000;
export const CHATS_STALE_TIME_MS = 60_000;

export function feedQueryOptions() {
  return {
    queryKey: queryKeys.feed(),
    queryFn: async () => {
      const page = await apiService.getFeed(FEED_PREFETCH_LIMIT);
      return page.items;
    },
    staleTime: FEED_STALE_TIME_MS,
  };
}

export function alertsQueryOptions() {
  return {
    queryKey: queryKeys.alerts(),
    queryFn: async () => (await apiService.getAlerts()) ?? [],
    staleTime: 60_000,
  };
}
export function chatsQueryOptions() {
  return {
    queryKey: queryKeys.chats(),
    queryFn: async (): Promise<ChatRoomSummary[]> => (await apiService.getChats()) ?? [],
    staleTime: CHATS_STALE_TIME_MS,
  };
}

function storyMediaUris(items: FeedItem[]): string[] {
  const uris: string[] = [];
  for (const item of items) {
    if (item.sourceType !== 'STORY') continue;
    if (item.mediaType === 'VIDEO') {
      if (item.coverImg) uris.push(item.coverImg);
    } else if (item.mediaUrl) {
      uris.push(item.mediaUrl);
    } else if (item.coverImg) {
      uris.push(item.coverImg);
    }
  }
  return uris;
}

const prefetchedStoryMediaUris = new Set<string>();

export function wasStoryMediaPrefetched(uri: string | null | undefined): boolean {
  return !!uri && prefetchedStoryMediaUris.has(uri);
}
export async function prefetchLaunchData(): Promise<void> {
  try {
    await Promise.allSettled([
      queryClient.prefetchQuery(feedQueryOptions()),
      queryClient.prefetchQuery(chatsQueryOptions()),
      queryClient.prefetchQuery(alertsQueryOptions()),
    ]);

    const items = queryClient.getQueryData<FeedItem[]>(queryKeys.feed()) ?? [];
    const uris = storyMediaUris(items).slice(0, 24);
    await Promise.allSettled(
      uris.map(async (uri) => {
        try {
          const ok = await Image.prefetch(uri);
          if (ok !== false) prefetchedStoryMediaUris.add(uri);
        } catch {
          // A single bad asset must not block the rest of the warmup.
        }
      }),
    );
  } catch (e) {
    logger.warn('[Prefetch] Launch data prefetch failed:', e);
  }
}
