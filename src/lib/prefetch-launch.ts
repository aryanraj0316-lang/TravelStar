import { Image } from 'expo-image';

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
    refetchInterval: 30_000,
    select: (items: FeedItem[]) => items.filter((item) => item.sourceType !== 'STORY' || Date.parse(item.createdAt) > Date.now() - 86_400_000),
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
    if (Date.parse(item.createdAt) <= Date.now() - 86_400_000) continue;
    // These are the images the home rail actually displays.
    if (item.authorAvatar) uris.push(item.authorAvatar);
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
const pendingImages = new Map<string, Promise<void>>();

function warmImages(uris: (string | null | undefined)[]): Promise<void> {
  return Promise.all(uris.filter((uri): uri is string => !!uri).map((uri) => {
    if (prefetchedStoryMediaUris.has(uri)) return Promise.resolve();
    const pending = pendingImages.get(uri);
    if (pending) return pending;
    const task = Image.prefetch(uri, 'memory-disk').then((ok) => {
      if (ok) prefetchedStoryMediaUris.add(uri);
    }).catch(() => {}).finally(() => pendingImages.delete(uri));
    pendingImages.set(uri, task);
    return task;
  })).then(() => {});
}

function warmFeedImages() {
  const items = queryClient.getQueryData<FeedItem[]>(queryKeys.feed()) ?? [];
  return warmImages(storyMediaUris(items).slice(0, 24));
}

function homeDestinationImage(uri?: string) {
  return uri?.includes('unsplash.com') ? uri.replace(/w=\d+/, 'w=900').replace(/q=\d+/, 'q=85') : uri;
}

export function wasStoryMediaPrefetched(uri: string | null | undefined): boolean {
  return !!uri && prefetchedStoryMediaUris.has(uri);
}
export async function prefetchLaunchData(): Promise<void> {
  try {
    await Promise.allSettled([
      // Cached pictures begin immediately. Fresh feed pictures don't wait
      // for unrelated inbox or alert requests to finish.
      warmFeedImages(),
      queryClient.prefetchQuery(feedQueryOptions()).then(warmFeedImages),
      queryClient.prefetchQuery(chatsQueryOptions()),
      queryClient.prefetchQuery(alertsQueryOptions()),
    ]);

  } catch (e) {
    logger.warn('[Prefetch] Launch data prefetch failed:', e);
  }
}

/** First visible home content, prepared while the existing splash covers it. */
export async function prepareHomeLaunch(signedIn: boolean, avatar?: string) {
  const cachedDestinations = queryClient.getQueryData<{ image?: string }[]>(queryKeys.destinations()) ?? [];
  const cachedTrips = queryClient.getQueryData<{ coverImage?: string; creatorAvatar?: string }[]>(queryKeys.trips()) ?? [];
  await Promise.allSettled([
    warmImages([avatar, ...cachedDestinations.slice(0, 6).map((item) => homeDestinationImage(item.image)),
      ...cachedTrips.slice(0, 6).flatMap((trip) => [trip.coverImage, trip.creatorAvatar])]),
    signedIn ? warmFeedImages() : Promise.resolve(),
    signedIn ? queryClient.prefetchQuery(feedQueryOptions()).then(warmFeedImages) : Promise.resolve(),
    queryClient.prefetchQuery({ queryKey: queryKeys.destinations(), queryFn: () => apiService.getDestinations() })
      .then(() => warmImages((queryClient.getQueryData<{ image?: string }[]>(queryKeys.destinations()) ?? []).slice(0, 6).map((item) => homeDestinationImage(item.image)))),
    queryClient.prefetchQuery({ queryKey: queryKeys.trendingWeather(), queryFn: () => apiService.getTrendingWeather(), staleTime: 5 * 60_000 }),
    queryClient.prefetchQuery(alertsQueryOptions()),
  ]);
}
