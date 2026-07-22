import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Play,
  Send,
  X,
} from 'lucide-react-native';
import React, { useRef, useState, useEffect } from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Animated,
  TextInput,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Story {
  id: string;
  creator: string;
  creatorAvatar: string;
  image: string;
  caption: string;
  location: string;
}

const STORIES_DATA: Story[] = [
  {
    id: 'story-1',
    creator: 'Rohan (Vlogger)',
    creatorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80',
    image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    caption: 'Chasing the sunrise at the Taj Mahal. Magical morning vibes! 🌅✨',
    location: 'Taj Mahal, Agra',
  },
  {
    id: 'story-2',
    creator: 'Priya (Backpacker)',
    creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    caption: 'Gulmarg Gondola Ride Phase 2. Zero degrees but pure bliss! ❄️🏔️',
    location: 'Gulmarg, Kashmir',
  },
  {
    id: 'story-3',
    creator: 'Vikram (Rider)',
    creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
    caption: 'Cruising next to the blue waters of Pangong Tso. The cold wind hits different here! 🏍️💨',
    location: 'Pangong Lake, Ladakh',
  },
];

const STORY_DURATION = 5000; // 5 seconds per story slide

export default function StoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isLiked, setIsLiked] = useState<Record<string, boolean>>({});

  // Anim progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  // Keyboard offset tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // Pause progress when typing
      progressAnim.stopAnimation();
      if (timerRef.current) clearTimeout(timerRef.current);
    });

    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      // Resume current slide animation
      startStoryTimer((progressAnim as any)._value || 0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [currentIdx]);

  const startStoryTimer = (startFrom = 0) => {
    progressAnim.setValue(startFrom);
    
    // Stop any existing timers
    if (timerRef.current) clearTimeout(timerRef.current);

    const remainingTime = STORY_DURATION * (1 - startFrom);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: remainingTime,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        handleNextStory();
      }
    });
  };

  const handleNextStory = () => {
    if (currentIdx < STORIES_DATA.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      // Out of stories, navigate back
      router.back();
    }
  };

  const handlePrevStory = () => {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
    }
  };

  // Reset and restart animation whenever story changes
  useEffect(() => {
    startStoryTimer(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIdx]);

  const activeStory = STORIES_DATA[currentIdx];

  const handleSendReply = () => {
    if (!inputText.trim()) return;
    setInputText('');
    Keyboard.dismiss();
  };

  const handleToggleLike = () => {
    setIsLiked(prev => ({
      ...prev,
      [activeStory.id]: !prev[activeStory.id]
    }));
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Slide Images */}
      <View style={styles.storyImageContainer}>
        <Image source={{ uri: activeStory.image }} style={styles.storyImg} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.75)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Progress Bars Row */}
      <View style={styles.progressBarWrapper}>
        {STORIES_DATA.map((story, index) => {
          let progressFillWidth: any = '0%';
          if (index < currentIdx) {
            progressFillWidth = '100%';
          } else if (index === currentIdx) {
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
              <View style={[styles.progressBarFill, { width: progressFillWidth }]} />
            </View>
          );
        })}
      </View>

      {/* Top Header info (Creator details + Close Button) */}
      <View style={styles.storyHeader}>
        <View style={styles.creatorMeta}>
          <Image source={{ uri: activeStory.creatorAvatar }} style={styles.creatorAvatar} />
          <View>
            <Text style={styles.creatorName}>{activeStory.creator}</Text>
            <Text style={styles.locationText}>{activeStory.location}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <X size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Tap triggers for navigation (Left 30% goes back, Right 70% goes forward) */}
      <View style={styles.touchControlsContainer}>
        <TouchableOpacity style={styles.leftTouchBlock} activeOpacity={1} onPress={handlePrevStory} />
        <TouchableOpacity style={styles.rightTouchBlock} activeOpacity={1} onPress={handleNextStory} />
      </View>

      {/* Bottom overlay: Caption + Send Message Reply Box */}
      <Animated.View style={[styles.bottomController, { bottom: keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 16) }]}>
        <View style={styles.captionPanel}>
          <Text style={styles.captionText}>{activeStory.caption}</Text>
        </View>

        <View style={styles.replyBoxRow}>
          <View style={styles.inputOuterWrapper}>
            <TextInput
              placeholder="Send message..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.replyInput}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendReply}
            />
          </View>

          <TouchableOpacity style={styles.controlIconCircle} onPress={handleToggleLike}>
            <Heart
              size={20}
              color={isLiked[activeStory.id] ? '#EF4444' : '#FFF'}
              fill={isLiked[activeStory.id] ? '#EF4444' : 'transparent'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlIconCircle} onPress={handleSendReply}>
            <Send size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    borderColor: '#00F2FE',
  },
  creatorName: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  locationText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
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
  replyBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputOuterWrapper: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 16,
    height: 40,
    justifyContent: 'center',
  },
  replyInput: {
    color: '#FFF',
    fontSize: 13,
    padding: 0,
  },
  controlIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
