import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path,
  Defs,
  RadialGradient,
  Stop,
  Rect,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Mail from 'lucide-react-native/icons/mail';
import Lock from 'lucide-react-native/icons/lock';
import User from 'lucide-react-native/icons/user';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Check from 'lucide-react-native/icons/check';
import Compass from 'lucide-react-native/icons/compass';
import Tent from 'lucide-react-native/icons/tent';

import CircleAlert from 'lucide-react-native/icons/circle-alert';

import { useApp, UserRole } from '@/store/AppContext';
import { apiService, setTokens, ApiError } from '@/services/api';
import { errorToastMessage, showAlert, toast } from '@/lib/feedback';

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456789', '1234567890',
  'qwertyuiop', 'letmein123', 'welcome123', 'admin12345', 'iloveyou1',
  'sunshine1', 'princess1', 'football1', 'monkey1234', 'abc123456',
  'passw0rd', 'p@ssw0rd', 'qwerty1234', '111111111', 'changeme123',
]);

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

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

// ─── Deep Bluish Swallow-Tail Bookmark Ribbon ─────────────────────────────────
function BookmarkRibbon({
  width = 248,
  height = 42,
}: {
  width?: number;
  height?: number;
}) {
  const notch = 16;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="ribbonBg" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#081635" />
          <Stop offset="25%" stopColor="#0E2A68" />
          <Stop offset="65%" stopColor="#1E40AF" />
          <Stop offset="100%" stopColor="#1D4ED8" />
        </SvgLinearGradient>
      </Defs>

      {/* Swallow-tail ribbon body: fully transparent in the notch cutout */}
      <Path
        d={`M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} L ${notch} ${height / 2} Z`}
        fill="url(#ribbonBg)"
      />

      {/* Solid Top & Bottom Edge Accents */}
      <Path d={`M 0 0 L ${width} 0`} stroke="rgba(147, 197, 253, 0.45)" strokeWidth={1.5} />
      <Path d={`M 0 ${height} L ${width} ${height}`} stroke="rgba(147, 197, 253, 0.45)" strokeWidth={1.5} />

      {/* Swallow-tail notch chevron accent stroke */}
      <Path
        d={`M 0 0 L ${notch} ${height / 2} L 0 ${height}`}
        stroke="rgba(147, 197, 253, 0.75)"
        strokeWidth={1.8}
        fill="none"
      />
    </Svg>
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
  const [errors, setErrors] = useState<FieldErrors>({});

  const validateFields = (): FieldErrors => {
    const errs: FieldErrors = {};
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === 'SIGNUP') {
      const trimmedName = fullName.trim();
      if (!trimmedName) {
        errs.name = 'Please enter your full name.';
      } else if (trimmedName.length < 2) {
        errs.name = 'Full name must be at least 2 characters.';
      }
    }

    if (!trimmedEmail) {
      errs.email = 'Email address is required.';
    } else if (!emailRegex.test(trimmedEmail)) {
      errs.email = 'Please enter a valid email address (e.g. name@example.com).';
    }

    if (!password) {
      errs.password = 'Password is required.';
    } else if (mode === 'SIGNUP') {
      if (password.length < 10) {
        errs.password = 'Password must be at least 10 characters.';
      } else if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        errs.password = 'This password is too common. Please choose a stronger password.';
      }
    }

    return errs;
  };

  const handleFormSubmit = async () => {
    const validationErrors = validateFields();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    if (mode === 'LOGIN') {
      setLoading(true);
      try {
        const response = await apiService.login(email.trim(), password);
        if (!response) {
          setErrors({ password: 'Login failed — Invalid credentials.' });
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
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.code === 'INVALID_CREDENTIALS') {
            setErrors({
              password: 'Incorrect email or password. Please try again.',
            });
            return;
          }
          if (err.code === 'ACCOUNT_LOCKED') {
            setErrors({
              email: err.message || 'Too many failed attempts. Please try again in 15 minutes.',
            });
            return;
          }
          if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details)) {
            const apiErrors: FieldErrors = {};
            for (const issue of err.details as { path?: string; message?: string }[]) {
              if (issue.path?.includes('email')) apiErrors.email = issue.message;
              else if (issue.path?.includes('password')) apiErrors.password = issue.message;
            }
            if (Object.keys(apiErrors).length > 0) {
              setErrors(apiErrors);
              return;
            }
          }
        }
        toast(errorToastMessage(err, t('auth.couldNotSignIn') || 'Could not sign you in'), 'error');
      } finally {
        setLoading(false);
      }
    } else {
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
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.code === 'EMAIL_ALREADY_REGISTERED') {
            setErrors({
              email: 'An account with this email already exists. Please sign in instead.',
            });
            return;
          }
          if (err.code === 'WEAK_PASSWORD') {
            setErrors({
              password: err.message || 'Password must be at least 10 characters and secure.',
            });
            return;
          }
          if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details)) {
            const apiErrors: FieldErrors = {};
            for (const issue of err.details as { path?: string; message?: string }[]) {
              if (issue.path?.includes('name')) apiErrors.name = issue.message;
              else if (issue.path?.includes('email')) apiErrors.email = issue.message;
              else if (issue.path?.includes('password')) apiErrors.password = issue.message;
            }
            if (Object.keys(apiErrors).length > 0) {
              setErrors(apiErrors);
              return;
            }
          }
        }
        toast(errorToastMessage(err, t('auth.couldNotCreateAccount') || 'Could not create account'), 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EFF4FB" translucent={false} />

      {/* ── Top-Left Back Button ── */}
      <TouchableOpacity
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/');
          }
        }}
        style={styles.backButton}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowLeft size={20} color="#0B1E3F" strokeWidth={2.4} />
      </TouchableOpacity>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexFill}>

        {/* ── Centered Content Area (Header + Form Card) ── */}
        <View style={styles.centerContainer}>
          <View style={styles.cardColumn}>

            {/* ── HEADER AIRPLANE IMAGE WITH LOWER-LEFT FADE & TEXT ── */}
            <View style={styles.headerBanner}>
              <Image
                source={require('@/assets/images/auth-header.jpg')}
                style={styles.headerBannerImage}
                resizeMode="cover"
              />

              {/* Natural localized white fade radiating from the lower-left corner directly behind text */}
              <Svg style={styles.headerSvgFade} pointerEvents="none">
                <Defs>
                  <RadialGradient
                    id="lowerLeftFade"
                    cx="0%"
                    cy="100%"
                    r="92%"
                    rx="88%"
                    ry="92%"
                    fx="0%"
                    fy="100%"
                  >
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                    <Stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.96" />
                    <Stop offset="65%" stopColor="#FFFFFF" stopOpacity="0.70" />
                    <Stop offset="85%" stopColor="#FFFFFF" stopOpacity="0.25" />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#lowerLeftFade)" />
              </Svg>

              {/* Text on lower-left side just above the form */}
              <View style={styles.headerBottomLeftWrap} pointerEvents="none">
                <Text style={styles.headerBottomLeftTitle}>
                  {mode === 'LOGIN' ? 'Welcome back' : 'Create account'}
                </Text>
                <Text style={styles.headerBottomLeftSubtitle}>
                  {mode === 'LOGIN'
                    ? 'Sign in to access your saved trips and bookings.'
                    : 'Join 50,000+ travelers and guides across India.'}
                </Text>
              </View>
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
                  <View style={[styles.inputBox, Boolean(errors.name) && styles.inputBoxError]}>
                    <User size={15} color={errors.name ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                    <TextInput
                      placeholder="e.g. Alex Sharma"
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={(text) => {
                        setFullName(text);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      style={styles.textInput}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>
                  {errors.name ? (
                    <View style={styles.fieldErrorRow}>
                      <CircleAlert size={12} color="#DC2626" strokeWidth={2.2} />
                      <Text style={styles.fieldErrorText}>{errors.name}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputFieldLabel}>EMAIL ADDRESS</Text>
                <View style={[styles.inputBox, Boolean(errors.email) && styles.inputBoxError]}>
                  <Mail size={15} color={errors.email ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    style={styles.textInput}
                  />
                </View>
                {errors.email ? (
                  <View style={styles.fieldErrorRow}>
                    <CircleAlert size={12} color="#DC2626" strokeWidth={2.2} />
                    <Text style={styles.fieldErrorText}>{errors.email}</Text>
                  </View>
                ) : null}
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
                <View style={[styles.inputBox, Boolean(errors.password) && styles.inputBoxError]}>
                  <Lock size={15} color={errors.password ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
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
                      <Eye size={15} color={errors.password ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.password ? (
                  <View style={styles.fieldErrorRow}>
                    <CircleAlert size={12} color="#DC2626" strokeWidth={2.2} />
                    <Text style={styles.fieldErrorText}>{errors.password}</Text>
                  </View>
                ) : null}
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
          onPress={() => {
            setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN');
            setErrors({});
          }}
          style={styles.screenBookmarkTab}
          activeOpacity={0.88}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={mode === 'LOGIN' ? 'Switch to Sign Up' : 'Switch to Log In'}
        >
          <BookmarkRibbon width={248} height={42} />
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

  // ── Top-Left Floating Back Button ──
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 28 : 34,
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0B1E3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        outlineWidth: 0,
      } as any,
    }),
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
    ...Platform.select({
      web: {
        outlineWidth: 0,
        clipPath: 'polygon(16px 50%, 0% 0%, 100% 0%, 100% 100%, 0% 100%)',
        WebkitClipPath: 'polygon(16px 50%, 0% 0%, 100% 0%, 100% 100%, 0% 100%)',
        WebkitTapHighlightColor: 'transparent',
        cursor: 'pointer',
      } as any,
    }),
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
    height: 185,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0F2952',
    position: 'relative',
  },
  headerBannerImage: {
    width: '100%',
    height: '100%',
  },
  headerSvgFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  headerBottomLeftWrap: {
    position: 'absolute',
    left: 20,
    bottom: 14,
    maxWidth: '78%',
    zIndex: 10,
  },
  headerBottomLeftTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0B1E3F',
    letterSpacing: -0.4,
    marginBottom: 3,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerBottomLeftSubtitle: {
    fontSize: 11.5,
    color: '#1E293B',
    lineHeight: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  fieldErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  fieldErrorText: {
    fontSize: 10.5,
    color: '#DC2626',
    fontWeight: '500',
    flexShrink: 1,
    lineHeight: 14,
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
