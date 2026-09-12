// docs/REMEDIATION.md §9.1. Uses expo-image so avatars get the disk cache
// and a transition rather than re-downloading on every list render (§9.5).
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { C, fontWeight, radii } from '@/theme/tokens';

export interface AvatarProps {
  uri?: string | null;
  /** Used for the initials fallback and the accessibility label. */
  name: string;
  size?: number;
  /** Applied to the rendered image or the initials fallback. */
  style?: StyleProp<ImageStyle>;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function Avatar({ uri, name, size = 40, style }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: radii.pill };
  const label = `Profile picture of ${name}`;
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [uri]);

  if (!uri || hasError) {
    return (
      <View style={[styles.fallback, dimension, style as StyleProp<ViewStyle>]} accessibilityRole="image" accessibilityLabel={label}>
        <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[dimension, style]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={label}
      onError={() => setHasError(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  initials: { color: C.textSec, fontWeight: fontWeight.semibold },
});
