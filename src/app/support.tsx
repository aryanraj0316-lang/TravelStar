import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  Alert,
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

  const handleSOSCall = () => {
    Alert.alert(
      '🚨 Direct SOS Hotline',
      'Are you sure you want to dial the emergency response hotline? (Mock call: +91 1800-SOS-HELP)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Emergency', onPress: () => Alert.alert('Dialing emergency hotline...') },
      ]
    );
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
          {/* Chat Support */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => Alert.alert('💬 Support Live Chat', 'Initiating live support assistant chat...')}
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
            onPress={() => Alert.alert('✉️ Email Support', 'Opening email draft to support@travelstar.app...')}
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
              <Text style={[styles.contactTitle, { color: C.rose }]}>24/7 Safety SOS Hotline</Text>
              <Text style={styles.contactSubtitle}>For urgent safety and travel emergencies</Text>
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
