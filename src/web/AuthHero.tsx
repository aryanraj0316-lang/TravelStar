// Website-only brand panel for the left half of the sign-in, sign-up and
// password-reset pages. Imported only from `*.web.tsx` screens. Its copy is
// the onboarding slides' existing, already-translated text.
import { LinearGradient } from 'expo-linear-gradient';
import MessagesSquare from 'lucide-react-native/icons/messages-square';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { webDisplayFont } from '@/web/layout';

export function AuthHero() {
  const { t } = useTranslation();
  const points = [
    { Icon: MessagesSquare, title: t('onboarding.slide2Title'), body: t('onboarding.slide2Body') },
    { Icon: ShieldCheck, title: t('onboarding.slide3Title'), body: t('onboarding.slide3Body') },
  ];

  return (
    <ImageBackground
      source={require('@/assets/images/auth-hero.jpg')}
      style={styles.hero}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(6, 10, 22, 0.2)', 'rgba(6, 10, 22, 0.55)', 'rgba(6, 10, 22, 0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.brandRow}>
        <View style={styles.mark}>
          <Text style={styles.markStar}>✦</Text>
        </View>
        <Text {...webDisplayFont} style={styles.brand}>
          Yatrenzo
        </Text>
      </View>

      <View style={styles.copy}>
        <Text {...webDisplayFont} style={styles.headline}>
          {t('onboarding.slide1Title').replace(/\n/g, ' ')}
        </Text>
        <View style={styles.points}>
          {points.map(({ Icon, title, body }) => (
            <View key={title} style={styles.point}>
              <View style={styles.pointIcon}>
                <Icon size={18} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointTitle}>{title.replace(/\n/g, ' ')}</Text>
                <Text style={styles.pointBody}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 48,
    backgroundColor: '#0B1220',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  markStar: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  copy: {
    maxWidth: 520,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 54,
    lineHeight: 60,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  points: {
    marginTop: 32,
    gap: 20,
  },
  point: {
    flexDirection: 'row',
    gap: 14,
  },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  pointTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pointBody: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 3,
  },
});
