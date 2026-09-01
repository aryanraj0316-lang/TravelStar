import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';


// Legal content authorship is REMEDIATION.md Phase 12 scope (Legal,
// privacy, and compliance), not Phase 8 — §8.20's job was to stop the
// "This is a mock implementation" Alert.alert() and give Terms of Service
// a real, navigable home. The text below is an honest placeholder, not
// drafted legal copy: it says what it is instead of pretending to be a
// finished document.
export default function TermsScreen() {
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
        <Text style={styles.headerTitle}>{t('legal.termsTitle')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card>
          <Text style={styles.pendingText}>
            {t('legal.termsPending')}
          </Text>
        </Card>
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
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  scrollContent: { padding: 16 },
  pendingText: { fontSize: 13, lineHeight: 20, color: C.textSec },
});
