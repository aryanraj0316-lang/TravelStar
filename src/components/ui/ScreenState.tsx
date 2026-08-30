// The shared four-state component set every remote-data screen uses
// (docs/REMEDIATION.md §0.2.5 / CONVENTIONS.md §6):
//
//   <ScreenLoading />  ·  <ScreenError onRetry />  ·  <ScreenEmpty />  ·  content
//
// No screen may render content while data is still undefined, and no screen
// may show a spinner forever. Before these existed, a failed fetch left the
// previous (often fabricated) data on screen and only logged a warning.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, lineHeight, radii, space } from '@/theme/tokens';
import { Button } from './Button';

interface ScreenLoadingProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string;
}

export function ScreenLoading({ label }: ScreenLoadingProps) {
  const { t } = useTranslation();
  const text = label ?? t('common.loading');
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={text}>
      <ActivityIndicator size="large" color={C.blueText} />
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

interface ScreenErrorProps {
  title?: string;
  /** Prefer the server's own `error.message` — see errorToastMessage(). */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ScreenError({ title: titleProp, message: messageProp, onRetry, retryLabel: retryLabelProp }: ScreenErrorProps) {
  const { t } = useTranslation();
  const title = titleProp ?? t('common.somethingWrong');
  const message = messageProp ?? t('common.loadFailedMessage');
  const retryLabel = retryLabelProp ?? t('common.retry');
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={[styles.glyph, styles.glyphError]}>
        <Text style={styles.glyphText}>!</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
      {onRetry ? (
        <Button
          label={retryLabel}
          onPress={onRetry}
          variant="primary"
          accessibilityHint={t('common.retriesLoadingHint')}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

interface ScreenEmptyProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ScreenEmpty({ title, message, actionLabel, onAction }: ScreenEmptyProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.glyph}>
        <Text style={styles.glyphText}>·</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.body}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[8],
    paddingHorizontal: space[5],
    gap: space[3],
    minHeight: 220,
  },
  glyph: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: space[2],
  },
  glyphError: { borderColor: C.redText },
  glyphText: { color: C.textMuted, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  title: {
    color: C.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  body: {
    color: C.textMuted,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: fontSize.base * lineHeight.normal,
    maxWidth: 320,
  },
  action: { marginTop: space[4] },
});
