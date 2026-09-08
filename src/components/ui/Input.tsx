// docs/REMEDIATION.md §9.1 / §9.3 — a labelled text field with a real
// accessibility label, a 44pt minimum height, and OS font scaling left on.
import React from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  labelStyle?: StyleProp<TextStyle>;
  labelNumberOfLines?: number;
  /** Shown under the field in red and announced as an alert. */
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Rendered inside the field, before the text — e.g. a lucide icon. */
  icon?: React.ReactNode;
  /** Rendered inside the field, after the text — e.g. a password-visibility
   *  toggle. Wrap an icon-only control in its own Pressable with a real
   *  accessibilityLabel; this slot doesn't add one for you. */
  rightAccessory?: React.ReactNode;
}

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    labelStyle,
    labelNumberOfLines,
    error,
    hint,
    containerStyle,
    icon,
    rightAccessory,
    accessibilityLabel,
    ...rest
  },
  forwardedRef
) {
  const localRef = React.useRef<TextInput>(null);

  React.useImperativeHandle(forwardedRef, () => localRef.current as TextInput);

  const handleFocus = () => {
    localRef.current?.focus();
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text
          onPress={handleFocus}
          style={[styles.label, labelStyle]}
          numberOfLines={labelNumberOfLines}
        >
          {label}
        </Text>
      ) : null}
      <View
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleFocus}
        style={[styles.box, !!error && styles.inputError]}
      >
        {icon}
        <TextInput
          ref={localRef}
          {...rest}
          accessibilityLabel={accessibilityLabel ?? label ?? rest.placeholder}
          placeholderTextColor={C.textMuted}
          style={[styles.input, !!icon && styles.inputWithIcon]}
        />
        {rightAccessory}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space[1] },
  label: { color: C.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  box: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: space[4],
    gap: space[2],
  },
  input: {
    flex: 1,
    paddingVertical: space[3],
    color: C.text,
    fontSize: fontSize.base,
  },
  inputWithIcon: { paddingLeft: 0 },
  inputError: { borderColor: C.redText },
  error: { color: C.redText, fontSize: fontSize.xs },
  hint: { color: C.textSec, fontSize: fontSize.xs },
});
