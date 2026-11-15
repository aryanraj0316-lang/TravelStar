import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';
import privacyPolicy from '@/content/privacy-policy.json';


const EFFECTIVE_DATE = privacyPolicy.updated;
const SECTIONS = privacyPolicy.sections;

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('legal.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('legal.privacyTitle')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.effectiveDate}>Last updated: {EFFECTIVE_DATE}</Text>
        {SECTIONS.map((section, index) => (
          <Card key={index} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </Card>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  scrollContent: { padding: 16 },
  effectiveDate: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionCard: {
    marginBottom: 12,
    borderColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    color: C.textSec,
  },
});

