import { Image } from 'expo-image';
import { SplashScreen, useRouter } from 'expo-router';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useApp } from '@/store/AppContext';

const DURATION = 500;

// `ready` gates the hide — without it, onLayout fires on the very
// first render (well before AppContext's session-restore hydrate effect
// resolves) and hides the splash unconditionally, producing a visible
// flash of logged-out UI before the real session state is known
// (REMEDIATION.md §7.5). Waits on AppContext's `sessionRestored` instead.
//
// A device that hasn't completed onboarding yet gets redirected to it
// while the splash is still covering the screen, so the app never flashes
// its normal tabs first — the redirect and the splash's hide both key off
// the same `sessionRestored` flip, in this one effect.
export function AnimatedSplashOverlay() {
  const { sessionRestored, hasOnboarded } = useApp();
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!sessionRestored) return;
    if (!hasOnboarded) {
      router.replace('/onboarding');
    }
    SplashScreen.hideAsync()
      .catch((e) => logger.warn('[Splash] hideAsync failed:', e))
      .finally(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: DURATION,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false);
        });
      });
  }, [sessionRestored, hasOnboarded, opacity, router]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.splashOverlay, { opacity }]}>
      <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
    </Animated.View>
  );
}

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      <View style={styles.background} />
      <View style={styles.imageContainer}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 76,
    height: 71,
  },
  background: {
    borderRadius: 40,
    backgroundColor: '#0274DF',
    width: 128,
    height: 128,
    position: 'absolute',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
