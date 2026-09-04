import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import classes from './animated-icon.module.css';
const DURATION = 300;

export function AnimatedSplashOverlay() {
  return null;
}

export function AnimatedIcon() {
  const [glowAnim] = useState(() => new Animated.Value(0));
  const [bgAnim] = useState(() => new Animated.Value(0));
  const [logoAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: 1,
      duration: DURATION * 4,
      easing: Easing.elastic(0.7),
      useNativeDriver: true,
    }).start();
    Animated.timing(bgAnim, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.elastic(1.2),
      useNativeDriver: true,
    }).start();
    Animated.timing(logoAnim, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.elastic(1.2),
      useNativeDriver: true,
    }).start();
  }, [glowAnim, bgAnim, logoAnim]);

  const glowRotate = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] });
  const bgScale = bgAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1.2, 1] });
  const logoScale = logoAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1.2, 1.2, 1] });

  return (
    <View style={styles.iconContainer}>
      <Animated.View
        style={[styles.glow, { opacity: glowAnim, transform: [{ rotateZ: glowRotate }, { scale: glowAnim }] }]}
      >
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View style={[styles.background, { transform: [{ scale: bgScale }] }]}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View
        style={[styles.imageContainer, { opacity: logoAnim, transform: [{ scale: logoScale }] }]}
      >
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
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
  },
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
