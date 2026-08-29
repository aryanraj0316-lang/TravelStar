// docs/REMEDIATION.md §9.1 / §9.3 — a labelled text field with a real
// accessibility label, a 44pt minimum height, and OS font scaling left on.
import React from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Shown under the field in red and announced as an alert. */
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({ label, error, hint, containerStyle, accessibilityLabel, ...rest }: InputProps) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        accessibilityLabel={accessibilityLabel ?? label ?? rest.placeholder}
        placeholderTextColor={C.textMuted}
        style={[styles.input, !!error && styles.inputError]}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[1] },
  label: { color: C.textSec, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: C.cardAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    color: C.white,
    fontSize: fontSize.base,
  },
  inputError: { borderColor: C.redText },
  error: { color: C.redText, fontSize: fontSize.xs },
  hint: { color: C.textMuted, fontSize: fontSize.xs },
});
