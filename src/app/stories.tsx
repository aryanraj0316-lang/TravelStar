import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart, X } from 'lucide-react-native';
import React, { useRef, useState, useEffect } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/theme/tokens';

// docs/REMEDIATION.md §8.16: this screen previously fell back to a
// hardcoded STORIES_DATABASE of fabricated creators/captions whenever the
// real feed had nothing for a location, and shipped a reply box that
// silently discarded whatever the user typed (there is no story-comment
// API). Both are gone — it now renders only real TravelStory rows with an
// honest empty state, and keeps only the real like action. It also read
// the private `progressAnim._value` and carried a `timerRef` that was
// never assigned a timeout (so every `clearTimeout` on it was a no-op);
// progress is now tracked through a proper Animated listener.

const STORY_DURATION = 5000; // 5 seconds per story slide

interface FeedStory {
  id: string;
  coverImg?: string;
  image?: string;
  content?: string;
  caption?: string;
  authorName?: string;
  creator?: string;
  authorAvatar?: string;
  creatorAvatar?: string;
  location?: string;
  title?: string;
}

export default function StoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const locationParam = (params.location as string) ?? '';
  const { storiesList } = useApp();
  const insets = useSafeAreaInsets();

  const activeStoriesList: FeedStory[] = React.useMemo(() => {
    if (!locationParam) return storiesList as FeedStory[];
    return (storiesList as FeedStory[]).filter(
      (s) =>
        s.location?.toLowerCase().includes(locationParam.toLowerCase()) ||
        s.title?.toLowerCase().includes(locationParam.toLowerCase())
    );
  }, [locationParam, storiesList]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isLiked, setIsLiked] = useState<Record<string, boolean>>({});

  // Progress bar. progressValueRef mirrors the animated value via a
  // listener so we never have to reach for the private `._value`.
  const progressAnim = useState(() => new Animated.Value(0))[0];
  const progressValueRef = useRef(0);

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  const goBackOrHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleNextStory = () => {
    setCurrentIdx((prev) => {
      if (prev < activeStoriesList.length - 1) return prev + 1;
      goBackOrHome();
      return prev;
    });
  };

  const handlePrevStory = () => {
    setCurrentIdx((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const startStoryTimer = (startFrom = 0) => {
    if (activeStoriesList.length === 0) return;
    progressAnim.setValue(startFrom);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION * (1 - startFrom),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) handleNextStory();
    });
  };

  // Restart the slide timer whenever the story changes.
  useEffect(() => {
    if (activeStoriesList.length > 0) startStoryTimer(0);
    return () => {
      progressAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, activeStoriesList]);

  if (activeStoriesList.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.emptyTitle}>No stories yet</Text>
        <Text style={styles.emptyText}>
          {locationParam
            ? `Nobody has shared a story from ${locationParam} yet.`
            : 'Be the first to share a travel story.'}
        </Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={goBackOrHome}>
          <Text style={styles.emptyBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const activeStory = activeStoriesList[Math.min(currentIdx, activeStoriesList.length - 1)];
  const storyImage =
    activeStory.coverImg ||
    activeStory.image ||
    'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80';
  const storyCaption = activeStory.content || activeStory.caption || '';
  const storyCreator = activeStory.authorName || activeStory.creator || 'Traveler';
  const storyCreatorAvatar =
    activeStory.authorAvatar ||
    activeStory.creatorAvatar ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
  const storyLocation = activeStory.location || 'India';

  const handleToggleLike = async () => {
    const wasLiked = !!isLiked[activeStory.id];
    setIsLiked((prev) => ({ ...prev, [activeStory.id]: !wasLiked }));
    try {
      await apiService.likeStory(activeStory.id);
    } catch (e) {
      logger.warn('[Stories] Like failed:', e);
      setIsLiked((prev) => ({ ...prev, [activeStory.id]: wasLiked }));
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.storyImageContainer}>
        <Image source={{ uri: storyImage }} style={styles.storyImg} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.75)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Progress bars */}
      <View style={styles.progressBarWrapper}>
        {activeStoriesList.map((story, index) => {
          if (index === currentIdx) {
            return (
              <View key={story.id} style={styles.progressBarTrack}>
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
            );
          }
          return (
            <View key={story.id} style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: index < currentIdx ? '100%' : '0%' }]} />
            </View>
          );
        })}
      </View>

      {/* Header */}
      <View style={styles.storyHeader}>
        <View style={styles.creatorMeta}>
          <Image source={{ uri: storyCreatorAvatar }} style={styles.creatorAvatar} />
          <View>
            <Text style={styles.creatorName}>{storyCreator}</Text>
            <Text style={styles.locationText}>{storyLocation}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Close stories">
          <X size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Tap zones */}
      <View style={styles.touchControlsContainer}>
        <TouchableOpacity style={styles.leftTouchBlock} activeOpacity={1} onPress={handlePrevStory} />
        <TouchableOpacity style={styles.rightTouchBlock} activeOpacity={1} onPress={handleNextStory} />
      </View>

      {/* Bottom: caption + like */}
      <View style={[styles.bottomController, { bottom: Math.max(insets.bottom, 16) }]}>
        {storyCaption.length > 0 && (
          <View style={styles.captionPanel}>
            <Text style={styles.captionText}>{storyCaption}</Text>
          </View>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.controlIconCircle}
            onPress={handleToggleLike}
            accessibilityRole="button"
            accessibilityLabel={isLiked[activeStory.id] ? 'Unlike story' : 'Like story'}
          >
            <Heart
              size={20}
              color={isLiked[activeStory.id] ? '#EF4444' : '#FFF'}
              fill={isLiked[activeStory.id] ? '#EF4444' : 'transparent'}
            />
          </TouchableOpacity>
        </View>
      </View>
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
    borderRadius: 20,
  },
  emptyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  storyImageContainer: {
    ...StyleSheet.absoluteFill,
  },
  storyImg: {
    ...StyleSheet.absoluteFill,
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
  creatorName: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  locationText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 12,
  },
  touchControlsContainer: {
    position: 'absolute',
    top: 120,
    bottom: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 10,
  },
  leftTouchBlock: {
    flex: 3,
  },
  rightTouchBlock: {
    flex: 7,
  },
  bottomController: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 80,
    gap: 10,
  },
  captionPanel: {
    paddingHorizontal: 6,
  },
  captionText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
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
});
