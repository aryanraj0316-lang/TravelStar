import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setTokens } from '@/services/api';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail, Lock, User, Eye, EyeOff, ShieldCheck, Sparkles, Compass } from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { Button, Input } from '@/components/ui';
import { useApp, UserRole } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { C, space } from '@/theme/tokens';
import { errorToastMessage, showAlert, toast } from '@/lib/feedback';

const ROLES: { id: UserRole; titleKey: string; subtitleKey: string; icon: string }[] = [
  { id: 'TOURIST', titleKey: 'auth.roleTourist', subtitleKey: 'auth.roleTouristSub', icon: '🧳' },
  { id: 'GUIDE', titleKey: 'auth.roleGuide', subtitleKey: 'auth.roleGuideSub', icon: '🧭' },
  { id: 'ORGANIZER', titleKey: 'auth.roleOrganizer', subtitleKey: 'auth.roleOrganizerSub', icon: '⛺' },
  { id: 'FAMILY_TRAVELER', titleKey: 'auth.roleFamily', subtitleKey: 'auth.roleFamilySub', icon: '👨‍👩‍👧‍👦' },
];

export default function AuthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentRole, setCurrentRole, updateProfile, login, refreshTrips } = useApp();

  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('SIGNUP');
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole || 'TOURIST');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFormSubmit = async () => {
    if (mode === 'LOGIN') {
      if (!email.trim() || !password.trim()) {
        toast(t('auth.pleaseEnterEmailPassword'), 'error');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.login(email, password);
        if (!response) {
          toast(t('auth.loginFailed'), 'error');
          return;
        }
        if (response.token && response.refreshToken) {
          await setTokens(response.token, response.refreshToken);
        }
        const userObj = response.user;
        setCurrentRole(userObj.role || selectedRole);
        updateProfile(userObj);
        login();
        // Refresh trips with new token so isMyTrip is correctly computed
        setTimeout(() => refreshTrips(), 300);
        // A single-action alert was only an "OK" gate in front of the
        // navigation below; a toast says the same without blocking (§0.2.6).
        toast(t('auth.welcomeBackToast'), 'success');
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, t('auth.couldNotSignIn')), 'error');
      } finally {
        setLoading(false);
      }
    } else {
      // SIGNUP flow
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        toast(t('auth.pleaseEnterAllSignup'), 'error');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.register({
          name: fullName,
          email,
          password,
          role: selectedRole,
        });
        if (!response) {
          toast(t('auth.signupFailed'), 'error');
          return;
        }
        if (response.token && response.refreshToken) {
          await setTokens(response.token, response.refreshToken);
        }

        const userObj = response.user;
        // The server controls role assignment (every new account starts as
        // TOURIST — see backend/src/api/routes/auth.ts) regardless of what was
        // picked in the role selector above, so reflect what the server
        // actually returned rather than the client's wishful selection.
        setCurrentRole(userObj.role || selectedRole);
        updateProfile(userObj);
        login();
        // Refresh trips with new token so isMyTrip is correctly computed
        setTimeout(() => refreshTrips(), 300);

        const roleChanged = userObj.role && userObj.role !== selectedRole;
        // The role note is a real, non-obvious consequence the user needs to
        // read (their chosen role was not granted — §2.6 makes GUIDE
        // admin-only), so that case keeps a dismissible dialog. The plain
        // welcome does not, and is a toast.
        if (roleChanged) {
          await showAlert(
            t('auth.accountCreatedTitle'),
            t('auth.accountCreatedMessage'),
            t('auth.startExploring'),
          );
        } else {
          toast(t('auth.welcomeToApp'), 'success');
        }
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, t('auth.couldNotCreateAccount')), 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Top Header Navigation */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('auth.goBack')}
            >
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>

            <View style={styles.brandBadge}>
              <Compass size={18} color={C.blue} style={{ marginRight: space[1] }} />
              <Text style={styles.brandTitle}>TravelStar</Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Hero Banner Title */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[C.blue, '#0044CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconBadge}
            >
              <Sparkles size={24} color={C.white} />
            </LinearGradient>
            <Text style={styles.heroHeading}>{mode === 'LOGIN' ? t('auth.welcomeBack') : t('auth.createAccount')}</Text>
            <Text style={styles.heroSub}>
              {mode === 'LOGIN' ? t('auth.loginSub') : t('auth.signupSub')}
            </Text>
          </View>

          {/* Mode Switcher Pill */}
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'LOGIN' && styles.modeTabActive]}
              onPress={() => setMode('LOGIN')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('auth.logIn')}
              accessibilityState={{ selected: mode === 'LOGIN' }}
            >
              <Text style={[styles.modeText, mode === 'LOGIN' && styles.modeTextActive]}>{t('auth.logIn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, mode === 'SIGNUP' && styles.modeTabActive]}
              onPress={() => setMode('SIGNUP')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('auth.createAccount')}
              accessibilityState={{ selected: mode === 'SIGNUP' }}
            >
              <Text style={[styles.modeText, mode === 'SIGNUP' && styles.modeTextActive]}>{t('auth.createAccount')}</Text>
            </TouchableOpacity>
          </View>

          {/* Role Selector Section */}
          <View style={{ marginBottom: 18 }}>
            <Text style={styles.sectionTitle}>{t('auth.selectYourRole')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ROLES.map((item) => {
                const isSelected = selectedRole === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedRole(item.id)}
                    activeOpacity={0.8}
                    style={[styles.roleCard, isSelected && styles.roleCardActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(item.titleKey)}, ${t(item.subtitleKey)}`}
                    accessibilityHint={t('auth.roleSelectHint')}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>{item.icon}</Text>
                    <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>{t(item.titleKey)}</Text>
                    <Text style={styles.roleSub}>{t(item.subtitleKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Form Input Fields */}
          <GlassCard style={styles.card}>
            {mode === 'SIGNUP' && (
              <Input
                label={t('auth.fullNameLabel')}
                icon={<User size={18} color={C.textSec} />}
                placeholder={t('auth.fullNamePlaceholder')}
                value={fullName}
                onChangeText={setFullName}
                containerStyle={styles.inputWrap}
              />
            )}

            <Input
              label={t('auth.emailLabel')}
              icon={<Mail size={18} color={C.textSec} />}
              placeholder="aarav@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              containerStyle={styles.inputWrap}
            />

            <Input
              label={t('auth.passwordLabel')}
              icon={<Lock size={18} color={C.textSec} />}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              containerStyle={styles.inputWrap}
              rightAccessory={
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={18} color={C.textSec} /> : <Eye size={18} color={C.textSec} />}
                </TouchableOpacity>
              }
            />
            {mode === 'LOGIN' && (
              <TouchableOpacity
                onPress={() => router.push('/forgot-password')}
                style={styles.forgotPasswordLink}
                accessibilityRole="button"
                accessibilityLabel={t('auth.forgotPassword')}
              >
                <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>
            )}

            {/* Primary Submit Button */}
            <Button
              label={mode === 'LOGIN' ? t('auth.logIn') : t('auth.createAccount')}
              onPress={handleFormSubmit}
              loading={loading}
              fullWidth
              icon={<ShieldCheck size={20} color={C.white} />}
              style={styles.submitBtn}
              accessibilityHint={mode === 'LOGIN' ? t('auth.signsYouIn') : t('auth.createsYourAccount')}
            />

            {/* Footer Switcher */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>
                {mode === 'LOGIN' ? t('auth.noAccountYet') : t('auth.alreadyRegistered')}
              </Text>
              <TouchableOpacity
                onPress={() => setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN')}
                accessibilityRole="button"
                accessibilityLabel={mode === 'LOGIN' ? t('auth.createOneNow') : t('auth.switchToLogIn')}
              >
                <Text style={styles.footerLink}>{mode === 'LOGIN' ? t('auth.createOneNow') : t('auth.switchToLogIn')}</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
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
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.3)',
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.blueText,
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
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
  heroHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: C.white,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 22,
  },
  modeTabActive: {
    backgroundColor: C.blue,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSec,
  },
  modeTextActive: {
    color: C.white,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    marginBottom: 10,
    marginLeft: 4,
  },
  roleCard: {
    width: 140,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 10,
  },
  roleCardActive: {
    borderColor: C.blue,
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
  },
  roleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSec,
    marginBottom: 2,
  },
  roleTitleActive: {
    color: C.blueText,
  },
  roleSub: {
    fontSize: 12,
    color: C.textMuted,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  inputWrap: {
    marginBottom: 14,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },
  submitBtn: {
    marginTop: space[3],
  },
  footerWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 13,
    color: C.textSec,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: C.blueText,
  },
});
