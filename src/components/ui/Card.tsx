// docs/REMEDIATION.md §9.1
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, elevation, radii, space } from '@/theme/tokens';

export interface CardProps {
  children: React.ReactNode;
  /** 'flat' drops the shadow — use inside an already-elevated surface. */
  variant?: 'raised' | 'flat';
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, variant = 'raised', style }: CardProps) {
  return <View style={[styles.card, variant === 'raised' && elevation.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: space[4],
  },
});
