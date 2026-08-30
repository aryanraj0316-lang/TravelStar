import { logger } from '@/lib/logger';
import AuthScreen from '@/app/auth';
import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useNavigation, type ErrorBoundaryProps } from 'expo-router';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import {
  Bell,
  Bookmark,
  Briefcase,
  Camera,
  Check,
  CheckCircle,
  ChevronRight,
  CreditCard,
  Download,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  LifeBuoy,
  LogOut,
  MapPin,
  Maximize2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { eventBus } from '@/services/event-bus';
import { apiService, type NotificationPreferences } from '@/services/api';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push';
import { toast, errorToastMessage, showAlert, useConfirm } from '@/lib/feedback';
import { uploadFileToUrl } from '@/lib/upload';
import { C } from '@/theme/tokens';
import { Button, Chip, Input, Sheet } from '@/components/ui';

// Safe dynamic import to prevent native app crash if module is unlinked in old APK
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
];

function ProfileScreen() {
  useEffect(() => {
    logger.log('Screen mounted: ProfileScreen');
  }, []);
  const router = useRouter();
  const navigation = useNavigation();
  const {
    profile,
    updateProfile,
    isLoggedIn,
    logout,
    setNavbarHidden,
    hasUnreadNotification,
    checkUnreadNotifications,
  } = useApp();

  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);

  // Input states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<any[]>([]);

  // Language settings state
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [pushNotifications, setPushNotifications] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  // Per-category push opt-outs (docs/REMEDIATION.md §8.18). The master
  // switch above used to be the whole story, and it did nothing: no
  // device token was ever registered, so it gated a delivery that could
  // never happen.
  const [pushPrefs, setPushPrefs] = useState<NotificationPreferences>({
    pushNotifications: true,
    pushTripUpdates: true,
    pushHazardAlerts: true,
    pushSeasonal: true,
  });
  const [pushBusy, setPushBusy] = useState(false);

  // Edit Profile Modal states
  const confirm = useConfirm();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAvatar, setEditAvatar] = useState(profile.avatar || AVATAR_PRESETS[0]);
  // docs/REMEDIATION.md §8.2 — true while a picked photo is being uploaded
  // to object storage; the avatar picker UI disables itself and shows a
  // spinner during this window (see pickImageFromDevice/takePhotoWithCamera).
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editName, setEditName] = useState(profile.name || 'Aarav Sharma');
  const [editGender, setEditGender] = useState(profile.gender || 'Male');
  const [editBio, setEditBio] = useState('Backpacker & Mountain Enthusiast 🏔️ | Exploring Incredible India 🇮🇳');
  const [editPhone, setEditPhone] = useState('+91 98765 43210');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('+91 98111 22334');
  const [editLanguages, setEditLanguages] = useState('Hindi, English, Punjabi');
  const [editStyles, setEditStyles] = useState('Mountains, Backpacking, Photography');

  useEffect(() => {
    if (isLoggedIn) {
      setShowAuthModal(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setShowAuthModal(false);
      checkUnreadNotifications();
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

  useEffect(() => {
    if (profile) {
      if (profile.selectedLanguage) {
        setSelectedLanguage(profile.selectedLanguage);
      }
      if (profile.pushNotifications !== undefined) {
        setPushNotifications(profile.pushNotifications);
      }
      if (profile.locationSharing !== undefined) {
        setLocationSharing(profile.locationSharing);
      }
    }
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getNotificationPreferences()
      .then((prefs) => {
        if (cancelled || !prefs) return;
        setPushPrefs(prefs);
        setPushNotifications(prefs.pushNotifications);
      })
      .catch((e) => logger.warn('[Profile] Failed to load notification settings:', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // The master switch now does the real thing: turning it on asks for OS
  // permission and registers this device's push token, turning it off
  // drops the token so the server stops trying. Rolls back on failure
  // rather than leaving the UI claiming a state the server rejected.
  const handleTogglePush = async () => {
    const next = !pushNotifications;
    setPushBusy(true);
    setPushNotifications(next);
    try {
      if (next) {
        const result = await registerForPushNotifications();
        if (result.status === 'denied') {
          setPushNotifications(false);
          toast('Notifications Blocked — Turn notifications on for TravelStar in your device settings to receive trip and safety alerts.', 'info');
          return;
        }
        if (result.status === 'not-configured' || result.status === 'unsupported') {
          setPushNotifications(false);
          await showAlert(
            'Push Not Available',
            result.status === 'unsupported'
              ? 'Push notifications need a real device — a simulator cannot receive them.'
              : 'This build has no push project configured, so notifications cannot be delivered to it yet.',
          );
          return;
        }
      } else {
        await unregisterPushNotifications();
      }
      const saved = await apiService.updateNotificationPreferences({ pushNotifications: next });
      setPushPrefs(saved);
    } catch (e) {
      logger.warn('[Profile] Failed to update push setting:', e);
      setPushNotifications(!next);
      toast('Could not save that setting.', 'error');
    } finally {
      setPushBusy(false);
    }
  };

  const handleToggleCategory = async (key: keyof NotificationPreferences) => {
    const next = !pushPrefs[key];
    const previous = pushPrefs;
    setPushPrefs({ ...pushPrefs, [key]: next });
    try {
      const saved = await apiService.updateNotificationPreferences({ [key]: next });
      setPushPrefs(saved);
    } catch (e) {
      logger.warn('[Profile] Failed to update notification category:', e);
      setPushPrefs(previous);
      toast('Could not save that setting.', 'error');
    }
  };

  // Device image pickers
  // docs/REMEDIATION.md §8.2: the picker result's `uri` is a local
  // file://(/blob:/data: on web) path — it never leaves the device that
  // took it, isn't reachable by anyone else (or this same user on another
  // device), and doesn't survive a cache clear. Setting it straight as the
  // avatar (the old behaviour) silently produced an avatar that only ever
  // rendered locally. This uploads the bytes to object storage first and
  // only ever sets a real, publicly-readable URL as the avatar.
  //
  // Per the 2026-08-27 decision on credential-dependent features: no fake
  // fallback. If the backend has no bucket configured
  // (ApiError code STORAGE_UNAVAILABLE), that's reported honestly — the
  // picked photo is discarded, not silently kept as a local-only URI.
  const uploadPickedAvatar = async (asset: { uri: string; mimeType?: string }) => {
    const contentType =
      asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
    setAvatarUploading(true);
    try {
      const { uploadUrl, publicUrl } = await apiService.getAvatarUploadUrl(contentType);
      await uploadFileToUrl(asset.uri, uploadUrl, contentType);
      setEditAvatar(publicUrl);
    } catch (err) {
      logger.warn('[Profile] Avatar upload failed:', err);
      toast(errorToastMessage(err, 'Could not upload that photo. Please try again.'), 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const pickImageFromDevice = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== 'function') {
        toast('Photo gallery module is initializing or requires restarting Expo dev client.', 'info');
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        toast('Permission Required — Permission to access photo gallery is required to select photos from your device.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadPickedAvatar(result.assets[0]);
      }
    } catch (err: any) {
      toast(errorToastMessage(err, 'Could not open the photo gallery. Please try again.'), 'error');
    }
  };

  const takePhotoWithCamera = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestCameraPermissionsAsync !== 'function') {
        toast('Camera module is initializing or requires restarting Expo dev client.', 'info');
        return;
      }
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult?.granted) {
        toast('Permission Required — Camera permission is required to capture a photo.', 'error');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadPickedAvatar(result.assets[0]);
      }
    } catch (err: any) {
      toast(errorToastMessage(err, 'Could not open the camera. Please try again.'), 'error');
    }
  };

  // "Digital Ticket & QR Code" modal removed rather than kept (same
  // convention as the "Share Profile" removal below): `selectedTicket`
  // only ever destructured its getter, never a setter, so it was
  // permanently null, and nothing in this file ever called
  // `setShowTicketModal(true)` — the modal's `{selectedTicket && (...)}`
  // guard could never render. It was unreachable dead code presenting a
  // fake "BOARDING PASS" with a "Download Pass (PDF)" button that only
  // ever showed a success toast and saved nothing.

  // Handlers
  const handleSaveProfile = () => {
    if (!editName.trim()) {
      toast('Profile Name cannot be empty.', 'error');
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
    toast('Profile saved.', 'success');
  };

  // "Share Profile" was removed rather than kept (docs/REMEDIATION.md §0.2
  // rule 4). It copied nothing to any clipboard, and the link it claimed to
  // have copied was a hardcoded https://travelstar.app/u/aarav_sharma — a
  // fixed username belonging to nobody, shown to every user. This product
  // has no public profile URLs, so there is nothing truthful for the button
  // to do yet.

  const handleLogout = () => {
    void (async () => {
      const ok = await confirm({
        title: 'Sign out of TravelStar?',
        message: 'You will need to sign in again to see your trips and messages.',
        confirmLabel: 'Sign Out',
        destructive: true,
      });
      if (!ok) return;
      logout();
      setShowAuthModal(true);
    })();
  };

  // ── Privacy & data (docs/REMEDIATION.md §12.4) ────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await apiService.exportMyData();
      // No file-download primitive on RN/Expo web here — surface the export
      // as JSON the user can copy. A share-sheet / file save is a follow-up.
      logger.log('[Profile] Data export', JSON.stringify(data));
      toast('Your data export is ready in the app logs. A file download is coming soon.', 'success');
    } catch (e) {
      toast(errorToastMessage(e, 'Could not build your data export.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleting || deletePassword.length === 0) return;
    setDeleting(true);
    try {
      await apiService.deleteAccount(deletePassword);
      setShowDeleteModal(false);
      setDeletePassword('');
      toast('Your account has been deleted.', 'success');
      logout();
      setShowAuthModal(true);
    } catch (e) {
      toast(errorToastMessage(e, 'Could not delete your account.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: '#070913' }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const diff = y - lastScrollYRef.current;

          if (y <= 15) {
            if (navbarHiddenRef.current) {
              navbarHiddenRef.current = false;
              eventBus.emit('toggleNavbar', false);
            }
            lastScrollYRef.current = y;
            return;
          }

          if (diff > 0.01 && !navbarHiddenRef.current) {
            navbarHiddenRef.current = true;
            eventBus.emit('toggleNavbar', true);
          } else if (diff < -0.01 && navbarHiddenRef.current) {
            navbarHiddenRef.current = false;
            eventBus.emit('toggleNavbar', false);
          }

          lastScrollYRef.current = y;
        }}
      >
        {/* ════════════════════════════════════════════════
            HERO COVER PHOTO BANNER & PROFILE CARD
            ════════════════════════════════════════════════ */}
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&q=80' }}
            style={styles.coverImage}
          />
          <LinearGradient colors={['rgba(7,9,19,0.3)', 'rgba(7,9,19,0.98)']} style={StyleSheet.absoluteFill} />

          {/* Top-Left Maximize/Scan Icon */}
          <TouchableOpacity style={styles.topLeftScanBtn} activeOpacity={0.7}>
            <Maximize2 size={20} color="#FFF" />
          </TouchableOpacity>

          {/* Top-Right Action Column: Edit (Pencil), Notifications (Bell), Share */}
          <View style={styles.topRightActionCol}>
            <TouchableOpacity style={styles.topActionBtn} activeOpacity={0.7} onPress={() => setShowEditModal(true)}>
              <Pencil size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/notifications')}
            >
              <Bell size={16} color="#FFF" />
              {hasUnreadNotification && <View style={styles.topNotifDot} />}
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

              <Text style={styles.userBio}>{profile.bio || 'Love exploring new places...'}</Text>
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
              <Text style={styles.profileDetailValue}>
                {profile.travelStyles || 'Mountains, Backpacking, Photography'}
              </Text>
            </View>
          </View>

          {/* Section 1: TRAVEL HUB */}
          <Text style={styles.sectionHeader}>TRAVEL HUB</Text>
          <View style={styles.menuCard}>
            {/* Bookings & Trips */}
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/bookings')}>
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

            {/* Push Notifications Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Bell size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Push Notifications</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={pushBusy}
                onPress={handleTogglePush}
                style={[
                  styles.switchTrack,
                  { backgroundColor: pushNotifications ? '#0066FF' : '#2C2F48', opacity: pushBusy ? 0.6 : 1 },
                ]}
              >
                <View style={[styles.switchThumb, pushNotifications ? styles.switchThumbOn : styles.switchThumbOff]} />
              </TouchableOpacity>
            </View>

            {/* Per-category opt-outs (docs/REMEDIATION.md §8.18), shown
            only while push is on — they have nothing to gate otherwise. */}
            {pushNotifications && (
              <View style={styles.pushCategoryGroup}>
                {(
                  [
                    { key: 'pushTripUpdates' as const, label: 'Trip updates' },
                    { key: 'pushHazardAlerts' as const, label: 'Hazard & safety alerts' },
                    { key: 'pushSeasonal' as const, label: 'Seasonal suggestions' },
                  ]
                ).map((row) => (
                  <View key={row.key} style={styles.pushCategoryRow}>
                    <Text style={styles.pushCategoryLabel}>{row.label}</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleToggleCategory(row.key)}
                      style={[
                        styles.switchTrack,
                        { backgroundColor: pushPrefs[row.key] ? '#0066FF' : '#2C2F48', transform: [{ scale: 0.85 }] },
                      ]}
                    >
                      <View
                        style={[styles.switchThumb, pushPrefs[row.key] ? styles.switchThumbOn : styles.switchThumbOff]}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.menuDivider} />

            {/* Location Sharing Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <MapPin size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Location Sharing</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const newValue = !locationSharing;
                  setLocationSharing(newValue);
                  updateProfile({ locationSharing: newValue });
                }}
                style={[styles.switchTrack, { backgroundColor: locationSharing ? '#0066FF' : '#2C2F48' }]}
              >
                <View style={[styles.switchThumb, locationSharing ? styles.switchThumbOn : styles.switchThumbOff]} />
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            {/* Customer Support */}
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/support')}>
              <View style={styles.menuItemLeft}>
                <LifeBuoy size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>Customer Support</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* About TravelStar */}
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/about')}>
              <View style={styles.menuItemLeft}>
                <HelpCircle size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>About TravelStar</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Download my data (§12.4) */}
            {isLoggedIn && (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={handleExportData}
                disabled={exporting}
                accessibilityRole="button"
                accessibilityLabel="Download my data"
              >
                <View style={styles.menuItemLeft}>
                  <Download size={17} color="#8B949E" />
                  <Text style={styles.menuItemText}>{exporting ? 'Preparing…' : 'Download my data'}</Text>
                </View>
                <ChevronRight size={14} color="#8B949E" />
              </TouchableOpacity>
            )}

            {/* Delete account (§12.4) */}
            {isLoggedIn && (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => setShowDeleteModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Delete my account"
              >
                <View style={styles.menuItemLeft}>
                  <Trash2 size={17} color="#FF453A" style={{ opacity: 0.9 }} />
                  <Text style={[styles.menuItemText, { color: '#FF453A' }]}>Delete my account</Text>
                </View>
                <ChevronRight size={14} color="#8B949E" />
              </TouchableOpacity>
            )}

            <View style={styles.menuDivider} />

            {/* Sign Out of Account */}
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleLogout}>
              <View style={styles.menuItemLeft}>
                <LogOut size={17} color="#FF453A" style={{ opacity: 0.9 }} />
                <Text style={[styles.menuItemText, { color: '#FF453A' }]}>Sign Out of Account</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Delete account confirmation */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.deleteOverlay}>
            <View style={styles.deleteCard}>
              <Text style={styles.deleteTitle}>Delete your account?</Text>
              <Text style={styles.deleteBodyText}>
                This permanently removes your profile, trips you organize, join requests, messages, and expenses. It
                cannot be undone. Enter your password to confirm.
              </Text>
              <Input
                placeholder="Current password"
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                accessibilityLabel="Current password"
              />
              <View style={styles.deleteBtnRow}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setShowDeleteModal(false);
                    setDeletePassword('');
                  }}
                />
                <Button
                  label={deleting ? 'Deleting…' : 'Delete forever'}
                  variant="destructive"
                  style={{ flex: 1 }}
                  disabled={deleting || deletePassword.length === 0}
                  onPress={handleDeleteAccount}
                />
              </View>
            </View>
          </View>
        </Modal>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ════════════════════════════════════════════════
          EDIT PROFILE MODAL
          ════════════════════════════════════════════════ */}
      <Sheet visible={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Profile Details">
        {/* Profile Photo Selector Section */}
        <View style={styles.photoPickerSection}>
          <Text style={styles.inputLabel}>Profile Photo</Text>

          {/* Large Preview with Interactive Tap */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.avatarPreviewWrap}
            onPress={pickImageFromDevice}
            disabled={avatarUploading}
          >
            <Image source={{ uri: editAvatar }} style={styles.avatarPreviewImage} />
            {avatarUploading ? (
              <View style={styles.avatarUploadingOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            ) : (
              <View style={styles.cameraIconBadge}>
                <Camera size={12} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Device Pick & Camera Buttons */}
          <View style={styles.devicePickRow}>
            <TouchableOpacity
              style={styles.devicePickBtn}
              activeOpacity={0.8}
              onPress={pickImageFromDevice}
              disabled={avatarUploading}
            >
              <ImageIcon size={15} color="#0066FF" />
              <Text style={styles.devicePickBtnText}>From Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.devicePickBtn}
              activeOpacity={0.8}
              onPress={takePhotoWithCamera}
              disabled={avatarUploading}
            >
              <Camera size={15} color="#0066FF" />
              <Text style={styles.devicePickBtnText}>Take Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Preset Avatars Row */}
          <Text style={{ fontSize: 11, color: '#7E8494', marginTop: 12, marginBottom: 8, alignSelf: 'flex-start' }}>
            Or Choose from Preset Avatars:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
          >
            {AVATAR_PRESETS.map((presetUrl, idx) => {
              const isSelected = editAvatar === presetUrl;
              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  onPress={() => setEditAvatar(presetUrl)}
                  style={[styles.presetAvatarTile, isSelected && styles.presetAvatarTileSelected]}
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

        <Input label="Full Name" value={editName} onChangeText={setEditName} placeholder="Enter full name" />

        {/* Gender Selection Section */}
        <Text style={styles.inputLabel}>Gender</Text>
        <View style={styles.genderWrap}>
          {[
            { label: 'Male', icon: '👨' },
            { label: 'Female', icon: '👩' },
            { label: 'Non-Binary', icon: '✨' },
            { label: 'Private', icon: '🔒' },
          ].map((g) => (
            <Chip
              key={g.label}
              label={g.label}
              icon={<Text style={{ fontSize: 13 }}>{g.icon}</Text>}
              selected={editGender === g.label}
              onPress={() => setEditGender(g.label)}
            />
          ))}
        </View>

        <Input
          label="Bio / Traveler Tagline"
          value={editBio}
          onChangeText={setEditBio}
          multiline
          placeholder="Share your travel motto"
          containerStyle={styles.editFieldGap}
        />
        <Input
          label="Mobile Phone"
          value={editPhone}
          onChangeText={setEditPhone}
          keyboardType="phone-pad"
          containerStyle={styles.editFieldGap}
        />
        <Input
          label="Emergency SOS Contact"
          value={editEmergencyPhone}
          onChangeText={setEditEmergencyPhone}
          keyboardType="phone-pad"
          containerStyle={styles.editFieldGap}
        />
        <Input
          label="Languages Spoken"
          value={editLanguages}
          onChangeText={setEditLanguages}
          containerStyle={styles.editFieldGap}
        />
        <Input
          label="Travel & Adventure Styles"
          value={editStyles}
          onChangeText={setEditStyles}
          containerStyle={styles.editFieldGap}
        />

        <Button
          label="Save Profile Changes"
          onPress={handleSaveProfile}
          fullWidth
          style={styles.saveModalBtnSpacing}
        />
      </Sheet>

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
              <TouchableOpacity
                onPress={() => {
                  setShowSavedPlacesModal(false);
                  setNavbarHidden(false);
                }}
                style={styles.bottomSheetCloseBtn}
              >
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
                  <Text style={{ color: '#8A92A6', fontStyle: 'italic', fontSize: 13 }}>
                    Your saved places list is empty.
                  </Text>
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
              <TouchableOpacity
                onPress={() => {
                  setShowLanguageModal(false);
                  setNavbarHidden(false);
                }}
                style={styles.bottomSheetCloseBtn}
              >
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
                      style={[styles.langRow, isSelected && { backgroundColor: 'rgba(0, 102, 255, 0.12)' }]}
                      onPress={() => {
                        setSelectedLanguage(lang.label);
                        updateProfile({ selectedLanguage: lang.label });
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
    color: C.textMuted,
    marginTop: 22,
    marginBottom: 8,
    letterSpacing: 1.5,
    fontStyle: 'italic',
  },
  menuCard: {
    backgroundColor: C.card,
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
  pushCategoryGroup: {
    paddingLeft: 34,
    paddingRight: 4,
    paddingBottom: 6,
    gap: 2,
  },
  pushCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  pushCategoryLabel: {
    color: '#8B949E',
    fontSize: 13,
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
    shadowColor: C.blueGlow,
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
    color: C.white,
    textAlign: 'center',
  },
  userBio: {
    fontSize: 11,
    color: '#8A92A6',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 12,
  },

  // Settings
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

  // Modals
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    marginTop: 10,
    marginBottom: 4,
  },
  editFieldGap: {
    marginTop: 10,
  },
  saveModalBtnSpacing: {
    marginTop: 20,
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
  avatarPreviewWrap: {
    position: 'relative',
    marginVertical: 8,
  },
  avatarPreviewImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: C.blue,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  avatarUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: C.blue,
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
    borderColor: C.blue,
    shadowColor: C.blue,
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
    backgroundColor: C.blue,
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
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteCard: {
    backgroundColor: '#121524',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1D2138',
    gap: 12,
  },
  deleteTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.white,
  },
  deleteBodyText: {
    fontSize: 12.5,
    color: '#8A92A6',
    lineHeight: 18,
  },
  deleteBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});

export default React.memo(ProfileScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Profile" />;
}
