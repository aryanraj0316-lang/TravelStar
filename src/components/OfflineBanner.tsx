// NetInfo-driven offline banner (REMEDIATION.md §6.3 DoD: "Airplane mode
// produces a clear offline banner"). Mounted once at the root, above the
// navigator, so it's visible regardless of which screen is active.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnlineStatus } from '@/lib/network-status';

// Matches the app-wide dark background used in _layout.tsx / most screens'
// local `const C = {...}` palettes — see REMEDIATION.md §0.2.7, a real
// design-token pass is Phase 9 scope, not this one.
const BANNER_BG = '#DC2626';

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.banner} accessibilityRole="alert">
        <Text style={styles.text}>You&apos;re offline — showing cached data. Some actions are queued and will send when you reconnect.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: BANNER_BG,
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
