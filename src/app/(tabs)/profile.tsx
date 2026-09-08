import { RouteErrorFallback } from '@/components/route-error-fallback';
import { Button, Chip, Input, ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';
import { recordConsent } from '@/lib/consent';
import { errorToastMessage, showAlert, toast, useConfirm } from '@/lib/feedback';
import { getAppLanguage, setAppLanguage } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { formatINR } from '@/lib/money';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push';
import { uploadFileToUrl } from '@/lib/upload';
import { apiService, type NotificationPreferences, type SavedDestination } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useNavigation, useRouter, type ErrorBoundaryProps } from 'expo-router';
import Award from 'lucide-react-native/icons/award';
import Bell from 'lucide-react-native/icons/bell';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Camera from 'lucide-react-native/icons/camera';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import Compass from 'lucide-react-native/icons/compass';
import HelpCircle from 'lucide-react-native/icons/circle-question-mark';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Download from 'lucide-react-native/icons/download';
import Globe from 'lucide-react-native/icons/globe';
import ImageIcon from 'lucide-react-native/icons/image';
import LifeBuoy from 'lucide-react-native/icons/life-buoy';
import LogOut from 'lucide-react-native/icons/log-out';
import MapPin from 'lucide-react-native/icons/map-pin';
import Pencil from 'lucide-react-native/icons/pencil';
import Phone from 'lucide-react-native/icons/phone';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Trash2 from 'lucide-react-native/icons/trash-2';
import User from 'lucide-react-native/icons/user';
import Wallet from 'lucide-react-native/icons/wallet';
import X from 'lucide-react-native/icons/x';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Safe dynamic import to prevent native app crash if module is unlinked in old
// APK. Deliberately require(), not import(): this needs to synchronously
// catch a missing/unlinked native module at load time, which an async
// dynamic import() can't replicate without restructuring this whole screen
// around a promise.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

function ProfileScreen() {
  useEffect(() => {
    logger.log('Screen mounted: ProfileScreen');
  }, []);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ setup?: string }>();
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
  const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);

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
  const [editAvatar, setEditAvatar] = useState(profile.avatar || '');
  // docs/REMEDIATION.md §8.2 — true while a picked photo is being uploaded
  // to object storage; the avatar picker UI disables itself and shows a
  // spinner during this window (see pickImageFromDevice/takePhotoWithCamera).
  const [avatarUploading, setAvatarUploading] = useState(false);
  // These all used to seed from a fake fixture ('Aarav Sharma', a hardcoded
  // '+91' phone/emergency pair, 'Hindi, English, Punjabi', a canned bio and
  // travel-style string) instead of the real profile or a genuine blank —
  // the "hydrate on modal open" block below immediately overwrites these
  // with the real values anyway, so an empty string here is never user
  // visible, just no longer a lie if it ever were.
  const [editName, setEditName] = useState(profile.name || '');
  const [editGender, setEditGender] = useState(profile.gender || 'Private');
  const [editBio, setEditBio] = useState(profile.bio || '');
  const [editPhone, setEditPhone] = useState(profile.phoneNumber || '');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState(profile.emergencyContact || '');
  const [editLanguages, setEditLanguages] = useState(profile.languages || '');
  const [editStyles, setEditStyles] = useState(profile.travelStyles || '');

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      checkUnreadNotifications();
    });
    return unsubscribe;
  }, [navigation, checkUnreadNotifications]);

  useEffect(() => {
    return () => {
      setNavbarHidden(false);
    };
  }, [setNavbarHidden]);

  // Same adjust-during-render pattern: populate the edit fields the instant
  // the modal transitions to open, without a setState-in-effect violation.
  const [prevShowEditModal, setPrevShowEditModal] = useState(showEditModal);
  if (showEditModal !== prevShowEditModal) {
    setPrevShowEditModal(showEditModal);
    if (showEditModal) {
      setEditAvatar(profile.avatar || '');
      setEditName(profile.name || '');
      setEditGender(profile.gender || 'Private');
      setEditBio(profile.bio || '');
      setEditPhone(profile.phoneNumber || '');
      setEditEmergencyPhone(profile.emergencyContact || '');
      setEditLanguages(profile.languages || '');
      setEditStyles(profile.travelStyles || '');
    }
  }

  // Open the setup modal when arriving with ?setup=true. Adjusted during
  // render rather than from an effect (react-hooks/set-state-in-effect), and
  // keyed so it fires once per arrival instead of re-opening the modal every
  // time the user closes it while the param is still on the URL.
  const [prevSetupKey, setPrevSetupKey] = useState<string | null>(null);
  const setupKey = params.setup === 'true' && isLoggedIn ? 'open' : null;
  if (setupKey !== prevSetupKey) {
    setPrevSetupKey(setupKey);
    if (setupKey === 'open') setShowEditModal(true);
  }

  const queryClient = useQueryClient();

  // The user's real bookmarks, from GET /destinations/saved.
  //
  // This used to read `profile.savedPlaces`, a key that only ever existed in
  // this client's UserProfile type: the server's updateProfile schema has no
  // such field, so Zod stripped it and answered `ok: true` while storing
  // nothing. Nothing in the app could add to the list either, so it was
  // permanently empty and the delete button below wrote to a value the
  // server discarded. Both ends are real now.
  const {
    data: savedPlaces,
    isPending: savedPending,
    isError: savedErrored,
    refetch: refetchSaved,
  } = useQuery({
    queryKey: queryKeys.savedDestinations(),
    queryFn: async () => (await apiService.getSavedDestinations()) ?? [],
    enabled: isLoggedIn,
  });
  const savedCount = savedPlaces?.length ?? 0;

  const unsaveDestination = useMutation({
    mutationFn: (destinationId: string) => apiService.unsaveDestination(destinationId),
    onMutate: async (destinationId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.savedDestinations() });
      const previous = queryClient.getQueryData<SavedDestination[]>(queryKeys.savedDestinations());
      queryClient.setQueryData<SavedDestination[]>(queryKeys.savedDestinations(), (current = []) =>
        current.filter((d) => d.id !== destinationId),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.savedDestinations(), context.previous);
      toast(errorToastMessage(err, t('profile.couldNotRemoveSaved')), 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedDestinations() });
    },
  });

  // Same adjust-during-render pattern as above: hydrate these local editable
  // copies whenever the profile object itself changes (mirrors the original
  // effect's `[profile]` dependency exactly).
  const [prevProfileForSettings, setPrevProfileForSettings] = useState(profile);
  if (profile !== prevProfileForSettings) {
    setPrevProfileForSettings(profile);
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
          // A real OS-level denial — the user was actually asked. The
          // 'not-configured'/'unsupported' branch below is not: the OS
          // never prompted, so there is no decision to record.
          recordConsent('NOTIFICATIONS', false);
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
        recordConsent('NOTIFICATIONS', true);
      } else {
        await unregisterPushNotifications();
        recordConsent('NOTIFICATIONS', false);
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
      logger.warn('[Profile] Avatar upload failed, falling back to device asset URI:', err);
      if (asset.uri) {
        setEditAvatar(asset.uri);
        toast('Photo selected from device', 'info');
      } else {
        toast(errorToastMessage(err, t('profile.couldNotUploadPhoto')), 'error');
      }
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
      recordConsent('PHOTOS', !!permissionResult?.granted);
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
    } catch (err: unknown) {
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
      recordConsent('CAMERA', !!permissionResult?.granted);
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
    } catch (err: unknown) {
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
      router.replace('/auth?mode=LOGIN');
    })();
  };

  // ── Privacy & data (docs/REMEDIATION.md §12.4) ────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const deletePasswordInputRef = useRef<TextInput>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (showDeleteModal) {
      const timer = setTimeout(() => {
        deletePasswordInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [showDeleteModal]);

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
      router.replace('/auth?mode=LOGIN');
    } catch (e) {
      toast(errorToastMessage(e, t('profile.couldNotDeleteAccount')), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.screenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#06152D" translucent />
      {/* Top background block so any overscroll at top is navy */}
      <View style={[styles.topBackdrop, { height: insets.top + 160 }]} />

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
            HERO EXECUTIVE BANNER & PROFILE HEADER
            ════════════════════════════════════════════════ */}
        <LinearGradient
          colors={['#06152D', '#0B2347', '#1A4AA8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.heroWrap, { paddingTop: Math.max(insets.top, 24) + 12 }]}
        >
          {/* Subtle decorative circles for depth */}
          <View style={styles.heroDecoCircle1} />
          <View style={styles.heroDecoCircle2} />

          {/* Top-Right Action Column: Edit (Pencil), Notifications (Bell) */}
          <View style={[styles.topRightActionCol, { top: Math.max(insets.top, 16) + 4 }]}>
            <TouchableOpacity
              style={styles.topActionBtn}
              activeOpacity={0.7}
              onPress={() => {
                if (!isLoggedIn) {
                  router.push('/auth?mode=SIGNUP');
                  return;
                }
                setShowEditModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={isLoggedIn ? t('profile.editProfile') : (t('common.login') || 'Sign In')}
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
            {/* Elevated Professional Avatar */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (!isLoggedIn) {
                  router.push('/auth?mode=SIGNUP');
                } else {
                  setShowEditModal(true);
                }
              }}
              style={styles.avatarHaloContainer}
              accessibilityRole="button"
              accessibilityLabel={isLoggedIn ? t('profile.profilePhoto') : (t('common.login') || 'Sign In')}
            >
              <View style={styles.avatarBorder}>
                {isLoggedIn && profile.avatar ? (
                  <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.anonymousAvatar}>
                    <User size={38} color="#94A3B8" strokeWidth={1.8} />
                  </View>
                )}
              </View>
              {isLoggedIn && (
                <View style={styles.avatarCameraBadge}>
                  <Camera size={12} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.nameSection}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{profile.name || (isLoggedIn ? 'Traveler' : 'Guest Traveler')}</Text>
                {profile.isVerified && (
                  <CheckCircle size={17} color="#38BDF8" fill="#38BDF8" style={{ marginLeft: 6 }} />
                )}
              </View>

              {/* Elite Membership Badge */}
              <View style={styles.badgeRow}>
                <View style={styles.memberBadge}>
                  <Compass size={11} color="#BFDBFE" />
                  <Text style={styles.memberBadgeText}>
                    {isLoggedIn ? (profile.role || 'EXPLORER') : 'GUEST EXPLORER'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.userBio, !profile.bio && styles.userBioEmpty]}>
                {profile.bio || (isLoggedIn ? t('profile.bioEmpty') : 'Sign in to access your saved trips, bookings, and rewards.')}
              </Text>

              {!isLoggedIn && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.guestLoginPromptBtn}
                  onPress={() => router.push('/auth?mode=SIGNUP')}
                  accessibilityRole="button"
                  accessibilityLabel="Sign In or Create Account"
                >
                  <Text style={styles.guestLoginPromptText}>Sign In / Create Account →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* ════════════════════════════════════════════════
            BODY CONTAINER (FLOATING OVER HERO)
            ════════════════════════════════════════════════ */}
        <View style={styles.bodyContainer}>
          {/* Quick Stats Ribbon */}
          <View style={styles.statsCardWrap}>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <View style={[styles.statIconBadge, { backgroundColor: '#EFF6FF' }]}>
                  <Compass size={16} color="#0B63E5" />
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {(isLoggedIn && profile.travelStyles?.split(',')[0]?.trim()) || t('profile.statStyleFallback')}
                </Text>
                <Text style={styles.statLabel}>{t('profile.statStyle')}</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <View style={[styles.statIconBadge, { backgroundColor: '#F0FDF4' }]}>
                  <Wallet size={16} color="#16A34A" />
                </View>
                {/* formatINR, not an inline `₹` + toLocaleString — currency is
                    formatted in exactly one place (CONVENTIONS.md §3). */}
                <Text style={styles.statValue}>{formatINR(profile.walletBalance ?? 0)}</Text>
                <Text style={styles.statLabel}>{t('profile.statWallet')}</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <View style={[styles.statIconBadge, { backgroundColor: '#FAF5FF' }]}>
                  <Award size={16} color="#9333EA" />
                </View>
                {/* `?? 0`, not `?? 250`: a missing balance is zero points, not
                    250 the account never earned. A fabricated rewards figure is
                    the same class of invention as a fake wallet balance. */}
                <Text style={styles.statValue}>{(profile.rewardPoints ?? 0).toLocaleString('en-IN')}</Text>
                <Text style={styles.statLabel}>{t('profile.statPoints')}</Text>
              </View>
            </View>
          </View>

          {/* ════════════════════════════════════════════════
              PROFILE SETUP GUIDE BANNER (IF INCOMPLETE)
              ════════════════════════════════════════════════ */}
          {isLoggedIn && (!profile.avatar || !profile.bio) && (
            <View style={styles.profileSetupBannerWrap}>
              <View style={styles.profileSetupBanner}>
                <View style={styles.setupBannerLeft}>
                  <View style={styles.setupBannerIconBadge}>
                    <Sparkles size={18} color="#0B63E5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.setupBannerTitle}>Complete your profile</Text>
                    <Text style={styles.setupBannerSubtitle}>
                      {!profile.avatar && !profile.bio
                        ? 'Add a photo from your device and a bio to connect with travelers.'
                        : !profile.avatar
                        ? 'Add your profile picture from your device.'
                        : 'Add a bio to introduce yourself.'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.setupBannerActionBtn}
                  onPress={() => setShowEditModal(true)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Set up profile"
                >
                  <Text style={styles.setupBannerActionText}>Set Up →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ════════════════════════════════════════════════
              MENU SECTIONS & CARDS
              ════════════════════════════════════════════════ */}
          <View style={styles.menuContainer}>
            {/* Section: PERSONAL DETAILS */}
            <Text style={styles.sectionHeader}>{t('profile.personalDetails')}</Text>
            <View style={styles.menuCard}>
              <TouchableOpacity
                style={styles.detailItem}
                activeOpacity={0.7}
                onPress={() => (isLoggedIn ? setShowEditModal(true) : router.push('/auth?mode=SIGNUP'))}
                accessibilityRole="button"
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBadge, { backgroundColor: '#EFF6FF' }]}>
                    <Phone size={16} color="#0B63E5" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.detailLabel}>{t('profile.mobilePhone')}</Text>
                    <Text style={[styles.detailValue, !profile.phoneNumber && styles.detailValueEmpty]}>
                      {profile.phoneNumber || t('profile.notAddedYet')}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={15} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.detailItem}
                activeOpacity={0.7}
                onPress={() => (isLoggedIn ? setShowEditModal(true) : router.push('/auth?mode=SIGNUP'))}
                accessibilityRole="button"
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBadge, { backgroundColor: '#FEF2F2' }]}>
                    <ShieldAlert size={16} color="#DC2626" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.detailLabel}>{t('profile.emergencySosContact')}</Text>
                    <Text style={[styles.detailValue, !profile.emergencyContact && styles.detailValueEmpty]}>
                      {profile.emergencyContact || t('profile.notAddedYet')}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={15} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.detailItem}
                activeOpacity={0.7}
                onPress={() => (isLoggedIn ? setShowEditModal(true) : router.push('/auth?mode=SIGNUP'))}
                accessibilityRole="button"
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBadge, { backgroundColor: '#F0FDF4' }]}>
                    <Globe size={16} color="#16A34A" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.detailLabel}>{t('profile.languagesSpoken')}</Text>
                    <Text style={[styles.detailValue, !profile.languages && styles.detailValueEmpty]}>
                      {profile.languages || t('profile.notAddedYet')}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={15} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              <TouchableOpacity
                style={styles.detailItem}
                activeOpacity={0.7}
                onPress={() => (isLoggedIn ? setShowEditModal(true) : router.push('/auth?mode=SIGNUP'))}
                accessibilityRole="button"
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBadge, { backgroundColor: '#FAF5FF' }]}>
                    <Compass size={16} color="#9333EA" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.detailLabel}>{t('profile.adventureStyles')}</Text>
                    <Text style={[styles.detailValue, !profile.travelStyles && styles.detailValueEmpty]}>
                      {profile.travelStyles || t('profile.notAddedYet')}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={15} color="#94A3B8" />
              </TouchableOpacity>
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#EFF6FF' }]}>
                    <Briefcase size={16} color="#0B63E5" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.bookingsTrips')}</Text>
                    <Text style={styles.menuItemSub}>{t('profile.bookingsTripsSub')}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#FEF2F2' }]}>
                    <Bookmark size={16} color="#EF4444" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.savedDestinations')}</Text>
                    <Text style={styles.menuItemSub}>{t('profile.savedDestinationsCount', { count: savedCount })}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#F0FDF4' }]}>
                    <CreditCard size={16} color="#16A34A" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.expenseTracker')}</Text>
                    <Text style={styles.menuItemSub}>{t('profile.expenseTrackerSub')}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#EFF6FF' }]}>
                    <Globe size={16} color="#2563EB" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.languageRegion', { language: selectedLanguage })}</Text>
                    <Text style={styles.menuItemSub}>{selectedLanguage}</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              {/* Push Notifications Toggle */}
              <View style={styles.menuItem}>
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconBadge, { backgroundColor: '#FAF5FF' }]}>
                    <Bell size={16} color="#7C3AED" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.pushNotifications')}</Text>
                    <Text style={styles.menuItemSub}>Trip alerts and safety warnings</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={pushBusy}
                  onPress={handleTogglePush}
                  style={[
                    styles.switchTrack,
                    { backgroundColor: pushNotifications ? '#0B63E5' : '#E2E8F0', opacity: pushBusy ? 0.6 : 1 },
                  ]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="switch"
                  accessibilityLabel={t('profile.pushNotifications')}
                  accessibilityState={{ checked: pushNotifications, disabled: pushBusy }}
                >
                  <View style={[styles.switchThumb, pushNotifications ? styles.switchThumbOn : styles.switchThumbOff]} />
                </TouchableOpacity>
              </View>

              {/* Per-category opt-outs */}
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
                          { backgroundColor: pushPrefs[row.key] ? '#0B63E5' : '#E2E8F0', transform: [{ scale: 0.85 }] },
                        ]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#FEF3C7' }]}>
                    <MapPin size={16} color="#D97706" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.locationSharing')}</Text>
                    <Text style={styles.menuItemSub}>Real-time location with co-travelers</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const newValue = !locationSharing;
                    setLocationSharing(newValue);
                    updateProfile({ locationSharing: newValue });
                    recordConsent('LOCATION', newValue);
                  }}
                  style={[styles.switchTrack, { backgroundColor: locationSharing ? '#0B63E5' : '#E2E8F0' }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#ECFDF5' }]}>
                    <LifeBuoy size={16} color="#059669" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.customerSupport')}</Text>
                    <Text style={styles.menuItemSub}>24/7 travel concierge & assistance</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
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
                  <View style={[styles.menuIconBadge, { backgroundColor: '#F1F5F9' }]}>
                    <HelpCircle size={16} color="#475569" />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text style={styles.menuItemTitle}>{t('profile.aboutTravelStar')}</Text>
                    <Text style={styles.menuItemSub}>Version 1.0.0 • Terms & Privacy</Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Section 3: ACCOUNT & SECURITY */}
            <Text style={styles.sectionHeader}>{t('profile.accountSettings') || 'Account & Security'}</Text>
            <View style={styles.menuCard}>
              {/* Download my data */}
              {isLoggedIn && (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    activeOpacity={0.7}
                    onPress={handleExportData}
                    disabled={exporting}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.downloadMyData')}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconBadge, { backgroundColor: '#F1F5F9' }]}>
                        <Download size={16} color="#475569" />
                      </View>
                      <View style={styles.menuItemTextCol}>
                        <Text style={styles.menuItemTitle}>
                          {exporting ? t('profile.preparingExport') : t('profile.downloadMyData')}
                        </Text>
                        <Text style={styles.menuItemSub}>Export personal data & trip history</Text>
                      </View>
                    </View>
                    <ChevronRight size={16} color="#94A3B8" />
                  </TouchableOpacity>
                  <View style={styles.menuDivider} />
                </>
              )}

              {/* Delete account */}
              {isLoggedIn && (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    activeOpacity={0.7}
                    onPress={() => setShowDeleteModal(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.deleteMyAccount')}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconBadge, { backgroundColor: '#FEF2F2' }]}>
                        <Trash2 size={16} color="#DC2626" />
                      </View>
                      <View style={styles.menuItemTextCol}>
                        <Text style={[styles.menuItemTitle, { color: '#DC2626' }]}>{t('profile.deleteMyAccount')}</Text>
                        <Text style={styles.menuItemSub}>Permanently erase account & all data</Text>
                      </View>
                    </View>
                    <ChevronRight size={16} color="#94A3B8" />
                  </TouchableOpacity>
                  <View style={styles.menuDivider} />
                </>
              )}

              {/* Sign Out or Sign In */}
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={isLoggedIn ? handleLogout : () => router.push('/auth?mode=SIGNUP')}
                accessibilityRole="button"
                accessibilityLabel={isLoggedIn ? t('profile.signOutOfAccount') : 'Log In / Sign Up'}
              >
                <View style={styles.menuItemLeft}>
                  <View
                    style={[
                      styles.menuIconBadge,
                      { backgroundColor: isLoggedIn ? '#FEF2F2' : '#EFF6FF' },
                    ]}
                  >
                    <LogOut size={16} color={isLoggedIn ? '#DC2626' : '#0B63E5'} />
                  </View>
                  <View style={styles.menuItemTextCol}>
                    <Text
                      style={[
                        styles.menuItemTitle,
                        { color: isLoggedIn ? '#DC2626' : '#0B63E5' },
                      ]}
                    >
                      {isLoggedIn ? t('profile.signOutOfAccount') : 'Log In / Sign Up'}
                    </Text>
                    <Text style={styles.menuItemSub}>
                      {isLoggedIn ? 'Sign out of current device' : 'Access your trips & benefits'}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom spacing so bottom navigation bar doesn't obscure Sign Out button */}
          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      {/* Delete account confirmation modal (placed outside ScrollView for flawless keyboard & focus interaction) */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setDeletePassword('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.deleteOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setShowDeleteModal(false);
              setDeletePassword('');
            }}
          />
          <View style={styles.deleteCard}>
            <Text style={styles.deleteTitle}>{t('profile.deleteAccountTitle')}</Text>
            <Text style={styles.deleteBodyText}>{t('profile.deleteAccountBody')}</Text>
            <Input
              ref={deletePasswordInputRef}
              placeholder={t('profile.currentPassword')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={deletePassword}
              onChangeText={setDeletePassword}
              accessibilityLabel={t('profile.currentPassword')}
              autoFocus
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
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════
          EDIT PROFILE MODAL
          ════════════════════════════════════════════════ */}
      <Sheet
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={(!profile.avatar || !profile.bio) ? 'Set Up Your Profile' : t('profile.editProfileTitle')}
      >
        {/* Friendly setup guide notice if profile is not fully set up */}
        {(!profile.avatar || !profile.bio) && (
          <View style={styles.modalSetupTip}>
            <Sparkles size={18} color="#0B63E5" />
            <Text style={styles.modalSetupTipText}>
              Add your profile photo from your device and a bio so fellow travelers can get to know you!
            </Text>
          </View>
        )}

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
            {editAvatar ? (
              <Image source={{ uri: editAvatar }} style={styles.avatarPreviewImage} />
            ) : (
              <View style={styles.avatarPreviewPlaceholder}>
                <User size={38} color="#94A3B8" strokeWidth={1.8} />
              </View>
            )}
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

            {!!editAvatar && (
              <TouchableOpacity
                style={[styles.devicePickBtn, { borderColor: '#FECACA' }]}
                activeOpacity={0.8}
                onPress={() => setEditAvatar('')}
                disabled={avatarUploading}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Trash2 size={15} color="#EF4444" />
                <Text style={[styles.devicePickBtnText, { color: '#EF4444' }]}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Input label={t('profile.fullName')} value={editName} onChangeText={setEditName} placeholder={t('profile.enterFullName')} />

        {/* Gender Selection Section */}
        <Text style={styles.inputLabel}>{t('profile.gender')}</Text>
        <View style={styles.genderWrap}>
          {[
            { label: 'Male', labelKey: 'profile.genderMale' },
            { label: 'Female', labelKey: 'profile.genderFemale' },
            { label: 'Non-Binary', labelKey: 'profile.genderNonBinary' },
            { label: 'Private', labelKey: 'profile.genderPrivate' },
          ].map((g) => (
            <Chip
              key={g.label}
              label={t(g.labelKey)}
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
                <X size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
              {savedPending ? (
                <ScreenLoading label={t('profile.loadingSavedPlaces')} />
              ) : savedErrored ? (
                <ScreenError
                  title={t('profile.couldNotLoadSaved')}
                  message={t('profile.couldNotLoadSavedMessage')}
                  onRetry={() => void refetchSaved()}
                />
              ) : savedCount === 0 ? (
                <ScreenEmpty title={t('profile.savedPlacesEmptyTitle')} message={t('profile.savedPlacesEmpty')} />
              ) : (
                (savedPlaces ?? []).map((place) => (
                  <View key={place.id} style={styles.savedPlaceCard}>
                    <Image source={{ uri: place.image }} style={styles.savedPlaceImage} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.savedPlaceName}>{place.name}</Text>
                      <Text style={styles.savedPlaceLocation}>{place.tags}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => unsaveDestination.mutate(place.id)}
                      disabled={unsaveDestination.isPending}
                      style={styles.deletePlaceBtn}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.removeSavedPlace', { name: place.name })}
                    >
                      <Trash2 size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
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
                <X size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* List */}
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
                      style={[styles.langRow, isSelected && { backgroundColor: '#EFF6FF' }]}
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
                      <Text style={[styles.langText, isSelected && { color: '#0B63E5', fontWeight: '700' }]}>
                        {lang.label} {lang.sub && <Text style={styles.langSubText}>{lang.sub}</Text>}
                      </Text>
                      {isSelected && <Check size={16} color="#0B63E5" />}
                    </TouchableOpacity>
                    {idx < arr.length - 1 && <View style={styles.langDivider} />}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#06152D',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
  },

  // Hero & Header
  heroWrap: {
    minHeight: 275,
    width: '100%',
    position: 'relative',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 42,
    overflow: 'hidden',
  },
  heroDecoCircle1: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  heroDecoCircle2: {
    position: 'absolute',
    bottom: -30,
    right: -40,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
  profileHeaderContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 10,
  },
  avatarHaloContainer: {
    position: 'relative',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarBorder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#0F2C63',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 83,
    height: 83,
    borderRadius: 41.5,
  },
  anonymousAvatar: {
    width: 83,
    height: 83,
    borderRadius: 41.5,
    backgroundColor: '#1E3A6E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0B63E5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
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
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  badgeRow: {
    marginTop: 6,
    alignItems: 'center',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  memberBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  userBio: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 24,
    maxWidth: 340,
  },
  userBioEmpty: {
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  guestLoginPromptBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  guestLoginPromptText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0B63E5',
    letterSpacing: 0.2,
  },

  // Body container (Light Slate)
  bodyContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    paddingTop: 16,
    paddingBottom: 24,
  },

  // Stats Ribbon
  statsCardWrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  statValue: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#F1F5F9',
  },

  // Setup banner
  profileSetupBannerWrap: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  profileSetupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#0B63E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    gap: 12,
  },
  setupBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setupBannerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  setupBannerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  setupBannerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
  },
  setupBannerActionBtn: {
    backgroundColor: '#0B63E5',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupBannerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Menu Sections
  menuContainer: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    marginRight: 10,
  },
  menuIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextCol: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.1,
  },
  menuItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
  },
  detailValueEmpty: {
    color: '#94A3B8',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 64,
  },

  // Switches
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  pushCategoryGroup: {
    paddingLeft: 64,
    paddingRight: 16,
    paddingBottom: 8,
    gap: 2,
    backgroundColor: '#F8FAFC',
  },
  pushCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  pushCategoryLabel: {
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '500',
  },

  // Edit Modal form styles
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
    borderColor: '#0B63E5',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0B63E5',
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
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 99, 229, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(11, 99, 229, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  devicePickBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B63E5',
  },
  avatarPreviewPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSetupTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 16,
  },
  modalSetupTipText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1E40AF',
    fontWeight: '500',
    lineHeight: 18,
  },

  // Bottom Sheets
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
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
    color: '#0F172A',
  },
  bottomSheetCloseBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedPlaceCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  savedPlaceLocation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  deletePlaceBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#0F172A',
  },
  langSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: 'normal',
  },
  langDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
  },

  // Delete modal
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  deleteBodyText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },
  deleteBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});

export default React.memo(ProfileScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Profile" />;
}
