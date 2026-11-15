import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function AuthModeBookmark({ label, action }: { label: string; action: string }) {
  return (
    <View style={styles.ribbon}>
      <Svg width="100%" height="100%" viewBox="0 0 268 56" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="authBookmark" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#081635" />
            <Stop offset="100%" stopColor="#1D4ED8" />
          </LinearGradient>
        </Defs>
        <Path d="M0 0 H268 V56 H0 L16 28 Z" fill="url(#authBookmark)" stroke="#93C5FD" strokeWidth={1} />
      </Svg>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.action}>{action} →</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: { minHeight: 56, paddingVertical: 10, paddingLeft: 28, paddingRight: 16, justifyContent: 'center', alignItems: 'center' },
  label: { color: '#BFDBFE', fontSize: 12, textAlign: 'center' },
  action: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 2 },
});
