import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Camera from 'lucide-react-native/icons/camera';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Compass from 'lucide-react-native/icons/compass';
import Heart from 'lucide-react-native/icons/heart';
import MapPin from 'lucide-react-native/icons/map-pin';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import Trash2 from 'lucide-react-native/icons/trash-2';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from 'react-i18next';

import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { FeedItem } from '@/types/api';

export interface AccountStoriesModalProps {
  visible: boolean;
  onClose: () => void;
  onAddStory: () => void;
}

export interface UserStoryRecord {
  id: string;
  title: string;
  content: string;
  coverImg?: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
  location?: string;
  likesCount: number;
  createdAt: string;
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return 'Recently';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export default function AccountStoriesModal({
  visible,
  onClose,
  onAddStory,
}: AccountStoriesModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { profile, storiesList, isLoggedIn, deleteStory, deletedStoryIds } = useApp();

  // Fetch feed to merge any remote stories for this user
  const feedQuery = useQuery({
    queryKey: queryKeys.feed(),
    queryFn: async () => {
      const page = await apiService.getFeed(30);
      return page.items;
    },
    enabled: isLoggedIn && visible,
  });
  const feed = feedQuery.data;

  // Determine all active stories belonging to this user's account
  const myStories: UserStoryRecord[] = useMemo(() => {
    if (!isLoggedIn) return [];

    const list: UserStoryRecord[] = [];
    const seenIds = new Set<string>();

    // 1. Stories from local state (created on this device)
    for (const item of storiesList) {
      if (deletedStoryIds?.has(item.id)) continue;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        list.push({
          id: item.id,
          title: item.title || 'My Travel Story',
          content: item.content || '',
          coverImg: item.coverImg || item.mediaUrl || undefined,
          mediaUrl: item.mediaUrl || undefined,
          mediaType: item.mediaType || 'IMAGE',
          location: item.location || undefined,
          likesCount: item.likesCount ?? 0,
          createdAt: item.createdAt,
        });
      }
    }

    // 2. Stories from remote feed created by this user
    const feedItems: FeedItem[] = feed ?? [];
    for (const f of feedItems) {
      if (deletedStoryIds?.has(f.id) || seenIds.has(f.id)) continue;

      const isMine =
        (f.userId && profile.id && f.userId === profile.id) ||
        (f.authorName &&
          profile.name &&
          profile.name !== 'Guest Traveler' &&
          f.authorName.trim().toLowerCase() === profile.name.trim().toLowerCase());

      if (isMine) {
        seenIds.add(f.id);
        list.push({
          id: f.id,
          title: f.title || 'My Travel Story',
          content: f.content || '',
          coverImg: f.coverImg ?? undefined,
          mediaUrl: (f as any).mediaUrl || (f as any).mediaUri || undefined,
          mediaType: (f as any).mediaType || ((f as any).hasReel ? 'VIDEO' : 'IMAGE'),
          location: f.location ?? undefined,
          likesCount: f.likesCount ?? 0,
          createdAt: f.createdAt,
        });
      }
    }

    return list;
  }, [isLoggedIn, storiesList, deletedStoryIds, feed, profile.id, profile.name]);

  const handlePlayStory = useCallback(
    (storyId: string) => {
      onClose();
      router.push({ pathname: '/stories', params: { id: storyId } });
    },
    [onClose, router],
  );

  const handleDeleteStory = useCallback(
    (storyId: string) => {
      Alert.alert(
        t('home.deleteStoryConfirmTitle', 'Delete Story'),
        t(
          'home.deleteStoryConfirmMsg',
          'Are you sure you want to delete this story? It will be removed from your profile and the travel feed.',
        ),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('common.delete', 'Delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteStory(storyId);
            },
          },
        ],
      );
    },
    [deleteStory, t],
  );

  const handleAddPress = useCallback(() => {
    onClose();
    onAddStory();
  }, [onClose, onAddStory]);

  const handleBrowseCommunityStories = useCallback(() => {
    onClose();
    router.push('/stories');
  }, [onClose, router]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        {/* Tap outside backdrop to close */}
        <Pressable style={styles.backdropPressable} onPress={onClose} />

        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Top drag notch */}
          <View style={styles.dragHandleWrap}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.headerTitle}>{t('home.myStories', 'My Stories')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {myStories.length}{' '}
                  {myStories.length === 1
                    ? t('home.storySingular', 'story')
                    : t('home.storyPlural', 'stories')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', 'Close')}
            >
              <X size={18} color={C.textSec} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          {/* Subheader / Action row */}
          <View style={styles.actionRow}>
            <Text style={styles.actionSubtitle}>
              {t('home.myStoriesSubtitle', 'Stories published from your account')}
            </Text>
            <TouchableOpacity
              style={styles.addStoryBtn}
              onPress={handleAddPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('home.addStory', 'Add Story')}
            >
              <Plus size={14} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.addStoryBtnText}>{t('home.addStory', 'Add Story')}</Text>
            </TouchableOpacity>
          </View>

          {/* Body content */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {myStories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Camera size={32} color={C.blueText} strokeWidth={1.8} />
                </View>
                <Text style={styles.emptyTitle}>
                  {t('home.noStoriesYet', 'No stories posted yet')}
                </Text>
                <Text style={styles.emptyDesc}>
                  {t(
                    'home.beTheFirstStory',
                    'Share photos or short video reels of your travel highlights with the community.',
                  )}
                </Text>

                <TouchableOpacity
                  style={styles.emptyCtaBtn}
                  onPress={handleAddPress}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.emptyCtaText}>
                    {t('home.createFirstStory', 'Share Your First Story')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              myStories.map((story) => {
                const isVideo = story.mediaType === 'VIDEO';
                return (
                  <View key={story.id} style={styles.storyCard}>
                    {/* Story Thumbnail */}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handlePlayStory(story.id)}
                      style={styles.thumbWrap}
                    >
                      {story.coverImg ? (
                        <ExpoImage
                          source={{ uri: story.coverImg }}
                          style={styles.thumbImage}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={styles.thumbFallback}>
                          <Camera size={22} color={C.blueText} strokeWidth={1.8} />
                        </View>
                      )}

                      {isVideo && (
                        <View style={styles.videoBadge}>
                          <Play size={10} color="#FFFFFF" fill="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Story Info */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handlePlayStory(story.id)}
                      style={styles.storyInfoCol}
                    >
                      <Text style={styles.storyTitle} numberOfLines={2}>
                        {story.content || story.title}
                      </Text>

                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Clock size={11} color={C.textMuted} />
                          <Text style={styles.metaText}>{formatTimeAgo(story.createdAt)}</Text>
                        </View>

                        {Boolean(story.location) && (
                          <View style={styles.metaItem}>
                            <MapPin size={11} color={C.blueText} />
                            <Text style={[styles.metaText, { color: C.blueText }]} numberOfLines={1}>
                              {story.location}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.statsRow}>
                        <View style={styles.statPill}>
                          <Heart size={11} color="#EF4444" fill="#EF4444" />
                          <Text style={styles.statText}>
                            {story.likesCount}{' '}
                            {story.likesCount === 1
                              ? t('home.like', 'like')
                              : t('home.likes', 'likes')}
                          </Text>
                        </View>
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>{t('home.active', 'Active')}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Action buttons */}
                    <View style={styles.actionsCol}>
                      <TouchableOpacity
                        style={styles.watchBtn}
                        onPress={() => handlePlayStory(story.id)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.watchStory', 'Watch')}
                      >
                        <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                        <Text style={styles.watchBtnText}>{t('home.watchStory', 'Watch')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteStory(story.id)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete', 'Delete')}
                      >
                        <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer: Explore Community Stories */}
          <View style={styles.footerSection}>
            <TouchableOpacity
              style={styles.communityBtn}
              onPress={handleBrowseCommunityStories}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <View style={styles.communityIconWrap}>
                <Compass size={18} color={C.blueText} />
              </View>
              <View style={styles.communityTextWrap}>
                <Text style={styles.communityTitle}>
                  {t('home.exploreCommunityStories', 'Browse All Community Stories')}
                </Text>
                <Text style={styles.communitySub}>
                  {t('home.communityStoriesSub', 'Watch stories shared by other travelers')}
                </Text>
              </View>
              <ChevronRight size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: 440,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    flex: 1,
    marginRight: 12,
  },
  addStoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addStoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollArea: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 12,
  },
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbWrap: {
    position: 'relative',
    width: 66,
    height: 84,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyInfoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 5,
  },
  storyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  activePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  actionsCol: {
    alignItems: 'center',
    gap: 10,
  },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  watchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerSection: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  communityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  communityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityTextWrap: {
    flex: 1,
  },
  communityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  communitySub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
});
