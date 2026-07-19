import React from 'react';
import { StyleSheet, View, ViewStyle, useColorScheme } from 'react-native';

interface GlassCardProps {
  children: React.ReactNode;
  style?: any;
  intensity?: number; // unused for standard RN, but good for design systems
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style }) => {
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      style={[
        styles.card,
        isDark ? styles.cardDark : styles.cardLight,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  cardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
  },
  cardDark: {
    backgroundColor: 'rgba(30, 31, 36, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
  },
});
export default GlassCard;
