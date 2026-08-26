import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

const C = {
  bg: '#070913',
  card: '#121524',
  border: '#1D2138',
  white: '#FFFFFF',
  textSec: '#8A92A6',
  textMuted: '#6A7182',
};

// Legal content authorship is REMEDIATION.md Phase 12 scope (Legal,
// privacy, and compliance), not Phase 8 — §8.20's job was to stop the
// "This is a mock implementation" Alert.alert() and give Terms of Service
// a real, navigable home. The text below is an honest placeholder, not
// drafted legal copy: it says what it is instead of pretending to be a
// finished document.
export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.pendingText}>
            TravelStar&apos;s Terms of Service have not been finalized yet. This
            screen is a real, working placeholder — legal content is being
            drafted and reviewed separately from this build.
          </Text>
        </View>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  pendingText: { fontSize: 13, lineHeight: 20, color: C.textSec },
});
