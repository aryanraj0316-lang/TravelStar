// docs/REMEDIATION.md §9.1 — one Button, four variants, instead of the
// ad-hoc TouchableOpacity+StyleSheet pairs each screen used to define.
// Enforces §9.3's 44×44 minimum touch target and always carries an
// accessibility role and label.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered before the label — pass a lucide icon element. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** Defaults to `label`; override when the label alone is not descriptive. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const isInert = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: isInert, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sizeSm : styles.sizeMd,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        isInert && styles.inert,
        pressed && !isInert && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? C.white : C.blueText} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, labelStyles[variant], size === 'sm' && styles.labelSm]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sizeMd: { paddingHorizontal: space[5], paddingVertical: space[3] },
  sizeSm: { paddingHorizontal: space[4], paddingVertical: space[2] },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  labelSm: { fontSize: fontSize.sm },
  inert: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: C.blue, borderColor: C.blue },
  secondary: { backgroundColor: C.cardAlt, borderColor: C.border },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  destructive: { backgroundColor: 'transparent', borderColor: C.redText },
});

const labelStyles = StyleSheet.create({
  primary: { color: C.white },
  secondary: { color: C.white },
  ghost: { color: C.blueText },
  destructive: { color: C.redText },
});
