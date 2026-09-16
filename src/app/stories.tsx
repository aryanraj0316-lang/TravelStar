import { ScreenError, ScreenLoading } from '@/components/ui';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import type { FeedItem, StoryInteractionsResponse } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Camera from 'lucide-react-native/icons/camera';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Eye from 'lucide-react-native/icons/eye';
import Heart from 'lucide-react-native/icons/heart';
import MoreHorizontal from 'lucide-react-native/icons/ellipsis';
import Share2 from 'lucide-react-native/icons/share-2';
import Trash2 from 'lucide-react-native/icons/trash-2';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Animated,
  Modal,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

// docs/REMEDIATION.md §8.16: this screen renders real TravelStory rows with
// like actions, automatic view recording, and a viewer list for story owners.

const STORY_DURATION = 5000; // 5 seconds per story slide

function formatTimeAgo(isoString: string): string {
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
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

export default function StoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const idParam = (params.id as string) ?? '';
  const insets = useSafeAreaInsets();

  const { storiesList, profile, isLoggedIn, deleteStory, deletedStoryIds } = useApp();

  const feedQuery = useQuery({
    queryKey: queryKeys.feed(),
    queryFn: async () => {
      const page = await apiService.getFeed(20);
      return page.items;
    },
    enabled: isLoggedIn,
  });
  const { data: feed, refetch } = feedQuery;
  const feedState = sectionState(feedQuery, feed != null);

  const allStories: FeedItem[] = useMemo(() => {
    if (!isLoggedIn) return [];
    const feedItems: FeedItem[] = (feed ?? [])
      .filter((item) => item.sourceType === 'STORY' && !deletedStoryIds?.has(item.id))
      .map((item) => {
        const local = storiesList.find((s) => s.id === item.id || (s.authorName === item.authorName && s.content === item.content));
        return {
          ...item,
          coverImg: item.coverImg || local?.coverImg,
          mediaUrl: item.mediaUrl || local?.mediaUrl,
          mediaType: item.mediaType || local?.mediaType,
        };
      });

    for (const local of storiesList) {
      if (!deletedStoryIds?.has(local.id) && !feedItems.some((r) => r.id === local.id)) {
        feedItems.unshift({
          id: local.id,
          sourceType: 'STORY',
          userId: profile.id,
          title: local.title,
          content: local.content,
          coverImg: local.coverImg,
          mediaUrl: local.mediaUrl,
          mediaType: local.mediaType,
          authorName: local.authorName,
          authorAvatar: local.authorAvatar,
          location: local.location,
          likesCount: local.likesCount,
          createdAt: local.createdAt,
        });
      }
    }
    return feedItems;
  }, [feed, storiesList, profile.id, deletedStoryIds, isLoggedIn]);

  // Only the story that was tapped — never a playlist of everyone else's.
  // Falling back to index 0 used to open a different story (or a reel)
  // the moment this screen mounted, then auto-advance the rest.
  const activeStory = useMemo(() => {
    if (allStories.length === 0) return undefined;
    if (idParam) {
      return allStories.find((s) => s.id === idParam);
    }
    return allStories[0];
  }, [allStories, idParam]);

  const [isLiked, setIsLiked] = useState<Record<string, boolean>>({});
  const [interactions, setInteractions] = useState<StoryInteractionsResponse | null>(null);
  const [isViewerSheetVisible, setIsViewerSheetVisible] = useState(false);
  const [loadingInteractions, setLoadingInteractions] = useState(false);

  // Media resolution, declared above the slide timer because that timer's
  // behaviour depends on whether this slide is a video.
  //
  // A STORY item carries `mediaUrl` with mediaType 'VIDEO'. `coverImg` is
  // the poster frame, and is the image itself on story rows that predate
  // video support — so no single field can be assumed to be the media.
  const slideVideoUrl =
    activeStory?.mediaType === 'VIDEO' ? activeStory?.mediaUrl ?? null : null;
  const storyIsVideo = !!slideVideoUrl;
  const storyMediaUrl = activeStory?.mediaUrl || activeStory?.coverImg || null;

  // An asset that 404s or is otherwise unplayable falls through to the
  // placeholder rather than leaving the slide blank forever.
  const [failedMediaIds, setFailedMediaIds] = useState<Record<string, boolean>>({});
  const mediaFailed = activeStory ? !!failedMediaIds[activeStory.id] : false;
  const [mediaLoaded, setMediaLoaded] = useState<Record<string, boolean>>({});
  const slideReady = activeStory ? !!mediaLoaded[activeStory.id] : false;

  // A spinner that never resolves is the worst outcome: the slide looks
  // broken with no explanation and no way forward. If the asset has not
  // loaded within this window, it is treated as failed so the placeholder
  // and its "couldn't load" line take over.
  useEffect(() => {
    if (!activeStory || slideReady || mediaFailed) return;
    const slideId = activeStory.id;
    const timer = setTimeout(() => {
      setFailedMediaIds((prev) => (prev[slideId] ? prev : { ...prev, [slideId]: true }));
    }, 10000);
    return () => clearTimeout(timer);
  }, [activeStory, slideReady, mediaFailed]);

  const videoPlayer = useVideoPlayer(slideVideoUrl, (player) => {
    player.loop = false;
    player.play();
  });

  // Progress bar
  const progressAnim = useState(() => new Animated.Value(0))[0];
  const progressValueRef = useRef(0);

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  const goBackOrHome = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const handleNextStory = useCallback(() => {
    goBackOrHome();
  }, [goBackOrHome]);

  // Press-and-hold pauses the slide and fades every overlay so only the
  // media remains. Releasing restores chrome and resumes the timer / video.
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didPauseRef = useRef(false);
  const chromeOpacity = useState(() => new Animated.Value(1))[0];
  const [chromeHidden, setChromeHidden] = useState(false);

  const hideChrome = () => {
    setChromeHidden(true);
    Animated.timing(chromeOpacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const showChrome = () => {
    setChromeHidden(false);
    Animated.timing(chromeOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  };

  const handleTapZonePressIn = () => {
    didPauseRef.current = false;
    pauseTimerRef.current = setTimeout(() => {
      didPauseRef.current = true;
      progressAnim.stopAnimation();
      if (storyIsVideo) {
        try {
          videoPlayer.pause();
        } catch {
          // Player may not be ready yet; chrome hide still applies.
        }
      }
      hideChrome();
    }, 180);
  };

  const handleTapZonePressOut = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (didPauseRef.current) {
      showChrome();
      if (storyIsVideo) {
        try {
          videoPlayer.play();
        } catch {
          // Ignore — overlay restore is the important part.
        }
      } else {
        startStoryTimer(progressValueRef.current);
      }
    }
  };

  // A held-and-released press must not also navigate — only a genuine
  // quick tap does. didPauseRef is reset here, after this check, rather
  // than in handleTapZonePressOut, so this handler (which React fires
  // after PressOut) can still see whether this press paused.
  const handleTapZoneTap = (navigate: () => void) => {
    if (didPauseRef.current) {
      didPauseRef.current = false;
      return;
    }
    navigate();
  };

  const startStoryTimer = (startFrom = 0) => {
    if (!activeStory || isViewerSheetVisible) return;
    progressAnim.setValue(startFrom);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION * (1 - startFrom),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) handleNextStory();
    });
  };

  useEffect(() => {
    // A video story is not advanced by the 5s slide timer — it would cut
    // playback off mid-clip. The viewer taps through those themselves,
    // using the player's own native controls.
    if (activeStory && !isViewerSheetVisible && !storyIsVideo) {
      startStoryTimer(0);
    }
    return () => {
      progressAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id, isViewerSheetVisible, storyIsVideo]);

  const handlePrevStory = () => {
    if (storyIsVideo) return;
    startStoryTimer(0);
  };

  // Determine if active story is created by the current user
  const isMyStory = useMemo(() => {
    if (!activeStory) return false;
    // A recorded userId is authoritative and final either way — falling
    // through to a name match on a *mismatch* (rather than only when no
    // userId was ever recorded) let two people who merely share a display
    // name see each other's stories as "mine," "You"-badged and
    // deletable. The name fallback exists only for the handful of
    // legacy rows from before story authorship was reliably recorded.
    if (activeStory.userId) {
      return !!profile.id && activeStory.userId === profile.id;
    }
    return !!(
      activeStory.authorName &&
      profile.name &&
      profile.name !== 'Guest Traveler' &&
      activeStory.authorName.trim().toLowerCase() === profile.name.trim().toLowerCase()
    );
  }, [activeStory, profile.id, profile.name]);

  // Fetch viewer and like interactions
  const fetchInteractions = useCallback(async () => {
    if (!activeStory?.id) return;
    setLoadingInteractions(true);
    try {
      const res = await apiService.getStoryInteractions(activeStory.id);
      if (res) {
        setInteractions(res);
        // The server resolves the caller's own like by user id. This used
        // to be inferred by scanning the viewer list and matching on
        // display *name*, which got the heart wrong for anyone sharing a
        // name — and could not work at all for a non-author, who does not
        // receive that list.
        setIsLiked((prev) => ({ ...prev, [activeStory.id]: res.viewerHasLiked }));
      }
    } catch (e) {
      logger.warn('[Stories] Failed to load interactions:', e);
    } finally {
      setLoadingInteractions(false);
    }
  }, [activeStory?.id, profile.id, profile.name]);

  // A view is recorded once the slide has actually been on screen for a
  // moment. Firing on mount counted every story someone swiped straight
  // past as seen, which is what made the counts wrong.
  useEffect(() => {
    if (!isLoggedIn || !activeStory?.id) return;
    const storyId = activeStory.id;
    const dwellTimer = setTimeout(() => {
      void apiService.recordStoryView(storyId).then(() => {
        if (isMyStory) void fetchInteractions();
      });
    }, 1000);
    return () => clearTimeout(dwellTimer);
  }, [isLoggedIn, activeStory?.id, isMyStory, fetchInteractions]);

  // Every story's like state and counts are fetched here, not just the
  // caller's own — GET /stories/:id/interactions already returns
  // totalViews/totalLikes/viewerHasLiked for any story, withholding only
  // the detailed per-viewer list to non-owners (returned as an empty
  // array). Gating this whole fetch on isMyStory meant the like button
  // never reflected whether *you* had liked someone else's story, and its
  // like/view counts fell back to the feed's stale snapshot instead of
  // the live total.
  useEffect(() => {
    if (activeStory?.id) {
      void fetchInteractions();
    } else {
      setInteractions(null);
    }
    if (!isMyStory) {
      setIsViewerSheetVisible(false);
    }
  }, [isMyStory, activeStory?.id, fetchInteractions]);

  const openViewerSheet = () => {
    progressAnim.stopAnimation();
    setIsViewerSheetVisible(true);
    void fetchInteractions();
  };

  // "..." menu — replaces the header trash icon, which read as a
  // destructive action sitting in everyone's face rather than an
  // intentional choice. Delete now lives behind one more tap, next to
  // Share, like every other options menu in the app.
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const openOptionsMenu = () => {
    progressAnim.stopAnimation();
    setShowOptionsMenu(true);
  };

  const closeOptionsMenu = () => {
    setShowOptionsMenu(false);
    if (!storyIsVideo) {
      startStoryTimer(progressValueRef.current);
    }
  };

  const handleShareStory = async () => {
    if (!activeStory) return;
    setShowOptionsMenu(false);
    try {
      // No public web view of a story exists yet, so this shares real
      // content only — never a fabricated link to a page nobody can open.
      const parts = [activeStory.title, activeStory.content].filter(
        (s, i, arr) => !!s && arr.indexOf(s) === i,
      );
      const author = activeStory.authorName || t('stories.defaultCreatorName');
      const message = [...parts, `Shared from TravelStar by ${author}`].join('\n\n');
      await Share.share({ message });
    } catch (e) {
      logger.warn('[Stories] Share failed:', e);
    } finally {
      if (!storyIsVideo) {
        startStoryTimer(progressValueRef.current);
      }
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const promptDeleteStory = () => {
    progressAnim.stopAnimation();
    Alert.alert(
      'Delete Story',
      'Are you sure you want to delete this story? It will be permanently removed.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (!storyIsVideo) {
              startStoryTimer(progressValueRef.current);
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!activeStory || isDeleting) return;
            setIsDeleting(true);
            try {
              const storyIdToDelete = activeStory.id;
              setIsViewerSheetVisible(false);

              // A false result means the server delete failed and deleteStory already
              // restored the story and toasted the error — navigating away as if it
              // succeeded would strand the user outside a viewer for a story that is
              // still there.
              const deleted = await deleteStory(storyIdToDelete);
              if (!deleted) {
                if (!storyIsVideo) {
                  startStoryTimer(progressValueRef.current);
                }
                return;
              }

              goBackOrHome();
            } catch (err) {
              logger.warn('[Stories] Delete failed:', err);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (!storyIsVideo) {
            startStoryTimer(progressValueRef.current);
          }
        },
      }
    );
  };

  const closeViewerSheet = () => {
    setIsViewerSheetVisible(false);
    startStoryTimer(progressValueRef.current);
  };

  const handleToggleLike = async () => {
    if (!activeStory || isMyStory) return;
    const wasLiked = !!isLiked[activeStory.id];
    setIsLiked((prev) => ({ ...prev, [activeStory.id]: !wasLiked }));
    try {
      const res = await apiService.likeStory(activeStory.id);
      if (res && typeof res.liked === 'boolean') {
        setIsLiked((prev) => ({ ...prev, [activeStory.id]: res.liked }));
      }
      void fetchInteractions();
    } catch (e) {
      logger.warn('[Stories] Like failed:', e);
      setIsLiked((prev) => ({ ...prev, [activeStory.id]: wasLiked }));
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.emptyTitle}>Sign In to View Stories</Text>
        <Text style={styles.emptyText}>
          Sign in to your account to browse, view, and share travel stories.
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: '#38BDF8', paddingHorizontal: 24 }]}
            onPress={() => router.push('/auth')}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            <Text style={[styles.emptyBtnText, { color: '#0F172A', fontWeight: '800' }]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={goBackOrHome}
            accessibilityRole="button"
            accessibilityLabel="Go Back"
          >
            <Text style={styles.emptyBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (feedState.kind === 'loading' && !activeStory) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ScreenLoading label={t('stories.loadingStories')} />
      </SafeAreaView>
    );
  }

  if ((feedState.kind === 'error' || !feed) && !activeStory) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ScreenError
          title={t('stories.couldNotLoadStories')}
          message={
            feedState.kind === 'error' && feedState.offline
              ? t('common.offlineMessage')
              : t('stories.couldNotLoadStoriesMessage')
          }
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!activeStory) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.emptyTitle}>{t('stories.noStoriesYetTitle')}</Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={goBackOrHome}
          accessibilityRole="button"
          accessibilityLabel={t('stories.goBack')}
        >
          <Text style={styles.emptyBtnText}>{t('stories.goBack')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const storyImage = storyMediaUrl;
  const storyCaption = activeStory.content || '';
  const storyCreator = activeStory.authorName || t('stories.defaultCreatorName');
  const storyCreatorAvatar = activeStory.authorAvatar || null;
  const storyLocation = activeStory.location?.trim() && activeStory.location.trim().toLowerCase() !== 'india' ? activeStory.location.trim() : null;

  const totalViewsDisplay = interactions?.totalViews ?? (interactions?.viewers ? interactions.viewers.length : 0);
  const totalLikesDisplay = interactions?.totalLikes ?? activeStory.likesCount ?? 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.storyImageContainer} pointerEvents="none">
        {storyIsVideo && !mediaFailed ? (
          <VideoView player={videoPlayer} style={styles.storyImg} contentFit="contain" nativeControls={false} />
        ) : storyImage && !mediaFailed ? (
          <Image
            source={{ uri: storyImage }}
            style={styles.storyImg}
            resizeMode="contain"
            onLoad={() => setMediaLoaded((prev) => ({ ...prev, [activeStory.id]: true }))}
            onError={() => setFailedMediaIds((prev) => ({ ...prev, [activeStory.id]: true }))}
          />
        ) : (
          <LinearGradient
            colors={['#1E293B', '#0F172A', '#020617']}
            style={[styles.storyImg, styles.storyImgFallback]}
          >
            <Camera size={48} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 12, fontWeight: '600' }}>
              {activeStory.title || 'Travel Story'}
            </Text>
            {mediaFailed ? (
              <Text style={styles.mediaFailedText}>{t('stories.mediaUnavailable')}</Text>
            ) : null}
          </LinearGradient>
        )}

        {/* Only while we are genuinely waiting — the timeout above turns
            this into the placeholder rather than letting it spin forever. */}
        {!storyIsVideo && storyImage && !slideReady && !mediaFailed ? (
          <View style={styles.mediaLoadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#FFF" />
          </View>
        ) : null}
      </View>

      {/* Caption on the story — stays visible on long press, positioned bottom-center slightly upward */}
      {storyCaption.length > 0 && (
        <View
          style={[styles.captionContainer, { bottom: Math.max(insets.bottom, 16) + 72 }]}
          pointerEvents="none"
        >
          <Text style={styles.captionPlainText}>{storyCaption}</Text>
        </View>
      )}

      <Animated.View
        style={[styles.chromeLayer, { opacity: chromeOpacity }]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'transparent']}
          style={styles.topScrim}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.bottomScrim}
          pointerEvents="none"
        />

        {/* Full screen tap & hold zones inside chrome, behind header and bottom actions */}
        <View style={styles.touchControlsContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.leftTouchBlock}
            activeOpacity={1}
            pressRetentionOffset={{ top: 200, bottom: 200, left: 200, right: 200 }}
            onPressIn={handleTapZonePressIn}
            onPressOut={handleTapZonePressOut}
            onPress={() => handleTapZoneTap(handlePrevStory)}
          />
          <TouchableOpacity
            style={styles.rightTouchBlock}
            activeOpacity={1}
            pressRetentionOffset={{ top: 200, bottom: 200, left: 200, right: 200 }}
            onPressIn={handleTapZonePressIn}
            onPressOut={handleTapZonePressOut}
            onPress={() => handleTapZoneTap(handleNextStory)}
          />
        </View>

        {/* Progress bar — only the story that was opened */}
        <View style={styles.progressBarWrapper} pointerEvents="none">
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        {/* Header */}
        <View style={styles.storyHeader} pointerEvents="box-none">
          <View style={styles.creatorMeta} pointerEvents="box-none">
            {storyCreatorAvatar ? (
              <Image source={{ uri: storyCreatorAvatar }} style={styles.creatorAvatar} />
            ) : (
              <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
                <User size={16} color="rgba(255,255,255,0.7)" strokeWidth={2} />
              </View>
            )}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.creatorName}>{storyCreator}</Text>
                {isMyStory && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                )}
              </View>
              {storyLocation ? <Text style={styles.locationText}>{storyLocation}</Text> : null}
            </View>
          </View>
          <View style={styles.headerRightActions} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.headerMoreBtn}
              onPress={openOptionsMenu}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('stories.moreOptions')}
            >
              <MoreHorizontal size={20} color="#FFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={goBackOrHome}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('stories.closeStories')}
            >
              <X size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom: activity / like controls */}
        <View style={[styles.bottomController, { bottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
          <View style={styles.actionRow} pointerEvents="box-none">
            {isMyStory ? (
              <TouchableOpacity
                style={styles.viewersPill}
                onPress={openViewerSheet}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="View story interactions"
              >
                <Eye size={15} color="#FFF" strokeWidth={2.2} />
                <Text style={styles.viewersPillText}>
                  {totalViewsDisplay} {totalViewsDisplay === 1 ? 'view' : 'views'}
                </Text>
                {totalLikesDisplay > 0 && (
                  <>
                    <View style={styles.pillDivider} />
                    <Heart size={13} color="#EF4444" fill="#EF4444" />
                    <Text style={styles.viewersPillText}>{totalLikesDisplay}</Text>
                  </>
                )}
                <ChevronUp size={15} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {!isMyStory && (
              <TouchableOpacity
                style={styles.controlIconCircle}
                onPress={handleToggleLike}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={isLiked[activeStory.id] ? t('stories.unlikeStory') : t('stories.likeStory')}
              >
                <Heart
                  size={20}
                  color={isLiked[activeStory.id] ? '#EF4444' : '#FFF'}
                  fill={isLiked[activeStory.id] ? '#EF4444' : 'transparent'}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Viewer & Likes Bottom Sheet */}
      <Modal
        visible={isViewerSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeViewerSheet}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeViewerSheet} />
          <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {/* Handle bar */}
            <View style={styles.sheetHandleBar} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Story Activity</Text>
                <View style={styles.sheetStatsRow}>
                  <View style={styles.sheetStatBadge}>
                    <Eye size={13} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.sheetStatText}>
                      {totalViewsDisplay} {totalViewsDisplay === 1 ? 'View' : 'Views'}
                    </Text>
                  </View>
                  <View style={[styles.sheetStatBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Heart size={13} color="#EF4444" fill="#EF4444" />
                    <Text style={[styles.sheetStatText, { color: '#FCA5A5' }]}>
                      {totalLikesDisplay} {totalLikesDisplay === 1 ? 'Like' : 'Likes'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isMyStory && (
                  <TouchableOpacity
                    style={styles.sheetDeleteBtn}
                    onPress={promptDeleteStory}
                    accessibilityRole="button"
                    accessibilityLabel="Delete this story"
                    disabled={isDeleting}
                  >
                    <Trash2 size={15} color="#EF4444" />
                    <Text style={styles.sheetDeleteText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={closeViewerSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Close sheet"
                >
                  <X size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Content */}
            {loadingInteractions ? (
              <View style={styles.sheetLoadingContainer}>
                <ActivityIndicator size="small" color="#38BDF8" />
                <Text style={styles.sheetLoadingText}>Loading story viewers...</Text>
              </View>
            ) : !interactions || interactions.viewers.length === 0 ? (
              <View style={styles.sheetEmptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Eye size={28} color="rgba(255,255,255,0.4)" />
                </View>
                <Text style={styles.sheetEmptyTitle}>No views yet</Text>
                <Text style={styles.sheetEmptySub}>
                  When travelers view or like your story, they will show up here in real time.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.viewersScrollView}
                contentContainerStyle={styles.viewersListContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.viewersSectionHeader}>
                  SEEN BY ({interactions.viewers.length})
                </Text>
                {interactions.viewers.map((viewer) => (
                  <View key={viewer.userId} style={styles.viewerItemRow}>
                    <View style={styles.viewerInfo}>
                      {viewer.avatar ? (
                        <Image source={{ uri: viewer.avatar }} style={styles.viewerAvatar} />
                      ) : (
                        <View style={styles.viewerAvatarFallback}>
                          <User size={18} color="rgba(255,255,255,0.7)" />
                        </View>
                      )}
                      <View style={styles.viewerNameBlock}>
                        <Text style={styles.viewerName} numberOfLines={1}>
                          {viewer.name}
                        </Text>
                        <Text style={styles.viewedTime}>
                          {formatTimeAgo(viewer.viewedAt)}
                        </Text>
                      </View>
                    </View>

                    {viewer.hasLiked ? (
                      <View style={styles.likedIndicator}>
                        <Heart size={18} color="#EF4444" fill="#EF4444" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* "..." options menu — Share, and Delete for the story's own author */}
      <Modal visible={showOptionsMenu} animationType="fade" transparent onRequestClose={closeOptionsMenu}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeOptionsMenu} />
          <View style={[styles.optionsMenuSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHandleBar} />
            <TouchableOpacity
              style={styles.optionsMenuRow}
              onPress={() => void handleShareStory()}
              accessibilityRole="button"
              accessibilityLabel={t('stories.shareStory')}
            >
              <Share2 size={18} color="#FFF" strokeWidth={2} />
              <Text style={styles.optionsMenuRowText}>{t('stories.shareStory')}</Text>
            </TouchableOpacity>
            {isMyStory && (
              <TouchableOpacity
                style={styles.optionsMenuRow}
                onPress={() => {
                  setShowOptionsMenu(false);
                  promptDeleteStory();
                }}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel={t('stories.deleteStory')}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Trash2 size={18} color="#EF4444" strokeWidth={2} />
                )}
                <Text style={[styles.optionsMenuRowText, { color: '#EF4444' }]}>{t('stories.deleteStory')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.optionsMenuCancelRow} onPress={closeOptionsMenu} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={styles.optionsMenuCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: 20,
  },
  emptyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  storyImageContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyImg: {
    width: '100%',
    height: '100%',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  storyImgFallback: {
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFailedText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 6,
  },
  mediaLoadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    gap: 4,
    zIndex: 90,
  },
  progressBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFF',
  },
  storyHeader: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 90,
  },
  creatorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creatorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: C.blueGlow,
  },

  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  sheetDeleteText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '700',
  },
  creatorAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorName: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  youBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  youBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  locationText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 12,
  },
  chromeLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },
  touchControlsContainer: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    zIndex: 1,
  },
  leftTouchBlock: {
    flex: 3,
    height: '100%',
  },
  rightTouchBlock: {
    flex: 7,
    height: '100%',
  },
  bottomController: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 80,
    alignItems: 'center',
  },
  captionContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  captionPlainText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 6,
    maxWidth: '92%',
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  viewersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 7,
  },
  viewersPillText: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 1,
  },
  controlIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  optionsMenuSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 4,
    paddingHorizontal: 8,
  },
  optionsMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  optionsMenuRowText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  optionsMenuCancelRow: {
    marginTop: 4,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  optionsMenuCancelText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  sheetTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  sheetStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  sheetStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  sheetStatText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11.5,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetLoadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sheetLoadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  sheetEmptyContainer: {
    paddingVertical: 45,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sheetEmptyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetEmptySub: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  viewersScrollView: {
    flexGrow: 0,
  },
  viewersListContent: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  viewersSectionHeader: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  viewerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  viewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  viewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E293B',
  },
  viewerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  viewerNameBlock: {
    flex: 1,
  },
  viewerName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  viewedTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11.5,
    marginTop: 2,
  },
  likedIndicator: {
    padding: 6,
  },
});
