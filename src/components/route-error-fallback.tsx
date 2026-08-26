// Shared fallback UI for expo-router's per-route ErrorBoundary convention
// (REMEDIATION.md §7.5): any route file can export a component named
// `ErrorBoundary` receiving `{ error, retry }`, and expo-router
// automatically wraps that route segment with it — a crash inside just
// that segment shows this fallback instead of white-screening (or, for a
// screen inside the Tabs group, taking down) the rest of the app. See the
// `export function ErrorBoundary` at the bottom of each screen/layout file
// that uses this.
//
// TODO(Phase 11 — Observability): report `error` to Sentry once it's wired
// up. For now this only logs locally via `logger.error`.
import type { ErrorBoundaryProps } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { logger } from '@/lib/logger';

export function RouteErrorFallback({ error, retry, label }: ErrorBoundaryProps & { label?: string }) {
  useEffect(() => {
    logger.error(`[ErrorBoundary${label ? ` · ${label}` : ''}] Caught a render crash:`, error);
  }, [error, label]);

  const isRoot = !label;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label ? `${label} hit a problem` : 'Something went wrong'}</Text>
      <Text style={styles.message}>{error.message || 'An unexpected error occurred.'}</Text>
      <TouchableOpacity style={styles.button} onPress={retry} activeOpacity={0.85}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
      {isRoot && Platform.OS === 'web' && (
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => window.location.reload()}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Reload app</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#060814',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButton: {
    backgroundColor: '#1A1D33',
    marginTop: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
