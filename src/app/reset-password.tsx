import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldAlert, ShieldCheck } from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { Button, Input } from '@/components/ui';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C, space } from '@/theme/tokens';

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
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heroWrap}>
            <LinearGradient colors={[C.blue, '#0044CC']} style={styles.heroIconBadge}>
              <Lock size={24} color={C.white} />
            </LinearGradient>
            <Text style={styles.heroHeading}>Set a new password</Text>
            <Text style={styles.heroSub}>
              This will sign you out everywhere else, so only whoever holds this link stays in.
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {done ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color={C.greenText} style={{ marginBottom: 10 }} />
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
                <ShieldAlert size={28} color={C.star} style={{ marginBottom: 10 }} />
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
                <Input
                  label="New Password"
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  accessibilityLabel="New password"
                  containerStyle={styles.inputWrap}
                  rightAccessory={
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} color={C.textSec} /> : <Eye size={18} color={C.textSec} />}
                    </TouchableOpacity>
                  }
                />

                <Input
                  label="Confirm New Password"
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  accessibilityLabel="Confirm new password"
                  containerStyle={styles.inputWrap}
                />

                <Button label="Update Password" onPress={handleSubmit} loading={loading} fullWidth style={styles.submitBtn} />
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
  submitBtn: { marginTop: space[2] },
  confirmWrap: { alignItems: 'center', paddingVertical: 10 },
  confirmText: { fontSize: 14, color: C.white, textAlign: 'center', lineHeight: 20 },
  footerLink: { fontSize: 13, fontWeight: '700', color: C.blueText },
});
