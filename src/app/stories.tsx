import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

const STORIES_DATABASE: Record<string, Story[]> = {
  Sikkim: [
    {
      id: 'sikkim-1',
      creator: 'Tashi (Monk & Guide)',
      creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=80',
      caption: 'High pass views in North Sikkim. Breathtaking beauty! 🏔️✨',
      location: 'Sikkim Corridor',
    },
    {
      id: 'sikkim-2',
      creator: 'Tashi (Monk & Guide)',
      creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
      caption: 'Golden hour in the valleys. Feels like heaven. 🌅💛',
      location: 'Gangtok, Sikkim',
    },
  ],
  Jaipur: [
    {
      id: 'jaipur-1',
      creator: 'Amit (Heritage Photographer)',
      creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&q=80',
      caption: 'Checking out the intricate facade of Hawa Mahal! 🏰💖',
      location: 'Jaipur, Rajasthan',
    },
    {
      id: 'jaipur-2',
      creator: 'Amit (Heritage Photographer)',
      creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=800&q=80',
      caption: 'Amber Fort reflections at dusk. Royal history live. 👑✨',
      location: 'Amber Fort, Jaipur',
    },
  ],
  Goa: [
    {
      id: 'goa-1',
      creator: 'Sarah (Beach Nomad)',
      creatorAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
      caption: 'Sun, sand, and palms. Vacation mode is officially ON! 🏖️🥥',
      location: 'South Goa Beaches',
    },
    {
      id: 'goa-2',
      creator: 'Sarah (Beach Nomad)',
      creatorAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80',
      caption: 'Tasting local Goan curries at beach shacks. Delicious! 🍛🌊',
      location: 'Anjuna, Goa',
    },
  ],
  Manali: [
    {
      id: 'manali-1',
      creator: 'Kabir (Ski Instructor)',
      creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=800&q=80',
      caption: 'Waking up to fresh snowfall in Solang Valley! ❄️🏔️',
      location: 'Solang Valley, Manali',
    },
    {
      id: 'manali-2',
      creator: 'Kabir (Ski Instructor)',
      creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=800&q=80',
      caption: 'Chilly vibes and woodfired pizza in Old Manali. 🍕🌲',
      location: 'Old Manali',
    },
  ],
  Munnar: [
    {
      id: 'munnar-1',
      creator: 'Meera (Botanist)',
      creatorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&q=80',
      caption: 'Lush green rolling tea fields covered in morning mist. 🍃💚',
      location: 'Munnar, Kerala',
    },
    {
      id: 'munnar-2',
      creator: 'Meera (Botanist)',
      creatorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
      image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
      caption: 'Sunset hike at Anamudi Peak. Stunning clouds. ⛰️⛅',
      location: 'Anamudi Peak, Munnar',
    },
  ],
};

const STORY_DURATION = 5000; // 5 seconds per story slide

export default function StoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const locationParam = (params.location as string) ?? 'Sikkim';

  const activeStoriesList = STORIES_DATABASE[locationParam] ?? STORIES_DATABASE['Sikkim'];

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
    if (currentIdx < activeStoriesList.length - 1) {
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

  const activeStory = activeStoriesList[currentIdx];

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
        {activeStoriesList.map((story, index) => {
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
