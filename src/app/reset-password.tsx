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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldAlert, ShieldCheck } from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C } from '@/theme/tokens';

// docs/REMEDIATION.md §8.1 — the other half of forgot-password.tsx. Reached
// via the app's `travelstar://` scheme as `travelstar://reset-password?token=...`
// (the token forgot-password.tsx's backend call generates — see that
// screen's header comment for why it isn't emailed yet). expo-router maps
// this file to that route automatically; `useLocalSearchParams` reads the
// token straight off the deep link's query string, same pattern as
// destination-details.tsx and stories.tsx.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 8) {
      toast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast('Passwords do not match.', 'error');
      return;
    }
    setLoading(true);
    try {
      await apiService.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      logger.warn('[ResetPassword] Request failed:', e);
      toast(errorToastMessage(e, 'Could not reset your password. The link may have expired.'), 'error');
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
              <Lock size={24} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.heroHeading}>Set a new password</Text>
            <Text style={styles.heroSub}>
              This will sign you out everywhere else, so only whoever holds this link stays in.
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {done ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color="#22C55E" style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>Password updated. Please sign in with your new password.</Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/auth')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.footerLink}>Go to Log In</Text>
                </TouchableOpacity>
              </View>
            ) : !token ? (
              <View style={styles.confirmWrap}>
                <ShieldAlert size={28} color="#F59E0B" style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>
                  This reset link is missing its token. Request a new one from the login screen.
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/forgot-password')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.footerLink}>Request a New Link</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputBox}>
                    <Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="••••••••"
                      placeholderTextColor="#7E8494"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      accessibilityLabel="New password"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Confirm New Password</Text>
                  <View style={styles.inputBox}>
                    <Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="••••••••"
                      placeholderTextColor="#7E8494"
                      secureTextEntry={!showPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      accessibilityLabel="Confirm new password"
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
                      <Text style={styles.submitBtnText}>Update Password</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </GlassCard>
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
  heroSub: { fontSize: 13, color: C.textSec, textAlign: 'center', maxWidth: 300, lineHeight: 18 },
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
  footerLink: { fontSize: 13, fontWeight: '700', color: '#60A5FA' },
});
