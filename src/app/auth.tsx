import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
  TextInput,
  Image,
  Keyboard,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
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
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { currentRole, setCurrentRole, updateProfile, login, refreshTrips } = useApp();
  const queryClient = useQueryClient();

  // Every cached query on the screen the user came from was fetched as an
  // anonymous caller. After a successful sign-in the same endpoints answer
  // differently (the feed gains the caller's own posts; notifications and
  // bookings become reachable at all), so the whole cache is invalidated —
  // only queries a mounted screen is actually observing refetch.
  const refreshAfterAuth = () => {
    refreshTrips();
    void queryClient.invalidateQueries();
  };

  const initialMode = (params.mode === 'LOGIN' || params.mode === 'SIGNUP') ? (params.mode as 'LOGIN' | 'SIGNUP') : 'SIGNUP';
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole || 'TOURIST');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const keyboardOpen = isKeyboardVisible;

  const scrollViewRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      if (passwordInputRef.current?.isFocused?.()) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 80);
      } else if (emailInputRef.current?.isFocused?.()) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: mode === 'SIGNUP' ? 220 : 160, animated: true });
        }, 80);
      } else if (nameInputRef.current?.isFocused?.()) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: 120, animated: true });
        }, 80);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [mode]);

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
        setTimeout(refreshAfterAuth, 300);
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }

        const userName = userObj.name || userObj.email?.split('@')[0] || 'Traveler';
        setTimeout(() => {
          void showAlert(
            'Signed In Successfully 🎉',
            `You are signed into the application as ${userName}. Welcome back!`,
            'Continue'
          );
        }, 150);
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
        setTimeout(refreshAfterAuth, 300);

        // As soon as the user signs up, take him directly to the profile section with setup guide
        router.replace({
          pathname: '/(tabs)/profile',
          params: { setup: 'true' },
        });

        const userName = userObj.name || fullName.trim() || userObj.email?.split('@')[0] || 'Traveler';
        const roleChanged = userObj.role && userObj.role !== selectedRole;

        setTimeout(() => {
          if (roleChanged) {
            void showAlert(
              'Account Created 🎉',
              `Welcome, ${userName}! Let's set up your profile — add a profile photo from your device and a bio to connect with travelers.`,
              'Set Up Profile'
            );
          } else {
            void showAlert(
              'Welcome to TravelStar! 🎉',
              `Welcome, ${userName}! Let's set up your profile — add a profile photo from your device and a bio to connect with travelers.`,
              'Set Up Profile'
            );
          }
        }, 150);
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

      {/* ── Top Bar with Back Button (pinned above scroll content, never overlaps form) ── */}
      <View style={styles.topBar}>
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
      </View>

      {/* Deliberately not a ScrollView: this form sits still on one
          screen. Android runs adjustResize (see AndroidManifest), so the
          window itself shrinks when the keyboard opens and the card no
          longer fits in what is left. Centred, it would overflow equally
          at the top and the bottom and clip the password field and submit
          button off the bottom - exactly the controls being reached for.
          Anchoring to the bottom while the keyboard is up moves the whole
          overflow to the TOP instead: the banner slides out of frame the
          way it would if you had scrolled, rather than vanishing in place,
          and everything from the inputs down stays on screen. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
        style={styles.flexFill}
      >
        <ScrollView
          ref={scrollViewRef}
          scrollEnabled={keyboardOpen}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            keyboardOpen && styles.scrollContentKeyboardOpen,
          ]}
        >
          <View style={styles.cardColumn}>

            {/* ── HEADER AIRPLANE IMAGE WITH LOWER-LEFT FADE & TEXT ── */}
            {/* Always full height. An earlier attempt collapsed this to
                zero while typing to free room for the keyboard; it made
                the image pop out of existence, and in Sign-Up mode it
                still was not enough height. The keyboard is handled by
                anchoring the card to the bottom instead - see
                `pageContent` in the stylesheet. */}
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
                <Text style={styles.headerBrandHeading}>TravelStar</Text>
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
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => nameInputRef.current?.focus()}
                  >
                    <Text style={styles.inputFieldLabel}>FULL NAME (USERNAME)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                      nameInputRef.current?.focus();
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({ y: 120, animated: true });
                      }, 100);
                    }}
                    style={[styles.inputBox, Boolean(errors.name) && styles.inputBoxError]}
                  >
                    <User size={16} color={errors.name ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                    <TextInput
                      ref={nameInputRef}
                      placeholder="e.g. Alex Sharma"
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={(text) => {
                        setFullName(text);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 120, animated: true });
                        }, 100);
                      }}
                      style={styles.textInput}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </TouchableOpacity>
                  {errors.name ? (
                    <View style={styles.fieldErrorRow}>
                      <CircleAlert size={12} color="#DC2626" strokeWidth={2.2} />
                      <Text style={styles.fieldErrorText}>{errors.name}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.inputGroup}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => emailInputRef.current?.focus()}
                >
                  <Text style={styles.inputFieldLabel}>EMAIL ADDRESS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    emailInputRef.current?.focus();
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: mode === 'SIGNUP' ? 220 : 160, animated: true });
                    }, 100);
                  }}
                  style={[styles.inputBox, Boolean(errors.email) && styles.inputBoxError]}
                >
                  <Mail size={16} color={errors.email ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                  <TextInput
                    ref={emailInputRef}
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
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({ y: mode === 'SIGNUP' ? 220 : 160, animated: true });
                      }, 100);
                    }}
                    style={styles.textInput}
                  />
                </TouchableOpacity>
                {errors.email ? (
                  <View style={styles.fieldErrorRow}>
                    <CircleAlert size={12} color="#DC2626" strokeWidth={2.2} />
                    <Text style={styles.fieldErrorText}>{errors.email}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.passwordLabelRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      passwordInputRef.current?.focus();
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }}
                  >
                    <Text style={styles.inputFieldLabel}>PASSWORD</Text>
                  </TouchableOpacity>
                  {mode === 'LOGIN' && (
                    <TouchableOpacity
                      onPress={() => router.push('/forgot-password')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    passwordInputRef.current?.focus();
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                  style={[styles.inputBox, Boolean(errors.password) && styles.inputBoxError]}
                >
                  <Lock size={16} color={errors.password ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                  <TextInput
                    ref={passwordInputRef}
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
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }}
                    style={styles.textInput}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={16} color="#64748B" strokeWidth={2} />
                    ) : (
                      <Eye size={16} color={errors.password ? '#EF4444' : '#94A3B8'} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
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

          {/* Reserved vertical clearance only needed when keyboard is active to keep fields clear */}
          <View style={{ height: keyboardOpen ? 120 : 0 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Deep Bluish Bookmark, pinned to the bottom-right ──
          Always mounted and always at the same offset. It used to be
          unmounted whenever the keyboard opened (`!isKeyboardVisible &&`),
          so it vanished mid-typing and popped back afterwards. It is
          absolutely positioned against the screen, so it holds its place
          instead of being shoved around by the form reflowing above it. */}
      <TouchableOpacity
          onPress={() => {
            setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN');
            setErrors({});
          }}
          style={[
            styles.screenBookmarkTab,
            { bottom: Math.max(insets.bottom, 14) + 14 },
          ]}
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

  // ── Top Navigation Bar ──
  topBar: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 50,
  },

  // ── Scroll Content Area ──
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  scrollContentKeyboardOpen: {
    paddingBottom: 170,
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

  // ── Top-Left Back Button (inside topBar) ──
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
      } as unknown as ViewStyle,
    }),
  },

  // ── Deep Bluish Bookmark Hanging Off the Screen from Right Side Below the Form ──
  screenBookmarkTab: {
    position: 'absolute',
    right: 0,
    bottom: 56,
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
      } as unknown as ViewStyle,
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
    height: 195,
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
    maxWidth: '82%',
    zIndex: 10,
  },
  headerBrandHeading: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0B1E3F',
    letterSpacing: -0.5,
    marginBottom: 2,
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerBottomLeftTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: -0.2,
    marginBottom: 2,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerBottomLeftSubtitle: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
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
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFCFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 11,
    gap: 8,
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
