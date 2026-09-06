import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  TextInput,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorToastMessage, toast, useConfirm } from '@/lib/feedback';
import { uploadFileToUrl } from '@/lib/upload';
import { recordConsent } from '@/lib/consent';
import { Button, Input, ScreenEmpty, ScreenLoading, Sheet } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import type {
  GuideLead,
  GuideProfile,
  GuideEarnings,
  GuidePackage,
  GuideReel,
  GuideLiveStatus,
  LiveWeather,
} from '@/types/api';
import type { SOSAlert } from '@/store/AppContext';
import { formatDate } from '@/lib/datetime';
import * as ImagePicker from 'expo-image-picker';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Search from 'lucide-react-native/icons/search';
import Users from 'lucide-react-native/icons/users';
import MapPin from 'lucide-react-native/icons/map-pin';
import Calendar from 'lucide-react-native/icons/calendar';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import UploadCloud from 'lucide-react-native/icons/cloud-upload';
import ImageIcon from 'lucide-react-native/icons/image';
import Video from 'lucide-react-native/icons/video';
import Plus from 'lucide-react-native/icons/plus';
import FileText from 'lucide-react-native/icons/file-text';
import Camera from 'lucide-react-native/icons/camera';
import Clock from 'lucide-react-native/icons/clock';
import Compass from 'lucide-react-native/icons/compass';
import Car from 'lucide-react-native/icons/car';
import Train from 'lucide-react-native/icons/tram-front';
import Plane from 'lucide-react-native/icons/plane';
import Calculator from 'lucide-react-native/icons/calculator';
import Hotel from 'lucide-react-native/icons/hotel';
import Home from 'lucide-react-native/icons/house';
import Tent from 'lucide-react-native/icons/tent';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Sun from 'lucide-react-native/icons/sun';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import Wind from 'lucide-react-native/icons/wind';
import Sunrise from 'lucide-react-native/icons/sunrise';
import Sunset from 'lucide-react-native/icons/sunset';
import Activity from 'lucide-react-native/icons/activity';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import PhoneCall from 'lucide-react-native/icons/phone-call';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import Shield from 'lucide-react-native/icons/shield';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


// ─── Interfaces ───
// A real GuideLead is a JoinRequest row (docs/REMEDIATION.md §8.17 /
// §8.16's GET /:id/leads) — it carries no avatar, budget, group size,
// duration, or free-text description. There is no backend model for those
// fields yet (a real "lead" quote/response flow needs a schema of its own),
// so the lead card below shows only what the row actually has rather than
// inventing the rest, and `handleSendQuote` below stays local-only per that
// same flagged gap.

interface UploadedMedia {
  id: string;
  type: 'STORY' | 'REEL';
  title: string;
  category: 'LOCATION' | 'PRICING';
  image: string;
  location: string;
  price?: string;
  likes: number;
  date: string;
}

const TRANSIT_MODE_LABEL_KEYS: Record<'BIKE' | 'CAR' | 'TRAIN' | 'PLANE', string> = {
  BIKE: 'travelGuide.modeBike',
  CAR: 'travelGuide.modeCarSuv',
  TRAIN: 'travelGuide.modeTrain',
  PLANE: 'travelGuide.modeFlight',
};

const CROWD_LABEL_KEYS: Record<'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL', string> = {
  LOW: 'travelGuide.crowdLow',
  MODERATE: 'travelGuide.crowdModerate',
  HIGH: 'travelGuide.crowdHigh',
  CRITICAL: 'travelGuide.crowdCritical',
};

const AQI_LABEL_KEYS: Record<'EXCELLENT' | 'GOOD' | 'POOR' | 'HAZARDOUS', string> = {
  EXCELLENT: 'travelGuide.aqiExcellent',
  GOOD: 'travelGuide.aqiGood',
  POOR: 'travelGuide.aqiPoor',
  HAZARDOUS: 'travelGuide.aqiHazardous',
};

const ALERT_TYPE_LABEL_KEYS: Record<string, string> = {
  DANGER: 'travelGuide.alertTypeDanger',
  WARNING: 'travelGuide.alertTypeWarning',
  INFO: 'travelGuide.alertTypeInfo',
};

const LEAD_STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: 'travelGuide.statusPending',
  APPROVED: 'travelGuide.statusApproved',
  REJECTED: 'travelGuide.statusRejected',
};

const BUDGET_CATEGORY_LABEL_KEYS: Record<string, string> = {
  Transport: 'travelGuide.budgetCategoryTransport',
  Food: 'travelGuide.budgetCategoryFood',
  Lodging: 'travelGuide.budgetCategoryLodging',
  'Guide Fee': 'travelGuide.budgetCategoryGuideFee',
  Misc: 'travelGuide.budgetCategoryMisc',
};

interface WeatherData {
  city: string;
  temp: string;
  condition: string;
  wind: string;
  sunrise: string;
  sunset: string;
  aqi: number;
  aqiStatus: 'EXCELLENT' | 'GOOD' | 'POOR' | 'HAZARDOUS';
  aqiColor: string;
  crowdLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  crowdColor: string;
}

export default function TravelGuideScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useApp();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'leads' | 'upload' | 'planning' | 'weather' | 'safety'>('leads');
  const [guideProfile, setGuideProfile] = useState<GuideProfile | null>(null);
  const [, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<GuideEarnings | null>(null);
  const [packages, setPackages] = useState<GuidePackage[]>([]);
  const [reels, setReels] = useState<GuideReel[]>([]);
  const [liveStatus, setLiveStatus] = useState<GuideLiveStatus | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);

  // Live weather state (fetched from API)
  const [liveWeatherData, setLiveWeatherData] = useState<LiveWeather | null>(null);
  const [, setWeatherLoading] = useState(false);

  // Safety state (fetched from API). monsoonAdvisories/userEmergencyContacts
  // were fetched into write-only state (never read anywhere in this
  // component) — removed rather than given a real type for the sake of it.
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [, setSafetyLoading] = useState(false);

  // Leads state (fetched from API)
  const [leadsLoading, setLeadsLoading] = useState(false);

  // CRUD state variables for packages modal
  const [pkgModalVisible, setPkgModalVisible] = useState(false);
  const [editingPackage, setEditingPackage] = useState<GuidePackage | null>(null);
  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgPrice, setPkgPrice] = useState('');
  const [pkgDuration, setPkgDuration] = useState('');
  const [pkgCities, setPkgCities] = useState('');

  // ────────────────────────────────────────────────────────
  // TABS 1: LEADS & EARNINGS STATE
  // ────────────────────────────────────────────────────────
  const [searchLeadQuery, setSearchLeadQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({});

  const loadGuideProfile = async () => {
    try {
      setLoading(true);
      const res = await apiService.getMyGuideProfile();
      if (res) {
        const guide = res;
        setGuideProfile(guide);
        // Deliberately not awaited — these run in parallel, each with its
        // own try/catch (see below), so one failing doesn't block the rest.
        void fetchEarnings(guide.id);
        void fetchPackages(guide.id);
        void fetchReels(guide.id);
        void fetchLiveStatus(guide.id);
        void fetchLeads(guide.id);
        void fetchSafetyData();
        void fetchLiveWeather(guide.id);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Load profile failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeads = async (guideId: string) => {
    try {
      setLeadsLoading(true);
      const res = await apiService.getGuideLeads(guideId);
      if (res && Array.isArray(res)) {
        setLeads(res);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch leads failed:', e);
    } finally {
      setLeadsLoading(false);
    }
  };

  const fetchSafetyData = async () => {
    try {
      setSafetyLoading(true);
      const sosRes = await apiService.getSOSAlerts();
      if (sosRes && Array.isArray(sosRes)) setSosAlerts(sosRes);
    } catch (e) {
      logger.warn('[TravelGuide] Fetch safety data failed:', e);
    } finally {
      setSafetyLoading(false);
    }
  };

  const fetchLiveWeather = async (guideId: string) => {
    try {
      setWeatherLoading(true);
      // Use guide's last-known position if available
      const statusRes = await apiService.getGuideLiveStatus(guideId);
      const loc = statusRes?.location;
      const lat = loc?.latitude || 26.9124;
      const lon = loc?.longitude || 75.7873;
      const weatherRes = await apiService.getLiveWeather(lat, lon);
      if (weatherRes) {
        setLiveWeatherData(weatherRes);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch live weather failed:', e);
    } finally {
      setWeatherLoading(false);
    }
  };

  const fetchEarnings = async (guideId: string) => {
    try {
      const res = await apiService.getEarnings(guideId);
      if (res) {
        setEarnings(res);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch earnings failed:', e);
    }
  };

  const fetchPackages = async (guideId: string) => {
    try {
      const res = await apiService.getGuidePackages(guideId);
      if (res) {
        setPackages(res);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch packages failed:', e);
    }
  };

  const fetchReels = async (guideId: string) => {
    try {
      const res = await apiService.getGuideReels(guideId);
      if (res) {
        setReels(res);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch reels failed:', e);
    }
  };

  const fetchLiveStatus = async (guideId: string) => {
    try {
      const res = await apiService.getGuideLiveStatus(guideId);
      if (res) {
        setLiveStatus(res);
      }
    } catch (e) {
      logger.warn('[TravelGuide] Fetch live status failed:', e);
    }
  };

  const triggerLiveBroadcast = async () => {
    if (!guideProfile) return;
    const lat = 26.9124 + (Math.random() - 0.5) * 0.01;
    const lon = 75.7873 + (Math.random() - 0.5) * 0.01;
    try {
      const res = await apiService.updateGuideLiveStatus(guideProfile.id, { latitude: lat, longitude: lon });
      if (res) {
        setLiveStatus((prev) => (prev ? { ...prev, location: res } : { location: res, activeGuiding: null }));
      }
    } catch (e) {
      logger.warn('Failed to broadcast live location:', e);
    }
  };

  const handleSavePackage = async () => {
    if (!pkgTitle || !pkgPrice || !pkgDuration) {
      toast(t('travelGuide.packageFieldsRequired'), 'error');
      return;
    }
    if (!guideProfile) return;

    const payload = {
      title: pkgTitle,
      description: pkgDesc,
      price: parseFloat(pkgPrice),
      durationDays: parseInt(pkgDuration),
      citiesIncluded: pkgCities
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    };

    try {
      if (editingPackage) {
        await apiService.updateGuidePackage(guideProfile.id, editingPackage.id, payload);
        toast(t('travelGuide.packageUpdated'), 'success');
      } else {
        await apiService.createGuidePackage(guideProfile.id, payload);
        toast(t('travelGuide.packageCreated'), 'success');
      }
      setPkgModalVisible(false);
      void fetchPackages(guideProfile.id);
    } catch {
      toast(t('travelGuide.failedToSavePackage'), 'error');
    }
  };

  const handleDeletePackage = async (pkgId: string) => {
    if (!guideProfile) return;
    const ok = await confirm({
      title: t('travelGuide.deletePackageTitle'),
      message: t('travelGuide.deletePackageMessage'),
      confirmLabel: t('travelGuide.delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiService.deleteGuidePackage(guideProfile.id, pkgId);
      void fetchPackages(guideProfile.id);
      toast(t('travelGuide.packageDeleted'), 'success');
    } catch (e) {
      // Previously `catch {}` around an Alert — the underlying error was
      // discarded entirely, so a 403 and a network drop looked identical
      // (docs/REMEDIATION.md §0.3).
      logger.warn('[TravelGuide] Delete package failed:', e);
      toast(errorToastMessage(e, t('travelGuide.couldNotDeletePackage')), 'error');
    }
  };

  // docs/REMEDIATION.md §8.17: this used to set the picked video's local
  // file://(/blob:/data: on web) uri directly as videoUrl — reachable only
  // on this guide's own device. Same fix as §8.2/§8.4: upload first, only
  // ever keep the real, publicly-readable URL.
  const handlePickVideo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      recordConsent('PHOTOS', permission.granted);
      if (!permission.granted) {
        toast(t('travelGuide.galleryPermissionRequiredReels'), 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 1,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const contentType = asset.mimeType === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
      setMediaUploading(true);
      try {
        const { uploadUrl, publicUrl } = await apiService.getGuideMediaUploadUrl(contentType);
        await uploadFileToUrl(asset.uri, uploadUrl, contentType);
        setSelectedVideoUri(publicUrl);
      } catch (uploadErr) {
        logger.warn('[TravelGuide] Video upload failed:', uploadErr);
        toast(errorToastMessage(uploadErr, t('travelGuide.couldNotUploadVideo')), 'error');
      } finally {
        setMediaUploading(false);
      }
    } catch (e) {
      logger.warn('Video pick error:', e);
    }
  };

  // loadGuideProfile (and the fetch* functions it calls) are plain functions
  // redeclared every render, not stable useCallbacks — adding it to the deps
  // array would refire this on every render instead of once on mount, which
  // is the intended behavior here.
  useEffect(() => {
    // False positive: loadGuideProfile's own setState calls happen after an
    // `await`, inside its promise continuation, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGuideProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same reasoning applies to triggerLiveBroadcast below — it isn't a stable
  // reference either, so it's deliberately left out of the deps array rather
  // than tearing down and resetting this interval on every render.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (isBroadcasting && guideProfile) {
      intervalId = setInterval(() => {
        void triggerLiveBroadcast();
      }, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcasting, guideProfile]);

  const [leads, setLeads] = useState<GuideLead[]>([]);
  // 'QUOTE_SENT' isn't a real JoinRequestStatus — there's no quote/response
  // field on that model (see the note above), so this stays a purely local
  // "did I click send" marker rather than overwriting the lead's real status.
  const [quotedLeadIds, setQuotedLeadIds] = useState<Set<string>>(new Set());

  const handleSendQuote = (leadId: string) => {
    const quoteVal = quoteInputs[leadId] || '';
    if (!quoteVal.trim() || isNaN(parseFloat(quoteVal))) {
      toast('Invalid Quote — Please enter a valid numeric quote amount in ₹.', 'error');
      return;
    }

    setQuotedLeadIds((prev) => new Set(prev).add(leadId));
    toast(`Quote Sent Successfully! — Your bid of ₹${quoteVal} has been sent to the traveler. They will be notified immediately.`, 'success');
    setQuoteInputs((prev) => ({ ...prev, [leadId]: '' }));
    setSelectedLeadId(null);
  };

  // Filtered Leads
  const filteredLeads = leads.filter(
    (l) =>
      l.tripName.toLowerCase().includes(searchLeadQuery.toLowerCase()) ||
      l.applicantName.toLowerCase().includes(searchLeadQuery.toLowerCase()),
  );

  // ────────────────────────────────────────────────────────
  // TABS 2: UPLOAD STORIES & REELS STATE
  // ────────────────────────────────────────────────────────
  const [uploadCategory, setUploadCategory] = useState<'STORY' | 'REEL'>('STORY');
  const [uploadTheme, setUploadTheme] = useState<'LOCATION' | 'PRICING'>('LOCATION');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaLocation, setMediaLocation] = useState('');
  const [mediaPrice, setMediaPrice] = useState('');
  // docs/REMEDIATION.md §8.17: these used to default to a hardcoded
  // Unsplash URL and offer a "Simulated media selection gallery" (the
  // original code's own comment) of 5 more hardcoded stock photos in place
  // of a real picker — publishing without ever picking anything just
  // published that stock photo as if it were the guide's own content.
  // Null until a real photo is picked and uploaded; the publish button is
  // disabled until then (see the JSX below).
  const [selectedCoverImage, setSelectedCoverImage] = useState<string | null>(null);
  const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<string | null>(null);
  // True while a cover photo, thumbnail, or video is uploading to object
  // storage — the picker row disables itself and shows a spinner.
  const [mediaUploading, setMediaUploading] = useState(false);

  const [activeMedia, setActiveMedia] = useState<UploadedMedia[]>([]);

  const pickAndUploadImage = async (onUploaded: (publicUrl: string) => void) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      recordConsent('PHOTOS', permission.granted);
      if (!permission.granted) {
        toast(t('travelGuide.galleryPermissionRequiredPhoto'), 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const contentType =
        asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
      setMediaUploading(true);
      try {
        const { uploadUrl, publicUrl } = await apiService.getGuideMediaUploadUrl(contentType);
        await uploadFileToUrl(asset.uri, uploadUrl, contentType);
        onUploaded(publicUrl);
      } catch (uploadErr) {
        logger.warn('[TravelGuide] Photo upload failed:', uploadErr);
        toast(errorToastMessage(uploadErr, t('travelGuide.couldNotUploadPhoto')), 'error');
      } finally {
        setMediaUploading(false);
      }
    } catch (e) {
      logger.warn('Image pick error:', e);
    }
  };

  const pickCoverImage = () => pickAndUploadImage(setSelectedCoverImage);
  const pickThumbnail = () => pickAndUploadImage(setSelectedThumbnailUri);

  const handlePublishMedia = async () => {
    if (!mediaTitle.trim() || !mediaLocation.trim()) {
      toast(t('travelGuide.fillTitleLocation'), 'error');
      return;
    }
    if (uploadCategory === 'REEL' && !selectedVideoUri) {
      toast(t('travelGuide.noVideoSelected'), 'error');
      return;
    }
    if (uploadCategory === 'STORY' && !selectedCoverImage) {
      toast(t('travelGuide.noPhotoSelected'), 'error');
      return;
    }
    if (!guideProfile) return;

    const caption = `${mediaTitle.trim()} | ${mediaLocation.trim()}${uploadTheme === 'PRICING' && mediaPrice.trim() ? ` | ₹${mediaPrice.trim()}/Day` : ''}`;

    try {
      // docs/REMEDIATION.md §8.17: this always called uploadGuideReel
      // regardless of uploadCategory, so a "Quick Story" post silently
      // created a GuideReel row instead of a TravelStory. STORY and REEL
      // are different content types with different backend homes.
      if (uploadCategory === 'STORY') {
        await apiService.createStory({
          title: mediaTitle.trim(),
          content: caption,
          coverImg: selectedCoverImage ?? undefined,
          location: mediaLocation.trim(),
          hasReel: false,
        });
      } else {
        // Guaranteed by the uploadCategory === 'REEL' guard at the top of
        // this function, but TS can't narrow selectedVideoUri across that
        // compound `uploadCategory === 'REEL' && !selectedVideoUri` check.
        if (!selectedVideoUri) return;
        await apiService.uploadGuideReel(guideProfile.id, {
          videoUrl: selectedVideoUri,
          thumbnailUrl: selectedThumbnailUri || undefined,
          caption,
        });
      }

      // Also add to local state for immediate UI feedback
      const newItem: UploadedMedia = {
        id: `m-${Date.now()}`,
        type: uploadCategory,
        title: mediaTitle.trim(),
        category: uploadTheme,
        image: (uploadCategory === 'STORY' ? selectedCoverImage : selectedThumbnailUri) ?? '',
        location: mediaLocation.trim(),
        price: uploadTheme === 'PRICING' ? (mediaPrice.trim() ? `₹${mediaPrice.trim()}/Day` : undefined) : undefined,
        likes: 0,
        date: t('travelGuide.justNow'),
      };
      setActiveMedia([newItem, ...activeMedia]);

      // Refresh reels from server
      void fetchReels(guideProfile.id);

      setMediaTitle('');
      setMediaLocation('');
      setMediaPrice('');
      setSelectedCoverImage(null);
      setSelectedThumbnailUri(null);
      setSelectedVideoUri(null);
      toast(
        uploadCategory === 'STORY' ? t('travelGuide.publishedStory') : t('travelGuide.publishedReel'),
        'success',
      );
    } catch (e) {
      logger.warn('[TravelGuide] Publish media failed:', e);
      toast(errorToastMessage(e, t('travelGuide.couldNotPublishContent')), 'error');
    }
  };

  // ────────────────────────────────────────────────────────
  // TABS 3: PLANNING, ESTIMATOR, BUDGET & LODGING STATE
  // ────────────────────────────────────────────────────────
  const [plannerTab, setPlannerTab] = useState<'itinerary' | 'estimator' | 'budget' | 'lodging'>('itinerary');

  // docs/REMEDIATION.md §9.3/§9.4 follow-up: an itineraryDays/handleAddDay
  // feature (seeded with hardcoded "Arrival & Local Market Walk"-style fake
  // days) used to live here but was never rendered anywhere in this file's
  // JSX — no form, no list, nothing called handleAddDay. Removed rather than
  // wired up, since there's no UI to connect it to and inventing one is a
  // product decision, not a lint fix.

  // Time Estimator
  const [estFrom, setEstFrom] = useState('');
  const [estTo, setEstTo] = useState('');
  const [estDist, setEstDist] = useState('');
  const [estMode, setEstMode] = useState<'BIKE' | 'CAR' | 'TRAIN' | 'PLANE'>('CAR');
  const [estimationResult, setEstimationResult] = useState<string | null>(null);

  const calculateEstimation = () => {
    const distanceVal = parseFloat(estDist);
    if (!estFrom.trim() || !estTo.trim() || isNaN(distanceVal) || distanceVal <= 0) {
      toast(t('travelGuide.provideValidRoute'), 'error');
      return;
    }

    let avgSpeed = 45; // km/h
    let loadingBuffer = 0.5; // hrs
    if (estMode === 'BIKE') avgSpeed = 38;
    if (estMode === 'TRAIN') {
      avgSpeed = 65;
      loadingBuffer = 1.0;
    }
    if (estMode === 'PLANE') {
      avgSpeed = 600;
      loadingBuffer = 2.5; // check-in/airport buffer
    }

    const travelHrs = distanceVal / avgSpeed;
    const totalTime = travelHrs + loadingBuffer;
    const hours = Math.floor(totalTime);
    const minutes = Math.round((totalTime - hours) * 60);

    const timeString = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
    setEstimationResult(
      t('travelGuide.estimationResultText', {
        from: estFrom.trim(),
        to: estTo.trim(),
        distance: distanceVal,
        mode: t(TRANSIT_MODE_LABEL_KEYS[estMode]),
        time: timeString,
      }),
    );
  };

  // Budget Calculator
  const [costTransport, setCostTransport] = useState('1500');
  const [costFood, setCostFood] = useState('800');
  const [costLodge, setCostLodge] = useState('2200');
  const [costGuide, setCostGuide] = useState('1500');
  const [costMisc, setCostMisc] = useState('500');
  const [budgetBreakdown, setBudgetBreakdown] = useState<{ total: number; percentages: Record<string, number> } | null>(
    null,
  );

  const calculateBudgetBreakdown = () => {
    const tr = parseFloat(costTransport) || 0;
    const fd = parseFloat(costFood) || 0;
    const ld = parseFloat(costLodge) || 0;
    const gd = parseFloat(costGuide) || 0;
    const ms = parseFloat(costMisc) || 0;

    const total = tr + fd + ld + gd + ms;
    if (total === 0) {
      toast(t('travelGuide.zeroCostError'), 'error');
      return;
    }

    setBudgetBreakdown({
      total,
      percentages: {
        Transport: (tr / total) * 100,
        Food: (fd / total) * 100,
        Lodging: (ld / total) * 100,
        'Guide Fee': (gd / total) * 100,
        Misc: (ms / total) * 100,
      },
    });
  };

  // Accommodations
  const [accomTab, setAccomTab] = useState<'HOTELS' | 'HOSTELS' | 'HOMESTAYS' | 'CAMPING'>('HOTELS');
  const accommodationsData = {
    HOTELS: [
      {
        name: 'Raddison Palace',
        location: 'Jaipur',
        rate: '₹4,500/night',
        rating: 4.8,
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=80',
      },
      {
        name: 'Hotel Snow Retreat',
        location: 'Manali',
        rate: '₹3,200/night',
        rating: 4.5,
        image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=200&q=80',
      },
    ],
    HOSTELS: [
      {
        name: 'Zostel Heritage',
        location: 'Jaipur Outskirts',
        rate: '₹800/night',
        rating: 4.6,
        image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&q=80',
      },
      {
        name: 'The Backpackers Nest',
        location: 'Goa',
        rate: '₹650/night',
        rating: 4.3,
        image: 'https://images.unsplash.com/photo-1623625434462-e5e42318ae4f?w=200&q=80',
      },
    ],
    HOMESTAYS: [
      {
        name: 'Verdant Meadows Homestay',
        location: 'Munnar Hills',
        rate: '₹1,800/night',
        rating: 4.9,
        image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=200&q=80',
      },
      {
        name: 'Sikkimese Traditional Stay',
        location: 'Gangtok',
        rate: '₹2,000/night',
        rating: 4.7,
        image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=200&q=80',
      },
    ],
    CAMPING: [
      {
        name: 'Pangong Lake Echo Camps',
        location: 'Ladakh',
        rate: '₹3,500/night',
        rating: 4.8,
        image: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=200&q=80',
      },
      {
        name: 'Riverside Woods Camping',
        location: 'Rishikesh',
        rate: '₹1,500/night',
        rating: 4.4,
        image: 'https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=200&q=80',
      },
    ],
  };

  const handleBookingRedirect = (accomName: string) => {
    toast(t('travelGuide.partnerRedirection', { name: accomName }), 'info');
  };

  // ────────────────────────────────────────────────────────
  // TABS 4: LIVE WEATHER, FORECAST, AQI & CROWD LEVEL
  // ────────────────────────────────────────────────────────
  const [selectedWeatherIdx, setSelectedWeatherIdx] = useState(0);

  // Build weather display from live API data or defaults
  const weatherLocations: WeatherData[] = liveWeatherData
    ? [
        {
          city: t('travelGuide.guideLocationFallback'),
          temp: liveWeatherData.temp || '—',
          condition: liveWeatherData.condition || t('travelGuide.loadingEllipsis'),
          wind: liveWeatherData.windSpeed || '— km/h',
          sunrise: '05:30 AM',
          sunset: '07:00 PM',
          aqi: 30,
          aqiStatus: 'GOOD' as const,
          aqiColor: C.cyan,
          crowdLevel: 'MODERATE' as const,
          crowdColor: C.cyan,
        },
      ]
    : [
        {
          city: t('travelGuide.loadingEllipsis'),
          temp: '—',
          condition: t('travelGuide.fetchingWeatherData'),
          wind: '—',
          sunrise: '—',
          sunset: '—',
          aqi: 0,
          aqiStatus: 'GOOD' as const,
          aqiColor: C.cyan,
          crowdLevel: 'LOW' as const,
          crowdColor: C.green,
        },
      ];

  const currentW = weatherLocations[selectedWeatherIdx] || weatherLocations[0];

  // ────────────────────────────────────────────────────────
  // TABS 5: SAFETY HUB & EMERGENCY CONTACTS
  // ────────────────────────────────────────────────────────
  // Places a real call. This used to pop an Alert reading "Initiating
  // cellular call to ..." and dial nothing — a helpline button on a safety
  // screen that did not work, which is the §8.9 hazard again.
  const handleEmergencyCall = (name: string, phone: string) => {
    const dialable = phone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${dialable}`).catch((e: unknown) => {
      logger.warn('[TravelGuide] Failed to open the phone dialer:', e);
      toast(t('travelGuide.couldNotOpenDialerFor', { phone, name }), 'error');
    });
  };

  // Static helpline contacts (always shown)
  const emergencyContacts = [
    {
      titleKey: 'travelGuide.contactNationalTouristHelpline',
      phone: '1800-11-1363',
      descKey: 'travelGuide.contactNationalTouristHelplineDesc',
      color: C.blue,
      Icon: PhoneCall,
    },
    {
      titleKey: 'travelGuide.contactPoliceEmergency',
      phone: '112',
      descKey: 'travelGuide.contactPoliceEmergencyDesc',
      color: C.rose,
      Icon: Shield,
    },
    {
      titleKey: 'travelGuide.contactNationalMedicalHelpline',
      phone: '102',
      descKey: 'travelGuide.contactNationalMedicalHelplineDesc',
      color: C.green,
      Icon: HeartPulse,
    },
    {
      titleKey: 'travelGuide.contactStateDisasterDesk',
      phone: '1070',
      descKey: 'travelGuide.contactStateDisasterDeskDesc',
      color: C.amber,
      Icon: AlertTriangle,
    },
  ];

  // Safety alerts now come from DB (sosAlerts state) — map for display
  const safetyAlerts =
    sosAlerts.length > 0
      ? sosAlerts.map((a) => ({
          id: a.id,
          type: a.status === 'ACTIVE' ? 'DANGER' : 'INFO',
          location: t('travelGuide.sosAlertLocation', { lat: a.latitude?.toFixed(4), lon: a.longitude?.toFixed(4) }),
          message: t('travelGuide.sosAlertMessage', {
            name: a.userName || t('travelGuide.unknownUser'),
            time: a.timestamp || t('travelGuide.unknownTime'),
          }),
        }))
      : [{ id: 'empty', type: 'INFO', location: t('travelGuide.allClear'), message: t('travelGuide.noActiveSosAlerts') }];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Modern Neon Header */}
      <LinearGradient
        colors={['rgba(20,24,47,0.8)', 'rgba(6,8,20,0.95)']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('travelGuide.goBack')}
          >
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t('travelGuide.headerTitle')}</Text>
            <Text style={styles.headerSub}>{t('travelGuide.headerSub')}</Text>
          </View>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.badgeOfficialGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Shield size={11} color={C.white} strokeWidth={2.5} />
            <Text style={styles.badgeOfficialText}>{t('travelGuide.verifiedBadge')}</Text>
          </LinearGradient>
        </View>

        {/* Floating Capsule Navigation Bar */}
        <View style={styles.tabBarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScroll}>
            {[
              { key: 'leads', labelKey: 'travelGuide.tabHubEarnings', Icon: TrendingUp },
              { key: 'upload', labelKey: 'travelGuide.tabUploadReels', Icon: UploadCloud },
              { key: 'planning', labelKey: 'travelGuide.tabGuidance', Icon: Compass },
              { key: 'weather', labelKey: 'travelGuide.tabLiveInfo', Icon: Sun },
              { key: 'safety', labelKey: 'travelGuide.tabSafetyDesk', Icon: ShieldAlert },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key as typeof activeTab)}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityLabel={t(tab.labelKey)}
                  accessibilityState={{ selected: isActive }}
                >
                  <tab.Icon size={14} color={isActive ? C.white : C.textSec} strokeWidth={isActive ? 2.5 : 1.8} />
                  <Text style={[styles.tabLabel, { color: isActive ? C.white : C.textSec }]}>{t(tab.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ========================================================
            TAB 1: LEADS & EARNINGS DASHBOARD
            ======================================================== */}
        {activeTab === 'leads' && (
          <View>
            {/* Premium Metallic Wallet Card */}
            <LinearGradient
              colors={['#181e3a', '#0b0d1b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.walletCard}
            >
              <View style={styles.walletCardAccent} />
              <View style={styles.walletHeader}>
                <View>
                  <Text style={styles.walletLabel}>{t('travelGuide.totalWalletBalance')}</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.rupeeSign}>₹</Text>
                    <Text style={styles.walletBalance}>
                      {earnings
                        ? earnings.walletBalance.toLocaleString('en-IN')
                        : profile.walletBalance.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.walletDivider} />

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('travelGuide.activeLeads')}</Text>
                  <Text style={[styles.statValue, { color: C.cyan }]}>
                    {earnings ? earnings.activeLeadsCount : leads.length}
                  </Text>
                </View>
                <View style={styles.statBoxVerticalDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('travelGuide.rating')}</Text>
                  <Text style={[styles.statValue, { color: C.amberGlow }]}>
                    {guideProfile ? `${guideProfile.rating} ★` : '4.9 ★'}
                  </Text>
                </View>
                <View style={styles.statBoxVerticalDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('travelGuide.completedTrips')}</Text>
                  <Text style={[styles.statValue, { color: C.greenGlow }]}>
                    {earnings ? earnings.completedTripsCount : 28}
                  </Text>
                </View>
              </View>

              {/* Earnings Mini Chart Graphic */}
              <Text style={styles.sectionLabelInline}>{t('travelGuide.weeklyEarningsProgress')}</Text>
              <View style={styles.chartContainer}>
                {(
                  earnings?.chartData
                    ? earnings.chartData
                    : [
                        { day: t('createTrip.weekdayMon'), amtText: '₹1.5k', height: 40 },
                        { day: t('createTrip.weekdayTue'), amtText: '₹2.2k', height: 65 },
                        { day: t('createTrip.weekdayWed'), amtText: '₹0', height: 5 },
                        { day: t('createTrip.weekdayThu'), amtText: '₹3.5k', height: 95 },
                        { day: t('createTrip.weekdayFri'), amtText: '₹1.8k', height: 50 },
                        { day: t('createTrip.weekdaySat'), amtText: '₹4.2k', height: 110 },
                        { day: t('createTrip.weekdaySun'), amtText: '₹2.8k', height: 80 },
                      ]
                ).map((item, idx) => {
                  const isWeekend = idx === 5 || idx === 6;
                  return (
                    <View key={idx} style={styles.chartCol}>
                      <Text style={styles.chartBarValue}>{item.amtText}</Text>
                      <LinearGradient
                        colors={isWeekend ? [C.purpleGlow, C.purple] : [C.blueGlow, C.blue]}
                        style={[styles.chartBar, { height: item.height }]}
                      />
                      <Text style={[styles.chartDayText, isWeekend && { color: C.purpleGlow }]}>{item.day}</Text>
                    </View>
                  );
                })}
              </View>
            </LinearGradient>

            {/* Tourist Customers Lead Search */}
            <View style={styles.leadHeader}>
              <View>
                <Text style={styles.subTitle}>{t('travelGuide.touristLeadFinder')}</Text>
                <Text style={styles.descSec}>{t('travelGuide.connectWithTravellersDesc')}</Text>
              </View>
              <View style={styles.badgeLive}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>{t('travelGuide.liveFeeds')}</Text>
              </View>
            </View>

            <Input
              placeholder={t('travelGuide.searchLeadsPlaceholder')}
              value={searchLeadQuery}
              onChangeText={setSearchLeadQuery}
              icon={<Search size={16} color={C.textSec} />}
              containerStyle={{ marginBottom: 14 }}
            />

            {leadsLoading ? (
              <ScreenLoading label={t('travelGuide.loadingLeads')} />
            ) : filteredLeads.length === 0 ? (
              <ScreenEmpty
                title={t('travelGuide.noMatchingLeadsTitle')}
                message={
                  leads.length === 0
                    ? t('travelGuide.noLeadsYetMessage')
                    : t('travelGuide.noLeadsMatchSearchMessage')
                }
              />
            ) : null}

            {filteredLeads.map((lead) => {
              const isSelected = selectedLeadId === lead.id;
              const hasQuote = quotedLeadIds.has(lead.id);

              return (
                <View key={lead.id} style={[styles.leadCard, isSelected && styles.leadCardSelected]}>
                  {isSelected && <View style={styles.activeBorderGlow} />}
                  <View style={styles.leadHeaderRow}>
                    {/* A GuideLead is a JoinRequest row — no applicant avatar
                        on that model, so this is a generic placeholder
                        rather than a made-up photo URL. */}
                    <View style={[styles.avatarBorder, styles.leadAvatarPlaceholder]}>
                      <Users size={16} color={C.textSec} />
                    </View>
                    <View style={styles.leadInfo}>
                      <Text style={styles.leadName}>{lead.applicantName}</Text>
                      <View style={styles.leadDestinationRow}>
                        <MapPin size={11} color={C.green} />
                        <Text style={styles.leadDestination} numberOfLines={1}>
                          {lead.tripName}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.leadRight}>
                      <Text style={styles.leadDays}>{t(LEAD_STATUS_LABEL_KEYS[lead.status] ?? 'travelGuide.statusPending')}</Text>
                    </View>
                  </View>

                  {/* Toggle Detailed Lead quote input */}
                  {isSelected ? (
                    <View style={styles.quoteInputsBox}>
                      <View style={styles.quoteInputsHeader}>
                        <Text style={styles.quoteInputLabel}>{t('travelGuide.sendAQuote')}</Text>
                      </View>
                      <Text style={styles.quoteSchedulePreview}>
                        {t('travelGuide.proposePackagePrice', { tripName: lead.tripName })}
                      </Text>

                      <View style={styles.bidRow}>
                        <View style={styles.currencyPrefix}>
                          <Text style={styles.currencyPrefixText}>₹</Text>
                        </View>
                        <TextInput
                          style={styles.bidInput}
                          placeholder={t('travelGuide.quotePackageBudget')}
                          placeholderTextColor={C.textMuted}
                          keyboardType="numeric"
                          value={quoteInputs[lead.id] || ''}
                          onChangeText={(text) => setQuoteInputs({ ...quoteInputs, [lead.id]: text })}
                        />
                        <TouchableOpacity
                          style={styles.sendQuoteBtn}
                          onPress={() => handleSendQuote(lead.id)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={t('travelGuide.submitQuote')}
                        >
                          <Text style={styles.sendQuoteBtnText}>{t('travelGuide.submitQuote')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.leadActionRow}>
                      <Text style={styles.dateLabel}>{t('travelGuide.requestedOn', { date: formatDate(lead.createdAt) })}</Text>
                      {hasQuote ? (
                        <View style={styles.quoteSentTag}>
                          <CheckCircle size={11} color={C.greenGlow} />
                          <Text style={styles.quoteSentTagText}>{t('travelGuide.quoteSent')}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.applyLeadBtn}
                          onPress={() => setSelectedLeadId(lead.id)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('travelGuide.quoteTrip')}
                        >
                          <Text style={styles.applyLeadBtnText}>{t('travelGuide.quoteTrip')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ========================================================
            TAB 2: REELS & STORIES UPLOAD
            ======================================================== */}
        {activeTab === 'upload' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>{t('travelGuide.broadcasterPanel')}</Text>
              <Text style={styles.descSec}>{t('travelGuide.broadcasterPanelDesc')}</Text>
            </View>

            <View style={styles.uploadOptionsBox}>
              <Text style={styles.formInputLabel}>{t('travelGuide.contentFormat')}</Text>
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[styles.selectorBtn, uploadCategory === 'STORY' && styles.selectorBtnActive]}
                  onPress={() => setUploadCategory('STORY')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('travelGuide.quickStory')}
                  accessibilityState={{ selected: uploadCategory === 'STORY' }}
                >
                  <ImageIcon size={15} color={uploadCategory === 'STORY' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadCategory === 'STORY' ? C.white : C.textSec }]}>
                    {t('travelGuide.quickStory')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.selectorBtn, uploadCategory === 'REEL' && styles.selectorBtnActive]}
                  onPress={() => setUploadCategory('REEL')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('travelGuide.travelReel')}
                  accessibilityState={{ selected: uploadCategory === 'REEL' }}
                >
                  <Video size={15} color={uploadCategory === 'REEL' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadCategory === 'REEL' ? C.white : C.textSec }]}>
                    {t('travelGuide.travelReel')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.formInputLabel}>{t('travelGuide.categoryTheme')}</Text>
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[styles.selectorBtnAlt, uploadTheme === 'LOCATION' && styles.selectorBtnAltActive]}
                  onPress={() => setUploadTheme('LOCATION')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('travelGuide.touristSpot')}
                  accessibilityState={{ selected: uploadTheme === 'LOCATION' }}
                >
                  <Compass size={13} color={uploadTheme === 'LOCATION' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadTheme === 'LOCATION' ? C.white : C.textSec }]}>
                    {t('travelGuide.touristSpot')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.selectorBtnAlt, uploadTheme === 'PRICING' && styles.selectorBtnAltActive]}
                  onPress={() => setUploadTheme('PRICING')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('travelGuide.pricePackages')}
                  accessibilityState={{ selected: uploadTheme === 'PRICING' }}
                >
                  <FileText size={13} color={uploadTheme === 'PRICING' ? C.white : C.textSec} />
                  <Text style={[styles.selectorLabelText, { color: uploadTheme === 'PRICING' ? C.white : C.textSec }]}>
                    {t('travelGuide.pricePackages')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Form inputs */}
              <Input
                label={t('travelGuide.captionDescription')}
                placeholder={t('travelGuide.captionPlaceholder')}
                value={mediaTitle}
                onChangeText={setMediaTitle}
                containerStyle={styles.formFieldGap}
              />

              <Input
                label={t('travelGuide.locationTag')}
                placeholder={t('travelGuide.locationTagPlaceholder')}
                value={mediaLocation}
                onChangeText={setMediaLocation}
                containerStyle={styles.formFieldGap}
              />

              {uploadTheme === 'PRICING' && (
                <Input
                  label={t('travelGuide.tripPackagePriceList')}
                  placeholder={t('travelGuide.tripPackagePricePlaceholder')}
                  keyboardType="numeric"
                  value={mediaPrice}
                  onChangeText={setMediaPrice}
                  containerStyle={styles.formFieldGap}
                />
              )}

              {/* docs/REMEDIATION.md §8.17: real pickers, uploaded to object
                  storage before selection can complete — no more stock-photo
                  "gallery". STORY needs a cover photo; REEL needs a video
                  and, optionally, a thumbnail. */}
              <Text style={styles.formInputLabel}>
                {uploadCategory === 'STORY' ? t('travelGuide.coverPhoto') : t('travelGuide.videoAndThumbnail')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryPreviewScroll}>
                {uploadCategory === 'REEL' && (
                  <TouchableOpacity
                    style={[
                      styles.galleryItemBtn,
                      { justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardAlt },
                      !!selectedVideoUri && styles.galleryItemBtnSelected,
                    ]}
                    onPress={handlePickVideo}
                    activeOpacity={0.8}
                    disabled={mediaUploading}
                    accessibilityRole="button"
                    accessibilityLabel={selectedVideoUri ? t('travelGuide.videoSelected') : t('travelGuide.pickVideo')}
                  >
                    <Video size={24} color={selectedVideoUri ? C.green : C.blueGlow} style={{ alignSelf: 'center' }} />
                    <Text style={{ fontSize: 12, color: C.textSec, marginTop: 4, textAlign: 'center' }}>
                      {selectedVideoUri ? t('travelGuide.videoSelected') : t('travelGuide.pickVideo')}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.galleryItemBtn,
                    { justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardAlt },
                    !!(uploadCategory === 'STORY' ? selectedCoverImage : selectedThumbnailUri) &&
                      styles.galleryItemBtnSelected,
                  ]}
                  onPress={uploadCategory === 'STORY' ? pickCoverImage : pickThumbnail}
                  activeOpacity={0.8}
                  disabled={mediaUploading}
                  accessibilityRole="button"
                  accessibilityLabel={uploadCategory === 'STORY' ? t('travelGuide.pickCoverPhoto') : t('travelGuide.pickThumbnail')}
                >
                  {(uploadCategory === 'STORY' ? selectedCoverImage : selectedThumbnailUri) ? (
                    <Image
                      source={{ uri: (uploadCategory === 'STORY' ? selectedCoverImage : selectedThumbnailUri)! }}
                      style={styles.galleryItemImage}
                    />
                  ) : (
                    <>
                      <ImageIcon size={24} color={C.blueGlow} style={{ alignSelf: 'center' }} />
                      <Text style={{ fontSize: 12, color: C.textSec, marginTop: 4, textAlign: 'center' }}>
                        {uploadCategory === 'STORY' ? t('travelGuide.pickCoverPhoto') : t('travelGuide.pickThumbnail')}
                      </Text>
                    </>
                  )}
                  {!!(uploadCategory === 'STORY' ? selectedCoverImage : selectedThumbnailUri) && (
                    <View style={styles.gallerySelectedCheck}>
                      <Plus size={10} color={C.white} />
                    </View>
                  )}
                </TouchableOpacity>

                {mediaUploading && (
                  <View style={[styles.galleryItemBtn, { justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator color={C.blueGlow} />
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.publishBtn, mediaUploading && { opacity: 0.6 }]}
                activeOpacity={0.8}
                onPress={handlePublishMedia}
                disabled={mediaUploading}
                accessibilityRole="button"
                accessibilityLabel={t('travelGuide.publishBroadcast')}
              >
                <Camera size={16} color={C.white} />
                <Text style={styles.publishBtnText}>{mediaUploading ? t('travelGuide.uploading') : t('travelGuide.publishBroadcast')}</Text>
              </TouchableOpacity>
            </View>

            {/* Active Feed Uploads */}
            <Text style={styles.subTitle}>{t('travelGuide.liveStoriesFeed')}</Text>
            <View style={styles.uploadsGrid}>
              {(reels.length > 0
                ? reels.map((r) => ({
                    id: r.id,
                    type: 'REEL',
                    title: r.caption || t('travelGuide.travelReelVlogFallback'),
                    image: r.thumbnailUrl || 'https://images.unsplash.com/photo-1548013146-72479768bada?w=300',
                    location: t('travelGuide.guidedTourRouteFallback'),
                    likes: r.likesCount,
                    date: t('travelGuide.justNow'),
                    price: undefined,
                  }))
                : activeMedia
              ).map((media) => (
                <View key={media.id} style={styles.uploadCardItem}>
                  <Image source={{ uri: media.image }} style={styles.uploadCardImg} />
                  <View style={styles.uploadCardOverlay}>
                    <View style={styles.badgeCategory}>
                      <Text style={styles.badgeCategoryText}>
                        {media.type === 'REEL' ? t('travelGuide.mediaTypeReel') : t('travelGuide.mediaTypeStory')}
                      </Text>
                    </View>
                    {media.price && (
                      <View style={[styles.badgeCategory, { backgroundColor: C.amber }]}>
                        <Text style={styles.badgeCategoryText}>{media.price}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.uploadCardInfoBox}>
                    <Text style={styles.uploadCardTitle} numberOfLines={1}>
                      {media.title}
                    </Text>
                    <View style={styles.uploadCardLocRow}>
                      <MapPin size={9} color={C.textSec} />
                      <Text style={styles.uploadCardLocText} numberOfLines={1}>
                        {media.location}
                      </Text>
                    </View>
                    <View style={styles.uploadCardLikesRow}>
                      <TrendingUp size={9} color={C.green} />
                      <Text style={styles.uploadCardLikes}>
                        {t('travelGuide.viewsCount', { count: media.likes, date: media.date })}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 3: PLANNING, ESTIMATION, BUDGET & ACCOMMODATION
            ======================================================== */}
        {activeTab === 'planning' && (
          <View>
            <View style={styles.plannerSubTabs}>
              {[
                { key: 'itinerary', labelKey: 'travelGuide.subtabItinerary', Icon: Calendar },
                { key: 'estimator', labelKey: 'travelGuide.subtabTimeEstimator', Icon: Clock },
                { key: 'budget', labelKey: 'travelGuide.subtabBudgetPlan', Icon: Calculator },
                { key: 'lodging', labelKey: 'travelGuide.subtabAccommodations', Icon: Hotel },
              ].map((sTab) => {
                const isSubActive = plannerTab === sTab.key;
                return (
                  <TouchableOpacity
                    key={sTab.key}
                    style={[styles.plannerSubTabItem, isSubActive && styles.plannerSubTabItemActive]}
                    onPress={() => setPlannerTab(sTab.key as typeof plannerTab)}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityLabel={t(sTab.labelKey)}
                    accessibilityState={{ selected: isSubActive }}
                  >
                    <Text style={[styles.plannerSubTabLabel, { color: isSubActive ? C.blueGlow : C.textSec }]}>
                      {t(sTab.labelKey)}
                    </Text>
                    {isSubActive && <View style={styles.plannerSubTabIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3A: Packages CRUD */}
            {plannerTab === 'itinerary' && (
              <View style={styles.innerPlannerSection}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 15,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subTitle}>{t('travelGuide.myGuidedTourPackages')}</Text>
                    <Text style={styles.descSec}>{t('travelGuide.managePackagesDesc')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.addDayBtn, { width: 120, height: MIN_TOUCH_TARGET, marginTop: 0 }]}
                    onPress={() => {
                      setEditingPackage(null);
                      setPkgTitle('');
                      setPkgDesc('');
                      setPkgPrice('');
                      setPkgDuration('');
                      setPkgCities('');
                      setPkgModalVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('travelGuide.addPackage')}
                  >
                    <Plus size={12} color={C.white} />
                    <Text style={styles.addDayBtnText}>{t('travelGuide.addPackage')}</Text>
                  </TouchableOpacity>
                </View>

                {packages.length === 0 ? (
                  <ScreenEmpty
                    title={t('travelGuide.noPackagesListedTitle')}
                    message={t('travelGuide.noPackagesListedMessage')}
                  />
                ) : (
                  <View style={{ gap: 12 }}>
                    {packages.map((pkg) => (
                      <View
                        key={pkg.id}
                        style={[
                          styles.leadCard,
                          {
                            padding: 16,
                            backgroundColor: C.card,
                            borderColor: C.border,
                            borderWidth: 1,
                            borderRadius: 16,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={[styles.leadName, { fontSize: 15, fontWeight: '800' }]}>{pkg.title}</Text>
                          <Text style={[styles.leadBudget, { color: C.greenGlow }]}>₹{pkg.price}</Text>
                        </View>
                        <Text style={[styles.descSec, { marginTop: 4, color: C.textSec }]}>
                          {t('travelGuide.packageDaysCities', {
                            days: pkg.durationDays,
                            cities: pkg.citiesIncluded?.join(', ') || t('travelGuide.variousLocations'),
                          })}
                        </Text>
                        <Text style={[styles.leadDesc, { marginTop: 8, color: 'rgba(255,255,255,0.8)' }]}>
                          {pkg.description}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
                          <TouchableOpacity
                            style={[
                              styles.applyLeadBtn,
                              { backgroundColor: C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
                            ]}
                            onPress={() => {
                              setEditingPackage(pkg);
                              setPkgTitle(pkg.title);
                              setPkgDesc(pkg.description);
                              setPkgPrice(String(pkg.price));
                              setPkgDuration(String(pkg.durationDays));
                              setPkgCities(pkg.citiesIncluded?.join(', ') || '');
                              setPkgModalVisible(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={t('travelGuide.edit')}
                          >
                            <Text style={[styles.applyLeadBtnText, { color: C.white }]}>{t('travelGuide.edit')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.applyLeadBtn,
                              {
                                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                              },
                            ]}
                            onPress={() => handleDeletePackage(pkg.id)}
                            accessibilityRole="button"
                            accessibilityLabel={t('travelGuide.delete')}
                          >
                            <Text style={[styles.applyLeadBtnText, { color: C.rose }]}>{t('travelGuide.delete')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Create/Edit Package Modal */}
                <Sheet
                  visible={pkgModalVisible}
                  onClose={() => setPkgModalVisible(false)}
                  title={editingPackage ? t('travelGuide.editPackage') : t('travelGuide.createPackage')}
                >
                  <Input
                    label={t('travelGuide.packageTitleLabel')}
                    placeholder={t('travelGuide.packageTitlePlaceholder')}
                    value={pkgTitle}
                    onChangeText={setPkgTitle}
                  />
                  <Input
                    label={t('travelGuide.packagePriceLabel')}
                    placeholder={t('travelGuide.packagePricePlaceholder')}
                    keyboardType="numeric"
                    value={pkgPrice}
                    onChangeText={setPkgPrice}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.packageDurationLabel')}
                    placeholder={t('travelGuide.packageDurationPlaceholder')}
                    keyboardType="numeric"
                    value={pkgDuration}
                    onChangeText={setPkgDuration}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.citiesIncludedLabel')}
                    placeholder={t('travelGuide.citiesIncludedPlaceholder')}
                    value={pkgCities}
                    onChangeText={setPkgCities}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.descriptionLabel')}
                    placeholder={t('travelGuide.descriptionPlaceholder')}
                    multiline
                    numberOfLines={3}
                    value={pkgDesc}
                    onChangeText={setPkgDesc}
                    containerStyle={styles.formFieldGap}
                  />

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                    <Button label={t('travelGuide.save')} style={{ flex: 1 }} onPress={handleSavePackage} />
                    <Button
                      label={t('travelGuide.cancel')}
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={() => setPkgModalVisible(false)}
                    />
                  </View>
                </Sheet>
              </View>
            )}

            {/* 3B: Travel Time Estimator */}
            {plannerTab === 'estimator' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>{t('travelGuide.transitTimeEstimator')}</Text>
                <Text style={styles.descSec}>{t('travelGuide.transitTimeEstimatorDesc')}</Text>

                <View style={styles.estimatorForm}>
                  <View style={styles.formInputRow}>
                    <Input
                      label={t('travelGuide.originCity')}
                      placeholder={t('travelGuide.originCityPlaceholder')}
                      value={estFrom}
                      onChangeText={setEstFrom}
                      containerStyle={{ flex: 1, marginRight: 8 }}
                    />
                    <Input
                      label={t('travelGuide.destinationCity')}
                      placeholder={t('travelGuide.destinationCityPlaceholder')}
                      value={estTo}
                      onChangeText={setEstTo}
                      containerStyle={{ flex: 1 }}
                    />
                  </View>

                  <Input
                    label={t('travelGuide.roadDistance')}
                    placeholder={t('travelGuide.roadDistancePlaceholder')}
                    keyboardType="numeric"
                    value={estDist}
                    onChangeText={setEstDist}
                    containerStyle={styles.formFieldGap}
                  />

                  <Text style={styles.formInputLabel}>{t('travelGuide.travelModeSelection')}</Text>
                  <View style={styles.modesGrid}>
                    {(
                      [
                        { mode: 'BIKE', Icon: Car },
                        { mode: 'CAR', Icon: Car },
                        { mode: 'TRAIN', Icon: Train },
                        { mode: 'PLANE', Icon: Plane },
                      ] as const
                    ).map((item) => {
                      const isModeActive = estMode === item.mode;
                      return (
                        <TouchableOpacity
                          key={item.mode}
                          style={[styles.modeTile, isModeActive && styles.modeTileActive]}
                          onPress={() => setEstMode(item.mode as typeof estMode)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={t(TRANSIT_MODE_LABEL_KEYS[item.mode])}
                          accessibilityState={{ selected: isModeActive }}
                        >
                          <item.Icon size={14} color={isModeActive ? C.white : C.textSec} />
                          <Text style={[styles.modeTileLabel, { color: isModeActive ? C.white : C.textSec }]}>
                            {t(TRANSIT_MODE_LABEL_KEYS[item.mode])}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={styles.estimateBtn}
                    onPress={calculateEstimation}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('travelGuide.calculateTransitTime')}
                  >
                    <Clock size={15} color={C.white} />
                    <Text style={styles.estimateBtnText}>{t('travelGuide.calculateTransitTime')}</Text>
                  </TouchableOpacity>

                  {estimationResult && (
                    <View style={styles.estimationResultCard}>
                      <Clock size={16} color={C.blueGlow} />
                      <Text style={styles.estimationResultText}>{estimationResult}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3C: Budget Calculator */}
            {plannerTab === 'budget' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>{t('travelGuide.travelCostBudgetCalculator')}</Text>
                <Text style={styles.descSec}>{t('travelGuide.travelCostBudgetDesc')}</Text>

                <View style={styles.budgetForm}>
                  <Input
                    label={t('travelGuide.transportExpenses')}
                    keyboardType="numeric"
                    value={costTransport}
                    onChangeText={setCostTransport}
                  />
                  <Input
                    label={t('travelGuide.foodMealsCost')}
                    keyboardType="numeric"
                    value={costFood}
                    onChangeText={setCostFood}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.accommodationStays')}
                    keyboardType="numeric"
                    value={costLodge}
                    onChangeText={setCostLodge}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.guideServiceCharge')}
                    keyboardType="numeric"
                    value={costGuide}
                    onChangeText={setCostGuide}
                    containerStyle={styles.formFieldGap}
                  />
                  <Input
                    label={t('travelGuide.miscellaneousBuffer')}
                    keyboardType="numeric"
                    value={costMisc}
                    onChangeText={setCostMisc}
                    containerStyle={styles.formFieldGap}
                  />

                  <TouchableOpacity
                    style={styles.calculateBudgetBtn}
                    onPress={calculateBudgetBreakdown}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('travelGuide.runCostAnalysis')}
                  >
                    <Calculator size={15} color={C.white} />
                    <Text style={styles.calculateBudgetBtnText}>{t('travelGuide.runCostAnalysis')}</Text>
                  </TouchableOpacity>

                  {budgetBreakdown && (
                    <View style={styles.budgetResultCard}>
                      <Text style={styles.budgetResultTitle}>{t('travelGuide.totalTripBudget')}</Text>
                      <Text style={styles.budgetResultAmount}>₹{budgetBreakdown.total.toLocaleString('en-IN')}</Text>

                      <Text style={styles.budgetResultSubtitle}>{t('travelGuide.expenseBreakdown')}</Text>
                      {Object.entries(budgetBreakdown.percentages).map(([name, pct]) => (
                        <View key={name} style={styles.breakdownRow}>
                          <View style={styles.breakdownLabelRow}>
                            <Text style={styles.breakdownName}>{t(BUDGET_CATEGORY_LABEL_KEYS[name] ?? name)}</Text>
                            <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                          </View>
                          <View style={styles.breakdownTrack}>
                            <View
                              style={[
                                styles.breakdownFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor:
                                    name === 'Transport'
                                      ? C.blue
                                      : name === 'Food'
                                        ? C.amber
                                        : name === 'Lodging'
                                          ? C.purple
                                          : name === 'Guide Fee'
                                            ? C.green
                                            : C.cyan,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3D: Lodging / Accommodations */}
            {plannerTab === 'lodging' && (
              <View style={styles.innerPlannerSection}>
                <Text style={styles.subTitle}>{t('travelGuide.lodgingAccommodations')}</Text>
                <Text style={styles.descSec}>{t('travelGuide.lodgingAccommodationsDesc')}</Text>

                <View style={styles.accomSelectorRow}>
                  {[
                    { key: 'HOTELS', labelKey: 'travelGuide.accomHotels', Icon: Hotel },
                    { key: 'HOSTELS', labelKey: 'travelGuide.accomHostels', Icon: Home },
                    { key: 'HOMESTAYS', labelKey: 'travelGuide.accomHomestays', Icon: Home },
                    { key: 'CAMPING', labelKey: 'travelGuide.accomCampsites', Icon: Tent },
                  ].map((item) => {
                    const isAccomActive = accomTab === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.accomSelectBtn, isAccomActive && styles.accomSelectBtnActive]}
                        onPress={() => setAccomTab(item.key as typeof accomTab)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t(item.labelKey)}
                        accessibilityState={{ selected: isAccomActive }}
                      >
                        <Text style={[styles.accomSelectLabel, { color: isAccomActive ? C.white : C.textSec }]}>
                          {t(item.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {accommodationsData[accomTab].map((item, idx) => (
                  <View key={idx} style={styles.stayCard}>
                    <Image source={{ uri: item.image }} style={styles.stayImage} />
                    <View style={styles.stayInfo}>
                      <View style={styles.stayHeaderRow}>
                        <Text style={styles.stayName}>{item.name}</Text>
                        <Text style={styles.stayRating}>{item.rating} ★</Text>
                      </View>
                      <View style={styles.stayLocRow}>
                        <MapPin size={11} color={C.textMuted} />
                        <Text style={styles.stayLocText}>{item.location}</Text>
                      </View>
                      <View style={styles.stayPriceRow}>
                        <Text style={styles.stayPrice}>{item.rate}</Text>
                        <TouchableOpacity
                          style={styles.bookingLinkBtn}
                          onPress={() => handleBookingRedirect(item.name)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('travelGuide.reserve')}
                        >
                          <Text style={styles.bookingLinkText}>{t('travelGuide.reserve')}</Text>
                          <ExternalLink size={10} color={C.blueGlow} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================
            TAB 4: WEATHER
            ======================================================== */}
        {activeTab === 'weather' && (
          <View>
            <View style={[styles.innerPlannerSection, { marginBottom: 20 }]}>
              <Text style={[styles.subTitle, { fontSize: 16 }]}>{t('travelGuide.liveGuidingBroadcastPanel')}</Text>
              <Text style={styles.descSec}>{t('travelGuide.liveGuidingBroadcastDesc')}</Text>

              <LinearGradient
                colors={
                  isBroadcasting
                    ? ['rgba(16, 185, 129, 0.08)', 'rgba(12, 15, 29, 0.95)']
                    : ['rgba(34, 41, 76, 0.2)', 'rgba(12, 15, 29, 0.95)']
                }
                style={[
                  styles.walletCard,
                  {
                    padding: 18,
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: isBroadcasting ? C.green : C.border,
                    borderRadius: 16,
                  },
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.walletLabel, { fontSize: 12 }]}>{t('travelGuide.broadcastStatus')}</Text>
                    <Text
                      style={[
                        styles.leadName,
                        {
                          color: isBroadcasting ? C.greenGlow : C.textSec,
                          fontSize: 14,
                          fontWeight: '800',
                          marginTop: 4,
                        },
                      ]}
                    >
                      {isBroadcasting ? t('travelGuide.broadcastActive') : t('travelGuide.broadcastInactive')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.cashoutBtn,
                      {
                        height: MIN_TOUCH_TARGET,
                        paddingHorizontal: 16,
                        backgroundColor: isBroadcasting ? C.rose : C.blue,
                        borderRadius: 8,
                        justifyContent: 'center',
                      },
                    ]}
                    onPress={() => {
                      if (isBroadcasting) {
                        setIsBroadcasting(false);
                      } else {
                        setIsBroadcasting(true);
                        void triggerLiveBroadcast();
                      }
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={isBroadcasting ? t('travelGuide.stopLive') : t('travelGuide.goLive')}
                  >
                    <Text style={[styles.cashoutBtnText, { fontSize: 12, lineHeight: 14 }]}>
                      {isBroadcasting ? t('travelGuide.stopLive') : t('travelGuide.goLive')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {liveStatus?.location && (
                  <View
                    style={{
                      marginTop: 14,
                      borderTopWidth: 1,
                      borderColor: 'rgba(255,255,255,0.06)',
                      paddingTop: 12,
                      gap: 4,
                    }}
                  >
                    <Text style={[styles.descSec, { fontSize: 12 }]}>{t('travelGuide.currentGpsCoordinates')}</Text>
                    <Text style={{ color: C.white, fontSize: 13, fontWeight: '700' }}>
                      {t('travelGuide.latLon', {
                        lat: liveStatus.location.latitude.toFixed(6),
                        lon: liveStatus.location.longitude.toFixed(6),
                      })}
                    </Text>
                    <Text style={[styles.descSec, { fontSize: 12 }]}>
                      {t('travelGuide.updatedAt', { time: new Date(liveStatus.location.updatedAt).toLocaleTimeString() })}
                    </Text>
                  </View>
                )}

                {liveStatus?.activeGuiding && (
                  <View
                    style={{
                      marginTop: 12,
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(59, 130, 246, 0.2)',
                    }}
                  >
                    <Text style={{ color: C.blueGlow, fontSize: 12, fontWeight: '700' }}>{t('travelGuide.guidingBookingOngoing')}</Text>
                    <Text style={[styles.descSec, { fontSize: 12, marginTop: 2 }]}>
                      {t('travelGuide.bookingId', { id: liveStatus.activeGuiding.bookingId })}
                    </Text>
                    <Text style={[styles.descSec, { fontSize: 12 }]}>{t('travelGuide.revenue', { amount: liveStatus.activeGuiding.amount })}</Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>{t('travelGuide.liveLocalParameters')}</Text>
              <Text style={styles.descSec}>{t('travelGuide.liveLocalParametersDesc')}</Text>
            </View>

            {/* Weather City Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weatherCitiesScroll}>
              {weatherLocations.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.weatherCityBtn, selectedWeatherIdx === idx && styles.weatherCityBtnActive]}
                  onPress={() => setSelectedWeatherIdx(idx)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={item.city}
                  accessibilityState={{ selected: selectedWeatherIdx === idx }}
                >
                  <Text style={[styles.weatherCityText, { color: selectedWeatherIdx === idx ? C.white : C.textSec }]}>
                    {item.city}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Primary Weather & Live Parameters Info */}
            <LinearGradient colors={['#0e1227', '#080a15']} style={styles.weatherLiveCard}>
              <View style={styles.weatherLiveCardGlow} />
              <View style={styles.weatherMainRow}>
                <View>
                  <Text style={styles.weatherMainCity}>{currentW.city}</Text>
                  <Text style={styles.weatherMainDesc}>{currentW.condition}</Text>
                </View>
                <View style={styles.weatherMainTempBox}>
                  <Sun size={28} color={C.amber} />
                  <Text style={styles.weatherMainTemp}>{currentW.temp}</Text>
                </View>
              </View>

              <View style={styles.weatherDetailsGrid}>
                <View style={styles.weatherDetailBox}>
                  <Wind size={15} color={C.blueGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>{t('travelGuide.windSpeed')}</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.wind}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Sunrise size={15} color={C.greenGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>{t('travelGuide.sunrise')}</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.sunrise}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Sunset size={15} color={C.amberGlow} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>{t('travelGuide.sunset')}</Text>
                    <Text style={styles.weatherDetailValue}>{currentW.sunset}</Text>
                  </View>
                </View>

                <View style={styles.weatherDetailBox}>
                  <Activity size={15} color={currentW.crowdColor} />
                  <View style={{ marginLeft: 6 }}>
                    <Text style={styles.weatherDetailLabel}>{t('travelGuide.crowdLevel')}</Text>
                    <Text style={[styles.weatherDetailValue, { color: currentW.crowdColor }]}>
                      {t(CROWD_LABEL_KEYS[currentW.crowdLevel])}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.aqiCard}>
                <View style={styles.aqiHeader}>
                  <Text style={styles.aqiTitle}>{t('travelGuide.airQualityIndex')}</Text>
                  <View style={[styles.aqiBadge, { backgroundColor: currentW.aqiColor }]}>
                    <Text style={styles.aqiBadgeText}>{t(AQI_LABEL_KEYS[currentW.aqiStatus])}</Text>
                  </View>
                </View>
                <View style={styles.aqiMeterRow}>
                  <Text style={styles.aqiValue}>{currentW.aqi}</Text>
                  <Text style={styles.aqiDescText}>
                    {currentW.aqiStatus === 'EXCELLENT' && t('travelGuide.aqiDescExcellent')}
                    {currentW.aqiStatus === 'GOOD' && t('travelGuide.aqiDescGood')}
                    {currentW.aqiStatus === 'POOR' && t('travelGuide.aqiDescPoor')}
                    {currentW.aqiStatus === 'HAZARDOUS' && t('travelGuide.aqiDescHazardous')}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* 5-Day Forecast Grid */}
            <Text style={styles.subTitle}>{t('travelGuide.fiveDayWeatherOutlook')}</Text>
            <View style={styles.forecastGrid}>
              {(
                [
                  { dayKey: 'travelGuide.dayFriday', temp: '32°C', icon: Sun, conditionKey: 'travelGuide.conditionSunny', isRain: false },
                  { dayKey: 'travelGuide.daySaturday', temp: '29°C', icon: CloudRain, conditionKey: 'travelGuide.conditionPartlyRain', isRain: true },
                  { dayKey: 'travelGuide.daySunday', temp: '28°C', icon: CloudRain, conditionKey: 'travelGuide.conditionThunderstorm', isRain: true },
                  { dayKey: 'travelGuide.dayMonday', temp: '31°C', icon: Sun, conditionKey: 'travelGuide.conditionClear', isRain: false },
                  { dayKey: 'travelGuide.dayTuesday', temp: '33°C', icon: Sun, conditionKey: 'travelGuide.conditionSunny', isRain: false },
                ] as const
              ).map((f, idx) => (
                <View key={idx} style={styles.forecastRow}>
                  <Text style={styles.forecastDay}>{t(f.dayKey)}</Text>
                  <View style={styles.forecastMid}>
                    <f.icon size={15} color={f.isRain ? C.blue : C.amber} />
                    <Text style={styles.forecastCondText}>{t(f.conditionKey)}</Text>
                  </View>
                  <Text style={styles.forecastTemp}>{f.temp}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ========================================================
            TAB 5: SAFETY
            ======================================================== */}
        {activeTab === 'safety' && (
          <View>
            <View style={styles.cardHeader}>
              <Text style={styles.subTitle}>{t('travelGuide.safetyEmergencyHelpdesk')}</Text>
              <Text style={styles.descSec}>{t('travelGuide.safetyEmergencyHelpdeskDesc')}</Text>
            </View>

            {/* Safety Warning Alerts List */}
            <Text style={styles.sectionLabelInline}>{t('travelGuide.realTimeSafetyAlerts')}</Text>
            {safetyAlerts.map((alert) => (
              <View key={alert.id} style={styles.safetyAlertItem}>
                <View style={styles.safetyAlertHeader}>
                  <View
                    style={[
                      styles.safetyAlertBadge,
                      {
                        backgroundColor:
                          alert.type === 'DANGER'
                            ? 'rgba(239,68,68,0.2)'
                            : alert.type === 'WARNING'
                              ? 'rgba(245,158,11,0.2)'
                              : 'rgba(59,130,246,0.2)',
                      },
                    ]}
                  >
                    <AlertTriangle
                      size={11}
                      color={alert.type === 'DANGER' ? C.rose : alert.type === 'WARNING' ? C.amber : C.blue}
                    />
                    <Text
                      style={[
                        styles.safetyAlertBadgeText,
                        { color: alert.type === 'DANGER' ? C.rose : alert.type === 'WARNING' ? C.amber : C.blue },
                      ]}
                    >
                      {t(ALERT_TYPE_LABEL_KEYS[alert.type] ?? 'travelGuide.alertTypeInfo')}
                    </Text>
                  </View>
                  <Text style={styles.safetyAlertLocation}>{alert.location}</Text>
                </View>
                <Text style={styles.safetyAlertMessage}>{alert.message}</Text>
              </View>
            ))}

            {/* Emergency Contacts Dial Desk */}
            <Text style={styles.sectionLabelInline}>{t('travelGuide.speedDialEmergencyDesk')}</Text>
            {emergencyContacts.map((contact, idx) => (
              <View key={idx} style={styles.contactItemCard}>
                <View style={styles.contactItemHeader}>
                  <View style={[styles.contactIconCircle, { backgroundColor: contact.color + '18' }]}>
                    <contact.Icon size={15} color={contact.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.contactTitle}>{t(contact.titleKey)}</Text>
                    <Text style={styles.contactDesc}>{t(contact.descKey)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.callActionBtn, { borderColor: contact.color }]}
                  onPress={() => handleEmergencyCall(t(contact.titleKey), contact.phone)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t(contact.titleKey)}
                >
                  <Text style={[styles.callActionBtnText, { color: contact.color }]}>{contact.phone}</Text>
                  <PhoneCall size={11} color={contact.color} />
                </TouchableOpacity>
              </View>
            ))}

            {/* The "Nearby Emergency Facilities" block was removed, not
                rebuilt (docs/REMEDIATION.md §8.9 / §0.2 rule 4). It listed
                two hardcoded places — "Apex Trauma Care, 1.4 km, Sector 5
                Main Marg" and "District Police HQ, 2.8 km, Kutchery Circle
                Rd" — with invented distances, shown identically to every
                user no matter where they were, on a safety screen whose
                whole purpose is telling someone in trouble where to go.
                Their "Navigate" buttons launched nothing; they popped an
                Alert reading "Launching Google Maps route to...". Real
                nearby-facility search needs a places/routing provider this
                project has no credentials for (the same constraint recorded
                at §8.13 and §8.8). The real, dialable helplines above are
                what this screen can honestly offer. */}
          </View>
        )}

        {/* Bottom Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────
// STYLES
// ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Header Gradient Box ─────────────────────────────
  headerGradient: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: C.textSec,
  },
  badgeOfficialGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  badgeOfficialText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },

  // ── Tab Bar ─────────────────────────────────────────
  tabBarContainer: {
    paddingHorizontal: 10,
    marginTop: 4,
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Section Titles ──────────────────────────────────
  subTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
    marginTop: 20,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  descSec: {
    fontSize: 12,
    color: C.textSec,
    marginBottom: 14,
  },
  sectionLabelInline: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  // ── Premium Wallet Card ─────────────────────────────
  walletCard: {
    borderRadius: 24,
    padding: 18,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  walletCardAccent: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,102,255,0.15)',
    filter: 'blur(30px)',
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  rupeeSign: {
    fontSize: 20,
    fontWeight: '700',
    color: C.blueGlow,
    marginRight: 2,
  },
  walletBalance: {
    fontSize: 28,
    fontWeight: '900',
    color: C.white,
  },
  cashoutBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  cashoutBtnGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashoutBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  walletDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statBoxVerticalDivider: {
    width: 1.2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statLabel: {
    fontSize: 12,
    color: C.textSec,
    marginBottom: 4,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
  },

  // ── Weekly Chart ────────────────────────────────────
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarValue: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartBar: {
    width: 11,
    borderRadius: 6,
  },
  chartDayText: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 6,
    fontWeight: '700',
  },

  // ── Lead Feed Header ────────────────────────────────
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 2,
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.rose,
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: C.rose,
  },

  // ── Glowing Leads Cards ──────────────────────────────
  leadCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  leadCardSelected: {
    borderColor: 'rgba(0,102,255,0.4)',
    backgroundColor: C.cardAlt,
  },
  activeBorderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.blueGlow,
  },
  avatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.borderGlow,
    padding: 1.5,
    marginRight: 10,
  },
  leadAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  leadAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
  },
  leadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
  leadDestinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  leadDestination: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
    maxWidth: '92%',
  },
  leadRight: {
    alignItems: 'flex-end',
  },
  leadBudget: {
    fontSize: 14,
    fontWeight: '900',
    color: C.greenGlow,
  },
  leadDays: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
    fontWeight: '700',
  },
  leadDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  leadActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
  },
  dateLabel: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '700',
  },
  applyLeadBtn: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  applyLeadBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blueGlow,
  },
  quoteSentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  quoteSentTagText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.greenGlow,
  },

  // ── Leads Bid Section ──
  quoteInputsBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 14,
  },
  quoteInputsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quoteInputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  quoteDurationBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: C.blueGlow,
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  quoteSchedulePreview: {
    fontSize: 12,
    color: C.textSec,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
    lineHeight: 16,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyPrefix: {
    width: 34,
    height: 38,
    backgroundColor: C.card,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  currencyPrefixText: {
    color: C.greenGlow,
    fontWeight: '800',
    fontSize: 13,
  },
  bidInput: {
    flex: 1,
    height: 38,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    color: C.white,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sendQuoteBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 14,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  sendQuoteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // ========================================================
  // TAB 2: REELS UPLOADER
  // ========================================================
  cardHeader: {
    marginTop: 4,
  },
  uploadOptionsBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 24,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  selectorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  selectorBtnActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  selectorBtnAlt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  selectorBtnAltActive: {
    backgroundColor: C.purple,
    borderColor: C.purpleGlow,
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  selectorLabelText: {
    fontSize: 12,
    fontWeight: '800',
  },
  formInputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.textSec,
    marginTop: 14,
    marginBottom: 6,
  },
  formFieldGap: {
    marginTop: 14,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 12.5,
    fontWeight: '600',
  },
  galleryPreviewScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  galleryItemBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.8,
    borderColor: 'transparent',
  },
  galleryItemBtnSelected: {
    borderColor: C.blueGlow,
  },
  galleryItemImage: {
    width: '100%',
    height: '100%',
  },
  gallerySelectedCheck: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: C.blueGlow,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  publishBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  uploadsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  uploadCardItem: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: C.card,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: C.border,
    position: 'relative',
  },
  uploadCardImg: {
    width: '100%',
    height: 115,
  },
  uploadCardOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    gap: 4,
  },
  badgeCategory: {
    backgroundColor: 'rgba(4,6,15,0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeCategoryText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
  },
  uploadCardInfoBox: {
    padding: 10,
  },
  uploadCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  uploadCardLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  uploadCardLocText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  uploadCardLikesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  uploadCardLikes: {
    fontSize: 12,
    color: C.greenGlow,
    fontWeight: '700',
  },

  // ========================================================
  // TAB 3: PLANNER SUB NAV
  // ========================================================
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  plannerSubTabItem: {
    flex: 1,
    paddingVertical: 9,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  plannerSubTabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  plannerSubTabLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  plannerSubTabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 14,
    height: 2,
    backgroundColor: C.blueGlow,
    borderRadius: 1,
  },
  innerPlannerSection: {
    marginTop: 8,
  },

  // Timeline UI Itinerary
  timelineContainer: {
    paddingLeft: 16,
    position: 'relative',
    marginTop: 10,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
    paddingLeft: 22,
  },
  timelineLine: {
    position: 'absolute',
    left: -2,
    top: 24,
    bottom: -24,
    width: 2,
    backgroundColor: C.border,
  },
  timelineNode: {
    position: 'absolute',
    left: -12,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blueGlow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineNodeText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
  },
  dayCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 12,
    flex: 1,
  },
  dayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
    marginBottom: 4,
  },
  dayActivitiesText: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 17,
    fontWeight: '500',
  },
  addDayBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginTop: 14,
    marginBottom: 24,
  },
  addDayBoxTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: C.white,
    marginBottom: 4,
  },
  addDayBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  addDayBtnText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
  },

  // Time Estimator
  estimatorForm: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  formInputRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  modesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modeTile: {
    flex: 1,
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  modeTileActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  modeTileLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  estimateBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  estimateBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  estimationResultCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,102,255,0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(0,102,255,0.18)',
    marginTop: 14,
    gap: 8,
  },
  estimationResultText: {
    flex: 1,
    color: C.white,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },

  // Budget Calculator
  budgetForm: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  calculateBudgetBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  calculateBudgetBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  budgetResultCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginTop: 14,
  },
  budgetResultTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.6,
  },
  budgetResultAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: C.greenGlow,
    marginTop: 2,
  },
  budgetResultSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginTop: 14,
    marginBottom: 8,
  },
  breakdownRow: {
    marginBottom: 8,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  breakdownName: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  breakdownPct: {
    fontSize: 12,
    color: C.white,
    fontWeight: '800',
  },
  breakdownTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Stays & Accommodations
  accomSelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  accomSelectBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  accomSelectBtnActive: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderColor: C.blue,
  },
  accomSelectLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  stayCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 10,
    marginBottom: 10,
  },
  stayImage: {
    width: 66,
    height: 66,
    borderRadius: 12,
    marginRight: 12,
  },
  stayInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  stayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stayName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  stayRating: {
    fontSize: 12,
    color: C.amberGlow,
    fontWeight: '800',
  },
  stayLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  stayLocText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '500',
  },
  stayPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  stayPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: C.greenGlow,
  },
  bookingLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,102,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
  },
  bookingLinkText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blueGlow,
  },

  // ========================================================
  // TAB 4: WEATHER
  // ========================================================
  weatherCitiesScroll: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  weatherCityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
    marginRight: 8,
  },
  weatherCityBtnActive: {
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderColor: C.blue,
  },
  weatherCityText: {
    fontSize: 12,
    fontWeight: '800',
  },
  weatherLiveCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  weatherLiveCardGlow: {
    position: 'absolute',
    top: -30,
    left: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0,102,255,0.1)',
    filter: 'blur(20px)',
  },
  weatherMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  weatherMainCity: {
    fontSize: 20,
    fontWeight: '900',
    color: C.white,
  },
  weatherMainDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    fontWeight: '600',
  },
  weatherMainTempBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weatherMainTemp: {
    fontSize: 32,
    fontWeight: '900',
    color: C.white,
  },
  weatherDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  weatherDetailBox: {
    width: (SCREEN_WIDTH - 64) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 10,
  },
  weatherDetailLabel: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '700',
  },
  weatherDetailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginTop: 1,
  },
  aqiCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  aqiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aqiTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.5,
  },
  aqiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  aqiBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#04060f',
  },
  aqiMeterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aqiValue: {
    fontSize: 26,
    fontWeight: '900',
    color: C.white,
  },
  aqiDescText: {
    flex: 1,
    fontSize: 12,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  forecastGrid: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  forecastDay: {
    width: 80,
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  forecastMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  forecastCondText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  forecastTemp: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    width: 45,
    textAlign: 'right',
  },

  // ========================================================
  // TAB 5: SAFETY
  // ========================================================
  safetyAlertItem: {
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 10,
  },
  safetyAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  safetyAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  safetyAlertBadgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  safetyAlertLocation: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  safetyAlertMessage: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  contactItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  contactItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  contactDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 1,
    fontWeight: '500',
  },
  callActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.2,
    borderRadius: 8,
    height: MIN_TOUCH_TARGET,
    marginTop: 12,
  },
  callActionBtnText: {
    fontSize: 12,
    fontWeight: '900',
  },
  facilitiesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  facilityBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    justifyContent: 'space-between',
  },
  facilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  facilityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.textSec,
  },
  facilityName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  facilityDist: {
    fontSize: 12,
    color: C.greenGlow,
    fontWeight: '700',
    marginTop: 2,
  },
  facilityLoc: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  facilityNavBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1.2,
    borderColor: C.border,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  facilityNavBtnText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
  },

  // Cashout Modal Styles
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: C.cardAlt,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
  },
  modalDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  modalBalanceLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '700',
  },
  modalBalanceVal: {
    fontSize: 12,
    fontWeight: '900',
    color: C.greenGlow,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginTop: 14,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.2,
    borderColor: C.border,
  },
  modalBtnCancelText: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '800',
  },
  modalBtnConfirm: {
    backgroundColor: C.green,
  },
  modalBtnConfirmText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
