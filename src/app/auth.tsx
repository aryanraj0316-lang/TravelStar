import React, { useState } from 'react';
import { safeStorage } from '@/services/storage';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Compass,
} from 'lucide-react-native';

import GlassCard from '@/components/ui/GlassCard';
import { useApp, UserRole } from '@/store/AppContext';
import { apiService } from '@/services/api';

const ROLES: Array<{ id: UserRole; title: string; subtitle: string; icon: string }> = [
  { id: 'TOURIST', title: 'Tourist', subtitle: 'Explore & Join Trips', icon: '🧳' },
  { id: 'GUIDE', title: 'Verified Guide', subtitle: 'Offer Tours & Earn', icon: '🧭' },
  { id: 'ORGANIZER', title: 'Trip Organizer', subtitle: 'Host Group Journeys', icon: '⛺' },
  { id: 'FAMILY_TRAVELER', title: 'Family Connect', subtitle: 'Midway Segment Join', icon: '👨‍👩‍👧‍👦' },
];

export default function AuthScreen() {
  const router = useRouter();
  const { currentRole, setCurrentRole, updateProfile, login } = useApp();

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
        Alert.alert('Required', 'Please enter your email and password');
        return;
      }
      setLoading(true);
      try {
        const response = await apiService.login(email, password);
        if (!response) {
          Alert.alert('Login Failed ❌', 'Invalid response from server.');
          return;
        }
        if (response.token) {
          await safeStorage.setItem('userToken', response.token);
        }
        const userObj = response.user;
        setCurrentRole(userObj.role || selectedRole);
        updateProfile(userObj);
        login();
        Alert.alert('Welcome Back! 👋', 'Logged in successfully', [
          { text: 'Continue', onPress: () => router.replace('/') },
        ]);
      } catch (err: any) {
        Alert.alert('Login Failed ❌', err?.message || 'An error occurred during login.');
      } finally {
        setLoading(false);
      }
    } else {
      // SIGNUP flow
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        Alert.alert('Required', 'Please enter your full name, email, and password');
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
          Alert.alert('Signup Failed ❌', 'Invalid response from server.');
          return;
        }
        if (response.token) {
          await safeStorage.setItem('userToken', response.token);
        }

        const userObj = response.user;
        setCurrentRole(selectedRole);
        updateProfile(userObj);
        login();

        Alert.alert('Account Created 🎉', 'Welcome to TravelConnect India!', [
          { text: 'Start Exploring', onPress: () => router.replace('/') },
        ]);
      } catch (err: any) {
        Alert.alert('Signup Failed ❌', err?.message || 'An error occurred during registration.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Header Navigation */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.8}
            >
              <ArrowLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.brandBadge}>
              <Compass size={18} color="#0066FF" style={{ marginRight: 6 }} />
              <Text style={styles.brandTitle}>TravelConnect</Text>
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
            <Text style={styles.heroHeading}>
              {mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}
            </Text>
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
              <Text style={[styles.modeText, mode === 'LOGIN' && styles.modeTextActive]}>
                Log In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, mode === 'SIGNUP' && styles.modeTabActive]}
              onPress={() => setMode('SIGNUP')}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeText, mode === 'SIGNUP' && styles.modeTextActive]}>
                Create Account
              </Text>
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
                    <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>
                      {item.title}
                    </Text>
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
                    placeholderTextColor="#64748B"
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
                  placeholderTextColor="#64748B"
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
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#94A3B8" />
                  ) : (
                    <Eye size={18} color="#94A3B8" />
                  )}
                </TouchableOpacity>
              </View>
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
                    <Text style={styles.submitBtnText}>
                      {mode === 'LOGIN' ? 'Log In' : 'Create Account'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Footer Switcher */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerText}>
                {mode === 'LOGIN' ? "Don't have an account? " : 'Already registered? '}
              </Text>
              <TouchableOpacity
                onPress={() => setMode(mode === 'LOGIN' ? 'SIGNUP' : 'LOGIN')}
              >
                <Text style={styles.footerLink}>
                  {mode === 'LOGIN' ? 'Create one now' : 'Log In'}
                </Text>
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
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  heroHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    color: '#94A3B8',
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
    backgroundColor: '#0066FF',
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeTextActive: {
    color: '#FFFFFF',
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
    borderColor: '#0066FF',
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
    color: '#64748B',
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
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
    color: '#FFFFFF',
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
  },
});
