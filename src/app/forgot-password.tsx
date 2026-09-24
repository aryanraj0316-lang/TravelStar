import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import KeyRound from 'lucide-react-native/icons/key-round';
import Lock from 'lucide-react-native/icons/lock';
import Phone from 'lucide-react-native/icons/phone';
import ShieldCheck from 'lucide-react-native/icons/shield-check';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button, Input } from '@/components/ui';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { indianMobileError, normalizeIndianMobile } from '@/lib/indian-phone';
import { C, MIN_TOUCH_TARGET, space } from '@/theme/tokens';

// Password reset by a 6-digit code emailed to the address the account
// registered with. Two steps on one screen: ask for the mobile number (the
// thing people sign in with), then take the code and a new password. The
// server answers identically whether or not the number is registered, so
// this screen moves on to the code step either way and only names the
// masked address when one was actually used.

const MIN_PASSWORD_LENGTH = 10;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();

  // Going back to the login screen has to REUSE the auth screen this flow was
  // opened from, not push a second one. `router.replace` swapped this screen
  // for a fresh /auth while the original stayed underneath, so after a
  // successful sign-in the handler's `router.back()` popped the new one and
  // revealed the old sign-in screen — the user appeared to be thrown back to
  // login and had to sign in a second time.
  const goToLogin = () => {
    const state = (navigation as { getState?: () => { routes?: { name?: string }[] } | undefined }).getState?.();
    const routes = state?.routes ?? [];
    const previous = routes[routes.length - 2];
    if (previous?.name === 'auth' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/auth', params: { mode: 'LOGIN' } });
  };

  const [step, setStep] = useState<'PHONE' | 'CODE' | 'DONE'>('PHONE');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async () => {
    const problem = indianMobileError(phone);
    if (problem) {
      setPhoneError(problem);
      return;
    }
    setPhoneError(undefined);
    setLoading(true);
    try {
      const res = await apiService.forgotPassword(normalizeIndianMobile(phone) as string);
      setMaskedEmail(res.maskedEmail ?? null);
      setResendIn(res.retryAfterSeconds ?? 60);
      setStep('CODE');
    } catch (e) {
      logger.warn('[ForgotPassword] Request failed:', e);
      toast(errorToastMessage(e, t('forgotPassword.couldNotSendReset', 'Could not send the code. Please try again.')), 'error');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    let bad = false;
    if (!/^\d{6}$/.test(otp)) {
      setCodeError(t('forgotPassword.enterSixDigitCode', 'Enter the 6-digit code from your email.'));
      bad = true;
    } else {
      setCodeError(undefined);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(
        t('forgotPassword.passwordTooShort', 'Password must be at least 10 characters.'),
      );
      bad = true;
    } else if (password !== confirm) {
      setPasswordError(t('forgotPassword.passwordsDoNotMatch', 'Passwords do not match.'));
      bad = true;
    } else {
      setPasswordError(undefined);
    }
    if (bad) return;

    setLoading(true);
    try {
      await apiService.resetPassword(normalizeIndianMobile(phone) as string, otp, password);
      setStep('DONE');
    } catch (e) {
      logger.warn('[ForgotPassword] Reset failed:', e);
      const message = e instanceof Error ? e.message : '';
      if (/code|attempt/i.test(message)) setCodeError(message);
      else if (/password/i.test(message)) setPasswordError(message);
      else toast(errorToastMessage(e, t('forgotPassword.couldNotReset', 'Could not reset your password.')), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => (step === 'CODE' ? setStep('PHONE') : router.back())}
              style={styles.backBtn}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('forgotPassword.goBack')}
            >
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>
            <View style={{ width: MIN_TOUCH_TARGET }} />
          </View>

          <View style={styles.heroWrap}>
            <LinearGradient colors={[C.blue, '#0044CC']} style={styles.heroIconBadge}>
              <KeyRound size={24} color={C.white} />
            </LinearGradient>
            <Text style={styles.heroHeading}>{t('forgotPassword.heading')}</Text>
            <Text style={styles.heroSub}>
              {step === 'CODE'
                ? maskedEmail
                  ? t('forgotPassword.codeSentTo', {
                      email: maskedEmail,
                      defaultValue: 'We sent a 6-digit code to {{email}}. Enter it below with your new password.',
                    })
                  : t(
                      'forgotPassword.codeSentGeneric',
                      'If this number is registered, a 6-digit code has been sent to its email.',
                    )
                : t('forgotPassword.subPhone', 'Enter the mobile number on your account. We will email you a code.')}
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {step === 'DONE' ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color={C.greenText} style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>
                  {t('forgotPassword.resetDone', 'Your password has been reset. Log in with your new password.')}
                </Text>
                <Button
                  label={t('forgotPassword.logIn')}
                  onPress={goToLogin}
                  fullWidth
                  style={styles.submitBtn}
                />
              </View>
            ) : step === 'PHONE' ? (
              <>
                <Input
                  label={t('forgotPassword.phoneLabel', 'Mobile number')}
                  icon={<Phone size={18} color={C.textSec} />}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  maxLength={16}
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    if (phoneError) setPhoneError(undefined);
                  }}
                  error={phoneError}
                  containerStyle={styles.inputWrap}
                />
                <Button
                  label={t('forgotPassword.sendCode', 'Send code')}
                  onPress={requestCode}
                  loading={loading}
                  fullWidth
                  style={styles.submitBtn}
                />
              </>
            ) : (
              <>
                <Input
                  label={t('forgotPassword.codeLabel', '6-digit code')}
                  icon={<ShieldCheck size={18} color={C.textSec} />}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(v) => {
                    setOtp(v.replace(/\D/g, ''));
                    if (codeError) setCodeError(undefined);
                  }}
                  error={codeError}
                  containerStyle={styles.inputWrap}
                />
                <Input
                  label={t('forgotPassword.newPasswordLabel', 'New password')}
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••••"
                  secureTextEntry
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (passwordError) setPasswordError(undefined);
                  }}
                  containerStyle={styles.inputWrap}
                />
                <Input
                  label={t('forgotPassword.confirmPasswordLabel', 'Confirm new password')}
                  icon={<Lock size={18} color={C.textSec} />}
                  placeholder="••••••••••"
                  secureTextEntry
                  value={confirm}
                  onChangeText={(v) => {
                    setConfirm(v);
                    if (passwordError) setPasswordError(undefined);
                  }}
                  error={passwordError}
                  containerStyle={styles.inputWrap}
                />
                <Button
                  label={t('forgotPassword.resetPassword', 'Reset password')}
                  onPress={submitReset}
                  loading={loading}
                  fullWidth
                  style={styles.submitBtn}
                />
                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={requestCode}
                  disabled={resendIn > 0 || loading}
                  accessibilityRole="button"
                >
                  <Text style={[styles.footerLink, resendIn > 0 && styles.resendDisabled]}>
                    {resendIn > 0
                      ? t('forgotPassword.resendIn', { seconds: resendIn, defaultValue: 'Resend code in {{seconds}}s' })
                      : t('forgotPassword.resendCode', 'Resend code')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </GlassCard>

          {step !== 'DONE' && (
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>{t('forgotPassword.rememberedIt')}</Text>
              <TouchableOpacity
                onPress={goToLogin}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('forgotPassword.logIn')}
              >
                <Text style={styles.footerLink}>{t('forgotPassword.logIn')}</Text>
              </TouchableOpacity>
            </View>
          )}
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
    paddingVertical: 12,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: { alignItems: 'center', marginBottom: 24 },
  heroIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroHeading: { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 6, textAlign: 'center' },
  heroSub: { fontSize: 13, color: C.textSec, textAlign: 'center', maxWidth: 300, lineHeight: 18 },
  card: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  inputWrap: { marginBottom: 14 },
  submitBtn: { marginTop: space[2] },
  confirmWrap: { alignItems: 'center', paddingVertical: 10 },
  confirmText: { fontSize: 14, color: C.white, textAlign: 'center', lineHeight: 20 },
  resendBtn: { alignSelf: 'center', marginTop: 16, paddingVertical: 6 },
  resendDisabled: { color: C.textMuted },
  footerWrap: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 4 },
  footerText: { fontSize: 13, color: C.textSec },
  footerLink: { fontSize: 13, fontWeight: '700', color: C.blueText },
});
