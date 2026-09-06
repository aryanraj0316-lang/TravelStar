import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Mail from 'lucide-react-native/icons/mail';
import PhoneCall from 'lucide-react-native/icons/phone-call';
import LifeBuoy from 'lucide-react-native/icons/life-buoy';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/feedback';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';


export default function SupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // Dials India's real national emergency number (docs/REMEDIATION.md
  // §8.9 — the previous version popped an Alert claiming to dial a
  // "TravelStar SOS Hotline" that didn't exist, then popped a second Alert
  // pretending it had placed a call. A non-functional emergency button is
  // a safety hazard and a store-rejection risk. No confirmation step: an
  // SOS control should minimize friction, not add a tap before a real call
  // in an actual emergency.
  const handleSOSCall = () => {
    Linking.openURL('tel:112').catch((e) => {
      logger.warn('[Support] Failed to open the phone dialer:', e);
      toast(t('support.couldNotOpenDialer'), 'error');
    });
  };

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
          accessibilityLabel={t('support.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('support.title')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Support Greeting */}
        <View style={styles.greetingBox}>
          <LifeBuoy size={48} color={C.blue} style={{ marginBottom: 12 }} />
          <Text style={styles.greetingTitle}>{t('support.greeting')}</Text>
          <Text style={styles.greetingSubtitle}>
            {t('support.greetingSub')}
          </Text>
        </View>

        {/* Minimal Support Channels */}
        <View style={styles.contactContainer}>
          {/* Chat Support — no live-chat vendor is integrated yet (a real
              build here needs picking one, e.g. Intercom/Zendesk); honest
              about that instead of the previous Alert.alert that silently
              no-ops on web and claimed a chat had started. */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toast(t('support.liveChatNotAvailable'), 'info')}
            accessibilityRole="button"
            accessibilityLabel={t('support.startLiveChat')}
          >
            <Card style={styles.contactCard}>
              <View style={styles.contactIconBg}>
                <MessageSquare size={18} color={C.blue} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.contactTitle}>{t('support.startLiveChat')}</Text>
                <Text style={styles.contactSubtitle}>{t('support.startLiveChatSub')}</Text>
              </View>
            </Card>
          </TouchableOpacity>

          {/* Email Support */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Linking.openURL('mailto:support@travelstar.app').catch((e) => {
              logger.warn('[Support] Failed to open mail client:', e);
              toast(t('support.couldNotOpenMail'), 'error');
            })}
            accessibilityRole="button"
            accessibilityLabel={t('support.emailUs')}
          >
            <Card style={styles.contactCard}>
              <View style={styles.contactIconBg}>
                <Mail size={18} color={C.blue} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.contactTitle}>{t('support.emailUs')}</Text>
                <Text style={styles.contactSubtitle}>{t('support.emailUsSub')}</Text>
              </View>
            </Card>
          </TouchableOpacity>

          {/* Call emergency hotline */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSOSCall}
            accessibilityRole="button"
            accessibilityLabel={t('support.callEmergency')}
          >
            <Card style={[styles.contactCard, styles.sosCardBorder]}>
              <View style={[styles.contactIconBg, { backgroundColor: 'rgba(255, 45, 85, 0.1)' }]}>
                <PhoneCall size={18} color={C.rose} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.contactTitle, { color: C.rose }]}>{t('support.callEmergency')}</Text>
                <Text style={styles.contactSubtitle}>{t('support.callEmergencySub')}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        </View>

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
    color: C.text,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 36,
  },
  greetingBox: {
    alignItems: 'center',
    marginBottom: 36,
    paddingHorizontal: 12,
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  contactContainer: {
    gap: 12,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sosCardBorder: {
    borderColor: 'rgba(255, 45, 85, 0.25)',
  },
  contactIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },
  contactSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
});
