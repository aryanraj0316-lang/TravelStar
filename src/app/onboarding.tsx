// First-launch onboarding: a one-time 3-slide introduction shown before the
// app's first real screen. Gated by AppContext's `hasOnboarded` (persisted
// via safeStorage — see the root layout, which redirects here before its
// splash overlay hides for a device that hasn't seen it yet) and marked
// done by `completeOnboarding()` on "Get Started"/"Skip" either one, so it
// never shows again on this device.
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Compass from 'lucide-react-native/icons/compass';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Shield from 'lucide-react-native/icons/shield';
import ArrowRight from 'lucide-react-native/icons/arrow-right';

import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { C, fontSize, fontWeight, radii, space } from '@/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  { key: 'slide1', Icon: Compass, tint: '#2563EB', tintGlow: '#DBEAFE' },
  { key: 'slide2', Icon: MessageSquare, tint: '#7C3AED', tintGlow: '#EDE9FE' },
  { key: 'slide3', Icon: Shield, tint: '#059669', tintGlow: '#D1FAE5' },
] as const;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { completeOnboarding } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  // useState (not useRef().current) — reading a ref's .current during
  // render trips react-hooks/refs; see home-screen.tsx's identical pattern.
  const [scrollX] = useState(() => new Animated.Value(0));

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
    scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_WIDTH, animated: true });
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(next);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        {!isLast && (
          <TouchableOpacity
            onPress={() => finish('/')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={[styles.iconWrap, { backgroundColor: slide.tintGlow }]}>
              <slide.Icon size={48} color={slide.tint} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>{t(`onboarding.${slide.key}Title`)}</Text>
            <Text style={styles.body}>{t(`onboarding.${slide.key}Body`)}</Text>
          </View>
        ))}
      </Animated.ScrollView>

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
                i === index ? styles.dotActive : styles.dotInactive,
                { transform: [{ scale: dotScale }] },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button
          label={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          onPress={goNext}
          fullWidth
          icon={<ArrowRight size={18} color={C.white} />}
        />
        {isLast && (
          <TouchableOpacity
            style={styles.guestLink}
            onPress={() => finish('/')}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.continueAsGuest')}
          >
            <Text style={styles.guestLinkText}>{t('onboarding.continueAsGuest')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: space[5],
    height: 44,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: C.textSec,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
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
    fontWeight: fontWeight.bold,
    color: C.text,
    textAlign: 'center',
    marginBottom: space[4],
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
    marginBottom: space[6],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  dotActive: { backgroundColor: C.blue },
  dotInactive: { backgroundColor: C.border },
  footer: {
    paddingHorizontal: space[5],
    paddingBottom: space[4],
    gap: space[3],
  },
  guestLink: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  guestLinkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: C.blueText,
  },
});
