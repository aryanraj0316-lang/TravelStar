// First-launch onboarding: a one-time 3-slide introduction shown before the
// app's first real screen. Gated by AppContext's `hasOnboarded` (persisted
// via safeStorage — see the root layout, which redirects here before its
// splash overlay hides for a device that hasn't seen it yet) and marked
// done by `completeOnboarding()` on "Get Started"/"Skip" either one, so it
// never shows again on this device.
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';

import { useApp } from '@/store/AppContext';
import { C, fontSize, fontWeight, radii, space } from '@/theme/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The image is 901×1600 (9:16). Calculate how tall it renders when
// scaled to fit the screen width so we know where the text area begins.
const IMAGE_ASPECT = 1600 / 901; // ≈ 1.776
const IMAGE_RENDERED_HEIGHT = Math.min(SCREEN_WIDTH * IMAGE_ASPECT, SCREEN_HEIGHT);
const IMAGE_TOP_OFFSET = (SCREEN_HEIGHT - IMAGE_RENDERED_HEIGHT) / 2;

type SlideItem = {
  key: 'slide1' | 'slide2' | 'slide3';
  image: ImageSourcePropType;
};

const SLIDES: readonly SlideItem[] = [
  {
    key: 'slide1',
    image: require('@/assets/images/onboarding-slide1.png'),
  },
  {
    key: 'slide2',
    image: require('@/assets/images/onboarding-slide2.png'),
  },
  {
    key: 'slide3',
    image: require('@/assets/images/onboarding-slide3.png'),
  },
] as const;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [scrollX] = useState(() => new Animated.Value(0));

  // 3 independent hovering float animations for the 3 trip cards on slide 1
  const hoverAnim1 = useRef(new Animated.Value(0)).current;
  const hoverAnim2 = useRef(new Animated.Value(0)).current;
  const hoverAnim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(hoverAnim1, {
          toValue: 1,
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hoverAnim1, {
          toValue: 0,
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(hoverAnim2, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hoverAnim2, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const loop3 = Animated.loop(
      Animated.sequence([
        Animated.timing(hoverAnim3, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hoverAnim3, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop1.start();
    loop2.start();
    loop3.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [hoverAnim1, hoverAnim2, hoverAnim3]);

  const card1TranslateY = hoverAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const card2TranslateY = hoverAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const card3TranslateY = hoverAnim3.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -9],
  });

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const fontStyles = fontsLoaded
    ? {
        title: { fontFamily: 'Outfit_700Bold' as const },
        titleHighlight: { fontFamily: 'Outfit_800ExtraBold' as const },
        body: { fontFamily: 'Outfit_400Regular' as const },
        skip: { fontFamily: 'Outfit_600SemiBold' as const },
        guest: { fontFamily: 'Outfit_600SemiBold' as const },
        button: { fontFamily: 'Outfit_600SemiBold' as const },
      }
    : {
        title: { fontWeight: fontWeight.bold },
        titleHighlight: { fontWeight: fontWeight.bold },
        body: { fontWeight: fontWeight.regular },
        skip: { fontWeight: fontWeight.semibold },
        guest: { fontWeight: fontWeight.semibold },
        button: { fontWeight: fontWeight.semibold },
      };

  const isLast = index === SLIDES.length - 1;

  const finish = (destination: '/auth' | '/') => {
    completeOnboarding();
    router.replace(destination);
  };

  const goNext = () => {
    if (isLast) {
      finish('/auth');
      return;
    }
    scrollRef.current?.scrollTo({
      x: (index + 1) * SCREEN_WIDTH,
      animated: true,
    });
  };

  const goBack = () => {
    if (index > 0) {
      scrollRef.current?.scrollTo({
        x: (index - 1) * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(next);
  };

  // Slide 1 calculations:
  // Position the text comfortably in the open area below the shifted globe & clouds.
  const topSpacerHeight = Math.round(
    IMAGE_TOP_OFFSET + IMAGE_RENDERED_HEIGHT * 0.60,
  );

  // Top fade: softly and gradually blends the status bar into the open sky with an ultra-smooth easing curve.
  const topFadeHeight = Math.max(Math.round(insets.top + 125), 175);

  // Bottom fade: deeply dissolves the lower half of the image into pure white
  // behind the text, while the text layer sits in front on zIndex: 10.
  const bottomFadeHeight = Math.max(
    Math.round(IMAGE_TOP_OFFSET + IMAGE_RENDERED_HEIGHT * 0.46),
    360,
  );

  // Slide 2 calculations: image is 460×1024. The coastal road photo ends at y≈395
  // inside the image before curving down into the clean white area.
  // Pulled down to give generous breathing room below the scenic road arch.
  const slide2Scale = Math.max(SCREEN_WIDTH / 460, SCREEN_HEIGHT / 1024);
  const slide2RoadBottom = (SCREEN_HEIGHT - 1024 * slide2Scale) / 2 + 395 * slide2Scale;
  const slide2TopSpacerHeight = Math.max(
    Math.round(slide2RoadBottom + 85),
    Math.round(SCREEN_HEIGHT * 0.50),
  );

  // Slide 3 calculations: image is 460×1024. The mountain hiker photo ends at y≈385
  // inside the image before curving into the clean white area.
  // Calibrated so the title and safety features card sit gracefully
  // in the lower white space with ample clearance above the bottom controls.
  const slide3Scale = Math.max(SCREEN_WIDTH / 460, SCREEN_HEIGHT / 1024);
  const slide3ImageBottom = (SCREEN_HEIGHT - 1024 * slide3Scale) / 2 + 385 * slide3Scale;
  const slide3TopSpacerHeight = Math.max(
    Math.round(slide3ImageBottom + 20),
    Math.round(SCREEN_HEIGHT * 0.40),
  );

  const activeDotColor = C.blue;
  const inactiveDotColor = '#CBD5E1';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.scrollView}
      >
        {SLIDES.map((slide) => {
          if (slide.key === 'slide1') {
            return (
              <View key={slide.key} style={[styles.slide1Container, { width: SCREEN_WIDTH }]}>
                <Image
                  source={slide.image}
                  style={styles.slide1Image}
                  resizeMode="cover"
                />
                {/* Top fade: softly and gradually blends the sky into pure white with an ultra-smooth easing curve */}
                <LinearGradient
                  colors={[
                    '#FFFFFF',
                    '#FFFFFF',
                    'rgba(255, 255, 255, 0.77)',
                    'rgba(255, 255, 255, 0.49)',
                    'rgba(255, 255, 255, 0.27)',
                    'rgba(255, 255, 255, 0.13)',
                    'rgba(255, 255, 255, 0.05)',
                    'rgba(255, 255, 255, 0.02)',
                    'rgba(255, 255, 255, 0)',
                  ]}
                  locations={[0, 0.10, 0.20, 0.32, 0.45, 0.58, 0.70, 0.82, 1]}
                  style={[styles.topFade, { height: topFadeHeight }]}
                  pointerEvents="none"
                />
                {/* Card 1: Mountain lake (blue theme, upper-right, tilted CLOCKWISE, positioned cleanly below airplane) */}
                <Animated.View
                  style={[
                    styles.floatingCard1,
                    {
                      top: Math.round(SCREEN_HEIGHT * 0.255),
                      transform: [{ translateY: card1TranslateY }, { rotate: '14deg' }],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Image
                    source={require('@/assets/images/onboarding-globe-card.png')}
                    style={styles.floatingCard1Image}
                    resizeMode="contain"
                  />
                </Animated.View>

                {/* Card 2: Santorini sunset (golden theme, mid-left, tilted COUNTER-CLOCKWISE) */}
                <Animated.View
                  style={[
                    styles.floatingCard2,
                    {
                      top: Math.round(SCREEN_HEIGHT * 0.335),
                      transform: [{ translateY: card2TranslateY }, { rotate: '-12deg' }],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Image
                    source={require('@/assets/images/onboarding-globe-card-santorini.png')}
                    style={styles.floatingCard2Image}
                    resizeMode="contain"
                  />
                </Animated.View>

                {/* Card 3: Alpine pine forest (emerald theme, lower-right, tilted CLOCKWISE) */}
                <Animated.View
                  style={[
                    styles.floatingCard3,
                    {
                      top: Math.round(SCREEN_HEIGHT * 0.415),
                      transform: [{ translateY: card3TranslateY }, { rotate: '42deg' }],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Image
                    source={require('@/assets/images/onboarding-globe-card-forest.png')}
                    style={styles.floatingCard3Image}
                    resizeMode="contain"
                  />
                </Animated.View>

                {/* Bottom fade: deeply dissolves the lower half of the image into pure white */}
                <LinearGradient
                  colors={[
                    'rgba(255, 255, 255, 0)',
                    'rgba(255, 255, 255, 0.40)',
                    'rgba(255, 255, 255, 0.75)',
                    'rgba(255, 255, 255, 0.95)',
                    '#FFFFFF',
                    '#FFFFFF',
                  ]}
                  locations={[0, 0.20, 0.40, 0.58, 0.75, 1]}
                  style={[styles.bottomFade, { height: bottomFadeHeight }]}
                  pointerEvents="none"
                />
                <View style={styles.slide1Content} pointerEvents="box-none">
                  <View style={{ height: topSpacerHeight }} />
                  <View style={styles.slide1TextWrap}>
                    <Text style={[styles.title, fontStyles.title]}>
                      {t('onboarding.slide1Title').split('\n')[0]}
                      {'\n'}
                      <Text style={[styles.titleHighlight, fontStyles.titleHighlight]}>
                        {t('onboarding.slide1Title').split('\n')[1] || ''}
                      </Text>
                    </Text>
                    <Text style={[styles.body, fontStyles.body]}>{t('onboarding.slide1Body')}</Text>
                  </View>
                </View>
              </View>
            );
          }

          if (slide.key === 'slide2') {
            return (
              <View key={slide.key} style={[styles.slide2Container, { width: SCREEN_WIDTH }]}>
                <Image
                  source={slide.image}
                  style={styles.slide2Image}
                  resizeMode="cover"
                />
                <View style={styles.slide2Content} pointerEvents="box-none">
                  <View style={{ height: slide2TopSpacerHeight }} />
                  <View style={styles.slide1TextWrap}>
                    <Text style={[styles.title, fontStyles.title]}>
                      {t('onboarding.slide2Title').split('\n')[0]}
                      {'\n'}
                      <Text style={[styles.titleHighlight, fontStyles.titleHighlight]}>
                        {t('onboarding.slide2Title').split('\n')[1] || ''}
                      </Text>
                    </Text>
                    <Text style={[styles.body, fontStyles.body]}>{t('onboarding.slide2Body')}</Text>
                  </View>
                </View>
              </View>
            );
          }

          if (slide.key === 'slide3') {
            return (
              <View key={slide.key} style={[styles.slide3Container, { width: SCREEN_WIDTH }]}>
                <Image
                  source={slide.image}
                  style={styles.slide3Image}
                  resizeMode="cover"
                />
                <View style={styles.slide3Content} pointerEvents="box-none">
                  <View style={{ height: slide3TopSpacerHeight }} />
                  <View style={styles.slide1TextWrap}>
                    <Text style={[styles.title, fontStyles.title]}>
                      {t('onboarding.slide3Title').split('\n')[0]}
                      {'\n'}
                      <Text style={[styles.titleHighlight, fontStyles.titleHighlight]}>
                        {t('onboarding.slide3Title').split('\n')[1] || ''}
                      </Text>
                    </Text>
                    <Image
                      source={require('@/assets/images/onboarding-slide3-features.png')}
                      style={styles.slide3FeaturesImage}
                      resizeMode="contain"
                      accessibilityLabel={t('onboarding.slide3Body')}
                    />
                  </View>
                </View>
              </View>
            );
          }

          return null;
        })}
      </Animated.ScrollView>

        {/* Top Bar with Back button on subsequent screens and Skip pill on the right */}
        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          {index > 0 ? (
            <Pressable
              onPress={goBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
              style={({ pressed }) => [
                styles.backPill,
                pressed && styles.backPillPressed,
              ]}
            >
              <ArrowLeft size={18} color="#0F172A" strokeWidth={2.2} />
            </Pressable>
          ) : (
            <View style={styles.backPillPlaceholder} />
          )}

          {!isLast && (
            <Pressable
              onPress={() => finish('/')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
              style={({ pressed }) => [
                styles.skipPill,
                pressed && styles.skipPillPressed,
              ]}
            >
              <Text style={[styles.skipText, fontStyles.skip]}>{t('onboarding.skip')}</Text>
              <ChevronRight size={13} color="#64748B" strokeWidth={2.4} />
            </Pressable>
          )}
        </View>

        {/* Bottom Controls (Pagination Dots + Next Button) */}
        <View
          style={[
            styles.bottomControls,
            { paddingBottom: Math.max(insets.bottom, 20) + 28 },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.dotsRow}>
            {SLIDES.map((slide, i) => {
              const dotScale = scrollX.interpolate({
                inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
                outputRange: [1, 1.4, 1],
                extrapolate: 'clamp',
              });
              return (
                <Animated.View
                  key={slide.key}
                  style={[
                    styles.dot,
                    styles.dotShadow,
                    {
                      backgroundColor: i === index ? activeDotColor : inactiveDotColor,
                      transform: [{ scale: dotScale }],
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
              style={({ pressed }) => [
                styles.nextButtonWrapper,
                pressed && styles.nextButtonPressed,
              ]}
            >
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.nextButtonGradient,
                  { minWidth: isLast ? 220 : 180 },
                ]}
              >
                <View style={styles.nextButtonContent}>
                  <Text style={[styles.nextButtonText, fontStyles.button]}>
                    {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
                  </Text>
                  <ArrowRight size={19} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              </LinearGradient>
            </Pressable>
            {isLast && (
              <TouchableOpacity
                style={styles.guestLink}
                onPress={() => finish('/')}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.continueAsGuest')}
              >
                <Text style={[styles.guestLinkText, fontStyles.guest]}>{t('onboarding.continueAsGuest')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
    </View>
  );
}

// Pure white background matching the container and app theme.
const SLIDE1_BG = '#FFFFFF';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    elevation: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
  },
  backPillPlaceholder: {
    width: 40,
    height: 40,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  backPillPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
  },
  skipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    borderRadius: radii.pill,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 7,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  skipPillPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
  },
  skipText: {
    fontSize: fontSize.sm,
    color: '#475569',
    letterSpacing: 0.3,
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  slide1Container: {
    flex: 1,
    backgroundColor: SLIDE1_BG,
    overflow: 'hidden',
  },
  slide2Container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  slide3Container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  slide1Image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    transform: [{ translateY: -45 }],
  },
  floatingCard1: {
    position: 'absolute',
    right: 14,
    zIndex: 4,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  floatingCard1Image: {
    width: Math.min(Math.round(SCREEN_WIDTH * 0.34), 132),
    height: Math.round(Math.min(Math.round(SCREEN_WIDTH * 0.34), 132) * (697 / 1024)),
  },
  floatingCard2: {
    position: 'absolute',
    left: 12,
    zIndex: 4,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  floatingCard2Image: {
    width: Math.min(Math.round(SCREEN_WIDTH * 0.25), 98),
    height: Math.round(Math.min(Math.round(SCREEN_WIDTH * 0.25), 98) * (807 / 867)),
  },
  floatingCard3: {
    position: 'absolute',
    right: 14,
    zIndex: 4,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  floatingCard3Image: {
    width: Math.min(Math.round(SCREEN_WIDTH * 0.29), 114),
    height: Math.round(Math.min(Math.round(SCREEN_WIDTH * 0.29), 114) * (811 / 872)),
  },
  slide2Image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  slide3Image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  slide1Content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: space[6],
  },
  slide2Content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: space[6],
  },
  slide3Content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: space[6],
  },
  slide1TextWrap: {
    alignItems: 'center',
    paddingHorizontal: space[2],
  },
  slide3FeaturesImage: {
    width: Math.min(SCREEN_WIDTH - space[6] * 2, 360),
    height: Math.round(Math.min(SCREEN_WIDTH - space[6] * 2, 360) * (309 / 540)),
    marginTop: space[2],
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
    paddingTop: 60,
    paddingBottom: 130,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[8],
  },
  title: {
    fontSize: fontSize.xxl,
    color: C.text,
    textAlign: 'center',
    marginBottom: space[3],
    letterSpacing: -0.3,
  },
  titleHighlight: {
    color: C.blue,
  },
  body: {
    fontSize: fontSize.base,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: fontSize.base * 1.5,
  },
  dotsRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: space[2],
    marginBottom: space[4],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  dotShadow: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.18)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 3,
    elevation: 3,
  },
  footer: {
    paddingHorizontal: space[5],
    alignItems: 'center',
    gap: space[3],
  },
  nextButtonWrapper: {
    alignSelf: 'center',
    borderRadius: radii.pill,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  nextButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  nextButtonGradient: {
    height: 52,
    paddingHorizontal: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  nextButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  nextButtonText: {
    fontSize: fontSize.md,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  guestLink: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  guestLinkText: {
    fontSize: fontSize.sm,
    color: C.blueText,
  },
});

