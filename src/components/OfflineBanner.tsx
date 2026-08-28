// NetInfo-driven offline banner (REMEDIATION.md §6.3 DoD: "Airplane mode
// produces a clear offline banner"). Mounted once at the root, above the
// navigator, so it's visible regardless of which screen is active.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnlineStatus } from '@/lib/network-status';
import { C } from '@/theme/tokens';

// Deliberately not a token: this is the one surface in the app that must
// read as an alarm rather than as part of the palette, and it sits above
// every screen (§6.3). 5.9:1 against white text.
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
    color: C.white,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
