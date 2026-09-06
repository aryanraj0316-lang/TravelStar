// This used to pick a light or dark translucent fill from useColorScheme(),
// but the app is dark-only by design (§1.3) and useColorScheme() returns
// 'light' whenever the OS has no preference set — the same bug §9.1 already
// found and fixed for ThemedText (src/theme/tokens.ts's header comment).
// That meant this card rendered as a near-opaque white glass panel with
// dark-on-dark text underneath it on any device that had never set a colour
// scheme, exactly like ThemedText's invisible-text bug. Always dark now.
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number; // unused for standard RN, but good for design systems
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
});
export default GlassCard;
