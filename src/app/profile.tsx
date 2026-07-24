import GlassCard from '@/components/ui/GlassCard';
import { useApp, UserRole } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  Coins,
  Compass,
  Download,
  Globe,
  HelpCircle,
  History,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  PhoneCall,
  Plus,
  QrCode,
  Settings,
  Share2,
  Shield,
  Sliders,
  Sparkles,
  User,
  Wallet,
  X
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Safe dynamic import to prevent native app crash if module is unlinked in old APK
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  ImagePicker = null;
}

// Mock Trip History Data
const TRIP_HISTORY = [
  {
    id: 'BOOK-98421',
    title: 'Ranchi to Vrindavan Spiritual Tour',
    route: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    date: '12 Aug 2026 - 17 Aug 2026',
    status: 'UPCOMING',
    seats: 2,
    amount: 17000,
    ticketCode: 'TS-VRN-98421',
    meetingPoint: 'Ranchi Junction Platform 1',
    organizer: 'Vikram Singh',
    image: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=500&q=80',
  },
  {
    id: 'BOOK-84192',
    title: 'Leh-Ladakh High Altitude Bike Expedition',
    route: ['Delhi', 'Manali', 'Leh', 'Pangong'],
    date: '10 Jun 2026 - 20 Jun 2026',
    status: 'COMPLETED',
    seats: 1,
    amount: 16500,
    ticketCode: 'TS-LEH-84192',
    meetingPoint: 'Delhi Aerocity Metro Gate 2',
    organizer: 'Rajesh Kumar',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80',
  },
  {
    id: 'BOOK-72104',
    title: 'Kerala Backwaters & Tea Gardens Escape',
    route: ['Kochi', 'Munnar', 'Alleppey'],
    date: '15 Jan 2026 - 20 Jan 2026',
    status: 'COMPLETED',
    seats: 2,
    amount: 30000,
    ticketCode: 'TS-KRL-72104',
    meetingPoint: 'Kochi Airport Terminal 1',
    organizer: 'Ananya Nair',
    image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=500&q=80',
  },
];

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
];

export default function ProfileScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const {
    currentRole,
    setCurrentRole,
    profile,
    updateProfile,
    walletTransactions,
    addWalletFunds,
    withdrawWalletFunds,
  } = useApp();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'HISTORY' | 'WALLET' | 'DASHBOARD' | 'SETTINGS'>('DETAILS');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UPCOMING' | 'COMPLETED'>('ALL');

  // Input states
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');

  // Guide dashboard states
  const [hourlyRate, setHourlyRate] = useState('350');
  const [dailyRate, setDailyRate] = useState('2200');

  // Edit Profile Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAvatar, setEditAvatar] = useState(profile.avatar || AVATAR_PRESETS[0]);
  const [editName, setEditName] = useState(profile.name || 'Aarav Sharma');
  const [editGender, setEditGender] = useState(profile.gender || 'Male');
  const [editBio, setEditBio] = useState('Backpacker & Mountain Enthusiast 🏔️ | Exploring Incredible India 🇮🇳');
  const [editPhone, setEditPhone] = useState('+91 98765 43210');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('+91 98111 22334');
  const [editLanguages, setEditLanguages] = useState('Hindi, English, Punjabi');
  const [editStyles, setEditStyles] = useState('Mountains, Backpacking, Photography');

  // Device image pickers
  const pickImageFromDevice = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== 'function') {
        Alert.alert('Notice', 'Photo gallery module is initializing or requires restarting Expo dev client.');
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert('Permission Required', 'Permission to access photo gallery is required to select photos from your device.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Notice', 'Photo gallery selection error: ' + (err?.message || 'Please try again.'));
    }
  };

  const takePhotoWithCamera = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestCameraPermissionsAsync !== 'function') {
        Alert.alert('Notice', 'Camera module is initializing or requires restarting Expo dev client.');
        return;
      }
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult?.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to capture a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Notice', 'Camera selection error: ' + (err?.message || 'Please try again.'));
    }
  };

  // Ticket Modal state
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  // Settings Toggles
  const [pushNotifications, setPushNotifications] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);

  // Handlers
  const handleAadhaarVerify = () => {
    if (aadhaarInput.length !== 12) {
      Alert.alert('Invalid Aadhaar', 'Aadhaar must be a 12-digit number.');
      return;
    }
    updateProfile({ aadhaarStatus: 'PENDING' });
    setTimeout(() => {
      updateProfile({ aadhaarStatus: 'VERIFIED', isVerified: true });
      Alert.alert('Verification Success', 'Your profile is now verified. Verified badge added!');
    }, 1500);
  };

  const handleApplyGuideLicense = () => {
    updateProfile({ guideLicenseStatus: 'PENDING' });
    setTimeout(() => {
      updateProfile({ guideLicenseStatus: 'VERIFIED' });
      Alert.alert('License Approved', 'Your tour guide license is verified.');
    }, 1500);
  };

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      Alert.alert('Required Field', 'Profile Name cannot be empty.');
      return;
    }
    updateProfile({ name: editName, avatar: editAvatar, gender: editGender });
    setShowEditModal(false);
    Alert.alert('✨ Profile Saved', 'Your profile details, gender & photo have been updated successfully.');
  };

  const handleShareProfile = () => {
    Alert.alert('🔗 Share Profile', 'Profile link copied to clipboard! (https://travelstar.app/u/aarav_sharma)');
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of TravelStar?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => router.replace('/') },
    ]);
  };

  const filteredHistory = TRIP_HISTORY.filter((item) => {
    if (historyFilter === 'ALL') return true;
    return item.status === historyFilter;
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: isDark ? '#080A14' : '#F4F6FB' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ════════════════════════════════════════════════
            HERO COVER PHOTO BANNER & PROFILE CARD
            ════════════════════════════════════════════════ */}
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1000&q=80' }}
            style={styles.coverImage}
          />
          <LinearGradient
            colors={['rgba(8,10,20,0.2)', 'rgba(8,10,20,0.92)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Top-Right Action Column: Notification, Edit (Pencil), Share */}
          <View style={styles.topRightActionCol}>
            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.push('/notifications')}
            >
              <Bell size={17} color="#FFF" />
              <View style={styles.topNotifDot} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setShowEditModal(true)}
            >
              <Pencil size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleShareProfile}
            >
              <Share2 size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeaderContent}>
            {/* Sleek Dual-Ring Floating Halo Avatar (Alpine Glacier Teal & Forest Emerald) */}
            <View style={styles.avatarHaloContainer}>
              <LinearGradient
                colors={['#00F2FE', '#06B6D4', '#10B981', '#3B82F6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradientRing}
              >
                <View style={styles.avatarInnerGap}>
                  <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                </View>
              </LinearGradient>
            </View>

            <View style={styles.nameSection}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{profile.name}</Text>
                {profile.isVerified && (
                  <CheckCircle size={18} color="#00D1FF" fill="#00D1FF" style={{ marginLeft: 6 }} />
                )}
              </View>

              <Text style={styles.userHandle}>@aarav_traveler • 📍 New Delhi, India</Text>

              <View style={styles.roleCap}>
                <Sparkles size={11} color="#FFB300" />
                <Text style={styles.roleCapText}>{currentRole.replace('_', ' ')}</Text>
              </View>

              <Text style={styles.userBio} numberOfLines={2}>
                {editBio}
              </Text>
            </View>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            STATS COUNTER ROW
            ════════════════════════════════════════════════ */}
        <View style={[styles.statsRow, { backgroundColor: isDark ? '#111424' : '#FFFFFF', borderColor: isDark ? '#1D2138' : '#E2E8F0' }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: isDark ? '#FFF' : '#0F172A' }]}>14</Text>
            <Text style={styles.statLabel}>Trips Taken</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#0066FF' }]}>4.95 ⭐</Text>
            <Text style={styles.statLabel}>Traveler Score</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>₹{profile.walletBalance.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>Wallet Cash</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{profile.rewardPoints}</Text>
            <Text style={styles.statLabel}>Star Points</Text>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            5-TAB NAVIGATION BAR
            ════════════════════════════════════════════════ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionTabs}
        >
          {[
            { key: 'DETAILS', label: 'Overview', Icon: User },
            { key: 'HISTORY', label: 'Trip History', Icon: History },
            { key: 'SETTINGS', label: 'Settings', Icon: Settings },
            { key: 'WALLET', label: 'Wallet', Icon: Wallet },
            { key: 'DASHBOARD', label: 'Dashboard', Icon: Compass },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.7}
                style={[
                  styles.tabButton,
                  isActive && styles.tabButtonActive,
                  !isActive && { backgroundColor: isDark ? '#111424' : '#E2E8F0' },
                ]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <tab.Icon size={14} color={isActive ? '#FFF' : (isDark ? '#94A3B8' : '#64748B')} />
                <Text style={[styles.tabText, isActive ? styles.tabTextActive : { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ════════════════════════════════════════════════
            TAB 1: OVERVIEW & DETAILS
            ════════════════════════════════════════════════ */}
        {activeTab === 'DETAILS' && (
          <View style={styles.tabContentContainer}>
            {/* Profile Completion Bar */}
            <GlassCard style={styles.innerCard}>
              <View style={styles.completionHeaderRow}>
                <View>
                  <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Profile Completion</Text>
                  <Text style={styles.completionSub}>Complete verification to unlock verified travel badges</Text>
                </View>
                <Text style={styles.completionPercent}>85%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: '85%' }]} />
              </View>
            </GlassCard>

            {/* Identity Verification (Aadhaar) */}
            <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
              <View style={styles.cardHeaderRow}>
                <Shield size={18} color="#0066FF" />
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginLeft: 8 }]}>
                  IDENTITY VERIFICATION (AADHAAR)
                </Text>
              </View>

              {profile.aadhaarStatus === 'VERIFIED' ? (
                <View style={styles.verifiedRow}>
                  <CheckCircle size={20} color="#10B981" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.verifiedMsg}>Aadhaar Identity Verified ✅</Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
                      Verified badge active on all public bookings & chat channels
                    </Text>
                  </View>
                </View>
              ) : profile.aadhaarStatus === 'PENDING' ? (
                <View style={styles.pendingRow}>
                  <Text style={{ fontSize: 13, fontStyle: 'italic', color: '#F59E0B' }}>
                    ⏳ Aadhaar Verification Pending Review (Takes ~2 mins)...
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 10 }}>
                    Enter your 12-digit Aadhaar number to obtain official traveler verification badge:
                  </Text>
                  <TextInput
                    placeholder="1234 5678 9012"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.textInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                    value={aadhaarInput}
                    onChangeText={setAadhaarInput}
                  />
                  <TouchableOpacity style={styles.verifyBtn} onPress={handleAadhaarVerify}>
                    <Text style={styles.verifyBtnText}>Submit Aadhaar Verification</Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>

            {/* Traveler Preferences */}
            <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
              <View style={styles.cardHeaderRow}>
                <Globe size={18} color="#F59E0B" />
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginLeft: 8 }]}>
                  TRAVEL PREFERENCES & STYLES
                </Text>
              </View>

              <View style={styles.prefGridItem}>
                <Text style={styles.prefLabel}>Gender</Text>
                <Text style={[styles.prefVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{editGender}</Text>
              </View>
              <View style={styles.prefGridItem}>
                <Text style={styles.prefLabel}>Languages Spoken</Text>
                <Text style={[styles.prefVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{editLanguages}</Text>
              </View>
              <View style={styles.prefGridItem}>
                <Text style={styles.prefLabel}>Adventure Styles</Text>
                <Text style={[styles.prefVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{editStyles}</Text>
              </View>
              <View style={styles.prefGridItem}>
                <Text style={styles.prefLabel}>Contact Mobile</Text>
                <Text style={[styles.prefVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{editPhone}</Text>
              </View>
              <View style={styles.prefGridItem}>
                <Text style={styles.prefLabel}>Emergency SOS Contact</Text>
                <Text style={[styles.prefVal, { color: '#EF4444' }]}>{editEmergencyPhone}</Text>
              </View>
            </GlassCard>
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 2: TRIP HISTORY & BOOKINGS
            ════════════════════════════════════════════════ */}
        {activeTab === 'HISTORY' && (
          <View style={styles.tabContentContainer}>
            {/* Sub-filter chips */}
            <View style={styles.historyFilterRow}>
              {['ALL', 'UPCOMING', 'COMPLETED'].map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setHistoryFilter(f as any)}
                  style={[
                    styles.historyFilterChip,
                    historyFilter === f && styles.historyFilterChipActive,
                    historyFilter !== f && { backgroundColor: isDark ? '#111424' : '#E2E8F0' },
                  ]}
                >
                  <Text style={[styles.historyFilterText, historyFilter === f && styles.historyFilterTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* List of bookings */}
            {filteredHistory.map((trip) => (
              <GlassCard key={trip.id} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <Image source={{ uri: trip.image }} style={styles.historyImage} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.statusBadgeRow}>
                      <View style={[
                        styles.statusPill,
                        trip.status === 'UPCOMING' ? { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' } : { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }
                      ]}>
                        <Text style={[styles.statusPillText, { color: trip.status === 'UPCOMING' ? '#3B82F6' : '#10B981' }]}>
                          {trip.status}
                        </Text>
                      </View>
                      <Text style={styles.bookingIdText}>{trip.id}</Text>
                    </View>

                    <Text style={[styles.historyTitle, { color: isDark ? '#FFF' : '#0F172A' }]} numberOfLines={1}>
                      {trip.title}
                    </Text>
                    <Text style={styles.historyDate}>{trip.date}</Text>
                  </View>
                </View>

                {/* Route Diagram */}
                <View style={styles.routeDiagramRow}>
                  {trip.route.map((city, idx) => (
                    <React.Fragment key={city}>
                      <Text style={[styles.routeCityText, { color: '#0066FF' }]}>{city}</Text>
                      {idx < trip.route.length - 1 && (
                        <Text style={{ color: isDark ? '#64748B' : '#94A3B8', marginHorizontal: 4 }}>➔</Text>
                      )}
                    </React.Fragment>
                  ))}
                </View>

                <View style={styles.historyFooter}>
                  <View>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Total Paid ({trip.seats} seats)</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#10B981' }}>₹{trip.amount.toLocaleString('en-IN')}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.viewTicketBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedTicket(trip);
                      setShowTicketModal(true);
                    }}
                  >
                    <QrCode size={14} color="#FFF" />
                    <Text style={styles.viewTicketBtnText}>View Digital Ticket</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 3: WALLET & TRANSACTIONS
            ════════════════════════════════════════════════ */}
        {activeTab === 'WALLET' && (
          <View style={styles.tabContentContainer}>
            <GlassCard style={styles.walletCard}>
              <View style={styles.walletRow}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', letterSpacing: 1 }}>WALLET BALANCE</Text>
                  <Text style={[styles.balanceText, { color: isDark ? '#FFF' : '#0F172A' }]}>
                    ₹{profile.walletBalance.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.rewardsBox}>
                  <Coins size={16} color="#F59E0B" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#F59E0B', marginLeft: 4 }}>
                    {profile.rewardPoints} pts
                  </Text>
                </View>
              </View>

              <View style={styles.walletActions}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    placeholder="Enter amount"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.walletInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                    value={fundingAmount}
                    onChangeText={setFundingAmount}
                  />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      const val = parseFloat(fundingAmount);
                      if (val > 0) {
                        addWalletFunds(val);
                        setFundingAmount('');
                        Alert.alert('Success', `Added ₹${val} to your wallet.`);
                      }
                    }}
                  >
                    <ArrowUpRight size={14} color="#FFF" />
                    <Text style={styles.actionBtnText}>Add Cash</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <TextInput
                    placeholder="Enter amount"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.walletInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                    value={withdrawalAmount}
                    onChangeText={setWithdrawalAmount}
                  />
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => {
                      const val = parseFloat(withdrawalAmount);
                      if (val > 0) {
                        withdrawWalletFunds(val);
                        setWithdrawalAmount('');
                        Alert.alert('Success', `Withdrew ₹${val} to your bank account.`);
                      }
                    }}
                  >
                    <ArrowDownLeft size={14} color="#FFF" />
                    <Text style={styles.actionBtnText}>Withdraw</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GlassCard>

            <Text style={[styles.transactionsHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              TRANSACTION HISTORY
            </Text>

            {walletTransactions.map((tx) => (
              <GlassCard key={tx.id} style={styles.txItem}>
                <View style={styles.txRow}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFF' : '#0F172A' }}>{tx.remark}</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{tx.date}</Text>
                  </View>
                  <Text
                    style={{ fontSize: 14, fontWeight: '700', color: tx.amount > 0 ? '#10B981' : '#EF4444' }}
                  >
                    {tx.amount > 0 ? `+₹${tx.amount}` : `-₹${Math.abs(tx.amount)}`}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 4: ROLE DASHBOARD
            ════════════════════════════════════════════════ */}
        {activeTab === 'DASHBOARD' && (
          <View style={styles.tabContentContainer}>
            {/* Role selection switcher */}
            <GlassCard style={styles.innerCard}>
              <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 8 }]}>ACTIVE ROLE SUITE</Text>
              <View style={styles.roleChipsWrap}>
                {(['TOURIST', 'GUIDE', 'ORGANIZER', 'FAMILY_TRAVELER', 'ADMIN'] as UserRole[]).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setCurrentRole(r)}
                    style={[
                      styles.roleChip,
                      currentRole === r && styles.roleChipActive,
                      currentRole !== r && { backgroundColor: isDark ? '#1A1D30' : '#E2E8F0' },
                    ]}
                  >
                    <Text style={[styles.roleChipText, currentRole === r && styles.roleChipTextActive]}>
                      {r.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </GlassCard>

            {/* 1. GUIDE DASHBOARD */}
            {currentRole === 'GUIDE' && (
              <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>GUIDE DASHBOARD</Text>
                <View style={styles.dashboardMetricRow}>
                  <View style={styles.metricItem}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Active Bookings</Text>
                    <Text style={[styles.metricValue, { color: isDark ? '#FFF' : '#0F172A' }]}>4 Tours</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Guide Rating</Text>
                    <Text style={[styles.metricValue, { color: '#F59E0B' }]}>4.95 ⭐</Text>
                  </View>
                </View>

                <View style={styles.priceSettings}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFF' : '#0F172A', marginBottom: 8 }}>Set Your Charges</Text>
                  <View style={styles.rateInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Hourly Rate (₹)</Text>
                      <TextInput
                        style={[styles.textInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                        value={hourlyRate}
                        onChangeText={setHourlyRate}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.label}>Daily Rate (₹)</Text>
                      <TextInput
                        style={[styles.textInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                        value={dailyRate}
                        onChangeText={setDailyRate}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>

                {profile.guideLicenseStatus === 'VERIFIED' ? (
                  <View style={styles.verifiedRow}>
                    <CheckCircle size={20} color="#10B981" />
                    <Text style={styles.verifiedMsg}>Official Guide License Verified</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.verifyBtn} onPress={handleApplyGuideLicense}>
                    <Text style={styles.verifyBtnText}>Verify Guide License</Text>
                  </TouchableOpacity>
                )}
              </GlassCard>
            )}

            {/* 2. ORGANIZER DASHBOARD */}
            {currentRole === 'ORGANIZER' && (
              <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>ORGANIZER DASHBOARD</Text>

                <View style={styles.dashboardMetricRow}>
                  <View style={styles.metricItem}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Groups Run</Text>
                    <Text style={[styles.metricValue, { color: isDark ? '#FFF' : '#0F172A' }]}>8 Groups</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Active Members</Text>
                    <Text style={[styles.metricValue, { color: '#0066FF' }]}>42 Members</Text>
                  </View>
                </View>

                <View style={styles.organizerActions}>
                  <TouchableOpacity style={styles.dashboardBtn} onPress={() => router.push('/create')}>
                    <Plus size={16} color="#FFF" />
                    <Text style={styles.dashboardBtnText}>Create Group Tour</Text>
                  </TouchableOpacity>
                   <TouchableOpacity style={[styles.dashboardBtn, { backgroundColor: '#F59E0B' }]} onPress={() => router.push('/create')}>
                    <Sliders size={16} color="#FFF" />
                    <Text style={styles.dashboardBtnText}>Custom Trip Studio</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}

            {/* 3. FAMILY CONNECT DASHBOARD */}
            {currentRole === 'FAMILY_TRAVELER' && (
              <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>FAMILY CONNECT</Text>
                <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 12 }}>
                  Discover safe verified family groups traveling through cities near your family.
                </Text>

                <View style={styles.familyInfoCard}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0066FF' }}>Live Segment Tracking</Text>
                  <Text style={{ fontSize: 11, marginTop: 4, color: isDark ? '#CBD5E1' : '#334155' }}>
                    Ranchi → Delhi tour group is at stop "Delhi" today. If you are in Delhi, you can request to join Vrindavan segment next!
                  </Text>
                </View>
              </GlassCard>
            )}

            {/* 4. ADMIN CONTROL PANEL */}
            {currentRole === 'ADMIN' && (
              <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>ADMIN CONTROL PANEL</Text>

                <View style={styles.adminGrid}>
                  <View style={styles.adminCell}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Platform Revenue</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#10B981' }}>₹1,24,500</Text>
                  </View>
                  <View style={styles.adminCell}>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>Total Bookings</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#0066FF' }}>1,024</Text>
                  </View>
                </View>

                <View style={styles.adminActions}>
                  <TouchableOpacity style={styles.dashboardBtn} onPress={() => Alert.alert('Guide Verification', 'No pending guides.')}>
                    <CheckCircle size={16} color="#FFF" />
                    <Text style={styles.dashboardBtnText}>Pending Guides (0)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dashboardBtn, { backgroundColor: '#EF4444' }]} onPress={() => Alert.alert('System Logs', 'Zero security threats reported.')}>
                    <Shield size={16} color="#FFF" />
                    <Text style={styles.dashboardBtnText}>Security Logs</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}

            {/* 5. TOURIST DASHBOARD */}
            {currentRole === 'TOURIST' && (
              <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>TOURIST SUITE</Text>
                <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 12 }}>
                  Manage tickets, passes, and quick actions.
                </Text>

                <View style={styles.bookingStatusItem}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFF' : '#0F172A' }}>Ranchi → Vrindavan Segment</Text>
                  <Text style={{ fontSize: 11, color: '#10B981', marginTop: 2 }}>Booking Status: Confirmed ✅</Text>
                </View>
              </GlassCard>
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 5: SETTINGS & SECURITY
            ════════════════════════════════════════════════ */}
        {activeTab === 'SETTINGS' && (
          <View style={styles.tabContentContainer}>
            {/* Account Settings */}
            <GlassCard style={styles.innerCard}>
              <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>ACCOUNT & SECURITY</Text>

              <TouchableOpacity style={styles.settingsRow} onPress={() => Alert.alert('Security', 'Password & biometrics enabled.')}>
                <Lock size={16} color="#0066FF" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A' }]}>Password & Authentication</Text>
                <ChevronRight size={16} color="#888" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsRow} onPress={() => Alert.alert('SOS Contact', `Current SOS: ${editEmergencyPhone}`)}>
                <PhoneCall size={16} color="#EF4444" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A' }]}>Emergency SOS Contact</Text>
                <ChevronRight size={16} color="#888" />
              </TouchableOpacity>

              <View style={styles.settingsToggleRow}>
                <Bell size={16} color="#F59E0B" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A', flex: 1 }]}>Push Notifications</Text>
                <TouchableOpacity
                  style={[styles.switchTrack, pushNotifications ? { backgroundColor: '#0066FF' } : { backgroundColor: '#475569' }]}
                  onPress={() => setPushNotifications(!pushNotifications)}
                >
                  <View style={[styles.switchThumb, pushNotifications ? styles.switchThumbOn : styles.switchThumbOff]} />
                </TouchableOpacity>
              </View>

              <View style={styles.settingsToggleRow}>
                <MapPin size={16} color="#10B981" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A', flex: 1 }]}>Live Location Sharing</Text>
                <TouchableOpacity
                  style={[styles.switchTrack, locationSharing ? { backgroundColor: '#10B981' } : { backgroundColor: '#475569' }]}
                  onPress={() => setLocationSharing(!locationSharing)}
                >
                  <View style={[styles.switchThumb, locationSharing ? styles.switchThumbOn : styles.switchThumbOff]} />
                </TouchableOpacity>
              </View>
            </GlassCard>

            {/* Support & Legal */}
            <GlassCard style={[styles.innerCard, { marginTop: 12 }]}>
              <Text style={[styles.cardTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 12 }]}>SUPPORT & ABOUT</Text>

              <TouchableOpacity style={styles.settingsRow} onPress={() => Alert.alert('Help Center', 'Connecting to live support chat...')}>
                <HelpCircle size={16} color="#0066FF" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A' }]}>Help & Customer Support</Text>
                <ChevronRight size={16} color="#888" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsRow} onPress={() => Alert.alert('Privacy Policy', 'TravelStar v2.4.0 (Build 57) - Encrypted & Secure')}>
                <Shield size={16} color="#10B981" />
                <Text style={[styles.settingsRowText, { color: isDark ? '#FFF' : '#0F172A' }]}>Privacy Policy & Terms</Text>
                <ChevronRight size={16} color="#888" />
              </TouchableOpacity>
            </GlassCard>

            {/* Logout Button */}
            <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.85} onPress={handleLogout}>
              <LogOut size={18} color="#FFF" />
              <Text style={styles.logoutBtnText}>Log Out of Account</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ════════════════════════════════════════════════
          EDIT PROFILE MODAL
          ════════════════════════════════════════════════ */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowEditModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#111424' : '#FFFFFF' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalSheetTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Edit Profile Details</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={20} color={isDark ? '#FFF' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Profile Photo Selector Section */}
              <View style={styles.photoPickerSection}>
                <Text style={styles.inputLabel}>Profile Photo</Text>

                {/* Large Preview with Interactive Tap */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.avatarPreviewWrap}
                  onPress={pickImageFromDevice}
                >
                  <Image source={{ uri: editAvatar }} style={styles.avatarPreviewImage} />
                  <View style={styles.cameraIconBadge}>
                    <Camera size={12} color="#FFF" />
                  </View>
                </TouchableOpacity>

                {/* Device Pick & Camera Buttons */}
                <View style={styles.devicePickRow}>
                  <TouchableOpacity
                    style={styles.devicePickBtn}
                    activeOpacity={0.8}
                    onPress={pickImageFromDevice}
                  >
                    <ImageIcon size={15} color="#0066FF" />
                    <Text style={styles.devicePickBtnText}>From Gallery</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.devicePickBtn}
                    activeOpacity={0.8}
                    onPress={takePhotoWithCamera}
                  >
                    <Camera size={15} color="#0066FF" />
                    <Text style={styles.devicePickBtnText}>Take Photo</Text>
                  </TouchableOpacity>
                </View>

                {/* Preset Avatars Row */}
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 12, marginBottom: 8, alignSelf: 'flex-start' }}>
                  Or Choose from Preset Avatars:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                  {AVATAR_PRESETS.map((presetUrl, idx) => {
                    const isSelected = editAvatar === presetUrl;
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => setEditAvatar(presetUrl)}
                        style={[
                          styles.presetAvatarTile,
                          isSelected && styles.presetAvatarTileSelected,
                        ]}
                      >
                        <Image source={{ uri: presetUrl }} style={styles.presetAvatarImage} />
                        {isSelected && (
                          <View style={styles.presetSelectedCheck}>
                            <Check size={10} color="#FFF" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter full name"
                placeholderTextColor="#888"
              />

              {/* Gender Selection Section */}
              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.genderWrap}>
                {[
                  { label: 'Male', icon: '👨' },
                  { label: 'Female', icon: '👩' },
                  { label: 'Non-Binary', icon: '✨' },
                  { label: 'Private', icon: '🔒' },
                ].map((g) => {
                  const isSelected = editGender === g.label;
                  return (
                    <TouchableOpacity
                      key={g.label}
                      activeOpacity={0.8}
                      onPress={() => setEditGender(g.label)}
                      style={[
                        styles.genderChip,
                        isSelected && styles.genderChipSelected,
                        !isSelected && { backgroundColor: isDark ? '#1A1D30' : '#E2E8F0', borderColor: 'transparent' },
                      ]}
                    >
                      <Text style={{ fontSize: 13 }}>{g.icon}</Text>
                      <Text
                        style={[
                          styles.genderChipText,
                          isSelected && styles.genderChipTextSelected,
                          !isSelected && { color: isDark ? '#CBD5E1' : '#475569' },
                        ]}
                      >
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Bio / Traveler Tagline</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1', height: 70 }]}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                placeholder="Share your travel motto"
                placeholderTextColor="#888"
              />

              <Text style={styles.inputLabel}>Mobile Phone</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Emergency SOS Contact</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                value={editEmergencyPhone}
                onChangeText={setEditEmergencyPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Languages Spoken</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                value={editLanguages}
                onChangeText={setEditLanguages}
              />

              <Text style={styles.inputLabel}>Travel & Adventure Styles</Text>
              <TextInput
                style={[styles.modalInput, { color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#262940' : '#CBD5E1' }]}
                value={editStyles}
                onChangeText={setEditStyles}
              />

              <TouchableOpacity style={styles.saveModalBtn} onPress={handleSaveProfile}>
                <Text style={styles.saveModalBtnText}>Save Profile Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════
          DIGITAL TICKET & QR CODE MODAL
          ════════════════════════════════════════════════ */}
      <Modal
        visible={showTicketModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowTicketModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowTicketModal(false)} />
          {selectedTicket && (
            <View style={[styles.ticketCardModal, { backgroundColor: isDark ? '#111424' : '#FFFFFF' }]}>
              <View style={styles.ticketHeader}>
                <Text style={styles.ticketBadge}>BOARDING PASS</Text>
                <TouchableOpacity onPress={() => setShowTicketModal(false)}>
                  <X size={20} color={isDark ? '#FFF' : '#000'} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.ticketTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>{selectedTicket.title}</Text>
              <Text style={{ fontSize: 12, color: '#0066FF', fontWeight: '700', marginTop: 4 }}>
                Ticket Code: {selectedTicket.ticketCode}
              </Text>

              {/* Route */}
              <View style={styles.ticketRouteRow}>
                {selectedTicket.route.map((city: string, idx: number) => (
                  <React.Fragment key={city}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0066FF' }}>{city}</Text>
                    {idx < selectedTicket.route.length - 1 && (
                      <Text style={{ color: '#888', marginHorizontal: 4 }}>➔</Text>
                    )}
                  </React.Fragment>
                ))}
              </View>

              {/* QR Code Graphic placeholder */}
              <View style={styles.qrCodeGraphic}>
                <QrCode size={110} color="#0F172A" />
                <Text style={{ fontSize: 10, color: '#475569', marginTop: 8 }}>Scan at Platform / Meeting Point</Text>
              </View>

              <View style={styles.ticketDetailsGrid}>
                <View style={styles.ticketMetaCell}>
                  <Text style={styles.metaLabel}>Passenger</Text>
                  <Text style={[styles.metaVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{profile.name}</Text>
                </View>
                <View style={styles.ticketMetaCell}>
                  <Text style={styles.metaLabel}>Seats</Text>
                  <Text style={[styles.metaVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{selectedTicket.seats} Confirmed</Text>
                </View>
                <View style={styles.ticketMetaCell}>
                  <Text style={styles.metaLabel}>Meeting Point</Text>
                  <Text style={[styles.metaVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{selectedTicket.meetingPoint}</Text>
                </View>
                <View style={styles.ticketMetaCell}>
                  <Text style={styles.metaLabel}>Organizer</Text>
                  <Text style={[styles.metaVal, { color: isDark ? '#FFF' : '#0F172A' }]}>{selectedTicket.organizer}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.downloadTicketBtn}
                onPress={() => {
                  Alert.alert('📥 Ticket Downloaded', 'Digital Pass saved to phone gallery!');
                  setShowTicketModal(false);
                }}
              >
                <Download size={16} color="#FFF" />
                <Text style={styles.downloadTicketBtnText}>Download Pass (PDF)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // Cover photo & Header
  heroWrap: {
    minHeight: 310,
    width: '100%',
    position: 'relative',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingTop: 36,
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
  },
  topRightActionCol: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'column',
    gap: 10,
    zIndex: 10,
    alignItems: 'center',
  },
  topActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  topNotifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
  },
  avatarHaloContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  avatarGradientRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerGap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#080A14',
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  profileHeaderContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nameSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  userHandle: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 2,
    textAlign: 'center',
  },
  roleCap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 179, 0, 0.2)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
    marginTop: 6,
  },
  roleCapText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFB300',
  },
  userBio: {
    fontSize: 11,
    color: '#E2E8F0',
    marginTop: 6,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },

  // Tab bar
  sectionTabs: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#0066FF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFF',
  },
  tabContentContainer: {
    paddingHorizontal: 16,
  },

  // Cards
  innerCard: {
    padding: 16,
    borderRadius: 16,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  completionPercent: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0066FF',
  },
  progressTrack: {
    height: 6,
    width: '100%',
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 3,
  },

  // Verified & Pending Rows
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  verifiedMsg: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 13,
  },
  pendingRow: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  textInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 10,
  },
  verifyBtn: {
    backgroundColor: '#0066FF',
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Preferences Grid
  prefGridItem: {
    marginTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  prefLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  prefVal: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  // History Tab
  historyFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  historyFilterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  historyFilterChipActive: {
    backgroundColor: '#0066FF',
  },
  historyFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  historyFilterTextActive: {
    color: '#FFF',
  },
  historyCard: {
    padding: 14,
    marginBottom: 12,
    borderRadius: 16,
  },
  historyCardHeader: {
    flexDirection: 'row',
  },
  historyImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  bookingIdText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  historyDate: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  routeDiagramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    flexWrap: 'wrap',
    backgroundColor: 'rgba(0,102,255,0.05)',
    padding: 8,
    borderRadius: 8,
  },
  routeCityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
    paddingTop: 10,
    marginTop: 4,
  },
  viewTicketBtn: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  viewTicketBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Wallet
  walletCard: {
    padding: 16,
    borderRadius: 16,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  rewardsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  walletActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  walletInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    marginBottom: 6,
  },
  actionBtn: {
    backgroundColor: '#0066FF',
    height: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  transactionsHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  txItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Dashboard Tab
  roleChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  roleChipActive: {
    backgroundColor: '#0066FF',
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  roleChipTextActive: {
    color: '#FFF',
  },
  dashboardMetricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    backgroundColor: 'rgba(0,102,255,0.06)',
    padding: 12,
    borderRadius: 12,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  priceSettings: {
    marginTop: 8,
  },
  rateInputs: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 4,
  },
  organizerActions: {
    gap: 8,
    marginTop: 8,
  },
  dashboardBtn: {
    backgroundColor: '#0066FF',
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dashboardBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  familyInfoCard: {
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    padding: 12,
    borderRadius: 12,
  },
  adminGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  adminCell: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  adminActions: {
    gap: 8,
  },
  bookingStatusItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },

  // Settings
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  settingsRowText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  },
  settingsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  logoutBtn: {
    backgroundColor: '#EF4444',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  logoutBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  saveModalBtn: {
    backgroundColor: '#0066FF',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveModalBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Ticket Modal
  ticketCardModal: {
    width: '90%',
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 24,
    padding: 20,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  ticketRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  qrCodeGraphic: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginVertical: 16,
  },
  ticketDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  ticketMetaCell: {
    width: '47%',
    backgroundColor: 'rgba(0,0,0,0.04)',
    padding: 10,
    borderRadius: 10,
  },
  metaLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  downloadTicketBtn: {
    backgroundColor: '#0066FF',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  downloadTicketBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Photo Picker inside Edit Modal
  photoPickerSection: {
    marginBottom: 16,
    alignItems: 'center',
    width: '100%',
  },
  genderWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  genderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  genderChipSelected: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  genderChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  genderChipTextSelected: {
    color: '#FFF',
    fontWeight: '700',
  },
  avatarPreviewWrap: {
    position: 'relative',
    marginVertical: 8,
  },
  avatarPreviewImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: '#0066FF',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  devicePickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    width: '100%',
  },
  devicePickBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  devicePickBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066FF',
  },
  presetAvatarTile: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  presetAvatarTileSelected: {
    borderColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  presetAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  presetSelectedCheck: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
