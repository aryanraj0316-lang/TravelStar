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
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getAppLanguage, setAppLanguage } from '@/lib/i18n';

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
  const { t } = useTranslation();
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
          toast(t('profile.pushBlockedMessage'), 'info');
          return;
        }
        if (result.status === 'not-configured' || result.status === 'unsupported') {
          setPushNotifications(false);
          await showAlert(
            t('profile.pushNotAvailableTitle'),
            result.status === 'unsupported'
              ? t('profile.pushUnsupportedMessage')
              : t('profile.pushNotConfiguredMessage'),
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
      toast(t('profile.couldNotSaveSetting'), 'error');
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
      toast(t('profile.couldNotSaveSetting'), 'error');
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
      toast(errorToastMessage(err, t('profile.couldNotUploadPhoto')), 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const pickImageFromDevice = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== 'function') {
        toast(t('profile.galleryModuleInitializing'), 'info');
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        toast(t('profile.galleryPermissionRequired'), 'error');
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
      toast(errorToastMessage(err, t('profile.couldNotOpenGallery')), 'error');
    }
  };

  const takePhotoWithCamera = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.requestCameraPermissionsAsync !== 'function') {
        toast(t('profile.cameraModuleInitializing'), 'info');
        return;
      }
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult?.granted) {
        toast(t('profile.cameraPermissionRequired'), 'error');
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
      toast(errorToastMessage(err, t('profile.couldNotOpenCamera')), 'error');
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
      toast(t('profile.nameCannotBeEmpty'), 'error');
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
    toast(t('profile.profileSaved'), 'success');
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
        title: t('profile.signOutTitle'),
        message: t('profile.signOutMessage'),
        confirmLabel: t('profile.signOutConfirmLabel'),
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
      toast(t('profile.exportReady'), 'success');
    } catch (e) {
      toast(errorToastMessage(e, t('profile.couldNotBuildExport')), 'error');
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
      toast(t('profile.accountDeleted'), 'success');
      logout();
      setShowAuthModal(true);
    } catch (e) {
      toast(errorToastMessage(e, t('profile.couldNotDeleteAccount')), 'error');
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

          {/* Top-Right Action Column: Edit (Pencil), Notifications (Bell) */}
          <View style={styles.topRightActionCol}>
            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => setShowEditModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editProfile')}
            >
              <Pencil size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title')}
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
          <Text style={styles.sectionHeader}>{t('profile.personalDetails')}</Text>
          <View style={styles.menuCard}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t('profile.mobilePhone')}</Text>
              <Text style={styles.profileDetailValue}>{profile.phoneNumber || '+91 98765 43210'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t('profile.emergencySosContact')}</Text>
              <Text style={styles.profileDetailValue}>{profile.emergencyContact || '+91 98111 22334'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t('profile.languagesSpoken')}</Text>
              <Text style={styles.profileDetailValue}>{profile.languages || 'Hindi, English, Punjabi'}</Text>
            </View>
            <View style={styles.profileDetailDivider} />
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t('profile.adventureStyles')}</Text>
              <Text style={styles.profileDetailValue}>
                {profile.travelStyles || 'Mountains, Backpacking, Photography'}
              </Text>
            </View>
          </View>

          {/* Section 1: TRAVEL HUB */}
          <Text style={styles.sectionHeader}>{t('profile.travelHub')}</Text>
          <View style={styles.menuCard}>
            {/* Bookings & Trips */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => router.push('/bookings')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.bookingsTrips')}
            >
              <View style={styles.menuItemLeft}>
                <Briefcase size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.bookingsTrips')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('profile.savedDestinations')}
            >
              <View style={styles.menuItemLeft}>
                <Bookmark size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.savedDestinations')}</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Expense Tracker */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => router.push('/budget-tracker')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.expenseTracker')}
            >
              <View style={styles.menuItemLeft}>
                <CreditCard size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.expenseTracker')}</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>
          </View>

          {/* Section 2: PREFERENCES & SUPPORT */}
          <Text style={styles.sectionHeader}>{t('profile.preferencesSupport')}</Text>
          <View style={styles.menuCard}>
            {/* Language & Region */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowLanguageModal(true);
                setNavbarHidden(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('profile.languageRegion', { language: selectedLanguage })}
            >
              <View style={styles.menuItemLeft}>
                <Globe size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.languageRegion', { language: selectedLanguage })}</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Push Notifications Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Bell size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.pushNotifications')}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={pushBusy}
                onPress={handleTogglePush}
                style={[
                  styles.switchTrack,
                  { backgroundColor: pushNotifications ? '#0066FF' : '#2C2F48', opacity: pushBusy ? 0.6 : 1 },
                ]}
                accessibilityRole="switch"
                accessibilityLabel={t('profile.pushNotifications')}
                accessibilityState={{ checked: pushNotifications, disabled: pushBusy }}
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
                    { key: 'pushTripUpdates' as const, labelKey: 'profile.tripUpdates' },
                    { key: 'pushHazardAlerts' as const, labelKey: 'profile.hazardSafetyAlerts' },
                    { key: 'pushSeasonal' as const, labelKey: 'profile.seasonalSuggestions' },
                  ]
                ).map((row) => (
                  <View key={row.key} style={styles.pushCategoryRow}>
                    <Text style={styles.pushCategoryLabel}>{t(row.labelKey)}</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleToggleCategory(row.key)}
                      style={[
                        styles.switchTrack,
                        { backgroundColor: pushPrefs[row.key] ? '#0066FF' : '#2C2F48', transform: [{ scale: 0.85 }] },
                      ]}
                      accessibilityRole="switch"
                      accessibilityLabel={t(row.labelKey)}
                      accessibilityState={{ checked: pushPrefs[row.key] }}
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
                <Text style={styles.menuItemText}>{t('profile.locationSharing')}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const newValue = !locationSharing;
                  setLocationSharing(newValue);
                  updateProfile({ locationSharing: newValue });
                }}
                style={[styles.switchTrack, { backgroundColor: locationSharing ? '#0066FF' : '#2C2F48' }]}
                accessibilityRole="switch"
                accessibilityLabel={t('profile.locationSharing')}
                accessibilityState={{ checked: locationSharing }}
              >
                <View style={[styles.switchThumb, locationSharing ? styles.switchThumbOn : styles.switchThumbOff]} />
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            {/* Customer Support */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => router.push('/support')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.customerSupport')}
            >
              <View style={styles.menuItemLeft}>
                <LifeBuoy size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.customerSupport')}</Text>
              </View>
              <ChevronRight size={14} color="#8B949E" />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* About TravelStar */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => router.push('/about')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.aboutTravelStar')}
            >
              <View style={styles.menuItemLeft}>
                <HelpCircle size={17} color="#FFF" style={{ opacity: 0.8 }} />
                <Text style={styles.menuItemText}>{t('profile.aboutTravelStar')}</Text>
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
                accessibilityLabel={t('profile.downloadMyData')}
              >
                <View style={styles.menuItemLeft}>
                  <Download size={17} color="#8B949E" />
                  <Text style={styles.menuItemText}>{exporting ? t('profile.preparingExport') : t('profile.downloadMyData')}</Text>
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
                accessibilityLabel={t('profile.deleteMyAccount')}
              >
                <View style={styles.menuItemLeft}>
                  <Trash2 size={17} color="#FF453A" style={{ opacity: 0.9 }} />
                  <Text style={[styles.menuItemText, { color: '#FF453A' }]}>{t('profile.deleteMyAccount')}</Text>
                </View>
                <ChevronRight size={14} color="#8B949E" />
              </TouchableOpacity>
            )}

            <View style={styles.menuDivider} />

            {/* Sign Out of Account */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel={t('profile.signOutOfAccount')}
            >
              <View style={styles.menuItemLeft}>
                <LogOut size={17} color="#FF453A" style={{ opacity: 0.9 }} />
                <Text style={[styles.menuItemText, { color: '#FF453A' }]}>{t('profile.signOutOfAccount')}</Text>
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
              <Text style={styles.deleteTitle}>{t('profile.deleteAccountTitle')}</Text>
              <Text style={styles.deleteBodyText}>{t('profile.deleteAccountBody')}</Text>
              <Input
                placeholder={t('profile.currentPassword')}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                accessibilityLabel={t('profile.currentPassword')}
              />
              <View style={styles.deleteBtnRow}>
                <Button
                  label={t('common.cancel')}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setShowDeleteModal(false);
                    setDeletePassword('');
                  }}
                />
                <Button
                  label={deleting ? t('profile.deletingAccount') : t('profile.deleteForever')}
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
      <Sheet visible={showEditModal} onClose={() => setShowEditModal(false)} title={t('profile.editProfileTitle')}>
        {/* Profile Photo Selector Section */}
        <View style={styles.photoPickerSection}>
          <Text style={styles.inputLabel}>{t('profile.profilePhoto')}</Text>

          {/* Large Preview with Interactive Tap */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.avatarPreviewWrap}
            onPress={pickImageFromDevice}
            disabled={avatarUploading}
            accessibilityRole="button"
            accessibilityLabel={t('profile.avatarPhoto')}
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
              accessibilityRole="button"
              accessibilityLabel={t('profile.fromGallery')}
            >
              <ImageIcon size={15} color="#0066FF" />
              <Text style={styles.devicePickBtnText}>{t('profile.fromGallery')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.devicePickBtn}
              activeOpacity={0.8}
              onPress={takePhotoWithCamera}
              disabled={avatarUploading}
              accessibilityRole="button"
              accessibilityLabel={t('profile.takePhoto')}
            >
              <Camera size={15} color="#0066FF" />
              <Text style={styles.devicePickBtnText}>{t('profile.takePhoto')}</Text>
            </TouchableOpacity>
          </View>

          {/* Preset Avatars Row */}
          <Text style={{ fontSize: 12, color: '#7E8494', marginTop: 12, marginBottom: 8, alignSelf: 'flex-start' }}>
            {t('profile.orChoosePreset')}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.selectAvatarPreset', { number: idx + 1 })}
                  accessibilityState={{ selected: isSelected }}
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

        <Input label={t('profile.fullName')} value={editName} onChangeText={setEditName} placeholder={t('profile.enterFullName')} />

        {/* Gender Selection Section */}
        <Text style={styles.inputLabel}>{t('profile.gender')}</Text>
        <View style={styles.genderWrap}>
          {[
            { label: 'Male', labelKey: 'profile.genderMale', icon: '👨' },
            { label: 'Female', labelKey: 'profile.genderFemale', icon: '👩' },
            { label: 'Non-Binary', labelKey: 'profile.genderNonBinary', icon: '✨' },
            { label: 'Private', labelKey: 'profile.genderPrivate', icon: '🔒' },
          ].map((g) => (
            <Chip
              key={g.label}
              label={t(g.labelKey)}
              icon={<Text style={{ fontSize: 13 }}>{g.icon}</Text>}
              selected={editGender === g.label}
              onPress={() => setEditGender(g.label)}
            />
          ))}
        </View>

        <Input
          label={t('profile.bioTagline')}
          value={editBio}
          onChangeText={setEditBio}
          multiline
          placeholder={t('profile.shareTravelMotto')}
          containerStyle={styles.editFieldGap}
        />
        <Input
          label={t('profile.mobilePhone')}
          value={editPhone}
          onChangeText={setEditPhone}
          keyboardType="phone-pad"
          containerStyle={styles.editFieldGap}
        />
        <Input
          label={t('profile.emergencySosContact')}
          value={editEmergencyPhone}
          onChangeText={setEditEmergencyPhone}
          keyboardType="phone-pad"
          containerStyle={styles.editFieldGap}
        />
        <Input
          label={t('profile.languagesSpoken')}
          value={editLanguages}
          onChangeText={setEditLanguages}
          containerStyle={styles.editFieldGap}
        />
        <Input
          label={t('profile.travelAdventureStyles')}
          value={editStyles}
          onChangeText={setEditStyles}
          containerStyle={styles.editFieldGap}
        />

        <Button
          label={t('profile.saveProfileChanges')}
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
            accessibilityRole="button"
            accessibilityLabel={t('profile.closeSignIn')}
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
                <Text style={styles.bottomSheetTitle}>{t('profile.savedPlacesTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowSavedPlacesModal(false);
                  setNavbarHidden(false);
                }}
                style={styles.bottomSheetCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
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
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.removeSavedPlace', { name: place.name })}
                  >
                    <Trash2 size={16} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              ))}
              {savedPlaces.length === 0 && (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#8A92A6', fontStyle: 'italic', fontSize: 13 }}>
                    {t('profile.savedPlacesEmpty')}
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
                <Text style={styles.bottomSheetTitle}>{t('profile.selectLanguageTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowLanguageModal(false);
                  setNavbarHidden(false);
                }}
                style={styles.bottomSheetCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* List. docs/REMEDIATION.md §9.4: only English and Hindi have
                real translations shipped. Picking one of the other three
                still records the preference (for when it's built) but
                does not pretend the UI actually switched to it. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {[
                { label: 'English', sub: '', code: 'en' as const },
                { label: 'Hindi', sub: '(हिन्दी)', code: 'hi' as const },
                { label: 'Punjabi', sub: '(ਪੰਜਾਬੀ)', code: null },
                { label: 'Bengali', sub: '(বাংলা)', code: null },
                { label: 'Tamil', sub: '(தமிழ்)', code: null },
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
                        if (lang.code) {
                          void setAppLanguage(lang.code);
                        } else {
                          toast(
                            t('profile.notTranslatedYet', {
                              language: lang.label,
                              current: getAppLanguage() === 'hi' ? t('profile.langNameHindi') : t('profile.langNameEnglish'),
                            }),
                            'info',
                          );
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${lang.label} ${lang.sub}`.trim()}
                      accessibilityState={{ selected: isSelected }}
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
  menuContainer: {
    paddingHorizontal: 16,
    marginTop: -8,
  },
  sectionHeader: {
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
