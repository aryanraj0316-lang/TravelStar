import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TextInput,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Mail from 'lucide-react-native/icons/mail';
import Lock from 'lucide-react-native/icons/lock';
import User from 'lucide-react-native/icons/user';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Check from 'lucide-react-native/icons/check';
import Compass from 'lucide-react-native/icons/compass';
import Tent from 'lucide-react-native/icons/tent';

import { useApp, UserRole } from '@/store/AppContext';
import { apiService, setTokens } from '@/services/api';
import { errorToastMessage, showAlert, toast } from '@/lib/feedback';

// ─── Branded Origami Plane Logo ──────────────────────────────────────────
function OrigamiLogo({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M6 24L42 6L26 42L20 28L6 24Z" fill="#2563EB" />
      <Path d="M20 28L42 6L26 42L20 28Z" fill="#1D4ED8" />
      <Path d="M20 28L26 42L32 32L20 28Z" fill="#60A5FA" />
    </Svg>
  );
}

// ─── Deep Bluish Bookmark Ribbon with Moving Splash Sheen (Left to Right) ─────
function FlashingBookmarkRibbon({
  width = 248,
  height = 42,
  sweepAnim,
}: {
  width?: number;
  height?: number;
  sweepAnim: Animated.Value;
}) {
  const notch = 16;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          overflow: 'hidden',
          // @ts-ignore: web clip-path for true transparent swallow-tail notch
          clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 16px 50%)',
        },
      ]}
    >
      {/* Deep Bluish Base Gradient */}
      <LinearGradient
        colors={['#081635', '#0E2A68', '#1E40AF', '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Moving Splash Sheen traveling from left to entire right */}
      <Animated.View
        style={{
          position: 'absolute',
          top: -16,
          bottom: -16,
          width: 100,
          transform: [{ translateX: sweepAnim }, { rotate: '20deg' }],
        }}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            'rgba(56, 189, 248, 0)',
            'rgba(56, 189, 248, 0.45)',
            'rgba(255, 255, 255, 0.95)',
            'rgba(96, 165, 250, 0.55)',
            'rgba(29, 78, 216, 0)',
          ]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Swallow-tail notch cut out on the left edge */}
      <Svg
        width={notch + 2}
        height={height}
        viewBox={`0 0 ${notch + 2} ${height}`}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 4 }}
        pointerEvents="none"
      >
        <Path d={`M 0 0 L ${notch} ${height / 2} L 0 ${height} L 0 0 Z`} fill="#EFF4FB" />
        <Path
          d={`M 0 0 L ${notch} ${height / 2} L 0 ${height}`}
          stroke="rgba(147, 197, 253, 0.65)"
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>

      {/* Clean Solid Top and Bottom Borders (no dashed lines) */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1.2,
          backgroundColor: 'rgba(147, 197, 253, 0.45)',
          zIndex: 5,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 1.2,
          backgroundColor: 'rgba(147, 197, 253, 0.45)',
          zIndex: 5,
        }}
        pointerEvents="none"
      />
    </View>
  );
}

// ─── Tourist Backpacker Icon ────────────────────────────────────
function TouristIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      <Path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <Path d="M4 11h2v6H4z" />
      <Path d="M18 11h2v6h-2z" />
    </Svg>
  );
}

interface RoleOption {
  id: UserRole;
  title: string;
  subtitle: string;
  IconComponent: React.ComponentType<{ color: string }>;
}

const ROLES: RoleOption[] = [
  {
    id: 'TOURIST',
    title: 'Tourist',
    subtitle: 'Explore & Join Trips',
    IconComponent: TouristIcon,
  },
  {
    id: 'GUIDE',
    title: 'Verified Guide',
    subtitle: 'Offer Tours & Earn',
    IconComponent: ({ color }) => <Compass size={18} color={color} strokeWidth={2} />,
  },
  {
    id: 'ORGANIZER',
    title: 'Trip Host',
    subtitle: 'Host & Manage Journeys',
    IconComponent: ({ color }) => <Tent size={18} color={color} strokeWidth={2} />,
  },
];

export default function AuthScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { currentRole, setCurrentRole, updateProfile, login, refreshTrips } = useApp();

  const initialMode = (params.mode === 'LOGIN' || params.mode === 'SIGNUP') ? (params.mode as 'LOGIN' | 'SIGNUP') : 'SIGNUP';
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole || 'TOURIST');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Looping sweep animation for the deep bluish bookmark's moving splash effect
  const sweepAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    let isMounted = true;
    const runSweep = () => {
      if (!isMounted) return;
      sweepAnim.setValue(-120);
      Animated.sequence([
        Animated.timing(sweepAnim, {
          toValue: 298,
          duration: 1650,
          useNativeDriver: true,
        }),
        Animated.delay(450),
      ]).start((result) => {
        if (isMounted && result.finished) {
          runSweep();
        }
      });
    };
    runSweep();

    return () => {
      isMounted = false;
      sweepAnim.stopAnimation();
    };
  }, [sweepAnim]);

  const handleFormSubmit = async () => {
    if (mode === 'LOGIN') {
      if (!email.trim() || !password.trim()) {
        toast(t('auth.pleaseEnterEmailPassword') || 'Please enter your email and password', 'error');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.login(email.trim(), password);
        if (!response) {
          toast(t('auth.loginFailed') || 'Login Failed — Invalid credentials', 'error');
          return;
        }
        if (response.token && response.refreshToken) {
          await setTokens(response.token, response.refreshToken);
        }
        const userObj = response.user;
        setCurrentRole(userObj.role || selectedRole);
        updateProfile(userObj);
        login();
        setTimeout(() => refreshTrips(), 300);
        toast(t('auth.welcomeBackToast') || 'Welcome back!', 'success');
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, t('auth.couldNotSignIn') || 'Could not sign you in'), 'error');
      } finally {
        setLoading(false);
      }
    } else {
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        toast(t('auth.pleaseEnterAllSignup') || 'Please enter all details', 'error');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.register({
          name: fullName.trim(),
          email: email.trim(),
          password,
          role: selectedRole,
        });
        if (!response) {
          toast(t('auth.signupFailed') || 'Signup failed. Please try again.', 'error');
          return;
        }
        if (response.token && response.refreshToken) {
          await setTokens(response.token, response.refreshToken);
        }

        const userObj = response.user;
        setCurrentRole(userObj.role || selectedRole);
        updateProfile(userObj);
        login();
        setTimeout(() => refreshTrips(), 300);

        const roleChanged = userObj.role && userObj.role !== selectedRole;
        if (roleChanged) {
          await showAlert(
            t('auth.accountCreatedTitle') || 'Account Created',
            t('auth.roleAssignedNotice', { grantedRole: userObj.role }) || `Account created with role ${userObj.role}`,
            t('common.ok') || 'OK'
          );
        } else {
          toast(t('auth.accountCreatedToast') || 'Account created successfully!', 'success');
        }

        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, t('auth.couldNotCreateAccount') || 'Could not create account'), 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EFF4FB" translucent={false} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexFill}>

        {/* ── Centered Content Area (Header + Form Card) ── */}
        <View style={styles.centerContainer}>
          <View style={styles.cardColumn}>

            {/* ── HEADER AIRPLANE IMAGE ── */}
            <View style={styles.headerBanner}>
              <Image
                source={require('@/assets/images/auth-header.jpg')}
                style={styles.headerBannerImage}
                resizeMode="cover"
              />
            </View>

            {/* ── MAIN ELEVATED WHITE FORM CARD ── */}
            <View style={styles.formCard}>
              {/* Role Selection Header */}
              <View style={styles.roleHeaderWrap}>
                <Text style={styles.roleSectionTitle}>Select Your Role</Text>
                <Text style={styles.roleSectionSub}>
                  Choose how you want to explore or contribute to our travel community.
                </Text>
              </View>

              {/* 3 Role Selection Cards */}
              <View style={styles.rolesRow}>
                {ROLES.map((role) => {
                  const isSelected = selectedRole === role.id;
                  const IconComp = role.IconComponent;

                  return (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => setSelectedRole(role.id)}
                      activeOpacity={0.85}
                      style={[
                        styles.roleCard,
                        isSelected ? styles.roleCardSelected : styles.roleCardUnselected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${role.title}, ${role.subtitle}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {isSelected && (
                        <View style={styles.checkBadge}>
                          <Check size={9} color="#FFFFFF" strokeWidth={3.5} />
                        </View>
                      )}

                      <View
                        style={[
                          styles.roleIconCircle,
                          isSelected
                            ? styles.roleIconCircleSelected
                            : styles.roleIconCircleUnselected,
                        ]}
                      >
                        <IconComp color={isSelected ? '#0B63E5' : '#475569'} />
                      </View>

                      <Text
                        style={[
                          styles.roleCardTitle,
                          isSelected && styles.roleCardTitleSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {role.title}
                      </Text>
                      <Text style={styles.roleCardSubtitle} numberOfLines={2}>
                        {role.subtitle}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Input Fields */}
              {mode === 'SIGNUP' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputFieldLabel}>FULL NAME (USERNAME)</Text>
                  <View style={styles.inputBox}>
                    <User size={15} color="#94A3B8" strokeWidth={2} />
                    <TextInput
                      placeholder="e.g. Alex Sharma"
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={setFullName}
                      style={styles.textInput}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>EMAIL ADDRESS</Text>
                <View style={styles.inputBox}>
                  <Mail size={15} color="#94A3B8" strokeWidth={2} />
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.inputFieldLabel}>PASSWORD</Text>
                  {mode === 'LOGIN' && (
                    <TouchableOpacity
                      onPress={() => router.push('/forgot-password')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputBox}>
                  <Lock size={15} color="#94A3B8" strokeWidth={2} />
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    style={styles.textInput}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                  >
                    {showPassword ? (
                      <EyeOff size={15} color="#64748B" strokeWidth={2} />
                    ) : (
                      <Eye size={15} color="#94A3B8" strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Primary Action Button */}
              <View style={styles.submitBtnWrap}>
                <TouchableOpacity
                  onPress={handleFormSubmit}
                  disabled={loading}
                  activeOpacity={0.88}
                  style={[styles.submitButton, loading && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'LOGIN' ? 'Log In' : 'Create Account'}
                >
                  <LinearGradient
                    colors={['#0B63E5', '#1D4ED8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
                  />
                  <Text style={styles.submitButtonText}>
                    {loading
                      ? 'Processing…'
                      : mode === 'LOGIN'
                      ? 'Sign In →'
                      : 'Create Account →'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Terms & Privacy Notice */}
              <View style={styles.disclaimerWrap}>
                <Text style={styles.disclaimerText}>
                  By continuing, you agree to our{' '}
                  <Text
                    style={styles.disclaimerLink}
                    onPress={() => router.push('/legal/terms')}
                  >
                    Terms
                  </Text>
                  {' & '}
                  <Text
                    style={styles.disclaimerLink}
                    onPress={() => router.push('/legal/privacy')}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>

          </View>
        </View>

        {/* ── Deep Bluish Bookmark Hanging off the Right Side Below the Form ── */}
        <TouchableOpacity
          onPress={() => setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN')}
          style={styles.screenBookmarkTab}
          activeOpacity={0.88}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={mode === 'LOGIN' ? 'Switch to Sign Up' : 'Switch to Log In'}
        >
          <FlashingBookmarkRibbon width={248} height={42} sweepAnim={sweepAnim} />
          <View style={styles.bookmarkContent}>
            <Text style={styles.bookmarkLabel}>
              {mode === 'LOGIN' ? "Don't have an account? " : 'Already have an account? '}
            </Text>
            <Text style={styles.bookmarkAction}>
              {mode === 'LOGIN' ? 'Sign Up' : 'Log In'} →
            </Text>
          </View>
        </TouchableOpacity>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF4FB',
  },
  flexFill: {
    flex: 1,
  },

  // ── Centered Main Container ──
  centerContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  cardColumn: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    shadowColor: '#0B1E3F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },

  // ── Deep Bluish Bookmark Hanging Off the Screen from Right Side Below the Form ──
  screenBookmarkTab: {
    position: 'absolute',
    right: 0,
    bottom: 24,
    width: 248,
    height: 42,
    zIndex: 99,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: -3, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },
  bookmarkContent: {
    width: 248,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 22,
    paddingRight: 14,
  },
  bookmarkLabel: {
    fontSize: 11,
    color: '#BFDBFE',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bookmarkAction: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Header Airplane Image Banner ──
  headerBanner: {
    width: '100%',
    height: 180,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0F2952',
  },
  headerBannerImage: {
    width: '100%',
    height: '100%',
  },

  // ── Elevated White Form Card ──
  formCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopColor: '#F1F5F9',
  },

  // ── Role Header ──
  roleHeaderWrap: {
    marginBottom: 8,
  },
  roleSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  roleSectionSub: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 13,
    marginTop: 1,
  },

  // ── Role Cards Row ──
  rolesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  roleCard: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 72,
  },
  roleCardSelected: {
    backgroundColor: '#F0F6FF',
    borderWidth: 1.5,
    borderColor: '#0B63E5',
  },
  roleCardUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0B63E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  roleIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  roleIconCircleSelected: {
    backgroundColor: '#DBEAFE',
  },
  roleIconCircleUnselected: {
    backgroundColor: '#F1F5F9',
  },
  roleCardTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 1,
  },
  roleCardTitleSelected: {
    color: '#0F172A',
  },
  roleCardSubtitle: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 10.5,
  },

  // ── Input Fields ──
  inputGroup: {
    marginBottom: 8,
  },
  inputFieldLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  forgotPasswordText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#0B63E5',
  },
  inputBox: {
    height: 37,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFCFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    gap: 7,
  },
  textInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    height: '100%',
    fontWeight: '500',
  },

  // ── Primary Button ──
  submitBtnWrap: {
    marginTop: 3,
    marginBottom: 7,
  },
  submitButton: {
    height: 39,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#0B63E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Disclaimer ──
  disclaimerWrap: {
    alignItems: 'center',
  },
  disclaimerText: {
    fontSize: 8.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 12,
  },
  disclaimerLink: {
    color: '#0B63E5',
    fontWeight: '600',
  },
});
