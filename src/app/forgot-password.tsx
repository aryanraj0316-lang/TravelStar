import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C } from '@/theme/tokens';

// docs/REMEDIATION.md §8.1: apiService.forgotPassword/resetPassword existed
// on the client and the backend routes were fully built (token hashing,
// expiry, session revocation on reset, account-enumeration protection —
// see backend/src/api/routes/auth.ts) but nothing in the UI ever called
// them: there was no "Forgot password?" link anywhere. This screen is that
// missing link. It shows the server's own message verbatim rather than
// writing a second copy — the server deliberately returns the same message
// whether or not the email is registered, and duplicating that text here
// would risk it drifting out of sync with the real enumeration-safe wording.
//
// One honest limitation: the backend has no email provider wired up yet
// (see the TODO in that route) — the reset token is logged server-side, not
// emailed. So this screen completes the flow the doc asked for; whether a
// real user can act on it depends on Phase 11/12 email infra that doesn't
// exist yet. reset-password.tsx is the other half, reached via a
// travelstar://reset-password?token=... deep link once that token reaches
// the user by some channel.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast('Enter the email address on your account.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.forgotPassword(email.trim());
      setSentMessage(res.message);
    } catch (e) {
      logger.warn('[ForgotPassword] Request failed:', e);
      toast(errorToastMessage(e, 'Could not send the reset request. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heroWrap}>
            <LinearGradient colors={['#0066FF', '#0044CC']} style={styles.heroIconBadge}>
              <KeyRound size={24} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.heroHeading}>Reset your password</Text>
            <Text style={styles.heroSub}>
              Enter the email on your account and we&apos;ll start a password reset for it.
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {sentMessage ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color="#22C55E" style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>{sentMessage}</Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/auth')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.footerLink}>Back to Log In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputBox}>
                    <Mail size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={styles.input}
                      placeholder="aarav@example.com"
                      placeholderTextColor="#7E8494"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={setEmail}
                      accessibilityLabel="Email address"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={{ marginTop: 6 }}
                >
                  <LinearGradient colors={['#0066FF', '#0044CC']} style={styles.submitBtn}>
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>Send Reset Link</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </GlassCard>

          <View style={styles.footerWrap}>
            <Text style={styles.footerText}>Remembered it? </Text>
            <TouchableOpacity onPress={() => router.replace('/auth')}>
              <Text style={styles.footerLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050710' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroWrap: { alignItems: 'center', marginBottom: 24 },
  heroIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  heroHeading: { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 6, textAlign: 'center' },
  heroSub: { fontSize: 13, color: C.textSec, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  card: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  inputWrap: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: C.textSec, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: { fontSize: 14, color: C.white, flex: 1 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  confirmWrap: { alignItems: 'center', paddingVertical: 10 },
  confirmText: { fontSize: 14, color: '#E2E8F0', textAlign: 'center', lineHeight: 20 },
  footerWrap: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { fontSize: 13, color: C.textSec },
  footerLink: { fontSize: 13, fontWeight: '700', color: '#60A5FA' },
});
