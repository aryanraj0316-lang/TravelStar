import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Lock from 'lucide-react-native/icons/lock';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import ShieldCheck from 'lucide-react-native/icons/shield-check';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button, Input } from '@/components/ui';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C, MIN_TOUCH_TARGET, space } from '@/theme/tokens';

// docs/REMEDIATION.md §8.1 — the other half of forgot-password.tsx. Reached
// via the app's `travelstar://` scheme as `travelstar://reset-password?token=...`
// (the token forgot-password.tsx's backend call generates — see that
// screen's header comment for why it isn't emailed yet). expo-router maps
// this file to that route automatically; `useLocalSearchParams` reads the
// token straight off the deep link's query string, same pattern as
// destination-details.tsx and stories.tsx.
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
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
      toast(t('resetPassword.passwordTooShort'), 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast(t('resetPassword.passwordsDoNotMatch'), 'error');
      return;
    }
    setLoading(true);
    try {
      await apiService.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      logger.warn('[ResetPassword] Request failed:', e);
      toast(errorToastMessage(e, t('resetPassword.couldNotResetPassword')), 'error');
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
              accessibilityLabel={t('resetPassword.goBack')}
            >
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>
            <View style={{ width: MIN_TOUCH_TARGET }} />
          </View>

          <View style={styles.heroWrap}>
            <LinearGradient colors={[C.blue, '#0044CC']} style={styles.heroIconBadge}>
              <Lock size={24} color={C.white} />
            </LinearGradient>
            <Text style={styles.heroHeading}>{t('resetPassword.heading')}</Text>
            <Text style={styles.heroSub}>
              {t('resetPassword.sub')}
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {done ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color={C.greenText} style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>{t('resetPassword.passwordUpdated')}</Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/auth')}
                  activeOpacity={0.85}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('resetPassword.goToLogIn')}
                >
                  <Text style={styles.footerLink}>{t('resetPassword.goToLogIn')}</Text>
                </TouchableOpacity>
              </View>
            ) : !token ? (
              <View style={styles.confirmWrap}>
                <ShieldAlert size={28} color={C.star} style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>
                  {t('resetPassword.missingToken')}
                </Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/forgot-password')}
                  activeOpacity={0.85}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('resetPassword.requestNewLink')}
                >
                  <Text style={styles.footerLink}>{t('resetPassword.requestNewLink')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Input
                  label={t('resetPassword.newPasswordLabel')}
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  accessibilityLabel={t('resetPassword.newPasswordA11y')}
                  containerStyle={styles.inputWrap}
                  rightAccessory={
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? t('resetPassword.hidePassword') : t('resetPassword.showPassword')}
                    >
                      {showPassword ? <EyeOff size={18} color={C.textSec} /> : <Eye size={18} color={C.textSec} />}
                    </TouchableOpacity>
                  }
                />

                <Input
                  label={t('resetPassword.confirmPasswordLabel')}
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  accessibilityLabel={t('resetPassword.confirmPasswordA11y')}
                  containerStyle={styles.inputWrap}
                />

                <Button label={t('resetPassword.updatePassword')} onPress={handleSubmit} loading={loading} fullWidth style={styles.submitBtn} />
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
