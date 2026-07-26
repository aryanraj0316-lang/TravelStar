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
  Globe,
  FileText,
  Shield,
  Info,
} from 'lucide-react-native';

const C = {
  bg: '#070913',
  card: '#121524',
  border: '#1D2138',
  white: '#FFFFFF',
  textSec: '#8A92A6',
  textMuted: '#6A7182',
  blue: '#0066FF',
  cyan: '#00D1FF',
};

export default function AboutScreen() {
  const router = useRouter();

  const handleLegalLink = (title: string) => {
    Alert.alert(
      title,
      `This is a mock implementation of the ${title}. In a production release, this would open the official document.`,
      [{ text: 'OK' }]
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
        <Text style={styles.headerTitle}>About TravelStar</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Globe size={40} color={C.white} />
          </View>
          <Text style={styles.brandName}>TravelStar</Text>
          <Text style={styles.versionText}>Version 1.4.2</Text>
        </View>

        {/* Short Mission description */}
        <View style={styles.card}>
          <Text style={styles.descriptionText}>
            TravelStar is a unified travel companion designed to organize group trips, track shared expenses, hire verified local guides, and ensure traveler safety with an active SOS network.
          </Text>
        </View>

        {/* Minimal Legal Resource links */}
        <View style={styles.legalList}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => handleLegalLink('Terms of Service')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FileText size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>Terms of Service</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => handleLegalLink('Privacy Policy')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Shield size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>Privacy Policy</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.legalRow}
            onPress={() => handleLegalLink('Licenses')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Info size={16} color={C.textSec} style={{ marginRight: 10 }} />
              <Text style={styles.legalLabelText}>Third-Party Licenses</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.copyrightText}>© 2026 TravelStar Technologies Pvt Ltd</Text>

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
    fontSize: 11,
    color: C.textSec,
    marginTop: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 24,
  },
  descriptionText: {
    fontSize: 12,
    lineHeight: 18,
    color: C.textSec,
    textAlign: 'center',
  },
  legalList: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 32,
  },
  legalRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    fontSize: 9,
    color: C.textMuted,
    textAlign: 'center',
  },
});
