import { ScreenError, ScreenLoading } from '@/components/ui';
import { feedQueryOptions } from '@/lib/prefetch-launch';
import { sectionState } from '@/lib/query-state';
import type { FeedItem } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/store/AppContext';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Camera from 'lucide-react-native/icons/camera';
import User from 'lucide-react-native/icons/user';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

// "View All" on the home Stories rail lands here: a plain list of other
// travelers who currently have a live story — just their DP and name, no
// preview/caption/likes/timing, since that content is only for the story
// viewer itself. Nothing auto-plays: tapping a row opens the full-screen
// player (src/app/stories.tsx) scoped to that one person's story.

export default function AllStoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn, deletedStoryIds, profile } = useApp();

  const feedQuery = useQuery({
    ...feedQueryOptions(),
    enabled: isLoggedIn,
  });
  const { data: feed, refetch } = feedQuery;
  const feedState = sectionState(feedQuery, feed != null);

  // Every other traveler's live story — reels are a different content
  // type and stay off this list, and the viewer's own stories are
  // reachable from "My Stories" instead of showing up here too.
  const liveStories: FeedItem[] = useMemo(() => {
    const items = (feed ?? []).filter((item) => {
      if (item.sourceType !== 'STORY') return false;
      if (deletedStoryIds?.has(item.id)) return false;
      const isMine =
        (item.userId && profile.id && item.userId === profile.id) ||
        (item.authorName &&
          profile.name &&
          profile.name !== 'Guest Traveler' &&
          item.authorName.trim().toLowerCase() === profile.name.trim().toLowerCase());
      return !isMine;
    });
    return [...items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [feed, deletedStoryIds, profile.id, profile.name]);

  const handleOpenStory = (storyId: string) => {
    router.push({ pathname: '/stories', params: { id: storyId } });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('stories.allStoriesTitle', 'Stories')}</Text>
        <View style={styles.backBtn} />
      </View>

      {!isLoggedIn ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconCircle}>
            <Camera size={30} color={C.blueText} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>{t('stories.signInTitle', 'Sign In to View Stories')}</Text>
        </View>
      ) : feedState.kind === 'loading' ? (
        <ScreenLoading label={t('stories.loadingStories')} />
      ) : feedState.kind === 'error' || !feed ? (
        <ScreenError
          title={t('stories.couldNotLoadStories')}
          message={
            feedState.kind === 'error' && feedState.offline
              ? t('common.offlineMessage')
              : t('stories.couldNotLoadStoriesMessage')
          }
          onRetry={() => void refetch()}
        />
      ) : liveStories.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconCircle}>
            <Camera size={30} color={C.blueText} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>{t('stories.noStoriesYetTitle')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {liveStories.map((story) => (
            <TouchableOpacity
              key={story.id}
              style={styles.storyRow}
              activeOpacity={0.7}
              onPress={() => handleOpenStory(story.id)}
              accessibilityRole="button"
              accessibilityLabel={story.authorName || t('stories.defaultCreatorName')}
            >
              {story.authorAvatar ? (
                <ExpoImage source={{ uri: story.authorAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <User size={20} color={C.blueText} strokeWidth={2.2} />
                </View>
              )}
              <Text style={styles.authorName} numberOfLines={1}>
                {story.authorName || t('stories.defaultCreatorName')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 4,
  },
  storyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: C.blue,
  },
  avatarFallback: {
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
});
