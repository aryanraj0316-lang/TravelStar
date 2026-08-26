import React from 'react';
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
import {
  ArrowLeft,
  MessageSquare,
  Mail,
  PhoneCall,
  LifeBuoy,
} from 'lucide-react-native';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/feedback';

const C = {
  bg: '#070913',
  card: '#121524',
  border: '#1D2138',
  white: '#FFFFFF',
  textSec: '#8A92A6',
  textMuted: '#6A7182',
  blue: '#0066FF',
  rose: '#FF2D55',
};

export default function SupportScreen() {
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
      toast('Could not open the dialer automatically. Please dial 112 directly.', 'error');
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
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Support Greeting */}
        <View style={styles.greetingBox}>
          <LifeBuoy size={48} color={C.blue} style={{ marginBottom: 12 }} />
          <Text style={styles.greetingTitle}>How can we help you?</Text>
          <Text style={styles.greetingSubtitle}>
            Our team is available 24/7 to assist you with bookings, payments, and safety.
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
            onPress={() => toast('Live chat isn\'t available yet — email us at support@travelstar.app in the meantime.', 'info')}
            style={styles.contactCard}
          >
            <View style={styles.contactIconBg}>
              <MessageSquare size={18} color={C.blue} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactTitle}>Start Live Chat</Text>
              <Text style={styles.contactSubtitle}>Average response time: 2 minutes</Text>
            </View>
          </TouchableOpacity>

          {/* Email Support */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Linking.openURL('mailto:support@travelstar.app').catch((e) => {
              logger.warn('[Support] Failed to open mail client:', e);
              toast('Could not open your email app. Please email support@travelstar.app directly.', 'error');
            })}
            style={styles.contactCard}
          >
            <View style={styles.contactIconBg}>
              <Mail size={18} color={C.blue} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactTitle}>Email support@travelstar.app</Text>
              <Text style={styles.contactSubtitle}>Get a reply within 2 hours</Text>
            </View>
          </TouchableOpacity>

          {/* Call emergency hotline */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSOSCall}
            style={[styles.contactCard, styles.sosCardBorder]}
          >
            <View style={[styles.contactIconBg, { backgroundColor: 'rgba(255, 45, 85, 0.1)' }]}>
              <PhoneCall size={18} color={C.rose} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.contactTitle, { color: C.rose }]}>Call 112 — National Emergency Number</Text>
              <Text style={styles.contactSubtitle}>India&apos;s emergency helpline — police, ambulance, fire</Text>
            </View>
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  greetingBox: {
    alignItems: 'center',
    marginBottom: 36,
    paddingHorizontal: 12,
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
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
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.white,
  },
  contactSubtitle: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },
});
