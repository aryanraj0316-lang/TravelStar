// A trip/story cover photo, or an honest placeholder when there isn't one.
//
// The backend used to guess a cover from the trip's *name* and hand back a
// stock Unsplash photograph, and several screens layered their own stock
// fallback on top of that. Both presented a picture nobody on the trip had
// taken as if it were the trip's own. Now the API returns null and this
// renders a neutral gradient instead.
import React from 'react';
import { StyleSheet, Text, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { C, fontWeight } from '@/theme/tokens';

export interface CoverImageProps {
  uri?: string | null;
  /** Seeds the placeholder initial and the accessibility label. */
  name?: string;
  style?: StyleProp<ImageStyle>;
  /** Hide the initial when the cover sits behind other content. */
  showInitial?: boolean;
  /**
   * Milliseconds for expo-image's own cross-fade-in. Defaults to 150, which
   * is right for a cover that pops into an otherwise-static layout. Pass 0
   * when the image is already being moved by an external animation (e.g. a
   * slide-in carousel) — layering this fade on top of that motion is what
   * reads as a flicker once the two finish at slightly different times.
   */
  transition?: number;
}

export function CoverImage({ uri, name, style, showInitial = true, transition = 150 }: CoverImageProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={style}
        contentFit="cover"
        transition={transition}
        cachePolicy="memory-disk"
        accessibilityLabel={name}
      />
    );
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? '';
  return (
    <LinearGradient
      colors={['#2A3356', '#141A33']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.placeholder, style as StyleProp<ViewStyle>]}
    >
      {showInitial && initial ? <Text style={styles.initial}>{initial}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: C.textSec, fontSize: 28, fontWeight: fontWeight.semibold },
});
