import { Image } from 'expo-image';
import { SplashScreen, useRouter, usePathname } from 'expo-router';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

import { useApp } from '@/store/AppContext';

// Short fade: during it the screen underneath is partly visible, which is
// what read as 'the home screen appears behind the splash'.
const DURATION = 250;

// A square box, sized off the SHORTER screen edge so it fits whole in any
// orientation, at 64% so the logo reads large without touching the edges.
const SPLASH_LOGO_SIZE = (() => {
  const { width, height } = Dimensions.get('window');
  return Math.round(Math.min(width, height) * 0.64);
})();

// `ready` gates the hide — without it, onLayout fires on the very
// first render (well before AppContext's session-restore hydrate effect
// resolves) and hides the splash unconditionally, producing a visible
// flash of logged-out UI before the real session state is known
// (REMEDIATION.md §7.5). Waits on AppContext's `sessionRestored` instead.
//
// A device that hasn't completed onboarding yet gets redirected to it
// while the splash is still covering the screen, so the app never flashes
// its normal tabs first.
//
// Redirecting and uncovering used to happen in the same effect, one after
// the other. `router.replace` is not synchronous, though: the home tabs are
// the initial route and stay mounted while the navigation is dispatched, so
// the overlay began fading over HOME and onboarding only painted partway
// through the 500ms fade — a visible flash of the home screen right before
// onboarding. The uncover now waits for the redirect to actually land,
// watching the pathname rather than assuming.
const REDIRECT_FALLBACK_MS = 2500;
// The splash must actually be seen. Session restore can finish in a few
// hundred milliseconds, and hiding the moment it does made the logo flash
// past or never appear at all.
const MIN_VISIBLE_MS = 1400;

export function AnimatedSplashOverlay() {
  const { sessionRestored, hasOnboarded } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  // Escape hatch: if the redirect never lands (a route error, say), the
  // splash must not sit there forever hiding a working app.
  const [redirectTimedOut, setRedirectTimedOut] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeDone(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  const awaitingOnboarding = sessionRestored && !hasOnboarded;
  const onOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding');
  const coveredUntil = awaitingOnboarding && !onOnboarding && !redirectTimedOut;

  useEffect(() => {
    if (!sessionRestored || hasOnboarded) return;
    router.replace('/onboarding');
    const timer = setTimeout(() => setRedirectTimedOut(true), REDIRECT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [sessionRestored, hasOnboarded, router]);

  useEffect(() => {
    if (!sessionRestored || coveredUntil || !minTimeDone) return;
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
  }, [sessionRestored, coveredUntil, minTimeDone, opacity]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.splashOverlay, { opacity }]}>
      <Image
        style={styles.splashLogo}
        source={require('@/assets/images/icon.png')}
        contentFit="contain"
      />
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
  // White, matching the native splash window, so the handover from the
  // OS splash to this overlay is invisible — no colour flash between them.
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  // The logo is square and shown whole: `contain` inside a square box, so
  // no edge is ever cropped, whatever the screen's aspect ratio.
  splashLogo: {
    width: SPLASH_LOGO_SIZE,
    height: SPLASH_LOGO_SIZE,
  },
});
