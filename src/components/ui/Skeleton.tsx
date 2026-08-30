// docs/REMEDIATION.md §9.1 — the loading placeholder for content that has a
// known shape. Prefer this over a bare spinner in lists.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { C, radii, space } from '@/theme/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = radii.sm, style }: SkeletonProps) {
  const pulse = useState(() => new Animated.Value(0.4))[0];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius, opacity: pulse }, style]}
    />
  );
}

/** A stack of Skeleton lines shaped like a typical list card. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={120} borderRadius={radii.md} />
      <Skeleton width="60%" height={18} />
      <Skeleton width="40%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: C.cardAlt },
  card: { gap: space[3], padding: space[4] },
});
