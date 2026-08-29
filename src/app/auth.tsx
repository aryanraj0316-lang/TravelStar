import React, { useState } from 'react';
import { setTokens } from '@/services/api';
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
import { ArrowLeft, Mail, Lock, User, Eye, EyeOff, ShieldCheck, Sparkles, Compass } from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { useApp, UserRole } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { C } from '@/theme/tokens';
import { errorToastMessage, showAlert, toast } from '@/lib/feedback';

const ROLES: { id: UserRole; title: string; subtitle: string; icon: string }[] = [
  { id: 'TOURIST', title: 'Tourist', subtitle: 'Explore & Join Trips', icon: '🧳' },
  { id: 'GUIDE', title: 'Verified Guide', subtitle: 'Offer Tours & Earn', icon: '🧭' },
  { id: 'ORGANIZER', title: 'Trip Organizer', subtitle: 'Host Group Journeys', icon: '⛺' },
  { id: 'FAMILY_TRAVELER', title: 'Family Connect', subtitle: 'Midway Segment Join', icon: '👨‍👩‍👧‍👦' },
];

export default function AuthScreen() {
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
        toast('Please enter your email and password', 'error');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.login(email, password);
        if (!response) {
          toast('Login Failed ❌ — Invalid response from server.', 'error');
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
        toast('Welcome back!', 'success');
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, 'Could not sign you in. Please try again.'), 'error');
      } finally {
        setLoading(false);
      }
    } else {
      // SIGNUP flow
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        toast('Please enter your full name, email, and password', 'error');
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
          toast('Signup Failed ❌ — Invalid response from server.', 'error');
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
            'Account created',
            'Your account starts as a Tourist. Guide and Organizer access is granted after a short verification step, available from your profile.',
            'Start Exploring',
          );
        } else {
          toast('Welcome to TravelStar!', 'success');
        }
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } catch (err) {
        toast(errorToastMessage(err, 'Could not create your account. Please try again.'), 'error');
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
              <ArrowLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.brandBadge}>
              <Compass size={18} color="#0066FF" style={{ marginRight: 6 }} />
              <Text style={styles.brandTitle}>TravelStar</Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Hero Banner Title */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={['#0066FF', '#0044CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconBadge}
            >
              <Sparkles size={24} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.heroHeading}>{mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}</Text>
            <Text style={styles.heroSub}>
              {mode === 'LOGIN'
                ? 'Log in to access your trips, wallet & live chats'
                : 'Connect with 50,000+ travelers & guides across India'}
            </Text>
          </View>

          {/* Mode Switcher Pill */}
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'LOGIN' && styles.modeTabActive]}
              onPress={() => setMode('LOGIN')}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeText, mode === 'LOGIN' && styles.modeTextActive]}>Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, mode === 'SIGNUP' && styles.modeTabActive]}
              onPress={() => setMode('SIGNUP')}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeText, mode === 'SIGNUP' && styles.modeTextActive]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Role Selector Section */}
          <View style={{ marginBottom: 18 }}>
            <Text style={styles.sectionTitle}>Select Your Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ROLES.map((item) => {
                const isSelected = selectedRole === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedRole(item.id)}
                    activeOpacity={0.8}
                    style={[styles.roleCard, isSelected && styles.roleCardActive]}
                  >
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>{item.icon}</Text>
                    <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>{item.title}</Text>
                    <Text style={styles.roleSub}>{item.subtitle}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Form Input Fields */}
          <GlassCard style={styles.card}>
            {mode === 'SIGNUP' && (
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Full Name (Username)</Text>
                <View style={styles.inputBox}>
                  <User size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Aarav Sharma"
                    placeholderTextColor="#7E8494"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>
            )}

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
                />
              </View>
            </View>

            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputBox}>
                <Lock size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="#7E8494"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showPassword ? <EyeOff size={18} color="#94A3B8" /> : <Eye size={18} color="#94A3B8" />}
                </TouchableOpacity>
              </View>
              {mode === 'LOGIN' && (
                <TouchableOpacity
                  onPress={() => router.push('/forgot-password')}
                  style={styles.forgotPasswordLink}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Primary Submit Button */}
            <TouchableOpacity
              onPress={handleFormSubmit}
              disabled={loading}
              activeOpacity={0.85}
              style={{ marginTop: 10 }}
            >
              <LinearGradient
                colors={['#0066FF', '#0044CC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitBtn}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <ShieldCheck size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>{mode === 'LOGIN' ? 'Log In' : 'Create Account'}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Footer Switcher */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>
                {mode === 'LOGIN' ? "Don't have an account? " : 'Already registered? '}
              </Text>
              <TouchableOpacity onPress={() => setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN')}>
                <Text style={styles.footerLink}>{mode === 'LOGIN' ? 'Create one now' : 'Log In'}</Text>
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
    backgroundColor: '#050710',
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
    color: '#60A5FA',
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
    color: '#E2E8F0',
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
    color: '#CBD5E1',
    marginBottom: 2,
  },
  roleTitleActive: {
    color: '#60A5FA',
  },
  roleSub: {
    fontSize: 10,
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
    marginTop: 8,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#60A5FA',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSec,
    marginBottom: 6,
  },
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
  input: {
    fontSize: 14,
    color: C.white,
    flex: 1,
  },
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
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
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
    color: '#60A5FA',
  },
});
