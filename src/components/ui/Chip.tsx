// docs/REMEDIATION.md §9.1 — selectable filter pill (Chip) and static
// status label (Badge) share this file because they share the same shape.
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  /** Rendered before the label — e.g. a lucide icon. */
  icon?: React.ReactNode;
}

export function Chip({ label, selected = false, onPress, accessibilityHint, style, icon }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ selected }}
      style={[styles.chip, !!icon && styles.chipWithIcon, selected && styles.chipSelected, style]}
    >
      {icon}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  return (
    <View style={[styles.badge, badgeTones[tone], style]} accessibilityRole="text">
      <Text style={[styles.badgeLabel, badgeLabelTones[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.cardAlt,
  },
  chipWithIcon: { gap: space[2] },
  chipSelected: { backgroundColor: C.blue, borderColor: C.blue },
  label: { color: C.textSec, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  labelSelected: { color: C.white, fontWeight: fontWeight.semibold },
  badge: {
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
});

const badgeTones = StyleSheet.create({
  neutral: { backgroundColor: C.cardAlt, borderColor: C.border },
  info: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: C.blueText },
  success: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: C.greenText },
  warning: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: C.star },
  danger: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: C.redText },
});

const badgeLabelTones = StyleSheet.create({
  neutral: { color: C.textSec },
  info: { color: C.blueText },
  success: { color: C.greenText },
  warning: { color: C.star },
  danger: { color: C.redText },
});
