import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Globe from 'lucide-react-native/icons/globe';
import FileText from 'lucide-react-native/icons/file-text';
import Shield from 'lucide-react-native/icons/shield';
import Info from 'lucide-react-native/icons/info';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';


export default function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('about.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('about.title')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Globe size={40} color={C.white} />
          </View>
          <Text style={styles.brandName}>TravelStar</Text>
          <Text style={styles.versionText}>{t('about.version')}</Text>
        </View>

        {/* Short Mission description */}
        <Card style={{ marginBottom: 24 }}>
          <Text style={styles.descriptionText}>
            {t('about.description')}
          </Text>
        </Card>

        {/* Minimal Legal Resource links */}
        <Card style={styles.legalList}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => router.push('/legal/terms')}
            accessibilityRole="button"
            accessibilityLabel={t('about.termsOfService')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FileText size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>{t('about.termsOfService')}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => router.push('/legal/privacy')}
            accessibilityRole="button"
            accessibilityLabel={t('about.privacyPolicy')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Shield size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>{t('about.privacyPolicy')}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => router.push('/licenses')}
            accessibilityRole="button"
            accessibilityLabel={t('about.thirdPartyLicenses')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Info size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>{t('about.thirdPartyLicenses')}</Text>
            </View>
          </TouchableOpacity>
        </Card>

        <Text style={styles.copyrightText}>{t('about.copyright')}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 36,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
  },
  versionText: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 4,
  },
  descriptionText: {
    fontSize: 12,
    lineHeight: 18,
    color: C.textSec,
    textAlign: 'center',
  },
  legalList: {
    padding: 0,
    marginBottom: 32,
  },
  legalRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  legalLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },
  legalDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  copyrightText: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
  },
});
