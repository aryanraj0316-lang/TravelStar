import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import KeyRound from 'lucide-react-native/icons/key-round';
import Mail from 'lucide-react-native/icons/mail';
import ShieldCheck from 'lucide-react-native/icons/shield-check';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button, Input } from '@/components/ui';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C, MIN_TOUCH_TARGET, space } from '@/theme/tokens';

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
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast(t('forgotPassword.enterEmail'), 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.forgotPassword(email.trim());
      setSentMessage(res.message);
    } catch (e) {
      logger.warn('[ForgotPassword] Request failed:', e);
      toast(errorToastMessage(e, t('forgotPassword.couldNotSendReset')), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
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
              {t('forgotPassword.sub')}
            </Text>
          </View>

          <GlassCard style={styles.card}>
            {sentMessage ? (
              <View style={styles.confirmWrap}>
                <ShieldCheck size={28} color={C.greenText} style={{ marginBottom: 10 }} />
                <Text style={styles.confirmText}>{sentMessage}</Text>
                <TouchableOpacity
                  style={{ marginTop: 18 }}
                  onPress={() => router.replace('/auth')}
                  activeOpacity={0.85}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('forgotPassword.backToLogIn')}
                >
                  <Text style={styles.footerLink}>{t('forgotPassword.backToLogIn')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Input
                  label={t('forgotPassword.emailLabel')}
                  icon={<Mail size={18} color={C.textSec} />}
                  placeholder="aarav@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  containerStyle={styles.inputWrap}
                />

                <Button
                  label={t('forgotPassword.sendResetLink')}
                  onPress={handleSubmit}
                  loading={loading}
                  fullWidth
                  style={styles.submitBtn}
                />
              </>
            )}
          </GlassCard>

          <View style={styles.footerWrap}>
            <Text style={styles.footerText}>{t('forgotPassword.rememberedIt')}</Text>
            <TouchableOpacity
              onPress={() => router.replace('/auth')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('forgotPassword.logIn')}
            >
              <Text style={styles.footerLink}>{t('forgotPassword.logIn')}</Text>
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
  heroSub: { fontSize: 13, color: C.textSec, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  card: { padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  inputWrap: { marginBottom: 14 },
  submitBtn: { marginTop: space[2] },
  confirmWrap: { alignItems: 'center', paddingVertical: 10 },
  confirmText: { fontSize: 14, color: C.white, textAlign: 'center', lineHeight: 20 },
  footerWrap: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { fontSize: 13, color: C.textSec },
  footerLink: { fontSize: 13, fontWeight: '700', color: C.blueText },
});
