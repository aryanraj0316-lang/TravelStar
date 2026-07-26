import GlassCard from '@/components/ui/GlassCard';
import DummyPaymentModal from '@/components/ui/DummyPaymentModal';
import AuthScreen from './auth';
import { useApp, UserRole } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Bookmark,
  Briefcase,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  Coins,
  Compass,
  CreditCard,
  Download,
  Globe,
  HelpCircle,
  History,
  Image as ImageIcon,
  LifeBuoy,
  Lock,
  LogOut,
  MapPin,
  Maximize2,
  Pencil,
  PhoneCall,
  Plus,
  QrCode,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X
} from 'lucide-react-native';
import React, { useState, useEffect } from 'react';
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
  const navigation = useNavigation();
  const isDark = useColorScheme() === 'dark';
  const {
    currentRole,
    setCurrentRole,
    profile,
    updateProfile,
    walletTransactions,
    addWalletFunds,
    withdrawWalletFunds,
    isLoggedIn,
    login,
    logout,
    setNavbarHidden,
  } = useApp();

  useEffect(() => {
    console.log('[ProfileScreen] isLoggedIn:', isLoggedIn, 'profile.name:', profile?.name, 'showAuthModal:', showAuthModal);
    if (isLoggedIn) {
      setShowAuthModal(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setShowAuthModal(false);
    });
    return unsubscribe;
  }, [navigation]);



  useEffect(() => {
    return () => {
      setNavbarHidden(false);
    };
  }, []);

  useEffect(() => {
    if (showEditModal) {
      setEditAvatar(profile.avatar || AVATAR_PRESETS[0]);
      setEditName(profile.name || '');
      setEditGender(profile.gender || 'Male');
      setEditBio(profile.bio || '');
      setEditPhone(profile.phoneNumber || '');
      setEditEmergencyPhone(profile.emergencyContact || '');
      setEditLanguages(profile.languages || '');
      setEditStyles(profile.travelStyles || '');
    }
  }, [showEditModal, profile]);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'HISTORY' | 'WALLET' | 'DASHBOARD' | 'SETTINGS'>('DETAILS');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'UPCOMING' | 'COMPLETED'>('ALL');

  // Input states
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<any[]>([]);

  useEffect(() => {
    if (profile.savedPlaces && Array.isArray(profile.savedPlaces)) {
      setSavedPlaces(profile.savedPlaces);
    } else {
      setSavedPlaces([
        {
          id: 'sp-1',
          name: 'Taj Mahal',
          location: 'Agra, Uttar Pradesh',
          image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=150&q=80',
        },
        {
          id: 'sp-2',
          name: 'Vrindavan Mandir',
          location: 'Vrindavan, Uttar Pradesh',
          image: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=150&q=80',
        },
        {
          id: 'sp-3',
          name: 'Munnar Tea Estates',
          location: 'Munnar, Kerala',
          image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=150&q=80',
        },
        {
          id: 'sp-4',
          name: 'Pangong Lake',
          location: 'Leh-Ladakh, India',
          image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=150&q=80',
        },
      ]);
    }
  }, [profile.savedPlaces]);

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

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
    updateProfile({
      name: editName,
      avatar: editAvatar,
      gender: editGender,
      bio: editBio,
      phoneNumber: editPhone,
      emergencyContact: editEmergencyPhone,
      languages: editLanguages,
      travelStyles: editStyles,
    });
    setShowEditModal(false);
    Alert.alert('✨ Profile Saved', 'Your profile details, gender, bio & photo have been updated successfully.');
  };

  const handleShareProfile = () => {
    Alert.alert('🔗 Share Profile', 'Profile link copied to clipboard! (https://travelstar.app/u/aarav_sharma)');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out of Account', 'Are you sure you want to sign out of TravelConnect?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          logout();
          setShowAuthModal(true);
        },
      },
    ]);
  };

  const filteredHistory = TRIP_HISTORY.filter((item) => {
    if (historyFilter === 'ALL') return true;
    return item.status === historyFilter;
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: '#070913' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ════════════════════════════════════════════════
            HERO COVER PHOTO BANNER & PROFILE CARD
            ════════════════════════════════════════════════ */}
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&q=80' }}
            style={styles.coverImage}
          />
          <LinearGradient
            colors={['rgba(7,9,19,0.3)', 'rgba(7,9,19,0.98)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Top-Left Maximize/Scan Icon */}
          <TouchableOpacity
            style={styles.topLeftScanBtn}
            activeOpacity={0.7}
          >
            <Maximize2 size={20} color="#FFF" />
          </TouchableOpacity>

          {/* Top-Right Action Column: Edit (Pencil), Notifications (Bell), Share */}
          <View style={styles.topRightActionCol}>
            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => setShowEditModal(true)}
            >
              <Pencil size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/notifications')}
            >
              <Bell size={16} color="#FFF" />
              <View style={styles.topNotifDot} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={handleShareProfile}
            >
              <Share2 size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileHeaderContent}>
            {/* Circular Avatar with Glowing Cyan Gradient Border Ring */}
            <View style={styles.avatarHaloContainer}>
              <LinearGradient
                colors={['#00F2FE', '#00D1FF', '#00F2FE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradientRing}
              >
                <View style={styles.avatarInnerGap}>
                  <Image source={{ uri: profile.avatar || AVATAR_PRESETS[0] }} style={styles.avatar} />
                </View>
              </LinearGradient>
            </View>

            <View style={styles.nameSection}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{profile.name || 'Aarav Sharma'}</Text>
                <CheckCircle size={15} color="#00D1FF" fill="#00D1FF" style={{ marginLeft: 6 }} />
              </View>

              <Text style={styles.userBio}>
                {profile.bio || "Love exploring new places..."}
              </Text>
            </View>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            MENU CARDS & TRAVEL HUB SECTIONS
            ════════════════════════════════════════════════ */}
        <View style={styles.menuContainer}>
          {/* Section: PERSONAL DETAILS */}
          <Text style={styles.sectionHeader}>PERSONAL DETAILS</Text>
          <View style={styles.menuCard}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Mobile Phone</Text>
              <Text style={styles.profileDetailValue}>{profile.phoneNumber || '+91 98765 43210'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Emergency SOS Contact</Text>
              <Text style={styles.profileDetailValue}>{profile.emergencyContact || '+91 98111 22334'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Languages Spoken</Text>
              <Text style={styles.profileDetailValue}>{profile.languages || 'Hindi, English, Punjabi'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Adventure Styles</Text>
              <Text style={styles.profileDetailValue}>{profile.travelStyles || 'Mountains, Backpacking, Photography'}</Text>
            </View>
          </View>

          {/* Section 1: TRAVEL HUB */}
          <Text style={styles.sectionHeader}>TRAVEL HUB</Text>
          <View style={styles.menuCard}>
            {/* Bookings & Trips */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => router.push('/bookings')}
            >
              <View style={styles.menuItemLeft}>
                <Briefcase size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Bookings & Trips</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Saved Destinations */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => {
                setShowSavedPlacesModal(true);
                setNavbarHidden(true);
              }}
            >
              <View style={styles.menuItemLeft}>
                <Bookmark size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Saved Destinations</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Expense Tracker */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => router.push('/budget-tracker')}
            >
              <View style={styles.menuItemLeft}>
                <CreditCard size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Expense Tracker</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>
          </View>

          {/* Section 2: PREFERENCES & SUPPORT */}
          <Text style={styles.sectionHeader}>PREFERENCES & SUPPORT</Text>
          <View style={styles.menuCard}>
            {/* Language & Region */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => {
                setShowLanguageModal(true);
                setNavbarHidden(true);
              }}
            >
              <View style={styles.menuItemLeft}>
                <Globe size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Language & Region ({selectedLanguage})</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Customer Support */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => Alert.alert("Customer Support", "Support desk is active 24/7 at support@travelstar.app")}
            >
              <View style={styles.menuItemLeft}>
                <LifeBuoy size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Customer Support</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* About TravelStar */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={() => Alert.alert("About TravelStar", "TravelStar v1.4.2\nPartnering with travelers across Incredible India.")}
            >
              <View style={styles.menuItemLeft}>
                <HelpCircle size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>About TravelStar</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Sign Out of Account */}
            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7}
              onPress={handleLogout}
            >
              <View style={styles.menuItemLeft}>
                <LogOut size={17} color="#FF453A" style={{ opacity: 0.9 }} />
                <Text style={[styles.menuItemText, { color: '#FF453A' }]}>Sign Out of Account</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>
          </View>
        </View>

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

      <DummyPaymentModal
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amount={1500}
        title="Spiritual Vrindavan Tour Advance Booking"
        onSuccess={(details) => {
          addWalletFunds(details.amount);
        }}
      />

      <Modal visible={showAuthModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#050710' }}>
          <AuthScreen />
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 50,
              right: 20,
              zIndex: 999,
              padding: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
            }}
            onPress={() => setShowAuthModal(false)}
          >
            <X size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════
          SAVED DESTINATIONS BOTTOM SHEET OVERLAY
          ════════════════════════════════════════════════ */}
      {showSavedPlacesModal && (
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1}
            onPress={() => {
              setShowSavedPlacesModal(false);
              setNavbarHidden(false);
            }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }} />
          </TouchableOpacity>
          <View style={styles.bottomSheetContent}>
            {/* Header */}
            <View style={styles.bottomSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>❤️</Text>
                <Text style={styles.bottomSheetTitle}>Saved Places</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowSavedPlacesModal(false); setNavbarHidden(false); }} style={styles.bottomSheetCloseBtn}>
                <X size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
              {savedPlaces.map((place) => (
                <View key={place.id} style={styles.savedPlaceCard}>
                  <Image source={{ uri: place.image }} style={styles.savedPlaceImage} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.savedPlaceName}>{place.name}</Text>
                    <Text style={styles.savedPlaceLocation}>{place.location}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const updated = savedPlaces.filter((p) => p.id !== place.id);
                      setSavedPlaces(updated);
                      updateProfile({ savedPlaces: updated });
                    }}
                    style={styles.deletePlaceBtn}
                  >
                    <Trash2 size={16} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              ))}
              {savedPlaces.length === 0 && (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#8A92A6', fontStyle: 'italic', fontSize: 13 }}>Your saved places list is empty.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ════════════════════════════════════════════════
          SELECT LANGUAGE BOTTOM SHEET OVERLAY
          ════════════════════════════════════════════════ */}
      {showLanguageModal && (
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1}
            onPress={() => {
              setShowLanguageModal(false);
              setNavbarHidden(false);
            }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }} />
          </TouchableOpacity>
          <View style={styles.bottomSheetContent}>
            {/* Header */}
            <View style={styles.bottomSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🌐</Text>
                <Text style={styles.bottomSheetTitle}>Select Language / भाषा</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowLanguageModal(false); setNavbarHidden(false); }} style={styles.bottomSheetCloseBtn}>
                <X size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {[
                { label: 'English', sub: '' },
                { label: 'Hindi', sub: '(हिन्दी)' },
                { label: 'Punjabi', sub: '(ਪੰਜਾਬੀ)' },
                { label: 'Bengali', sub: '(বাংলা)' },
                { label: 'Tamil', sub: '(தமிழ்)' },
              ].map((lang, idx, arr) => {
                const isSelected = selectedLanguage.startsWith(lang.label);
                return (
                  <View key={lang.label}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.langRow,
                        isSelected && { backgroundColor: 'rgba(0, 102, 255, 0.12)' }
                      ]}
                      onPress={() => {
                        setSelectedLanguage(lang.label);
                        setShowLanguageModal(false);
                        setNavbarHidden(false);
                      }}
                    >
                      <Text style={[styles.langText, isSelected && { color: '#00D1FF', fontWeight: '700' }]}>
                        {lang.label} {lang.sub && <Text style={styles.langSubText}>{lang.sub}</Text>}
                      </Text>
                      {isSelected && <Check size={16} color="#00D1FF" />}
                    </TouchableOpacity>
                    {idx < arr.length - 1 && <View style={styles.langDivider} />}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
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
  topLeftScanBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  menuContainer: {
    paddingHorizontal: 16,
    marginTop: -8,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6A7182',
    marginTop: 22,
    marginBottom: 8,
    letterSpacing: 1.5,
    fontStyle: 'italic',
  },
  menuCard: {
    backgroundColor: '#111322',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1D2138',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#E1E4EC',
    letterSpacing: 0.2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
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
    backgroundColor: '#070913',
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
    color: '#8A92A6',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
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
  bottomSheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 99999,
  },
  bottomSheetContent: {
    backgroundColor: '#121524',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  bottomSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedPlaceCard: {
    backgroundColor: '#1C1F32',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedPlaceImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  savedPlaceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  savedPlaceLocation: {
    fontSize: 11,
    color: '#8A92A6',
    marginTop: 4,
  },
  deletePlaceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDetailRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  profileDetailLabel: {
    fontSize: 10,
    color: '#8A92A6',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  profileDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E1E4EC',
    marginTop: 4,
  },
  profileDetailDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  langText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E1E4EC',
  },
  langSubText: {
    fontSize: 13,
    color: '#8A92A6',
    fontWeight: 'normal',
  },
  langDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 16,
  },
});
