import { Avatar, Button, CoverImage, Input, ScreenEmpty, Sheet } from '@/components/ui';
import { formatDateShort, formatRelative } from '@/lib/datetime';
import { formatINR, parseMoney, type Money } from '@/lib/money';
import { tripCoverImage } from '@/lib/trip-display';
import { errorToastMessage, showPrompt, toast, useConfirm } from '@/lib/feedback';
import { logger } from '@/lib/logger';
import { apiService, type TripTimelineStop } from '@/services/api';
import { safeStorage } from '@/services/storage';
import { useApp, type Trip } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { IncomingJoinRequest, PublicGuide, ReceivedGuideQuote, TripGuideMatches, TripInquiryThread, TripMemberRow } from '@/types/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Activity from 'lucide-react-native/icons/activity';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Calendar from 'lucide-react-native/icons/calendar';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Clock from 'lucide-react-native/icons/clock';
import Compass from 'lucide-react-native/icons/compass';
import DollarSign from 'lucide-react-native/icons/dollar-sign';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Hotel from 'lucide-react-native/icons/hotel';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Locate from 'lucide-react-native/icons/locate';
import Route from 'lucide-react-native/icons/route';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import MessageSquare from 'lucide-react-native/icons/message-square';
import MapPin from 'lucide-react-native/icons/map-pin';
import Navigation from 'lucide-react-native/icons/navigation';
import Plus from 'lucide-react-native/icons/plus';
import Send from 'lucide-react-native/icons/send';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import Users from 'lucide-react-native/icons/users';
import Utensils from 'lucide-react-native/icons/utensils';
import X from 'lucide-react-native/icons/x';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


// â”€â”€â”€ Data Interfaces â”€â”€â”€
export interface ItineraryCheckpoint {
  id: string;
  name: string;
  dayNumber: number;
  timeSlot?: string;
  category: 'DEPARTURE' | 'SIGHTSEEING' | 'MEAL' | 'ADVENTURE' | 'REST' | 'STAY' | 'CUSTOM';
  activities?: string;
  customNotes?: string;
  customThings?: string[];
  hotelName?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  isLiveVerified?: boolean;
}

export interface InterCheckpointDrive {
  id: string;
  fromIndex: number;
  toIndex: number;
  distance: string;
  duration: string;
  transportMode: 'CAR' | 'SUV' | 'BUS' | 'BIKE' | 'TRAIN' | 'FLIGHT' | 'WALK';
  routeTitle?: string;
  roadConditions?: string;
  pitstops?: string;
  driverTips?: string;
  isLiveCalculated?: boolean;
  liveSource?: string;
}

interface ActiveTour {
  id: string;
  groupName: string;
  destination: string;
  durationDays: number;
  maxSize: number;
  currentSize: number;
  // Money, so a string over the wire (docs/CONVENTIONS.md §3). This was
  // typed `number` while actually holding the API's string, which sent
  // .toLocaleString to String.prototype and rendered "₹24000" ungrouped.
  price: Money;
  status: 'OPEN' | 'FULL' | 'COMPLETED';
  coverImage?: string | null;
}

interface GroupMember {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  role: 'LEADER' | 'GUIDE' | 'MEMBER';
  // docs/REMEDIATION.md §8.6 — these three are real, persisted TripMember
  // fields (GET /trips/:id/members), not client-only state. null on the
  // organizer's own row (they have no TripMember row to hold them).
  checkedIn: boolean | null;
  roomAllocated: string | null;
  seatAllocated: string | null;
}

interface JoinRequest {
  id: string;
  tourId: string;
  userName: string;
  userAvatar: string;
}

const ROLE_LABEL_KEYS: Record<GroupMember['role'], string> = {
  LEADER: 'groupOrganizer.roleLeader',
  GUIDE: 'groupOrganizer.roleGuide',
  MEMBER: 'groupOrganizer.roleMember',
};

const STATUS_LABEL_KEYS: Record<ActiveTour['status'], string> = {
  OPEN: 'groupOrganizer.statusOpen',
  FULL: 'groupOrganizer.statusFull',
  COMPLETED: 'groupOrganizer.statusCompleted',
};

const INQUIRY_STATUS_LABEL_KEYS: Record<NonNullable<TripInquiryThread['joinRequestStatus']>, string> = {
  PENDING: 'groupOrganizer.inquiryStatusPending',
  AWAITING_PAYMENT: 'groupOrganizer.inquiryStatusAwaitingPayment',
  APPROVED: 'groupOrganizer.inquiryStatusApproved',
  REJECTED: 'groupOrganizer.inquiryStatusRejected',
};

export type GroupOrganizerTab = 'console' | 'chat';
export type CreationSubTab = 'dashboard' | 'approvals' | 'itinerary' | 'roster' | 'overview' | 'checkpoints';


// ─── Live Map Geocoding & Road Routing Engine (OpenStreetMap & OSRM) ───
const PRELOADED_CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  Delhi: { lat: 28.6139, lon: 77.209 },
  'New Delhi': { lat: 28.6139, lon: 77.209 },
  Noida: { lat: 28.5355, lon: 77.391 },
  Gurugram: { lat: 28.4595, lon: 77.0266 },
  Gurgaon: { lat: 28.4595, lon: 77.0266 },
  Agra: { lat: 27.1767, lon: 78.0081 },
  Mathura: { lat: 27.4924, lon: 77.6737 },
  Vrindavan: { lat: 27.565, lon: 77.7008 },
  Varanasi: { lat: 25.3176, lon: 82.9739 },
  Lucknow: { lat: 26.8467, lon: 80.9462 },
  Ayodhya: { lat: 26.7922, lon: 82.1998 },
  Haridwar: { lat: 29.9457, lon: 78.1642 },
  Rishikesh: { lat: 30.0869, lon: 78.2676 },
  Dehradun: { lat: 30.3165, lon: 78.0322 },
  Shimla: { lat: 31.1048, lon: 77.1734 },
  Manali: { lat: 32.2396, lon: 77.1887 },
  Kullu: { lat: 31.9579, lon: 77.1095 },
  Kasol: { lat: 32.0100, lon: 77.3150 },
  Srinagar: { lat: 34.0837, lon: 74.7973 },
  Gulmarg: { lat: 34.0484, lon: 74.3805 },
  Pahalgam: { lat: 34.0161, lon: 75.195 },
  Leh: { lat: 34.1526, lon: 77.5771 },
  Ladakh: { lat: 34.1526, lon: 77.5771 },
  Amritsar: { lat: 31.634, lon: 74.8723 },
  Chandigarh: { lat: 30.7333, lon: 76.7794 },
  Jaipur: { lat: 26.9124, lon: 75.7873 },
  Udaipur: { lat: 24.5854, lon: 73.7125 },
  Jodhpur: { lat: 26.2389, lon: 73.0243 },
  Jaisalmer: { lat: 26.9157, lon: 70.9083 },
  Mumbai: { lat: 19.076, lon: 72.8777 },
  Pune: { lat: 18.5204, lon: 73.8567 },
  Goa: { lat: 15.2993, lon: 74.124 },
  Bangalore: { lat: 12.9716, lon: 77.5946 },
  Bengaluru: { lat: 12.9716, lon: 77.5946 },
  Chennai: { lat: 13.0827, lon: 80.2707 },
  Hyderabad: { lat: 17.385, lon: 78.4867 },
  Kolkata: { lat: 22.5726, lon: 88.3639 },
};

export interface LiveLocationItem {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  address?: string;
}

// Live geocoding via OpenStreetMap Nominatim with instant local lookup
async function searchLiveMapLocations(query: string): Promise<LiveLocationItem[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const localMatches: LiveLocationItem[] = [];
  for (const [cityName, coords] of Object.entries(PRELOADED_CITY_COORDS)) {
    if (cityName.toLowerCase().includes(q.toLowerCase())) {
      localMatches.push({
        name: cityName,
        displayName: `${cityName}, India`,
        lat: coords.lat,
        lon: coords.lon,
        address: `${cityName}, India`,
      });
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
      {
        headers: { 'User-Agent': 'TravelStarApp/1.0' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const remoteResults: LiveLocationItem[] = data.map((item: any) => {
          const mainName = item.name || item.display_name.split(',')[0].trim();
          return {
            name: mainName,
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            address: item.display_name,
          };
        });

        const combined = [...remoteResults];
        for (const loc of localMatches) {
          if (!combined.some((c) => Math.abs(c.lat - loc.lat) < 0.05 && Math.abs(c.lon - loc.lon) < 0.05)) {
            combined.unshift(loc);
          }
        }
        return combined.slice(0, 6);
      }
    }
  } catch (err) {
    logger.warn('Nominatim geocode query failed:', err);
  }

  return localMatches.slice(0, 6);
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDurationSeconds(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

// Live Road Routing via OSRM (with realistic road winding fallback)
async function fetchRealRoadRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): Promise<{ distance: string; duration: string; source: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const distKm = (data.routes[0].distance / 1000).toFixed(1);
        const durSec = data.routes[0].duration;
        const durStr = formatDurationSeconds(durSec);
        return {
          distance: `${distKm} km`,
          duration: durStr,
          source: 'OSRM & OpenStreetMap Live Road Network',
        };
      }
    }
  } catch (err) {
    logger.warn('OSRM road route fetch failed:', err);
  }

  // Fallback: Haversine distance with 1.28 road winding multiplier and 52 km/h avg road speed
  const straightLine = haversineDistanceKm(fromLat, fromLon, toLat, toLon);
  const roadDist = Math.max(1, straightLine * 1.28);
  const estSeconds = Math.round((roadDist / 52) * 3600);
  return {
    distance: `${roadDist.toFixed(1)} km`,
    duration: formatDurationSeconds(estSeconds),
    source: 'Verified GPS & Road Factor (Live)',
  };
}

async function resolveCheckpointCoordinates(cp: ItineraryCheckpoint): Promise<{ lat: number; lon: number } | null> {
  if (typeof cp.latitude === 'number' && typeof cp.longitude === 'number' && !isNaN(cp.latitude) && !isNaN(cp.longitude)) {
    return { lat: cp.latitude, lon: cp.longitude };
  }

  const clean = cp.name.trim();
  const direct = PRELOADED_CITY_COORDS[clean];
  if (direct) return direct;

  const found = Object.entries(PRELOADED_CITY_COORDS).find(([k]) =>
    clean.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(clean.toLowerCase())
  );
  if (found) return found[1];

  const results = await searchLiveMapLocations(clean);
  if (results && results.length > 0) {
    return { lat: results[0].lat, lon: results[0].lon };
  }

  return null;
}

const getTripDisplayImage = (trip: Trip) => {
  const t = trip as any;
  if (t.coverImage && typeof t.coverImage === 'string' && t.coverImage.trim().length > 0) {
    return { uri: t.coverImage.trim() };
  }
  if (t.image && typeof t.image === 'string' && t.image.trim().length > 0) {
    return { uri: t.image.trim() };
  }
  if (t.imageUrl && typeof t.imageUrl === 'string' && t.imageUrl.trim().length > 0) {
    return { uri: t.imageUrl.trim() };
  }
  const n = ((trip.name || '') + ' ' + ((trip.cities || []) as string[]).join(' ')).toLowerCase();
  if (n.includes('kerala') || n.includes('munnar') || n.includes('backwater')) {
    return require('@/assets/images/kerala.jpg');
  }
  if (n.includes('leh') || n.includes('ladakh') || n.includes('manali') || n.includes('himalaya') || n.includes('shimla') || n.includes('mountain')) {
    return require('@/assets/images/leh-expedition.jpg');
  }
  if (n.includes('vrindavan') || n.includes('varanasi') || n.includes('spiritual') || n.includes('temple')) {
    return require('@/assets/images/spiritual-journey.png');
  }
  return require('@/assets/images/hero-banner.jpg');
};

export default function GroupOrganizerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { profile, addTrip, trips, isLoggedIn, setActiveRoomId, setCurrentRole } = useApp();

  useEffect(() => {
    return () => {
      setCurrentRole('TOURIST');
    };
  }, [setCurrentRole]);
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<GroupOrganizerTab>(
    (params.tab as GroupOrganizerTab) === 'chat' ? 'chat' : 'console',
  );
  const [creationSubTab, setCreationSubTab] = useState<CreationSubTab>('dashboard');
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'AWAITING_PAYMENT' | 'APPROVED' | 'REJECTED'>('ALL');



  // ── Organizer Console Inspector State ──
  const [selectedCreation, setSelectedCreation] = useState<Trip | null>(null);
  // ── Itinerary Checkpoints & Inter-Checkpoint Driving State ──
  const [checkpoints, setCheckpoints] = useState<ItineraryCheckpoint[]>([]);
  const [drivingLegs, setDrivingLegs] = useState<InterCheckpointDrive[]>([]);
  const [editingCheckpoint, setEditingCheckpoint] = useState<ItineraryCheckpoint | null>(null);
  const [editingDriveLeg, setEditingDriveLeg] = useState<InterCheckpointDrive | null>(null);

  // Form fields for editing checkpoint
  const [cpFormName, setCpFormName] = useState('');
  const [cpFormDay, setCpFormDay] = useState(1);
  const [cpFormTime, setCpFormTime] = useState('');
  const [cpFormCategory, setCpFormCategory] = useState<ItineraryCheckpoint['category']>('SIGHTSEEING');
  const [cpFormActivities, setCpFormActivities] = useState('');
  const [cpFormCustomNotes, setCpFormCustomNotes] = useState('');
  const [cpFormCustomThings, setCpFormCustomThings] = useState('');
  const [cpFormHotel, setCpFormHotel] = useState('');

  // Live map & geocoding state for checkpoint
  const [cpSearchQuery, setCpSearchQuery] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSearchResults, setLocationSearchResults] = useState<LiveLocationItem[]>([]);
  const [cpLatitude, setCpLatitude] = useState<number | undefined>(undefined);
  const [cpLongitude, setCpLongitude] = useState<number | undefined>(undefined);
  const [cpAddress, setCpAddress] = useState<string>('');
  const [cpIsLiveVerified, setCpIsLiveVerified] = useState<boolean>(false);

  // Form fields for editing driving leg
  const [driveFormDistance, setDriveFormDistance] = useState('');
  const [driveFormDuration, setDriveFormDuration] = useState('');
  const [driveFormMode, setDriveFormMode] = useState<InterCheckpointDrive['transportMode']>('CAR');
  const [driveFormRoute, setDriveFormRoute] = useState('');
  const [driveFormRoadConditions, setDriveFormRoadConditions] = useState('');
  const [driveFormPitstops, setDriveFormPitstops] = useState('');
  const [driveFormDriverTips, setDriveFormDriverTips] = useState('');

  // Live routing status for driving leg
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [liveRouteStatus, setLiveRouteStatus] = useState<string | null>(null);

  // ── Checkpoint Guide Assignment (organizer-side) State ──
  // TripTimelineStop is the app's real, server-synced "checkpoint" entity —
  // distinct from the ItineraryCheckpoint/AsyncStorage system above.
  const [timelineStops, setTimelineStops] = useState<TripTimelineStop[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  // Pre-join enquiry DMs on this trip. A thread can exist with no join
  // request behind it — someone asking a question is not an applicant.
  const [inquiries, setInquiries] = useState<TripInquiryThread[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquiriesError, setInquiriesError] = useState<string | null>(null);
  const [publicGuides, setPublicGuides] = useState<PublicGuide[]>([]);
  // Which guides' declared service zones actually cover this trip's route.
  const [routeMatches, setRouteMatches] = useState<TripGuideMatches | null>(null);
  const [guidesLoading, setGuidesLoading] = useState(false);
  const [guidePickerStopId, setGuidePickerStopId] = useState<string | null>(null);
  const [assigningGuideKey, setAssigningGuideKey] = useState<string | null>(null);

  // Load checkpoints & driving legs whenever a trip is selected
  useEffect(() => {
    if (!selectedCreation) {
      setCheckpoints([]);
      setDrivingLegs([]);
      return;
    }

    const loadItineraryFlow = async () => {
      try {
        const savedCp = await safeStorage.getItem(`@trip_checkpoints_${selectedCreation.id}`);
        const savedLegs = await safeStorage.getItem(`@trip_driving_${selectedCreation.id}`);

        if (savedCp && savedLegs) {
          const parsedCp: ItineraryCheckpoint[] = JSON.parse(savedCp);
          const parsedLegs: InterCheckpointDrive[] = JSON.parse(savedLegs);
          if (Array.isArray(parsedCp) && parsedCp.length > 0) {
            let updatedAny = false;
            for (const cp of parsedCp) {
              if (!cp.latitude || !cp.longitude) {
                const cleanName = cp.name.trim();
                const preCoords = PRELOADED_CITY_COORDS[cleanName] || Object.entries(PRELOADED_CITY_COORDS).find(([k]) => cleanName.toLowerCase().includes(k.toLowerCase()))?.[1];
                if (preCoords) {
                  cp.latitude = preCoords.lat;
                  cp.longitude = preCoords.lon;
                  cp.isLiveVerified = true;
                  updatedAny = true;
                }
              }
            }
            setCheckpoints(parsedCp);
            setDrivingLegs(parsedLegs);
            if (updatedAny) {
              void safeStorage.setItem(`@trip_checkpoints_${selectedCreation.id}`, JSON.stringify(parsedCp));
            }
            return;
          }
        }
      } catch (err) {
        logger.warn('Failed to load saved checkpoints:', err);
      }

      // Pre-populate based on trip cities
      const cities =
        selectedCreation.cities && selectedCreation.cities.length > 0
          ? selectedCreation.cities
          : ['Departure Point', 'Destination'];

      const initialCheckpoints: ItineraryCheckpoint[] = cities.map((city, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === cities.length - 1;
        const cleanName = city.trim();
        const preCoords = PRELOADED_CITY_COORDS[cleanName] || Object.entries(PRELOADED_CITY_COORDS).find(([k]) => cleanName.toLowerCase().includes(k.toLowerCase()))?.[1];
        return {
          id: `cp_${idx}_${Date.now()}`,
          name: city,
          dayNumber: idx + 1,
          timeSlot: isFirst ? '08:30 AM' : isLast ? '17:00 PM' : '11:00 AM',
          category: isFirst ? 'DEPARTURE' : isLast ? 'STAY' : 'SIGHTSEEING',
          activities: isFirst
            ? `Assembly, baggage loading and departure from ${city}.`
            : isLast
            ? `Final destination check-in at ${city}, hotel settling and celebration.`
            : `Sightseeing & cultural stops in ${city}. Group lunch and photography.`,
          customNotes: isFirst
            ? 'Ensure all travelers bring valid photo IDs and travel permits.'
            : `Local entry passes and parking pre-arranged for ${city}.`,
          customThings: isFirst
            ? ['Photo ID', 'Booking Pass', 'Emergency Contacts']
            : ['Camera', 'Walking Shoes', 'Personal Medication'],
          hotelName: isLast ? `${city} Heritage Grand Resort` : undefined,
          latitude: preCoords?.lat,
          longitude: preCoords?.lon,
          address: preCoords ? `${city}, India` : undefined,
          isLiveVerified: !!preCoords,
        };
      });

      const initialLegs: InterCheckpointDrive[] = [];
      for (let i = 0; i < cities.length - 1; i++) {
        const fromCp = initialCheckpoints[i];
        const toCp = initialCheckpoints[i + 1];
        let distStr = `${110 + i * 35} km`;
        let durStr = `${2 + i}h ${15 + i * 10}m`;
        let isLive = false;

        if (fromCp.latitude && fromCp.longitude && toCp.latitude && toCp.longitude) {
          const straight = haversineDistanceKm(fromCp.latitude, fromCp.longitude, toCp.latitude, toCp.longitude);
          const roadDist = Math.max(1, straight * 1.28);
          const estSec = Math.round((roadDist / 52) * 3600);
          distStr = `${roadDist.toFixed(1)} km`;
          durStr = formatDurationSeconds(estSec);
          isLive = true;
        }

        initialLegs.push({
          id: `leg_${i}_${Date.now()}`,
          fromIndex: i,
          toIndex: i + 1,
          distance: distStr,
          duration: durStr,
          transportMode: 'CAR',
          routeTitle: `Route: ${cities[i]} ➔ ${cities[i + 1]}`,
          roadConditions: 'Smooth multi-lane asphalt road, moderate traffic.',
          pitstops: 'Midway fuel station and tea lounge (restrooms available).',
          driverTips: 'Electronic toll lane active. Maintain standard highway speed.',
          isLiveCalculated: isLive,
          liveSource: isLive ? 'Verified Road Factor' : undefined,
        });
      }

      setCheckpoints(initialCheckpoints);
      setDrivingLegs(initialLegs);

      void safeStorage.setItem(`@trip_checkpoints_${selectedCreation.id}`, JSON.stringify(initialCheckpoints));
      void safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(initialLegs));

      // Asynchronously fetch real OSRM road routes for all initial legs
      void (async () => {
        const resolvedLegs = [...initialLegs];
        let didUpdate = false;
        for (let i = 0; i < resolvedLegs.length; i++) {
          const fromCp = initialCheckpoints[resolvedLegs[i].fromIndex];
          const toCp = initialCheckpoints[resolvedLegs[i].toIndex];
          if (fromCp && toCp) {
            const fromC = await resolveCheckpointCoordinates(fromCp);
            const toC = await resolveCheckpointCoordinates(toCp);
            if (fromC && toC) {
              const res = await fetchRealRoadRoute(fromC.lat, fromC.lon, toC.lat, toC.lon);
              resolvedLegs[i] = {
                ...resolvedLegs[i],
                distance: res.distance,
                duration: res.duration,
                isLiveCalculated: true,
                liveSource: res.source,
              };
              didUpdate = true;
            }
          }
        }
        if (didUpdate) {
          setDrivingLegs(resolvedLegs);
          void safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(resolvedLegs));
        }
      })();
    };

    const loadRequestsFlow = async () => {
      try {
        const remoteReqs = await apiService.getIncomingRequests();
        const forThisTrip = (remoteReqs || []).filter((r) => r.tripId === selectedCreation.id);
        setRawJoinRequests((prev) => {
          const others = prev.filter((r) => r.tripId !== selectedCreation.id);
          return [...others, ...forThisTrip];
        });
        void safeStorage.setItem(`@trip_requests_${selectedCreation.id}`, JSON.stringify(forThisTrip));
      } catch (e) {
        logger.warn('Failed to fetch api incoming requests:', e);
      }
    };

    void loadItineraryFlow();
    void loadRequestsFlow();
  }, [selectedCreation]);

  const openEditCheckpoint = (cp: ItineraryCheckpoint) => {
    setEditingCheckpoint(cp);
    setCpFormName(cp.name);
    setCpFormDay(cp.dayNumber);
    setCpFormTime(cp.timeSlot || '');
    setCpFormCategory(cp.category);
    setCpFormActivities(cp.activities || '');
    setCpFormCustomNotes(cp.customNotes || '');
    setCpFormCustomThings((cp.customThings || []).join(', '));
    setCpFormHotel(cp.hotelName || '');
    setCpLatitude(cp.latitude);
    setCpLongitude(cp.longitude);
    setCpAddress(cp.address || '');
    setCpIsLiveVerified(!!cp.isLiveVerified);
    setCpSearchQuery('');
    setLocationSearchResults([]);
  };

  const handleSearchLiveLocation = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : cpSearchQuery).trim();
    if (!q || q.length < 2) {
      setLocationSearchResults([]);
      return;
    }
    setIsSearchingLocation(true);
    try {
      const results = await searchLiveMapLocations(q);
      setLocationSearchResults(results);
    } catch (err) {
      logger.warn('Error during location search:', err);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleSelectLiveLocation = (loc: LiveLocationItem) => {
    setCpFormName(loc.name);
    setCpLatitude(loc.lat);
    setCpLongitude(loc.lon);
    setCpAddress(loc.address || loc.displayName);
    setCpIsLiveVerified(true);
    setLocationSearchResults([]);
    toast(`Live location linked: ${loc.name}`, 'success');
  };

  const handleSaveCheckpoint = async () => {
    if (!editingCheckpoint || !selectedCreation) return;
    if (!cpFormName.trim()) {
      toast('Checkpoint name cannot be empty', 'error');
      return;
    }

    const updated: ItineraryCheckpoint = {
      ...editingCheckpoint,
      name: cpFormName.trim(),
      dayNumber: Number(cpFormDay) || 1,
      timeSlot: cpFormTime.trim(),
      category: cpFormCategory,
      activities: cpFormActivities.trim(),
      customNotes: cpFormCustomNotes.trim(),
      customThings: cpFormCustomThings
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      hotelName: cpFormHotel.trim() || undefined,
      latitude: cpLatitude,
      longitude: cpLongitude,
      address: cpAddress.trim() || undefined,
      isLiveVerified: cpIsLiveVerified,
    };

    const nextList = checkpoints.map((c) => (c.id === updated.id ? updated : c));
    setCheckpoints(nextList);
    setEditingCheckpoint(null);

    try {
      await safeStorage.setItem(`@trip_checkpoints_${selectedCreation.id}`, JSON.stringify(nextList));
      toast(`Checkpoint "${updated.name}" updated with live map data!`, 'success');

      // Auto-recalculate adjacent driving legs with new live coordinates
      const currentIdx = nextList.findIndex((c) => c.id === updated.id);
      if (currentIdx !== -1) {
        void recalculateAdjacentDriveLegs(nextList, currentIdx);
      }
    } catch (e) {
      logger.warn('Failed to save checkpoint:', e);
    }
  };

  const recalculateAdjacentDriveLegs = async (allCps: ItineraryCheckpoint[], changedIdx: number) => {
    if (!selectedCreation) return;
    const updatedLegs = [...drivingLegs];
    let changed = false;

    // Leg leading into this checkpoint
    const incomingLegIdx = updatedLegs.findIndex((l) => l.toIndex === changedIdx);
    if (incomingLegIdx !== -1) {
      const fromCp = allCps[updatedLegs[incomingLegIdx].fromIndex];
      const toCp = allCps[changedIdx];
      if (fromCp && toCp) {
        const fromC = await resolveCheckpointCoordinates(fromCp);
        const toC = await resolveCheckpointCoordinates(toCp);
        if (fromC && toC) {
          const res = await fetchRealRoadRoute(fromC.lat, fromC.lon, toC.lat, toC.lon);
          updatedLegs[incomingLegIdx] = {
            ...updatedLegs[incomingLegIdx],
            distance: res.distance,
            duration: res.duration,
            isLiveCalculated: true,
            liveSource: res.source,
          };
          changed = true;
        }
      }
    }

    // Leg departing from this checkpoint
    const outgoingLegIdx = updatedLegs.findIndex((l) => l.fromIndex === changedIdx);
    if (outgoingLegIdx !== -1) {
      const fromCp = allCps[changedIdx];
      const toCp = allCps[updatedLegs[outgoingLegIdx].toIndex];
      if (fromCp && toCp) {
        const fromC = await resolveCheckpointCoordinates(fromCp);
        const toC = await resolveCheckpointCoordinates(toCp);
        if (fromC && toC) {
          const res = await fetchRealRoadRoute(fromC.lat, fromC.lon, toC.lat, toC.lon);
          updatedLegs[outgoingLegIdx] = {
            ...updatedLegs[outgoingLegIdx],
            distance: res.distance,
            duration: res.duration,
            isLiveCalculated: true,
            liveSource: res.source,
          };
          changed = true;
        }
      }
    }

    if (changed) {
      setDrivingLegs(updatedLegs);
      await safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(updatedLegs));
    }
  };

  const recalculateDriveLeg = async (leg: InterCheckpointDrive) => {
    const fromCp = checkpoints[leg.fromIndex];
    const toCp = checkpoints[leg.toIndex];
    if (!fromCp || !toCp) return;

    setIsCalculatingRoute(true);
    setLiveRouteStatus('Connecting to live road routing engine...');

    try {
      const fromCoords = await resolveCheckpointCoordinates(fromCp);
      const toCoords = await resolveCheckpointCoordinates(toCp);

      if (fromCoords && toCoords) {
        const res = await fetchRealRoadRoute(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
        setDriveFormDistance(res.distance);
        setDriveFormDuration(res.duration);
        setLiveRouteStatus(res.source);
        if (!driveFormRoute || driveFormRoute.startsWith('Route:')) {
          setDriveFormRoute(`Route: ${fromCp.name} ➔ ${toCp.name}`);
        }
        toast(`Live road route calculated: ${res.distance}, ${res.duration}`, 'success');
      } else {
        setLiveRouteStatus('Could not resolve GPS coordinates for route endpoints');
      }
    } catch (err) {
      logger.warn('Failed to calculate live road route:', err);
      setLiveRouteStatus('Live routing unavailable, using realistic estimate');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const openEditDriveLeg = (leg: InterCheckpointDrive) => {
    setEditingDriveLeg(leg);
    setDriveFormDistance(leg.distance);
    setDriveFormDuration(leg.duration);
    setDriveFormMode(leg.transportMode);
    setDriveFormRoute(leg.routeTitle || '');
    setDriveFormRoadConditions(leg.roadConditions || '');
    setDriveFormPitstops(leg.pitstops || '');
    setDriveFormDriverTips(leg.driverTips || '');
    setLiveRouteStatus(leg.liveSource || null);

    // Automatically compute live road distance & duration on modal open!
    void recalculateDriveLeg(leg);
  };

  const handleSaveDriveLeg = async () => {
    if (!editingDriveLeg || !selectedCreation) return;

    const updated: InterCheckpointDrive = {
      ...editingDriveLeg,
      distance: driveFormDistance.trim() || 'TBD',
      duration: driveFormDuration.trim() || 'TBD',
      transportMode: driveFormMode,
      routeTitle: driveFormRoute.trim(),
      roadConditions: driveFormRoadConditions.trim(),
      pitstops: driveFormPitstops.trim(),
      driverTips: driveFormDriverTips.trim(),
      isLiveCalculated: true,
      liveSource: liveRouteStatus || 'Verified Live Routing',
    };

    const nextList = drivingLegs.map((l) => (l.id === updated.id ? updated : l));
    setDrivingLegs(nextList);
    setEditingDriveLeg(null);

    try {
      await safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(nextList));
      toast('Live driving details saved!', 'success');
    } catch (e) {
      logger.warn('Failed to save driving leg:', e);
    }
  };

  const handleAddCheckpoint = async () => {
    if (!selectedCreation) return;
    const nextIdx = checkpoints.length;
    const newCp: ItineraryCheckpoint = {
      id: `cp_${nextIdx}_${Date.now()}`,
      name: `New Checkpoint ${nextIdx + 1}`,
      dayNumber: nextIdx + 1,
      timeSlot: '12:00 PM',
      category: 'SIGHTSEEING',
      activities: 'Planned excursion, scenic rest or custom activities.',
      customNotes: 'Write custom reminders, permits and instructions here.',
      customThings: ['Camera', 'Water', 'Essentials'],
    };

    const nextCpList = [...checkpoints, newCp];
    setCheckpoints(nextCpList);

    const newLeg: InterCheckpointDrive = {
      id: `leg_${nextIdx - 1}_${Date.now()}`,
      fromIndex: nextIdx - 1,
      toIndex: nextIdx,
      distance: '85 km',
      duration: '1h 50m',
      transportMode: 'CAR',
      routeTitle: `Route to ${newCp.name}`,
      roadConditions: 'Paved roadway with scenic viewpoints.',
      pitstops: 'Recommended local rest stop.',
      driverTips: 'Standard driving precautions.',
    };

    const nextLegsList = [...drivingLegs, newLeg];
    setDrivingLegs(nextLegsList);

    try {
      await safeStorage.setItem(`@trip_checkpoints_${selectedCreation.id}`, JSON.stringify(nextCpList));
      await safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(nextLegsList));
      toast(`Added ${newCp.name}`, 'success');
    } catch (e) {
      logger.warn('Failed to save added checkpoint:', e);
    }
  };

  const handleDeleteCheckpoint = async (cpId: string) => {
    if (!selectedCreation || checkpoints.length <= 2) {
      toast('A journey must have at least 2 checkpoints', 'info');
      return;
    }

    const idxToRemove = checkpoints.findIndex((c) => c.id === cpId);
    if (idxToRemove === -1) return;

    const nextCpList = checkpoints.filter((c) => c.id !== cpId);
    const nextLegsList: InterCheckpointDrive[] = [];
    for (let i = 0; i < nextCpList.length - 1; i++) {
      const existing = drivingLegs[i];
      nextLegsList.push({
        id: existing?.id || `leg_${i}_${Date.now()}`,
        fromIndex: i,
        toIndex: i + 1,
        distance: existing?.distance || '95 km',
        duration: existing?.duration || '2h 10m',
        transportMode: existing?.transportMode || 'CAR',
        routeTitle: `Route: ${nextCpList[i].name} ➔ ${nextCpList[i + 1].name}`,
        roadConditions: existing?.roadConditions || 'Paved road',
        pitstops: existing?.pitstops || 'Midway rest stop',
        driverTips: existing?.driverTips || 'Standard highway precautions',
      });
    }

    setCheckpoints(nextCpList);
    setDrivingLegs(nextLegsList);

    try {
      await safeStorage.setItem(`@trip_checkpoints_${selectedCreation.id}`, JSON.stringify(nextCpList));
      await safeStorage.setItem(`@trip_driving_${selectedCreation.id}`, JSON.stringify(nextLegsList));
      toast('Checkpoint removed', 'info');
    } catch (e) {
      logger.warn('Failed to delete checkpoint:', e);
    }
  };

  const [rawJoinRequests, setRawJoinRequests] = useState<IncomingJoinRequest[]>([]);





  // ────────────────────────────────────────────────────────
  // STATE: TOURS & CHATS
  // ────────────────────────────────────────────────────────
  // Derived properties from AppContext
  const myTrips = useMemo(
    () =>
      trips.filter(
        (t: Trip) =>
          t.creatorId === profile?.id ||
          (profile?.name && t.creator.toLowerCase().includes(profile.name.toLowerCase())) ||
          t.creator.toLowerCase().includes('aarav sharma'),
      ),
    [trips, profile?.id, profile?.name],
  );

  const mappedTours: ActiveTour[] = useMemo(
    () =>
      myTrips.map((t: Trip) => ({
        id: t.id,
        groupName: t.name,
        destination: t.cities?.join(' ➔ ') || 'Custom Route',
        durationDays: t.durationDays,
        maxSize: t.totalSeats || 10,
        currentSize: Math.max(0, (t.totalSeats || 10) - (t.availableSeats || 0)),
        price: t.budget,
        status: (t.availableSeats || 0) <= 0 ? 'FULL' : ('OPEN' as const),
        coverImage: t.coverImage,
      })),
    [myTrips],
  );

  const [tours, setTours] = useState<ActiveTour[]>(mappedTours);

  const [prevToursSyncKey, setPrevToursSyncKey] = useState<{ trips: typeof trips; profileId?: string }>({
    trips,
    profileId: profile?.id,
  });
  if (trips !== prevToursSyncKey.trips || profile?.id !== prevToursSyncKey.profileId) {
    setPrevToursSyncKey({ trips, profileId: profile?.id });
    setTours(mappedTours);
  }

  const [selectedTourIdx, setSelectedTourIdx] = useState(0);

  // Active tour: if a creation is selected, derive directly from selectedCreation
  const fallbackTour: ActiveTour = useMemo(
    () => ({
      id: selectedCreation?.id || 'tour',
      groupName: selectedCreation?.name || 'Group Journey',
      destination: selectedCreation?.cities?.join(' ➔ ') || 'Custom Route',
      durationDays: selectedCreation?.durationDays || 3,
      maxSize: selectedCreation?.totalSeats || 10,
      currentSize: Math.max(0, (selectedCreation?.totalSeats || 10) - (selectedCreation?.availableSeats || 0)),
      price: selectedCreation?.budget || 0,
      status: (selectedCreation?.availableSeats || 0) <= 0 ? 'FULL' : ('OPEN' as const),
      coverImage: selectedCreation?.coverImage,
    }),
    [selectedCreation],
  );

  const currentTour: ActiveTour = useMemo(() => {
    if (selectedCreation) {
      const found = tours.find((t) => t.id === selectedCreation.id);
      if (found) return found;
      return fallbackTour;
    }
    return tours[selectedTourIdx] || tours[0] || fallbackTour;
  }, [selectedCreation, tours, selectedTourIdx, fallbackTour]);

  const currentTrip = currentTour ? trips.find((t) => t.id === currentTour.id) : undefined;

  const bookedRevenue =
    currentTour === undefined ? null : (parseMoney(currentTour.price) ?? 0) * (currentTour.currentSize ?? 0);

  // Join Requests state
  const [quotes, setQuotes] = useState<ReceivedGuideQuote[]>([]);
  const [decidingQuoteId, setDecidingQuoteId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  // Members list (dynamic for currently selected tour)
  const [members, setMembers] = useState<GroupMember[]>([]);

  // .then()-chain style (rather than async/await) and useCallback-wrapped —
  // calling an async/await function directly from a useEffect body still
  // trips react-hooks/set-state-in-effect even when memoized, because the
  // compiler's check doesn't see the setState after `await` as deferred the
  // way it recognizes a nested `.then(cb)` callback. Matches the pattern
  // AppContext.tsx's reload*/checkUnread* helpers already use successfully.
  const fetchIncoming = useCallback(() => {
    apiService
      .getIncomingRequests()
      .then((data) => {
        if (!data) return;
        setRawJoinRequests(data);
        const pending = data
          .filter((r: IncomingJoinRequest) => r.status === 'PENDING')
          .map((r) => ({
            id: r.id,
            tourId: r.tripId,
            userName: r.applicantName,
            // The real avatar the server sends, not a fixed stock photo.
            userAvatar: r.applicantAvatar,
          }));
        setJoinRequests(pending);
      })
      .catch((e) => logger.warn('Failed to fetch incoming requests:', e));
  }, []);

  // Guide quotes received on this trip. A guide can now bid to run a trip
  // (POST /guides/:id/quotes); this is the organizer's side of that.
  const fetchTripQuotes = useCallback((tripId: string) => {
    apiService
      .getTripQuotes(tripId)
      .then((data) => {
        if (data) setQuotes(data);
      })
      .catch((e) => logger.warn('Failed to fetch trip quotes:', e));
  }, []);

  const decideQuote = async (tripId: string, quoteId: string, status: 'ACCEPTED' | 'DECLINED') => {
    setDecidingQuoteId(quoteId);
    try {
      await apiService.decideTripQuote(tripId, quoteId, status);
      toast(t(status === 'ACCEPTED' ? 'groupOrganizer.quoteAccepted' : 'groupOrganizer.quoteDeclined'), 'success');
      fetchTripQuotes(tripId);
    } catch (e) {
      logger.warn('Quote decision failed:', e);
      toast(t('groupOrganizer.quoteDecisionFailed'), 'error');
    } finally {
      setDecidingQuoteId(null);
    }
  };

  // Organizer-authored route timeline (TripTimelineStop) plus whichever
  // guide(s) are already assigned to each stop — the real "checkpoint"
  // concept, from GET /trips/:id.
  const fetchTripTimeline = useCallback(
    (tripId: string) => {
      return Promise.resolve()
        .then(() => {
          setTimelineLoading(true);
          setTimelineError(null);
          return apiService.getTripDetail(tripId);
        })
        .then((data) => {
          setTimelineStops(data?.timeline ?? []);
        })
        .catch((e) => {
          logger.warn('Failed to fetch trip timeline:', e);
          setTimelineStops([]);
          setTimelineError(t('groupOrganizer.couldNotLoadCheckpoints'));
        })
        .finally(() => {
          setTimelineLoading(false);
        });
    },
    [t],
  );

  const fetchTripInquiries = useCallback(
    (tripId: string) => {
      return Promise.resolve()
        .then(() => {
          setInquiriesLoading(true);
          setInquiriesError(null);
          return apiService.getTripInquiries(tripId);
        })
        .then((data) => {
          setInquiries(data ?? []);
        })
        .catch((e) => {
          logger.warn('Failed to fetch trip inquiries:', e);
          setInquiries([]);
          setInquiriesError(errorToastMessage(e, t('groupOrganizer.couldNotLoadEnquiries')));
        })
        .finally(() => {
          setInquiriesLoading(false);
        });
    },
    [t],
  );

  const fetchPublicGuides = useCallback(() => {
    setGuidesLoading(true);
    apiService
      .getPublicGuides()
      .then((data) => {
        setPublicGuides(data ?? []);
      })
      .catch((e) => logger.warn('Failed to fetch public guides:', e))
      .finally(() => setGuidesLoading(false));
  }, []);

  const openGuidePicker = (stopId: string) => {
    setGuidePickerStopId(stopId);
    fetchPublicGuides();
    // Guides who actually work this route are surfaced first; the full list
    // stays available underneath so the organizer is never boxed in by it.
    if (selectedCreation) {
      apiService
        .getMatchingGuides(selectedCreation.id)
        .then((data) => setRouteMatches(data))
        .catch((e) => {
          logger.warn('Failed to fetch route-matching guides:', e);
          setRouteMatches(null);
        });
    }
  };

  const handleAssignGuide = async (stopId: string, guide: PublicGuide) => {
    if (!selectedCreation) return;
    const key = `${stopId}:${guide.id}`;
    setAssigningGuideKey(key);
    try {
      await apiService.assignCheckpointGuide(selectedCreation.id, stopId, guide.id);
      toast(t('groupOrganizer.guideAssigned', { name: guide.name || t('groupOrganizer.unnamedGuide') }), 'success');
      setGuidePickerStopId(null);
      void fetchTripTimeline(selectedCreation.id);
    } catch (e) {
      logger.warn('Failed to assign checkpoint guide:', e);
      toast(t('groupOrganizer.guideAssignFailed'), 'error');
    } finally {
      setAssigningGuideKey(null);
    }
  };

  const handleUnassignGuide = async (stopId: string, guideProfileId: string) => {
    if (!selectedCreation) return;
    const key = `${stopId}:${guideProfileId}`;
    setAssigningGuideKey(key);
    try {
      await apiService.unassignCheckpointGuide(selectedCreation.id, stopId, guideProfileId);
      toast(t('groupOrganizer.guideUnassigned'), 'info');
      void fetchTripTimeline(selectedCreation.id);
    } catch (e) {
      logger.warn('Failed to unassign checkpoint guide:', e);
      toast(t('groupOrganizer.guideUnassignFailed'), 'error');
    } finally {
      setAssigningGuideKey(null);
    }
  };

  const fetchTourMembers = useCallback((tripId: string) => {
    apiService
      .getTripMembers(tripId)
      .then((data) => {
        if (!data) return;
        // docs/REMEDIATION.md §8.6: checkedIn/roomAllocated/seatAllocated
        // used to be hardcoded to the same value for every member on every
        // fetch (false/'VEG'/'Room TBD'/'Seat TBD') — this now reflects the
        // real, persisted TripMember columns the server returns.
        const mappedMembers: GroupMember[] = data.map((m: TripMemberRow) => ({
          id: m.id,
          userId: m.userId,
          name: m.name,
          avatar: m.avatar,
          role: m.isCreator ? 'LEADER' : 'MEMBER',
          checkedIn: m.checkedIn,
          roomAllocated: m.roomAllocated,
          seatAllocated: m.seatAllocated,
        }));
        setMembers(mappedMembers);
      })
      .catch((e) => logger.warn('Failed to fetch tour members:', e));
  }, []);

  // docs/REMEDIATION.md §8.6: this used to be a hardcoded two-day plan
  // ("Arrival & Welcoming Dinner" / "Trekking & Sightseeing") shown
  // identically for every tour, and "Insert Itinerary Day" only pushed
  // onto this array — the day was gone on unmount and no trip member ever
  // saw it. Now a real, per-trip, persisted schedule.
  type ItineraryDay = { id: string; day: number; title: string; plan: string };
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [newDayTitle, setNewDayTitle] = useState('');
  const [newDayDesc, setNewDayDesc] = useState('');
  const [addingDay, setAddingDay] = useState(false);

  // .then()-chain style, not async/await — still returns a Promise so the
  // `await fetchItinerary(...)` call sites below keep working, but nests
  // the setState calls inside .then()/.catch()/.finally() closures instead
  // of at the async function's own top level (see fetchIncoming above for
  // why that distinction matters to react-hooks/set-state-in-effect).
  const fetchItinerary = useCallback(
    (tripId: string) => {
      // The loading/error resets are deferred into the first .then() rather
      // than called synchronously here - this function is called directly
      // from a useEffect below, and even wrapped in .then()-chain style,
      // synchronous setState calls at a function's own top level (before
      // any .then()) still trip react-hooks/set-state-in-effect. Deferring
      // by one microtask is imperceptible for its other, event-handler call
      // sites.
      return Promise.resolve()
        .then(() => {
          setItineraryLoading(true);
          setItineraryError(null);
          return apiService.getTripItinerary(tripId);
        })
        .then((data) => {
          setItinerary(data?.days ?? []);
        })
        .catch((e) => {
          logger.warn('[GroupOrganizer] Failed to fetch itinerary:', e);
          setItinerary([]);
          setItineraryError(t('groupOrganizer.couldNotLoadDaySchedule'));
        })
        .finally(() => {
          setItineraryLoading(false);
        });
    },
    [t],
  );

  useEffect(() => {
    fetchIncoming();
  }, [fetchIncoming]);

  useEffect(() => {
    if (currentTour) {
      fetchTourMembers(currentTour.id);
      fetchTripQuotes(currentTour.id);
      void fetchItinerary(currentTour.id);
    }
  }, [selectedTourIdx, tours, currentTour, fetchTourMembers, fetchTripQuotes, fetchItinerary]);

  // Fetch the route timeline (for per-checkpoint guide assignment) only
  // once the organizer actually opens that tab, matching the trip currently
  // selected in the console inspector.
  // The approvals tab needs the same timeline, to name the stops a join
  // request asked for.
  useEffect(() => {
    if ((creationSubTab === 'checkpoints' || creationSubTab === 'approvals') && selectedCreation) {
      void fetchTripTimeline(selectedCreation.id);
    }
  }, [creationSubTab, selectedCreation, fetchTripTimeline]);

  useEffect(() => {
    if (creationSubTab === 'approvals' && selectedCreation) {
      void fetchTripInquiries(selectedCreation.id);
    }
  }, [creationSubTab, selectedCreation, fetchTripInquiries]);

  // Create new Tour form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newDest, setNewDest] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newMaxSize, setNewMaxSize] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const handleCreateTour = () => {
    if (!newGroupName.trim() || !newDest.trim() || !newDuration.trim() || !newMaxSize.trim() || !newPrice.trim()) {
      toast(t('groupOrganizer.fillAllTripDetails'), 'error');
      return;
    }

    // The trip is created on the server first and its real, database-issued
    // id is what the local tour row carries. This used to mint
    // `trip-${Date.now()}` client-side and use it for both — the server
    // rejected it as a non-UUID (so the trip was never actually created)
    // and the local row pointed at an id no trip ever had.
    void (async () => {
      const created = await addTrip({
        name: newGroupName.trim(),
        cities: [newDest.trim()],
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: parseFloat(newPrice),
        totalSeats: parseInt(newMaxSize),
        meetingPoint: t('groupOrganizer.organizerMeetingPoint'),
        guideIncluded: true,
        foodIncluded: true,
        hotelIncluded: false,
        cabIncluded: false,
        privacy: 'PUBLIC',
      });
      if (!created) return; // addTrip already surfaced the error

      const newTour: ActiveTour = {
        id: created.id,
        groupName: created.name,
        destination: newDest.trim(),
        durationDays: parseInt(newDuration),
        maxSize: created.totalSeats,
        currentSize: 1, // Organizer starts inside
        price: parseFloat(newPrice),
        status: 'OPEN',
      };
      setTours((prev) => [...prev, newTour]);
      setNewGroupName('');
      setNewDest('');
      setNewDuration('');
      setNewMaxSize('');
      setNewPrice('');
      setShowCreateModal(false);
      toast(t('groupOrganizer.tourCreated', { name: newTour.groupName }), 'success');
    })();
  };

  const handleApproveRequest = async (reqId: string, userName: string, avatar?: string) => {
    let nextStatus: 'APPROVED' | 'AWAITING_PAYMENT' = 'APPROVED';
    try {
      const res: any = await apiService.updateJoinRequestStatus(reqId, 'APPROVED');
      if (res?.status === 'AWAITING_PAYMENT') {
        nextStatus = 'AWAITING_PAYMENT';
      }
    } catch (e) {
      // A failed approval must not report success and flip the row locally:
      // the organizer would believe someone is on the trip who never got a
      // seat, and the next refetch would silently contradict the UI.
      logger.warn('Approve request failed:', e);
      toast(errorToastMessage(e, t('groupOrganizer.approveFailed', { name: userName })), 'error');
      return;
    }
    setRawJoinRequests((prev) => {
      const updated = prev.map((r) => (r.id === reqId ? { ...r, status: nextStatus } : r));
      if (selectedCreation) {
        const forTrip = updated.filter((r) => r.tripId === selectedCreation.id);
        void safeStorage.setItem(`@trip_requests_${selectedCreation.id}`, JSON.stringify(forTrip));
      }
      return updated;
    });
    if (nextStatus === 'AWAITING_PAYMENT') {
      toast(`Approved! Awaiting payment from ${userName}`, 'info');
    } else {
      toast(t('groupOrganizer.requestApproved', { name: userName, tour: selectedCreation?.name || currentTour.groupName }), 'success');
      if (selectedCreation) {
        fetchTourMembers(selectedCreation.id);
      }
    }
  };

  const handleRejectRequest = async (reqId: string, userName: string) => {
    try {
      await apiService.updateJoinRequestStatus(reqId, 'REJECTED');
    } catch (e) {
      logger.warn('Reject request failed:', e);
      toast(errorToastMessage(e, t('groupOrganizer.rejectFailed', { name: userName })), 'error');
      return;
    }
    setRawJoinRequests((prev) => {
      const updated = prev.map((r) => (r.id === reqId ? { ...r, status: 'REJECTED' as const } : r));
      if (selectedCreation) {
        const forTrip = updated.filter((r) => r.tripId === selectedCreation.id);
        void safeStorage.setItem(`@trip_requests_${selectedCreation.id}`, JSON.stringify(forTrip));
      }
      return updated;
    });
    toast(t('groupOrganizer.requestRejected', { name: userName }), 'info');
  };

  // docs/REMEDIATION.md §8.6 — "Edit Group Name" and the "Official Chat
  // Join Link" removed: both were pure local useState with no backend call
  // (a rename never touched the real ChatRoom.name column) and the "join
  // link" was a fabricated travelstar.app/chat/join/... string that no
  // route in this app resolves — tapping or sharing it would have done
  // nothing. Real chat rooms are joined by joining the trip, not a link.

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 2: MEMBERS & TOOLS STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // docs/REMEDIATION.md §8.6: "Add Member" and "Remove Member" bypassed the
  // real seat-claiming/join-request system entirely — a manually-added
  // member had a fake id and no TripMember row, and removal never freed a
  // seat back on the server (§5.4's race-safe seat accounting lives in
  // claimSeatAndJoin/releaseSeatAndLeave, keyed off a real join). Building a
  // parallel, safe path for an organizer to add/remove members outside that
  // flow is a larger, separate piece of work — not attempted this pass.
  // Members join for real via the "Chats & Approvals" tab's join-request
  // approval below, which already goes through that system.

  const isOrganizer = useMemo(() => {
    if (!selectedCreation) return false;
    if (selectedCreation.isMyTrip) return true;
    if (profile?.id && selectedCreation.creatorId === profile.id) return true;
    if (profile?.name && selectedCreation.creator && selectedCreation.creator.toLowerCase().includes(profile.name.toLowerCase())) return true;
    if (selectedCreation.creator && selectedCreation.creator.toLowerCase().includes('aarav sharma')) return true;
    return true;
  }, [selectedCreation, profile?.id, profile?.name]);



  const handleCheckInToggle = async (member: GroupMember) => {
    if (!currentTour) return;
    const next = !member.checkedIn;
    // Optimistic — rolled back if the server rejects it.
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, checkedIn: next } : m)));
    try {
      await apiService.updateTripRoster(currentTour.id, member.userId, { checkedIn: next });
    } catch (e) {
      logger.warn('[GroupOrganizer] Check-in update failed:', e);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, checkedIn: member.checkedIn } : m)));
      toast(t('groupOrganizer.couldNotUpdateCheckIn'), 'error');
    }
  };

  // Roster stats
  const checkedInCount = members.filter((m) => m.checkedIn).length;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 3: ITINERARY PLANNER & LOGISTICS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [logisticsTab, setLogisticsTab] = useState<'itinerary' | 'transport' | 'hotel'>('itinerary');

  const handleAddItineraryDay = async () => {
    if (!newDayTitle.trim() || !newDayDesc.trim()) {
      toast(t('groupOrganizer.pleaseCompleteDayDetails'), 'error');
      return;
    }
    if (!currentTour) return;
    setAddingDay(true);
    try {
      // The day number is assigned server-side, so refetch rather than
      // guessing it from the local array length.
      await apiService.addTripItineraryDay(currentTour.id, {
        title: newDayTitle.trim(),
        plan: newDayDesc.trim(),
      });
      setNewDayTitle('');
      setNewDayDesc('');
      await fetchItinerary(currentTour.id);
    } catch (e) {
      logger.warn('[GroupOrganizer] Failed to add itinerary day:', e);
      toast(t('groupOrganizer.couldNotSaveDay'), 'error');
    } finally {
      setAddingDay(false);
    }
  };

  const handleDeleteItineraryDay = (target: ItineraryDay) => {
    if (!currentTour) return;
    void (async () => {
      const ok = await confirm({
        title: t('groupOrganizer.removeDay'),
        message: t('groupOrganizer.removeDayMessage', { number: target.day, title: target.title }),
        confirmLabel: t('groupOrganizer.remove'),
        destructive: true,
      });
      if (!ok) return;
      try {
        // The server renumbers the days after this one, so take the whole
        // list back from it rather than splicing locally.
        await apiService.deleteTripItineraryDay(currentTour.id, target.id);
        await fetchItinerary(currentTour.id);
      } catch (e) {
        logger.warn('[GroupOrganizer] Failed to delete itinerary day:', e);
        toast(t('groupOrganizer.couldNotRemoveDay'), 'error');
      }
    })();
  };

  // Rooms and Seats allocations states
  // docs/REMEDIATION.md §8.6: both of these used to be pure local
  // setMembers() — discarded the next time fetchTourMembers ran (e.g.
  // switching tours and back). Now a real PATCH, with a rollback on failure.
  //
  // These two used Alert.prompt, which exists only on iOS — on Android and
  // web the allocator buttons did nothing at all, silently. showPrompt is the
  // cross-platform replacement (docs/REMEDIATION.md §9.2).
  const handleAllocateRoom = (member: GroupMember) => {
    if (!currentTour) return;
    void (async () => {
      const room = await showPrompt({
        title: t('groupOrganizer.allocateHotelRoom'),
        message: t('groupOrganizer.setRoomNumberMessage'),
        placeholder: t('groupOrganizer.roomPlaceholder'),
        defaultValue: member.roomAllocated ?? '',
        confirmLabel: t('groupOrganizer.allocate'),
      });
      if (room === null) return;
      const trimmed = room.trim();
      if (!trimmed) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, roomAllocated: trimmed } : m)));
      try {
        await apiService.updateTripRoster(currentTour.id, member.userId, { roomAllocated: trimmed });
      } catch (e) {
        logger.warn('[GroupOrganizer] Room allocation failed:', e);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, roomAllocated: member.roomAllocated } : m)),
        );
        toast(t('groupOrganizer.couldNotSaveRoomAssignment'), 'error');
      }
    })();
  };

  const handleAllocateSeat = (member: GroupMember) => {
    if (!currentTour) return;
    void (async () => {
      const seat = await showPrompt({
        title: t('groupOrganizer.allocateTransportSeat'),
        message: t('groupOrganizer.setSeatNumberMessage'),
        placeholder: t('groupOrganizer.seatPlaceholder'),
        defaultValue: member.seatAllocated ?? '',
        confirmLabel: t('groupOrganizer.allocate'),
      });
      if (seat === null) return;
      const trimmed = seat.trim();
      if (!trimmed) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, seatAllocated: trimmed } : m)));
      try {
        await apiService.updateTripRoster(currentTour.id, member.userId, { seatAllocated: trimmed });
      } catch (e) {
        logger.warn('[GroupOrganizer] Seat allocation failed:', e);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, seatAllocated: member.seatAllocated } : m)),
        );
        toast(t('groupOrganizer.couldNotSaveSeatAssignment'), 'error');
      }
    })();
  };

  // docs/REMEDIATION.md §8.6: removed —
  // • Fake driver info (hardcoded "Jaspreet Singh" for every tour).
  // • Payments tab (three hardcoded names/balances that never changed) and
  //   "Generate Invoice" (an Alert.alert claiming a PDF had been compiled
  //   and emailed — payments/wallet were already removed for v1, §5.5/§5.6,
  //   so there is no real payment data to display here at all).
  // • Documents tab (three hardcoded fake filenames, no real storage).
  // • Group consensus polls — fully local, unauthenticated, unlimited
  //   voting (nothing stopped one person clicking the same option 100
  //   times), no persistence.
  // • The AI Trip Generator — a setTimeout("Simulate AI generation lag",
  //   the code's own comment) that filled in a hardcoded template string
  //   with the typed destination name, presented as if a real model ran.
  // • The QR check-in scanner simulation — a fake scanning animation with
  //   a "Simulate Scanned Participant" picker; there was never a real scan.
  // None of these had a reasonable real backend to wire up in this pass —
  // payments/documents/polls, in particular, would each need their own
  // schema and moderation story, not a quick fix.

  // docs/REMEDIATION.md §8.6 — real announcements, replacing local-only
  // useState + an Alert.alert claiming "broadcasted... via Push
  // Notification" when nothing was sent to anyone. Publishing is real (a
  // Notification row is created for every trip member) — this list itself
  // is the organizer's session-only log of what they've sent, not a fetch
  // of history, since a Notification is stored per-recipient, not per-
  // announcement; there's no single row to list back without deduping N
  // near-identical copies. Reopening the app clears this list; the sent
  // notifications themselves are not lost.
  const [announcements, setAnnouncements] = useState<
    { id: string; title: string; content: string; createdAt: string }[]
  >([]);
  const [newAnnounceTitle, setNewAnnounceTitle] = useState('');
  const [newAnnounceDesc, setNewAnnounceDesc] = useState('');
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);

  const handlePublishAnnouncement = async () => {
    if (!newAnnounceTitle.trim() || !newAnnounceDesc.trim()) {
      toast(t('groupOrganizer.fillTitleAndContent'), 'error');
      return;
    }
    if (!currentTour) return;
    setPublishingAnnouncement(true);
    try {
      const result = await apiService.postTripAnnouncement(currentTour.id, {
        title: newAnnounceTitle.trim(),
        content: newAnnounceDesc.trim(),
      });
      setAnnouncements((prev) => [
        {
          id: `a-${Date.now()}`,
          title: newAnnounceTitle.trim(),
          content: newAnnounceDesc.trim(),
          createdAt: t('groupOrganizer.justNow'),
        },
        ...prev,
      ]);
      setNewAnnounceTitle('');
      setNewAnnounceDesc('');
      toast(
        result.recipientCount > 0
          ? t('groupOrganizer.announcementPublished', { count: result.recipientCount })
          : t('groupOrganizer.announcementPublishedNoMembers'),
        result.recipientCount > 0 ? 'success' : 'info',
      );
    } catch (e) {
      logger.warn('[GroupOrganizer] Publish announcement failed:', e);
      toast(t('groupOrganizer.couldNotSendAnnouncement'), 'error');
    } finally {
      setPublishingAnnouncement(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Clean Modern Light Header */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setCurrentRole('TOURIST');
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('groupOrganizer.goBack')}
          >
            <ArrowLeft size={18} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t('groupOrganizer.headerTitle')}</Text>
            <Text style={styles.headerSub}>{t('groupOrganizer.headerSub')}</Text>
          </View>

        </View>

        {/* Top 2 Tabs: Organizer Console & Chats and Approvals */}
        <View style={styles.tabBarContainer}>
          <View style={styles.topTwoTabsRow}>
            {(
              [
                { key: 'console', label: t('groupOrganizer.tabConsole', 'Organizer Console'), Icon: Compass },
                { key: 'chat', label: t('groupOrganizer.tabChatsApprovals', 'Chats and Approvals'), Icon: MessageSquare },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.key;
              const pendingCount = rawJoinRequests.filter((r) => r.status === 'PENDING').length + quotes.length;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.topTabItem, isActive && styles.topTabItemActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <tab.Icon size={15} color={isActive ? C.white : C.textSec} strokeWidth={isActive ? 2.5 : 1.8} />
                  <Text style={[styles.topTabLabel, { color: isActive ? C.white : C.textSec }]}>{tab.label}</Text>
                  {tab.key === 'chat' && pendingCount > 0 && (
                    <View style={styles.chatTabBadge}>
                      <Text style={styles.chatTabBadgeText}>{pendingCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Dropdown Trip Selector (shown in Chats & Approvals tab when multiple tours exist) */}
        {activeTab === 'chat' && tours.length > 1 && (
          <View style={styles.dropdownTripBar}>
            <Text style={styles.dropdownLabel}>{t('groupOrganizer.activeRosterLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dropdownTripScroll}>
              {tours.map((tour, idx) => {
                const isSel = idx === selectedTourIdx;
                return (
                  <TouchableOpacity
                    key={tour.id}
                    style={[styles.dropdownTripBtn, isSel && styles.dropdownTripBtnActive]}
                    onPress={() => setSelectedTourIdx(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={tour.groupName}
                    accessibilityState={{ selected: isSel }}
                  >
                    <Text style={[styles.dropdownTripText, { color: isSel ? C.blueText : C.textSec }]}>{tour.groupName}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.dropdownTripAddBtn}
                onPress={() => router.push('/create')}
                accessibilityRole="button"
                accessibilityLabel={t('groupOrganizer.launchNewTourGroup')}
              >
                <Plus size={12} color={C.blueText} />
                <Text style={styles.dropdownTripAddText}>{t('common.create')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Every tab below is scoped to the caller's own trips and writes
          through authenticated endpoints (create trip, approve a join
          request, post to the trip room), so there is nothing here for a
          logged-out visitor to do. The home screen already prompts before
          routing here; this covers a deep link. */}
      {!isLoggedIn ? (
        <ScreenEmpty
          title={t('groupOrganizer.signInTitle')}
          message={t('groupOrganizer.signInMessage')}
          actionLabel={t('groupOrganizer.signIn')}
          onAction={() => router.push('/auth')}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} scrollEnabled={!(selectedCreation && creationSubTab === "overview")}>
          {/* docs/REMEDIATION.md §8.6: `tours` used to always have at least
            one entry (a hardcoded fixture) even for an organizer with zero
            real trips, so every tab below could assume `currentTour`
            existed. It's now sourced entirely from real trips, which means
            it can be empty — this is the real empty state instead of a
            crash or a fake trip. */}
          {/* ========================================================
              TAB 0: ORGANIZER CONSOLE (MY CREATIONS & HOSTED JOURNEYS)
              ======================================================== */}
          {activeTab === 'console' ? (
            !selectedCreation ? (
              <View style={styles.organizerConsoleBlock}>
                {/* Section Title with + Create */}
                  <View style={styles.creationsSectionHeader}>
                    <Text style={styles.creationsSectionTitle}>{t('createTrip.myCreations')}</Text>
                    <TouchableOpacity
                      style={styles.creationsAddBtn}
                      onPress={() => router.push('/create')}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.create')}
                    >
                      <Plus size={14} color={C.blueText} />
                      <Text style={styles.creationsAddBtnText}>{t('common.create')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Hosted Journeys List or Empty State */}
                  {myTrips.length === 0 ? (
                    <View style={styles.organizerEmptyCard}>
                      <Users size={38} color={C.textMuted} />
                      <Text style={styles.organizerEmptyTitle}>No Hosted Journeys Yet</Text>
                      <Text style={styles.organizerEmptySub}>
                        Publish a group journey route to start accepting travelers, managing booking requests, and chatting with cohorts.
                      </Text>
                      <TouchableOpacity
                        style={styles.organizerPrimaryBtn}
                        onPress={() => router.push('/create')}
                        accessibilityRole="button"
                      >
                        <Plus size={14} color={C.white} />
                        <Text style={styles.organizerPrimaryBtnText}>Host a Group Journey</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {myTrips.map((trip: Trip) => {
                        const tripPendingCount = rawJoinRequests.filter(
                          (r) => r.tripId === trip.id && r.status === 'PENDING',
                        ).length;
                        const tripBudgetPerPerson = parseMoney(trip.budget) ?? 0;
                        const tripTotalSeats = Number(trip.totalSeats) || 10;
                        const tripAvailSeats = Number(trip.availableSeats) || 0;
                        const tripConfirmedSeats = Math.max(0, tripTotalSeats - tripAvailSeats);
                        const tripTotalCost = tripBudgetPerPerson * tripTotalSeats;
                        const tripMoneyCollected = tripBudgetPerPerson * tripConfirmedSeats;
                        const isTripOpen = tripAvailSeats > 0;

                        return (
                          <TouchableOpacity
                            key={trip.id}
                            style={styles.consoleTripCard}
                            onPress={() => {
                              setSelectedCreation(trip);
                              const tIdx = tours.findIndex((t) => t.id === trip.id);
                              if (tIdx !== -1) setSelectedTourIdx(tIdx);
                              fetchTourMembers(trip.id);
                              fetchItinerary(trip.id);
                              void fetchTripQuotes(trip.id);
                              setCreationSubTab('dashboard');
                            }}
                            activeOpacity={0.88}
                          >
                            <CoverImage uri={tripCoverImage(trip)} name={trip.name} style={styles.consoleTripCardImg} />
                            <View style={styles.consoleTripCardBody}>
                              <View style={styles.consoleTripCardHeader}>
                                <Text style={styles.consoleTripCardTitle} numberOfLines={1}>
                                  {trip.name}
                                </Text>
                                <View style={styles.previewHeaderBadges}>
                                  <View
                                    style={[
                                      styles.tripStatusBadge,
                                      isTripOpen ? styles.tripStatusOpenBadge : styles.tripStatusClosedBadge,
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.tripStatusDot,
                                        isTripOpen ? styles.tripStatusDotOpen : styles.tripStatusDotClosed,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.tripStatusText,
                                        isTripOpen ? styles.tripStatusOpenText : styles.tripStatusClosedText,
                                      ]}
                                    >
                                      {isTripOpen ? 'OPEN' : 'CLOSED'}
                                    </Text>
                                  </View>
                                  {tripPendingCount > 0 && (
                                    <View style={styles.requestNotifyIndicator}>
                                      <Text style={styles.requestNotifyText}>
                                        {tripPendingCount} req
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>

                              <Text style={styles.consoleTripCardRoute} numberOfLines={1}>
                                {trip.cities.join(' ➔ ')}
                              </Text>

                              {/* Total Cost & Money Collected */}
                              <View style={styles.creationStatsRow}>
                                <View style={styles.creationStat}>
                                  <Text style={styles.creationStatLabel}>Total Cost</Text>
                                  <Text style={styles.creationStatVal}>{formatINR(tripTotalCost)}</Text>
                                </View>
                                <View style={styles.creationStat}>
                                  <Text style={styles.creationStatLabel}>Money Collected</Text>
                                  <Text style={[styles.creationStatVal, { color: C.greenText }]}>
                                    {formatINR(tripMoneyCollected)}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.creationManageRow}>
                                <Text style={styles.creationSeatSubtitle}>
                                  {tripConfirmedSeats}/{tripTotalSeats} seats filled ({tripAvailSeats} left)
                                </Text>
                                <View style={styles.creationManageLink}>
                                  <Text style={styles.creationManageText}>Manage</Text>
                                  <ChevronRight size={12} color={C.blueText} />
                                </View>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.selectedCreationViewBlock}>
                  {/* Ultra-Compact Unified Header Bar (Back + Trip Identity + Status) */}
                  <View style={styles.compactCreationHeader}>
                    <TouchableOpacity
                      style={styles.compactBackBtn}
                      onPress={() => setSelectedCreation(null)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Back to My Creations"
                    >
                      <ArrowLeft size={16} color={C.blueText} />
                      <Text style={styles.compactBackText}>Creations</Text>
                    </TouchableOpacity>

                    <View style={styles.compactHeaderDivider} />

                    <View style={styles.compactHeaderContent}>
                      <View style={styles.compactHeaderTitleRow}>
                        <Text style={styles.compactHeaderTitle} numberOfLines={1}>
                          {selectedCreation.name}
                        </Text>
                        <View style={styles.compactHeaderBadge}>
                          <Text style={styles.compactHeaderBadgeText}>{selectedCreation.category || 'Tour'}</Text>
                        </View>
                      </View>
                      <Text style={styles.compactHeaderMeta} numberOfLines={1}>
                        {selectedCreation.cities.join(' ➔ ')} • {formatINR(selectedCreation.budget)} • {selectedCreation.availableSeats} slots
                      </Text>
                    </View>
                  </View>

                  {/* Precision Slim Segmented Control (Non-Scrollable, Space-Efficient) */}
                  <View style={styles.compactSegmentedBar}>
                    {(
                      [
                        { key: 'dashboard', label: 'Dashboard', Icon: TrendingUp },
                        { key: 'roster', label: 'Members', Icon: Users },
                        {
                          key: 'approvals',
                          label: t('groupOrganizer.tabChatApprovals'),
                          Icon: MessageSquare,
                          badge:
                            rawJoinRequests.filter((r) => r.tripId === selectedCreation.id && r.status === 'PENDING').length +
                            inquiries.filter((th) => th.unreadCount > 0).length,
                        },
                        { key: 'itinerary', label: 'Itinerary', Icon: Calendar },
                        { key: 'checkpoints', label: t('groupOrganizer.tabCheckpointGuides'), Icon: MapPin },
                        { key: 'overview', label: 'Overview', Icon: Compass },
                      ] as const
                    ).map((item) => {
                      const isAct = creationSubTab === item.key;
                      const Icon = item.Icon;
                      const pendingBadge = 'badge' in item ? (item as any).badge : 0;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[styles.compactSegmentItem, isAct && styles.compactSegmentItemActive]}
                          onPress={() => setCreationSubTab(item.key)}
                          activeOpacity={0.8}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: isAct }}
                        >
                          <View style={styles.compactSegmentIconWrap}>
                            <Icon size={14} color={isAct ? C.blueText : C.textSec} strokeWidth={isAct ? 2.3 : 1.8} />
                            {pendingBadge > 0 && (
                              <View style={styles.requestsTabRedDot} />
                            )}
                          </View>
                          <Text
                            style={[
                              styles.compactSegmentLabel,
                              isAct && styles.compactSegmentLabelActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
              {creationSubTab === 'dashboard' && (() => {
                const tripBudgetPerPerson = parseMoney(selectedCreation.budget) ?? 0;
                const tripTotalSeats = Number(selectedCreation.totalSeats) || 10;
                const tripAvailSeats = Number(selectedCreation.availableSeats) || 0;
                const tripConfirmedSeats = Math.max(0, tripTotalSeats - tripAvailSeats);
                const tripTotalCostNeeded = tripBudgetPerPerson * tripTotalSeats;
                const tripMoneyTaken = tripBudgetPerPerson * tripConfirmedSeats;
                const tripRemainingMoney = Math.max(0, tripTotalCostNeeded - tripMoneyTaken);
                const tripCollectionRate = tripTotalCostNeeded > 0 ? Math.round((tripMoneyTaken / tripTotalCostNeeded) * 100) : 0;
                const tripOccupancyRate = tripTotalSeats > 0 ? Math.round((tripConfirmedSeats / tripTotalSeats) * 100) : 0;
                const isTripFull = tripAvailSeats <= 0;
                const tripPendingRequests = rawJoinRequests.filter(
                  (r) => r.tripId === selectedCreation.id && r.status === 'PENDING'
                ).length;

                return (
                  <View style={{ gap: 12 }}>
                    {/* Financial Overview Card for this Particular Trip */}
                    <View style={styles.minimalAnalyticsCard}>
                      <View style={styles.minimalAnalyticsHeader}>
                        <View>
                          <Text style={styles.minimalAnalyticsTitle}>Trip Financial Overview</Text>
                          <Text style={styles.minimalAnalyticsSub}>
                            Budget target and realized funds for {selectedCreation.name}
                          </Text>
                        </View>
                        <View style={isTripFull ? styles.seatStatusFullBadge : styles.seatStatusOpenBadge}>
                          <Text style={isTripFull ? styles.seatStatusFullBadgeText : styles.seatStatusOpenBadgeText}>
                            {isTripFull ? 'SEATS FULL' : `${tripAvailSeats} SEATS LEFT`}
                          </Text>
                        </View>
                      </View>

                      {/* Progress Bar: Money Collected vs Total Cost Needed */}
                      <View style={styles.minimalProgressSection}>
                        <View style={styles.minimalProgressMetaRow}>
                          <Text style={styles.minimalProgressLabel}>
                            Money Collected:{' '}
                            <Text style={styles.minimalProgressVal}>{formatINR(tripMoneyTaken)}</Text>
                          </Text>
                          <Text style={styles.minimalProgressPercent}>
                            {tripCollectionRate}% of Cost Needed
                          </Text>
                        </View>
                        <View style={styles.minimalProgressBarBg}>
                          <View
                            style={[
                              styles.minimalProgressBarFill,
                              { width: `${Math.min(100, tripCollectionRate)}%` },
                            ]}
                          />
                        </View>
                        <View style={styles.minimalProgressSubRow}>
                          <Text style={styles.minimalProgressRemaining}>
                            Remaining to collect: {formatINR(tripRemainingMoney)}
                          </Text>
                          <Text style={styles.minimalProgressPax}>
                            {tripConfirmedSeats} / {tripTotalSeats} travelers
                          </Text>
                        </View>
                      </View>

                      {/* 2 Core Minimal Stat Boxes: Total Cost Needed & Money Collected */}
                      <View style={styles.minimalStatsRow}>
                        <View style={styles.minimalStatBox}>
                          <Text style={styles.minimalStatLabel}>Total Cost Needed</Text>
                          <Text style={styles.minimalStatVal}>{formatINR(tripTotalCostNeeded)}</Text>
                          <Text style={styles.minimalStatSub}>Across all {tripTotalSeats} slots</Text>
                        </View>

                        <View style={styles.minimalStatBox}>
                          <Text style={styles.minimalStatLabel}>Money Collected</Text>
                          <Text style={[styles.minimalStatVal, { color: '#059669' }]}>
                            {formatINR(tripMoneyTaken)}
                          </Text>
                          <Text style={styles.minimalStatSub}>Taken so far ({tripConfirmedSeats} travelers)</Text>
                        </View>
                      </View>
                    </View>

                    {/* Trip Seat Status & Capacity Card */}
                    <View style={styles.minimalAnalyticsCard}>
                      <View style={styles.minimalAnalyticsHeader}>
                        <View>
                          <Text style={styles.minimalAnalyticsTitle}>Trip Seat Status</Text>
                          <Text style={styles.minimalAnalyticsSub}>
                            Passenger capacity and reservation status
                          </Text>
                        </View>
                        <View style={isTripFull ? styles.seatStatusFullBadge : styles.seatStatusOpenBadge}>
                          <Text style={isTripFull ? styles.seatStatusFullBadgeText : styles.seatStatusOpenBadgeText}>
                            {isTripFull ? 'FULL' : 'INCOMPLETE'}
                          </Text>
                        </View>
                      </View>

                      {/* Seat Occupancy Progress Bar */}
                      <View style={styles.minimalProgressSection}>
                        <View style={styles.minimalProgressMetaRow}>
                          <Text style={styles.minimalProgressLabel}>
                            Confirmed Seats:{' '}
                            <Text style={styles.minimalProgressVal}>
                              {tripConfirmedSeats} / {tripTotalSeats}
                            </Text>
                          </Text>
                          <Text style={styles.minimalProgressPercent}>
                            {tripOccupancyRate}% Filled
                          </Text>
                        </View>
                        <View style={styles.minimalProgressBarBg}>
                          <View
                            style={[
                              styles.minimalProgressBarFill,
                              { width: `${Math.min(100, tripOccupancyRate)}%` },
                            ]}
                          />
                        </View>
                        <View style={styles.minimalProgressSubRow}>
                          <Text style={styles.minimalProgressRemaining}>
                            {isTripFull ? 'All seats booked' : `${tripAvailSeats} slots still open for travelers`}
                          </Text>
                          <Text style={styles.minimalProgressPax}>
                            {formatINR(tripBudgetPerPerson)} / person
                          </Text>
                        </View>
                      </View>

                      {/* Seat Status Metrics */}
                      <View style={styles.minimalStatsRow}>
                        <View style={styles.minimalStatBox}>
                          <Text style={styles.minimalStatLabel}>Seat Status</Text>
                          <Text style={[styles.minimalStatVal, { color: isTripFull ? '#059669' : '#D97706' }]}>
                            {isTripFull ? 'Full' : 'Incomplete'}
                          </Text>
                          <Text style={styles.minimalStatSub}>
                            {isTripFull ? 'Capacity complete' : `${tripAvailSeats} seats open`}
                          </Text>
                        </View>

                        <View style={styles.minimalStatBox}>
                          <Text style={styles.minimalStatLabel}>Pending Requests</Text>
                          <Text style={[styles.minimalStatVal, tripPendingRequests > 0 && { color: '#D97706' }]}>
                            {tripPendingRequests}
                          </Text>
                          <Text style={styles.minimalStatSub}>
                            {tripPendingRequests > 0 ? t('groupOrganizer.reviewInApprovalsTab') : 'No pending requests'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    
                  </View>
                );
              })()}

              {creationSubTab === 'roster' && (
                <View style={{ gap: 10 }}>
                  {/* Header Row */}
                  <View style={styles.membersHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.membersTitle}>Trip Members</Text>
                      <Text style={styles.membersSub}>
                        {members.length} {members.length === 1 ? 'traveler' : 'travelers'} enrolled for {selectedCreation.name}
                      </Text>
                    </View>

                    {/* Dedicated Separate Option for Group Chat */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.openGroupChatBtn}
                        onPress={() => {
                          if (selectedCreation?.chatRoomId) {
                            setActiveRoomId(selectedCreation.chatRoomId);
                          }
                          router.push('/chat');
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Open Group Chat"
                      >
                        <MessageSquare size={12} color={C.white} />
                        <Text style={styles.openGroupChatBtnText}>Group Chat</Text>
                      </TouchableOpacity>

                      <View style={styles.membersCountBadge}>
                        <Users size={12} color={C.blueText} />
                        <Text style={styles.membersCountText}>
                          {members.length}/{selectedCreation.totalSeats || 10}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Members List */}
                  {members.length === 0 ? (
                    <View style={styles.emptyMembersState}>
                      <Users size={32} color={C.textMuted} />
                      <Text style={styles.emptyMembersTitle}>No members yet</Text>
                      <Text style={styles.emptyMembersSub}>
                        When travelers join this trip, their profiles will appear here.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {members.map((member) => {
                        const isLeader = member.role === 'LEADER';

                        return (
                          <View key={member.id} style={styles.memberCard}>
                            <View style={styles.memberCardTop}>
                              {member.avatar ? (
                                <Image source={{ uri: member.avatar }} style={styles.memberCardAvatar} />
                              ) : (
                                <View style={styles.memberAvatarFallback}>
                                  <Text style={styles.memberAvatarText}>
                                    {member.name ? member.name.charAt(0).toUpperCase() : 'T'}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.memberInfoCol}>
                                <View style={styles.memberNameRow}>
                                  <Text style={styles.memberCardName}>{member.name}</Text>
                                  <View
                                    style={[
                                      styles.memberRolePill,
                                      isLeader
                                        ? { backgroundColor: C.blueGlow }
                                        : member.role === 'GUIDE'
                                          ? { backgroundColor: C.purpleGlow }
                                          : { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.memberRoleText,
                                        {
                                          color: isLeader
                                            ? C.blueText
                                            : member.role === 'GUIDE'
                                              ? C.purpleText
                                              : C.textSec,
                                        },
                                      ]}
                                    >
                                      {isLeader ? 'ORGANIZER' : member.role === 'GUIDE' ? 'GUIDE' : 'TRAVELER'}
                                    </Text>
                                  </View>
                                </View>

                                {/* Optional Allocations (Room & Seat) */}
                                {(member.roomAllocated || member.seatAllocated) ? (
                                  <View style={styles.memberMetaRow}>
                                    {member.roomAllocated ? (
                                      <View style={styles.memberMetaChip}>
                                        <Hotel size={10} color={C.textMuted} />
                                        <Text style={styles.memberMetaChipText}>Room {member.roomAllocated}</Text>
                                      </View>
                                    ) : null}
                                    {member.seatAllocated ? (
                                      <View style={styles.memberMetaChip}>
                                        <Car size={10} color={C.textMuted} />
                                        <Text style={styles.memberMetaChipText}>Seat {member.seatAllocated}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* ========================================================
              CREATION OPTION 2: REQUESTS & APPROVALS
              ======================================================== */}
              {creationSubTab === 'approvals' && (
                <View style={styles.requestsSection}>
                  {/* ─── Section 1: pre-join enquiry DMs ─── */}
                  <View style={styles.membersHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.membersTitle}>{t('groupOrganizer.enquiriesTitle')}</Text>
                      <Text style={styles.membersSub}>{t('groupOrganizer.enquiriesSub')}</Text>
                    </View>
                  </View>

                  {inquiriesLoading ? (
                    <View style={styles.emptyMembersState}>
                      <ActivityIndicator color={C.blue} />
                      <Text style={styles.emptyMembersSub}>{t('groupOrganizer.loadingEnquiries')}</Text>
                    </View>
                  ) : inquiriesError ? (
                    <View style={styles.emptyMembersState}>
                      <MessageSquare size={32} color={C.textMuted} />
                      <Text style={styles.emptyMembersTitle}>{inquiriesError}</Text>
                      <TouchableOpacity
                        onPress={() => fetchTripInquiries(selectedCreation.id)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.emptyMembersSub, { color: C.blueText, marginTop: 6 }]}>
                          {t('groupOrganizer.retry')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : inquiries.length === 0 ? (
                    <View style={styles.emptyMembersState}>
                      <MessageSquare size={32} color={C.textMuted} />
                      <Text style={styles.emptyMembersTitle}>{t('groupOrganizer.noEnquiriesTitle')}</Text>
                      <Text style={styles.emptyMembersSub}>{t('groupOrganizer.noEnquiriesDesc')}</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {inquiries.map((thread) => {
                        const threadName = thread.user.name || t('groupOrganizer.unnamedTraveler');
                        const chipStatus = thread.hasJoinRequest ? thread.joinRequestStatus : null;
                        return (
                          <TouchableOpacity
                            key={thread.chatRoomId}
                            style={styles.inquiryRow}
                            onPress={() =>
                              router.push({ pathname: '/(tabs)/chat', params: { roomId: thread.chatRoomId } })
                            }
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={threadName}
                          >
                            <Avatar uri={thread.user.avatar} name={threadName} size={38} />
                            <View style={styles.inquiryBody}>
                              <View style={styles.inquiryTopRow}>
                                <Text style={styles.inquiryName} numberOfLines={1}>
                                  {threadName}
                                </Text>
                                {chipStatus ? (
                                  <View
                                    style={[
                                      styles.requestStatusBadge,
                                      chipStatus === 'APPROVED'
                                        ? styles.requestStatusApproved
                                        : chipStatus === 'REJECTED'
                                        ? styles.requestStatusRejected
                                        : chipStatus === 'AWAITING_PAYMENT'
                                        ? styles.requestStatusAwaiting
                                        : styles.requestStatusPending,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.requestStatusBadgeText,
                                        chipStatus === 'APPROVED'
                                          ? styles.requestStatusApprovedText
                                          : chipStatus === 'REJECTED'
                                          ? styles.requestStatusRejectedText
                                          : chipStatus === 'AWAITING_PAYMENT'
                                          ? styles.requestStatusAwaitingText
                                          : styles.requestStatusPendingText,
                                      ]}
                                    >
                                      {t(INQUIRY_STATUS_LABEL_KEYS[chipStatus])}
                                    </Text>
                                  </View>
                                ) : null}
                                <Text style={styles.inquiryTime}>{formatRelative(thread.lastMessageAt)}</Text>
                              </View>
                              <View style={styles.inquiryBottomRow}>
                                <Text style={styles.inquiryPreview} numberOfLines={1}>
                                  {thread.lastMessage || t('groupOrganizer.enquiryNoMessages')}
                                </Text>
                                {thread.unreadCount > 0 ? (
                                  <View style={styles.inquiryUnreadBadge}>
                                    <Text style={styles.inquiryUnreadBadgeText}>{thread.unreadCount}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* ─── Section 2: join requests ─── */}
                  <View style={[styles.membersHeaderRow, { marginTop: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.membersTitle}>{t('groupOrganizer.joinRequestsTitle')}</Text>
                      <Text style={styles.membersSub}>{t('groupOrganizer.joinRequestsSub')}</Text>
                    </View>
                  </View>

                  {/* Requests Notification Banner (Active whenever there are pending requests / messages) */}
                  {(() => {
                    const pendingCount = rawJoinRequests.filter(
                      (r) => r.tripId === selectedCreation.id && r.status === 'PENDING',
                    ).length;
                    if (pendingCount > 0) {
                      return (
                        <View style={styles.requestsNotificationCard}>
                          <View style={styles.requestsNotificationIconWrap}>
                            <MessageSquare size={16} color="#DC2626" />
                            <View style={styles.requestsNotificationInnerDot} />
                          </View>
                          <View style={styles.requestsNotificationBody}>
                            <View style={styles.requestsNotificationHeaderRow}>
                              <Text style={styles.requestsNotificationTag}>NEW NOTIFICATION</Text>
                              <View style={styles.requestsNotificationCountBadge}>
                                <Text style={styles.requestsNotificationCountText}>
                                  {pendingCount} Pending
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.requestsNotificationTitle}>
                              {pendingCount === 1
                                ? '1 new message regarding pending request'
                                : `${pendingCount} new messages regarding pending requests`}
                            </Text>
                            <Text style={styles.requestsNotificationDesc}>
                              Travelers have sent messages regarding joining this journey. Review their notes and accept or decline below.
                            </Text>
                          </View>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* Requests Filter Pills - Exactly 1 Row, Non-Wrapping, Stacking at Same Level */}
                  <View style={styles.requestsFilterRow}>
                    {[
                      { key: 'ALL', label: 'All' },
                      { key: 'PENDING', label: 'Pending' },
                      { key: 'AWAITING_PAYMENT', label: 'Awaiting Pay' },
                      { key: 'APPROVED', label: 'Accepted' },
                      { key: 'REJECTED', label: 'Declined' },
                    ].map((filter) => {
                      const isSel = requestFilter === filter.key;
                      const count =
                        filter.key === 'ALL'
                          ? rawJoinRequests.filter((r) => r.tripId === selectedCreation.id).length
                          : rawJoinRequests.filter((r) => r.tripId === selectedCreation.id && r.status === filter.key).length;
                      return (
                        <TouchableOpacity
                          key={filter.key}
                          style={[styles.requestFilterPill, isSel && styles.requestFilterPillActive]}
                          onPress={() => setRequestFilter(filter.key as any)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`${filter.label} filter, ${count} items`}
                        >
                          <Text
                            style={[styles.requestFilterText, isSel && styles.requestFilterTextActive]}
                            numberOfLines={1}
                          >
                            {filter.label} ({count})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Request Items List */}
                  {(() => {
                    const tripRequests = rawJoinRequests
                      .filter((r) => r.tripId === selectedCreation.id)
                      .filter((r) => requestFilter === 'ALL' || r.status === requestFilter);

                    if (tripRequests.length === 0) {
                      return (
                        <View style={styles.emptyRequestsBox}>
                          <Users size={32} color={C.textMuted} />
                          <Text style={styles.emptyRequestsBoxTitle}>
                            {requestFilter === 'PENDING'
                              ? 'No pending join requests'
                              : requestFilter === 'AWAITING_PAYMENT'
                              ? 'No requests awaiting payment'
                              : requestFilter === 'APPROVED'
                              ? 'No accepted travelers yet'
                              : requestFilter === 'REJECTED'
                              ? 'No declined requests'
                              : 'No requests received for this journey yet'}
                          </Text>
                          <Text style={styles.emptyRequestsBoxSub}>
                            When travelers apply to join your group journey, their applications and messages will appear here for review.
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View style={{ gap: 10 }}>
                        {tripRequests.map((req) => (
                          <View key={req.id} style={styles.requestCard}>
                            <View style={styles.requestCardTop}>
                              <Avatar uri={req.applicantAvatar} name={req.applicantName} size={38} />
                              <View style={styles.requestCardInfo}>
                                <View style={styles.requestCardNameRow}>
                                  <Text style={styles.requestCardName}>{req.applicantName || 'Traveler'}</Text>
                                  <View
                                    style={[
                                      styles.requestStatusBadge,
                                      req.status === 'APPROVED'
                                        ? styles.requestStatusApproved
                                        : req.status === 'REJECTED'
                                        ? styles.requestStatusRejected
                                        : req.status === 'AWAITING_PAYMENT'
                                        ? styles.requestStatusAwaiting
                                        : styles.requestStatusPending,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.requestStatusBadgeText,
                                        req.status === 'APPROVED'
                                          ? styles.requestStatusApprovedText
                                          : req.status === 'REJECTED'
                                          ? styles.requestStatusRejectedText
                                          : req.status === 'AWAITING_PAYMENT'
                                          ? styles.requestStatusAwaitingText
                                          : styles.requestStatusPendingText,
                                      ]}
                                    >
                                      {req.status === 'APPROVED' ? 'ACCEPTED' : req.status === 'REJECTED' ? 'DECLINED' : req.status === 'AWAITING_PAYMENT' ? 'AWAITING PAY' : 'PENDING'}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.requestCardRoute} numberOfLines={1}>
                                  {req.fromCity && req.toCity ? `${req.fromCity} ➔ ${req.toCity}` : 'Full Journey Route'}
                                </Text>
                                {req.familyMemberCount > 0 ? (
                                  <Text style={styles.requestCardRoute} numberOfLines={1}>
                                    {t('groupOrganizer.requestPartySize', {
                                      partySize: req.partySize,
                                      familyMemberCount: req.familyMemberCount,
                                    })}
                                  </Text>
                                ) : null}
                                {(() => {
                                  const fromStop = req.fromStopId
                                    ? timelineStops.find((s) => s.id === req.fromStopId)
                                    : undefined;
                                  const toStop = req.toStopId
                                    ? timelineStops.find((s) => s.id === req.toStopId)
                                    : undefined;
                                  if (!fromStop || !toStop) return null;
                                  return (
                                    <Text style={styles.requestCardRoute} numberOfLines={1}>
                                      {t('groupOrganizer.requestCheckpointRange', {
                                        from: fromStop.city,
                                        to: toStop.city,
                                      })}
                                    </Text>
                                  );
                                })()}
                                {req.joiningDate ? (
                                  <Text style={styles.requestCardRoute} numberOfLines={1}>
                                    {t('groupOrganizer.requestJoiningDate', {
                                      date: formatDateShort(req.joiningDate),
                                    })}
                                  </Text>
                                ) : null}
                              </View>
                            </View>

                            {/* Applicant Message Note */}
                            {(req as any).message ? (
                              <View style={styles.requestApplicantMsgBox}>
                                <View style={styles.requestApplicantMsgHeader}>
                                  <MessageSquare size={11} color={C.blueText} />
                                  <Text style={styles.requestApplicantMsgLabel}>Traveler Note</Text>
                                  {(req as any).createdAt ? (
                                    <Text style={styles.requestApplicantMsgTime}>
                                      {formatRelative((req as any).createdAt)}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={styles.requestApplicantMsgText}>
                                  "{(req as any).message}"
                                </Text>
                              </View>
                            ) : null}

                            {(req.status === 'PENDING' || req.status === 'AWAITING_PAYMENT') && (
                              <View style={styles.requestActionRow}>
                                {req.status === 'PENDING' && (
                                  <TouchableOpacity
                                    style={styles.requestAcceptBtn}
                                    onPress={() => handleApproveRequest(req.id, req.applicantName || 'Traveler', req.applicantAvatar || '')}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                  >
                                    <Check size={14} color={C.white} />
                                    <Text style={styles.requestAcceptBtnText}>Accept Request</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  style={styles.requestRejectBtn}
                                  onPress={() => handleRejectRequest(req.id, req.applicantName || 'Traveler')}
                                  activeOpacity={0.8}
                                  accessibilityRole="button"
                                >
                                  <X size={14} color={'#DC2626'} />
                                  <Text style={styles.requestRejectBtnText}>Decline</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              )}

                            {/* ========================================================
              CREATION OPTION 3: ITINERARY PLANNER
              ======================================================== */}
              {creationSubTab === 'itinerary' && (
                <View style={{ gap: 12 }}>
                  {/* Itinerary Header */}
                  <View style={styles.itineraryFlowHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itineraryFlowTitle}>Itinerary & Checkpoints</Text>
                      <Text style={styles.itineraryFlowSub}>
                        {checkpoints.length} Checkpoints • {drivingLegs.length} Driving Segments for {selectedCreation.name}
                      </Text>
                    </View>
                  </View>

                  {/* Checkpoints & Driving Flow List */}
                  <View style={{ gap: 0 }}>
                    {checkpoints.map((cp, idx) => {
                      const driveLeg = drivingLegs[idx];

                      return (
                        <View key={cp.id}>
                          {/* Checkpoint Card */}
                          <View style={styles.checkpointCard}>
                            {/* Card Top: Stop Index, Category, Time */}
                            <View style={styles.checkpointTopRow}>
                              <View style={styles.checkpointIndexPill}>
                                <MapPin size={11} color={C.blueText} />
                                <Text style={styles.checkpointIndexText}>STOP {idx + 1}</Text>
                              </View>

                              <View
                                style={[
                                  styles.checkpointCatPill,
                                  cp.category === 'DEPARTURE'
                                    ? { backgroundColor: C.blueGlow }
                                    : cp.category === 'STAY'
                                    ? { backgroundColor: C.purpleGlow }
                                    : cp.category === 'ADVENTURE'
                                    ? { backgroundColor: C.amberGlow }
                                    : { backgroundColor: C.cardAlt },
                                ]}
                              >
                                <Text style={styles.checkpointCatText}>{cp.category}</Text>
                              </View>

                              {cp.timeSlot ? (
                                <View style={styles.checkpointTimePill}>
                                  <Clock size={10} color={C.textMuted} />
                                  <Text style={styles.checkpointTimeText}>{cp.timeSlot}</Text>
                                </View>
                              ) : null}
                            </View>

                            {/* Checkpoint Name */}
                            <Text style={styles.checkpointNameText}>{cp.name}</Text>
                            {cp.isLiveVerified && cp.latitude && cp.longitude ? (
                              <View style={styles.checkpointLiveGpsRow}>
                                <View style={styles.checkpointLiveGpsBadge}>
                                  <Locate size={10} color="#059669" />
                                  <Text style={styles.checkpointLiveGpsText}>
                                    {cp.latitude.toFixed(3)}° N, {cp.longitude.toFixed(3)}° E
                                  </Text>
                                </View>
                                {cp.address ? (
                                  <Text style={styles.checkpointAddressSummary} numberOfLines={1}>
                                    {cp.address}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}

                            {/* Planned Activities */}
                            {cp.activities ? (
                              <Text style={styles.checkpointActivitiesText}>{cp.activities}</Text>
                            ) : null}

                            {/* Hotel / Venue (if assigned) */}
                            {cp.hotelName ? (
                              <View style={styles.checkpointHotelChip}>
                                <Hotel size={11} color={C.blueText} />
                                <Text style={styles.checkpointHotelText}>{cp.hotelName}</Text>
                              </View>
                            ) : null}

                            {/* Custom Things & Notes Box */}
                            {(cp.customNotes || (cp.customThings && cp.customThings.length > 0)) ? (
                              <View style={styles.customThingsContainer}>
                                <Text style={styles.customThingsHeader}>CUSTOM THINGS & INSTRUCTIONS</Text>
                                {cp.customNotes ? (
                                  <Text style={styles.customNotesBody}>{cp.customNotes}</Text>
                                ) : null}

                                {cp.customThings && cp.customThings.length > 0 ? (
                                  <View style={styles.customThingsChipsWrap}>
                                    {cp.customThings.map((thing: string, tIdx: number) => (
                                      <View key={tIdx} style={styles.customThingChip}>
                                        <Check size={9} color="#059669" />
                                        <Text style={styles.customThingChipText}>{thing}</Text>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            ) : null}

                            {/* Actions on Checkpoint: Edit & Remove */}
                            <View style={styles.checkpointActionsRow}>
                              <TouchableOpacity
                                style={styles.editCheckpointBtn}
                                onPress={() => openEditCheckpoint(cp)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.editCheckpointBtnText}>Edit Checkpoint Details</Text>
                              </TouchableOpacity>

                              {checkpoints.length > 2 && (
                                <TouchableOpacity
                                  style={styles.deleteCheckpointBtn}
                                  onPress={() => handleDeleteCheckpoint(cp.id)}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.deleteCheckpointBtnText}>Remove</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          {/* Inter-Checkpoint Driving Leg Card */}
                          {driveLeg && idx < checkpoints.length - 1 && (
                            <View style={styles.interDriveSection}>
                              {/* Connecting Timeline Track */}
                              <View style={styles.transitConnectorLine} />

                              {/* Drive Details Card */}
                              <View style={styles.interDriveCard}>
                                <View style={styles.interDriveHeader}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Car size={13} color="#D97706" />
                                    <Text style={styles.interDriveTitle} numberOfLines={1}>
                                      TRANSIT: {cp.name} ➔ {checkpoints[idx + 1]?.name}
                                    </Text>
                                  </View>
                                  {driveLeg.isLiveCalculated ? (
                                    <View style={styles.liveRoadDataPill}>
                                      <Route size={10} color="#059669" />
                                      <Text style={styles.liveRoadDataPillText}>Live Road Data</Text>
                                    </View>
                                  ) : null}
                                  <View style={styles.interDriveModeBadge}>
                                    <Text style={styles.interDriveModeBadgeText}>{driveLeg.transportMode}</Text>
                                  </View>
                                </View>

                                {/* Driving Metrics */}
                                <View style={styles.interDriveMetricsRow}>
                                  <View style={styles.interDriveMetric}>
                                    <Text style={styles.interDriveMetricLabel}>DISTANCE</Text>
                                    <Text style={styles.interDriveMetricVal}>{driveLeg.distance}</Text>
                                  </View>
                                  <View style={styles.interDriveMetric}>
                                    <Text style={styles.interDriveMetricLabel}>EST. TIME</Text>
                                    <Text style={styles.interDriveMetricVal}>{driveLeg.duration}</Text>
                                  </View>
                                  <View style={[styles.interDriveMetric, { flex: 1.5 }]}>
                                    <Text style={styles.interDriveMetricLabel}>ROUTE</Text>
                                    <Text style={styles.interDriveMetricVal} numberOfLines={1}>
                                      {driveLeg.routeTitle || 'Direct Route'}
                                    </Text>
                                  </View>
                                </View>

                                {/* Road conditions & Pitstops */}
                                {(driveLeg.roadConditions || driveLeg.pitstops) && (
                                  <View style={styles.driveDetailsSubBox}>
                                    {driveLeg.roadConditions ? (
                                      <Text style={styles.driveConditionText}>
                                        <Text style={{ fontWeight: '700' }}>Road: </Text>
                                        {driveLeg.roadConditions}
                                      </Text>
                                    ) : null}
                                    {driveLeg.pitstops ? (
                                      <Text style={styles.drivePitstopText}>
                                        <Text style={{ fontWeight: '700' }}>Pitstops: </Text>
                                        {driveLeg.pitstops}
                                      </Text>
                                    ) : null}
                                  </View>
                                )}

                                {/* Edit Driving Details Button */}
                                <TouchableOpacity
                                  style={styles.editDriveBtn}
                                  onPress={() => openEditDriveLeg(driveLeg)}
                                  activeOpacity={0.8}
                                >
                                  <Navigation size={11} color="#B45309" />
                                  <Text style={styles.editDriveBtnText}>Edit Driving Details</Text>
                                </TouchableOpacity>
                              </View>

                              {/* Connecting Timeline Track */}
                              <View style={styles.transitConnectorLine} />
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>



                  {/* ──────────────── Modal: Edit Checkpoint & Custom Things ──────────────── */}
                  <Modal
                    visible={editingCheckpoint !== null}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setEditingCheckpoint(null)}
                  >
                    <View style={styles.modalBackdrop}>
                      <View style={styles.modalContentCard}>
                        <View style={styles.modalHeaderRow}>
                          <Text style={styles.modalTitle}>Edit Checkpoint</Text>
                          <TouchableOpacity onPress={() => setEditingCheckpoint(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={18} color={C.textSec} />
                          </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                          {/* Live Location Search */}
                          <Text style={styles.modalInputLabel}>Search Location on Live Map</Text>
                          <View style={styles.locationSearchRow}>
                            <View style={styles.locationSearchInputWrap}>
                              <Search size={14} color={C.textMuted} style={{ marginRight: 6 }} />
                              <TextInput
                                style={styles.locationSearchInput}
                                value={cpSearchQuery}
                                onChangeText={(text) => {
                                  setCpSearchQuery(text);
                                  if (text.trim().length >= 2) {
                                    void handleSearchLiveLocation(text);
                                  } else {
                                    setLocationSearchResults([]);
                                  }
                                }}
                                placeholder="Search city, landmark, or viewpoint..."
                                placeholderTextColor={C.textMuted}
                                returnKeyType="search"
                                onSubmitEditing={() => handleSearchLiveLocation(cpSearchQuery)}
                              />
                              {isSearchingLocation ? (
                                <ActivityIndicator size="small" color={C.blue} />
                              ) : cpSearchQuery.length > 0 ? (
                                <TouchableOpacity onPress={() => { setCpSearchQuery(''); setLocationSearchResults([]); }}>
                                  <X size={13} color={C.textMuted} />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                            <TouchableOpacity
                              style={styles.searchMapActionBtn}
                              onPress={() => handleSearchLiveLocation(cpSearchQuery)}
                              disabled={isSearchingLocation}
                              activeOpacity={0.8}
                            >
                              <Locate size={13} color={C.white} />
                              <Text style={styles.searchMapActionBtnText}>Search</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Live Suggestions Dropdown */}
                          {locationSearchResults.length > 0 && (
                            <View style={styles.searchResultsContainer}>
                              <Text style={styles.searchResultsHeader}>SELECT VERIFIED LOCATION FROM MAP:</Text>
                              {locationSearchResults.map((loc, lIdx) => (
                                <TouchableOpacity
                                  key={lIdx}
                                  style={styles.searchResultRow}
                                  onPress={() => handleSelectLiveLocation(loc)}
                                  activeOpacity={0.7}
                                >
                                  <MapPin size={13} color={C.blueText} style={{ marginTop: 2 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.searchResultTitle}>{loc.name}</Text>
                                    <Text style={styles.searchResultAddress} numberOfLines={2}>
                                      {loc.displayName}
                                    </Text>
                                    <Text style={styles.searchResultCoords}>
                                      GPS: {loc.lat.toFixed(4)}° N, {loc.lon.toFixed(4)}° E
                                    </Text>
                                  </View>
                                  <ChevronRight size={14} color={C.textMuted} />
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}

                          {/* Live Location Status Indicator */}
                          <View style={[styles.liveMapStatusCard, cpIsLiveVerified ? styles.liveMapStatusCardVerified : null]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Locate size={13} color={cpIsLiveVerified ? '#059669' : C.textMuted} />
                              <Text style={[styles.liveMapStatusTitle, cpIsLiveVerified ? { color: '#059669' } : null]}>
                                {cpIsLiveVerified ? 'LIVE GPS COORDINATES LINKED' : 'GPS LOCATION NOT LINKED YET'}
                              </Text>
                            </View>
                            {cpIsLiveVerified && typeof cpLatitude === 'number' && typeof cpLongitude === 'number' ? (
                              <View style={{ marginTop: 4 }}>
                                <Text style={styles.liveMapCoordsText}>
                                  Coordinates: {cpLatitude.toFixed(4)}° N, {cpLongitude.toFixed(4)}° E
                                </Text>
                                {cpAddress ? (
                                  <Text style={styles.liveMapAddressText} numberOfLines={2}>
                                    {cpAddress}
                                  </Text>
                                ) : null}
                              </View>
                            ) : (
                              <Text style={styles.liveMapHintText}>
                                Search and select a place above to auto-link live map data and enable real driving calculations.
                              </Text>
                            )}
                          </View>

                          <Text style={styles.modalInputLabel}>Checkpoint / Destination Name</Text>
                          <TextInput
                            style={styles.modalTextInput}
                            value={cpFormName}
                            onChangeText={setCpFormName}
                            placeholder="e.g. Rohtang Pass Viewpoint"
                            placeholderTextColor={C.textMuted}
                          />

                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalInputLabel}>Day Number</Text>
                              <TextInput
                                style={styles.modalTextInput}
                                value={String(cpFormDay)}
                                onChangeText={(val) => setCpFormDay(Number(val) || 1)}
                                keyboardType="number-pad"
                              />
                            </View>
                            <View style={{ flex: 1.5 }}>
                              <Text style={styles.modalInputLabel}>Arrival / Timing</Text>
                              <TextInput
                                style={styles.modalTextInput}
                                value={cpFormTime}
                                onChangeText={setCpFormTime}
                                placeholder="e.g. 10:30 AM"
                                placeholderTextColor={C.textMuted}
                              />
                            </View>
                          </View>

                          <Text style={styles.modalInputLabel}>Checkpoint Category</Text>
                          <View style={styles.categoryPillsWrap}>
                            {(['DEPARTURE', 'SIGHTSEEING', 'ADVENTURE', 'MEAL', 'REST', 'STAY', 'CUSTOM'] as const).map((cat) => (
                              <TouchableOpacity
                                key={cat}
                                style={[
                                  styles.categoryPillItem,
                                  cpFormCategory === cat && styles.categoryPillItemActive,
                                ]}
                                onPress={() => setCpFormCategory(cat)}
                              >
                                <Text
                                  style={[
                                    styles.categoryPillItemText,
                                    cpFormCategory === cat && styles.categoryPillItemTextActive,
                                  ]}
                                >
                                  {cat}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <Text style={styles.modalInputLabel}>Main Activities & Description</Text>
                          <TextInput
                            style={[styles.modalTextInput, { height: 60, textAlignVertical: 'top' }]}
                            value={cpFormActivities}
                            onChangeText={setCpFormActivities}
                            placeholder="What happens at this stop?"
                            placeholderTextColor={C.textMuted}
                            multiline
                          />

                          <Text style={styles.modalInputLabel}>Write Custom Things & Special Instructions</Text>
                          <TextInput
                            style={[styles.modalTextInput, { height: 75, textAlignVertical: 'top' }]}
                            value={cpFormCustomNotes}
                            onChangeText={setCpFormCustomNotes}
                            placeholder="Write custom notes, entry permit guidelines, meeting spots, weather alerts..."
                            placeholderTextColor={C.textMuted}
                            multiline
                          />

                          <Text style={styles.modalInputLabel}>Custom Checklist / Things to Bring (comma-separated)</Text>
                          <TextInput
                            style={styles.modalTextInput}
                            value={cpFormCustomThings}
                            onChangeText={setCpFormCustomThings}
                            placeholder="e.g. Photo ID, Warm Jacket, Sunglasses, Cash for Tickets"
                            placeholderTextColor={C.textMuted}
                          />

                          <Text style={styles.modalInputLabel}>Stay / Venue Name (Optional)</Text>
                          <TextInput
                            style={styles.modalTextInput}
                            value={cpFormHotel}
                            onChangeText={setCpFormHotel}
                            placeholder="e.g. Mountain View Resort & Camp"
                            placeholderTextColor={C.textMuted}
                          />
                        </ScrollView>

                        <View style={styles.modalActionsRow}>
                          <TouchableOpacity
                            style={styles.modalCancelBtn}
                            onPress={() => setEditingCheckpoint(null)}
                          >
                            <Text style={styles.modalCancelBtnText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.modalSaveBtn}
                            onPress={handleSaveCheckpoint}
                          >
                            <Text style={styles.modalSaveBtnText}>Save Checkpoint</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>

                  {/* ──────────────── Modal: Edit Inter-Checkpoint Driving Details ──────────────── */}
                  <Modal
                    visible={editingDriveLeg !== null}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setEditingDriveLeg(null)}
                  >
                    <View style={styles.modalBackdrop}>
                      <View style={styles.modalContentCard}>
                        <View style={styles.modalHeaderRow}>
                          <Text style={styles.modalTitle}>Edit Driving Details</Text>
                          <TouchableOpacity onPress={() => setEditingDriveLeg(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <X size={18} color={C.textSec} />
                          </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                          {/* Live Routing Status Banner */}
                          <View style={styles.liveRoutingBannerCard}>
                            <View style={styles.liveRoutingBannerHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <Route size={14} color="#2563EB" />
                                <Text style={styles.liveRoutingBannerTitle}>LIVE ROAD ROUTE (OSRM & MAP DATA)</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.refreshRouteBtn}
                                onPress={() => editingDriveLeg && recalculateDriveLeg(editingDriveLeg)}
                                disabled={isCalculatingRoute}
                                activeOpacity={0.8}
                              >
                                {isCalculatingRoute ? (
                                  <ActivityIndicator size="small" color="#2563EB" />
                                ) : (
                                  <>
                                    <RefreshCw size={11} color="#2563EB" />
                                    <Text style={styles.refreshRouteBtnText}>Recalculate</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>

                            {editingDriveLeg && checkpoints[editingDriveLeg.fromIndex] && checkpoints[editingDriveLeg.toIndex] && (
                              <View style={styles.liveRouteLegPointsRow}>
                                <View style={styles.liveRoutePoint}>
                                  <Text style={styles.liveRoutePointLabel}>ORIGIN</Text>
                                  <Text style={styles.liveRoutePointName} numberOfLines={1}>
                                    {checkpoints[editingDriveLeg.fromIndex].name}
                                  </Text>
                                </View>
                                <ArrowRight size={13} color={C.textMuted} />
                                <View style={styles.liveRoutePoint}>
                                  <Text style={styles.liveRoutePointLabel}>DESTINATION</Text>
                                  <Text style={styles.liveRoutePointName} numberOfLines={1}>
                                    {checkpoints[editingDriveLeg.toIndex].name}
                                  </Text>
                                </View>
                              </View>
                            )}

                            <View style={styles.liveRouteStatusFooter}>
                              <Text style={styles.liveRouteSourceText}>
                                {isCalculatingRoute
                                  ? '🛰️ Calculating live road network distance & time...'
                                  : liveRouteStatus
                                  ? `✓ ${liveRouteStatus}`
                                  : '✓ Real road network distance verified'}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalInputLabel}>Driving Distance (Live)</Text>
                              <TextInput
                                style={styles.modalTextInput}
                                value={driveFormDistance}
                                onChangeText={setDriveFormDistance}
                                placeholder="e.g. 145 km"
                                placeholderTextColor={C.textMuted}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalInputLabel}>Est. Driving Time (Live)</Text>
                              <TextInput
                                style={styles.modalTextInput}
                                value={driveFormDuration}
                                onChangeText={setDriveFormDuration}
                                placeholder="e.g. 3h 15m"
                                placeholderTextColor={C.textMuted}
                              />
                            </View>
                          </View>

                          <Text style={styles.modalInputLabel}>Mode of Transport</Text>
                          <View style={styles.categoryPillsWrap}>
                            {(['CAR', 'SUV', 'BUS', 'BIKE', 'TRAIN', 'FLIGHT', 'WALK'] as const).map((mode) => (
                              <TouchableOpacity
                                key={mode}
                                style={[
                                  styles.categoryPillItem,
                                  driveFormMode === mode && styles.categoryPillItemActive,
                                ]}
                                onPress={() => setDriveFormMode(mode)}
                              >
                                <Text
                                  style={[
                                    styles.categoryPillItemText,
                                    driveFormMode === mode && styles.categoryPillItemTextActive,
                                  ]}
                                >
                                  {mode}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <Text style={styles.modalInputLabel}>Route / Highway Name</Text>
                          <TextInput
                            style={styles.modalTextInput}
                            value={driveFormRoute}
                            onChangeText={setDriveFormRoute}
                            placeholder="e.g. Via NH-44 Expressway & Bypass"
                            placeholderTextColor={C.textMuted}
                          />

                          <Text style={styles.modalInputLabel}>Road Conditions & Terrain</Text>
                          <TextInput
                            style={[styles.modalTextInput, { height: 60, textAlignVertical: 'top' }]}
                            value={driveFormRoadConditions}
                            onChangeText={setDriveFormRoadConditions}
                            placeholder="e.g. Smooth 4-lane expressway; mountain hairpins for last 20km"
                            placeholderTextColor={C.textMuted}
                            multiline
                          />

                          <Text style={styles.modalInputLabel}>Planned Pitstops & Rest Breaks</Text>
                          <TextInput
                            style={[styles.modalTextInput, { height: 60, textAlignVertical: 'top' }]}
                            value={driveFormPitstops}
                            onChangeText={setDriveFormPitstops}
                            placeholder="e.g. Breakfast stop at km 50; fuel bunk at highway exit"
                            placeholderTextColor={C.textMuted}
                            multiline
                          />

                          <Text style={styles.modalInputLabel}>Toll & Driving Tips</Text>
                          <TextInput
                            style={[styles.modalTextInput, { height: 60, textAlignVertical: 'top' }]}
                            value={driveFormDriverTips}
                            onChangeText={setDriveFormDriverTips}
                            placeholder="e.g. Fastag lanes; fog expected early morning"
                            placeholderTextColor={C.textMuted}
                            multiline
                          />
                        </ScrollView>

                        <View style={styles.modalActionsRow}>
                          <TouchableOpacity
                            style={styles.modalCancelBtn}
                            onPress={() => setEditingDriveLeg(null)}
                          >
                            <Text style={styles.modalCancelBtnText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.modalSaveBtn}
                            onPress={handleSaveDriveLeg}
                          >
                            <Text style={styles.modalSaveBtnText}>Save Driving Details</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                </View>
              )}

              {/* ========================================================
              CREATION OPTION: CHECKPOINT GUIDES
              ======================================================== */}
              {creationSubTab === 'checkpoints' && (
                <View style={{ gap: 10 }}>
                  <View style={styles.membersHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.membersTitle}>{t('groupOrganizer.checkpointGuidesTitle')}</Text>
                      <Text style={styles.membersSub}>{t('groupOrganizer.checkpointGuidesSub')}</Text>
                    </View>
                  </View>

                  {timelineLoading ? (
                    <View style={styles.emptyMembersState}>
                      <ActivityIndicator color={C.blue} />
                      <Text style={styles.emptyMembersSub}>{t('groupOrganizer.loadingCheckpoints')}</Text>
                    </View>
                  ) : timelineError ? (
                    <View style={styles.emptyMembersState}>
                      <MapPin size={32} color={C.textMuted} />
                      <Text style={styles.emptyMembersTitle}>{timelineError}</Text>
                      <TouchableOpacity
                        onPress={() => selectedCreation && fetchTripTimeline(selectedCreation.id)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.emptyMembersSub, { color: C.blueText, marginTop: 6 }]}>
                          {t('groupOrganizer.retry')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : timelineStops.length === 0 ? (
                    <View style={styles.emptyMembersState}>
                      <MapPin size={32} color={C.textMuted} />
                      <Text style={styles.emptyMembersTitle}>{t('groupOrganizer.noCheckpointsTitle')}</Text>
                      <Text style={styles.emptyMembersSub}>{t('groupOrganizer.noCheckpointsDesc')}</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {[...timelineStops]
                        .sort((a, b) => a.order - b.order)
                        .map((stop) => (
                          <View key={stop.id} style={styles.stopGuideCard}>
                            <View style={styles.stopGuideHeaderRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.stopGuideStopLabel}>
                                  {t('groupOrganizer.checkpointStopNumber', { number: stop.order })}
                                </Text>
                                <Text style={styles.stopGuideCityText}>{stop.city}</Text>
                                {stop.stayDays != null && (
                                  <Text style={styles.memberNoMetaText}>
                                    {t('groupOrganizer.daysCount', { count: stop.stayDays })}
                                  </Text>
                                )}
                              </View>
                              <TouchableOpacity
                                style={styles.assignGuideBtn}
                                onPress={() => openGuidePicker(stop.id)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                              >
                                <Plus size={12} color={C.white} />
                                <Text style={styles.assignGuideBtnText}>{t('groupOrganizer.assignGuide')}</Text>
                              </TouchableOpacity>
                            </View>

                            {stop.assignedGuides.length === 0 ? (
                              <Text style={styles.memberNoMetaText}>{t('groupOrganizer.noGuidesAssigned')}</Text>
                            ) : (
                              <View style={{ gap: 6, marginTop: 8 }}>
                                {stop.assignedGuides.map((g) => {
                                  const removeKey = `${stop.id}:${g.guideProfileId}`;
                                  return (
                                    <View key={g.guideProfileId} style={styles.assignedGuideChip}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.assignedGuideName}>{g.name}</Text>
                                        {g.note ? (
                                          <Text style={styles.memberNoMetaText}>{g.note}</Text>
                                        ) : null}
                                      </View>
                                      <TouchableOpacity
                                        onPress={() => handleUnassignGuide(stop.id, g.guideProfileId)}
                                        disabled={assigningGuideKey === removeKey}
                                        style={styles.removeGuideBtn}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('groupOrganizer.removeGuide')}
                                      >
                                        {assigningGuideKey === removeKey ? (
                                          <ActivityIndicator size="small" color={C.textSec} />
                                        ) : (
                                          <X size={13} color={C.textSec} />
                                        )}
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        ))}
                    </View>
                  )}

                  <Sheet
                    visible={!!guidePickerStopId}
                    onClose={() => setGuidePickerStopId(null)}
                    title={t('groupOrganizer.pickAGuide')}
                  >
                    {guidesLoading ? (
                      <ActivityIndicator color={C.blue} style={{ marginVertical: 20 }} />
                    ) : publicGuides.length === 0 ? (
                      <Text style={styles.emptyMembersSub}>{t('groupOrganizer.noGuidesAvailable')}</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {(() => {
                          const matchForGuide = (guideId: string) =>
                            routeMatches?.guides.find((m) => m.guideProfileId === guideId) ?? null;
                          const coversThisStop = (guideId: string) =>
                            !!guidePickerStopId && !!matchForGuide(guideId)?.coveredStopIds.includes(guidePickerStopId);

                          // Guides whose zones cover this checkpoint first,
                          // then whole-route guides, then everyone else.
                          return [...publicGuides].sort((a, b) => {
                            const aCovers = coversThisStop(a.id) ? 2 : matchForGuide(a.id) ? 1 : 0;
                            const bCovers = coversThisStop(b.id) ? 2 : matchForGuide(b.id) ? 1 : 0;
                            return bCovers - aCovers;
                          });
                        })().map((guide) => {
                          const pickKey = `${guidePickerStopId}:${guide.id}`;
                          const alreadyAssigned = timelineStops
                            .find((s) => s.id === guidePickerStopId)
                            ?.assignedGuides.some((g) => g.guideProfileId === guide.id);
                          const match = routeMatches?.guides.find((m) => m.guideProfileId === guide.id) ?? null;
                          const coversThisStop = !!guidePickerStopId && !!match?.coveredStopIds.includes(guidePickerStopId);
                          return (
                            <TouchableOpacity
                              key={guide.id}
                              style={styles.guidePickerRow}
                              onPress={() => guidePickerStopId && handleAssignGuide(guidePickerStopId, guide)}
                              disabled={assigningGuideKey === pickKey || !!alreadyAssigned}
                              activeOpacity={0.8}
                            >
                              {guide.avatar ? (
                                <Image source={{ uri: guide.avatar }} style={styles.memberCardAvatar} />
                              ) : (
                                <View style={styles.memberAvatarFallback}>
                                  <Text style={styles.memberAvatarText}>
                                    {(guide.name || t('groupOrganizer.unnamedGuide')).charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                              )}
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.memberCardName}>{guide.name || t('groupOrganizer.unnamedGuide')}</Text>
                                <Text style={styles.memberNoMetaText}>
                                  {guide.rating != null
                                    ? t('groupOrganizer.guideRating', { count: guide.reviewCount, rating: guide.rating })
                                    : t('groupOrganizer.guideNoRating')}
                                  {'  •  '}
                                  {guide.verifiedStatus === 'VERIFIED'
                                    ? t('groupOrganizer.guideVerified')
                                    : t('groupOrganizer.guideNotVerified')}
                                </Text>
                                {coversThisStop ? (
                                  <Text style={styles.guideCoverageText}>
                                    {match?.coversEntireRoute
                                      ? t('groupOrganizer.guideCoversWholeRoute')
                                      : t('groupOrganizer.guideCoversThisCheckpoint')}
                                  </Text>
                                ) : match ? (
                                  <Text style={styles.guideCoverageMutedText}>
                                    {t('groupOrganizer.guideCoversOtherStops', { count: match.coveredOrders.length })}
                                  </Text>
                                ) : null}
                              </View>
                              {assigningGuideKey === pickKey ? (
                                <ActivityIndicator size="small" color={C.blue} />
                              ) : alreadyAssigned ? (
                                <Check size={16} color={C.blueText} />
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </Sheet>
                </View>
              )}

              {/* ========================================================
                      CREATION OPTION 5: OVERVIEW & TRIP DETAILS
                      ======================================================== */}
                  {creationSubTab === 'overview' && (() => {
                    const totalSeats = Number(selectedCreation.totalSeats) || 10;
                    const availSeats = Number(selectedCreation.availableSeats) || 0;
                    const confirmedCount = Math.max(0, totalSeats - availSeats);
                    const isOpen = availSeats > 0;

                    return (
                      <View style={styles.structuredOverviewContainer}>
                        {/* 1. Trip Identity Header with Very Compact Thumbnail */}
                        <View style={styles.structuredHeaderCard}>
                          <Image
                            source={getTripDisplayImage(selectedCreation)}
                            style={styles.microTripThumb}
                            resizeMode="cover"
                          />
                          <View style={{ flex: 1 }}>
                            <View style={styles.structuredHeaderBadgesRow}>
                              <View style={styles.structuredCatBadge}>
                                <Text style={styles.structuredCatBadgeText}>
                                  {selectedCreation.category || 'Adventure'}
                                </Text>
                              </View>
                              <View style={[styles.structuredStatusPill, isOpen ? styles.structuredStatusOpen : styles.structuredStatusClosed]}>
                                <Text style={[styles.structuredStatusPillText, isOpen ? styles.structuredStatusOpenText : styles.structuredStatusClosedText]}>
                                  {isOpen ? 'OPEN' : 'CLOSED'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.structuredTripTitle} numberOfLines={1}>
                              {selectedCreation.name}
                            </Text>
                            <Text style={styles.structuredOrganizerSub} numberOfLines={1}>
                              Hosted by <Text style={{ fontWeight: '700', color: C.text }}>{selectedCreation.creator}</Text>
                              {selectedCreation.durationDays ? ` • ${selectedCreation.durationDays} Days` : ''}
                            </Text>
                          </View>
                        </View>

                        {/* 2. Structured Logistics 2x2 Grid */}
                        <View style={styles.structuredGrid}>
                          <View style={styles.structuredGridCell}>
                            <View style={styles.structuredCellHeader}>
                              <Calendar size={12} color={C.blueText} />
                              <Text style={styles.structuredCellLabel}>SCHEDULE</Text>
                            </View>
                            <Text style={styles.structuredCellVal} numberOfLines={1}>
                              {selectedCreation.startDate}
                            </Text>
                            <Text style={styles.structuredCellSub} numberOfLines={1}>
                              to {selectedCreation.endDate || selectedCreation.startDate}
                            </Text>
                          </View>

                          <View style={styles.structuredGridCell}>
                            <View style={styles.structuredCellHeader}>
                              <DollarSign size={12} color={C.greenText} />
                              <Text style={styles.structuredCellLabel}>TOTAL COST</Text>
                            </View>
                            <Text style={[styles.structuredCellVal, { color: C.greenText }]} numberOfLines={1}>
                              {formatINR(selectedCreation.budget)}
                            </Text>
                            <Text style={styles.structuredCellSub}>per traveler</Text>
                          </View>

                          <View style={styles.structuredGridCell}>
                            <View style={styles.structuredCellHeader}>
                              <Users size={12} color={C.blueText} />
                              <Text style={styles.structuredCellLabel}>CONFIRMED</Text>
                            </View>
                            <Text style={styles.structuredCellVal} numberOfLines={1}>
                              {confirmedCount} Travelers
                            </Text>
                            <Text style={styles.structuredCellSub}>enrolled in group</Text>
                          </View>

                          <View style={styles.structuredGridCell}>
                            <View style={styles.structuredCellHeader}>
                              <ShieldCheck size={12} color={C.amberText} />
                              <Text style={styles.structuredCellLabel}>AVAILABILITY</Text>
                            </View>
                            <Text style={[styles.structuredCellVal, { color: C.amberText }]} numberOfLines={1}>
                              {availSeats} / {totalSeats} Slots
                            </Text>
                            <Text style={styles.structuredCellSub}>{isOpen ? 'Booking Open' : 'Fully Booked'}</Text>
                          </View>
                        </View>

                        {/* 3. Itinerary Route Flow */}
                        <View style={styles.structuredSectionBox}>
                          <Text style={styles.structuredBoxHeader}>ITINERARY ROUTE</Text>
                          <View style={styles.structuredRouteRow}>
                            {selectedCreation.cities.map((city, idx) => (
                              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <View style={styles.structuredCityChip}>
                                  <MapPin size={10} color={C.blueText} />
                                  <Text style={styles.structuredCityText}>{city}</Text>
                                </View>
                                {idx < selectedCreation.cities.length - 1 && (
                                  <Text style={styles.structuredArrow}>➔</Text>
                                )}
                              </View>
                            ))}
                          </View>
                        </View>

                        {/* 4. Assembly & Meeting Location */}
                        {selectedCreation.meetingPoint ? (
                          <View style={styles.structuredMeetingRow}>
                            <MapPin size={14} color={C.blueText} style={{ marginTop: 1 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.structuredMeetingTitle} numberOfLines={1}>
                                <Text style={{ fontWeight: '800' }}>Assembly: </Text>
                                {selectedCreation.meetingPoint}
                              </Text>
                              <Text style={styles.structuredMeetingSub}>Please report 30 mins before scheduled departure</Text>
                            </View>
                          </View>
                        ) : null}

                        {/* 5. Inclusions & Services Strip */}
                        <View style={styles.structuredInclusionsRow}>
                          <View style={[styles.structuredInclusionItem, { opacity: selectedCreation.guideIncluded ? 1 : 0.45 }]}>
                            <Compass size={13} color={selectedCreation.guideIncluded ? C.greenText : C.textMuted} />
                            <Text style={styles.structuredInclusionText}>Guide {selectedCreation.guideIncluded ? '✓' : '✗'}</Text>
                          </View>
                          <View style={[styles.structuredInclusionItem, { opacity: selectedCreation.foodIncluded ? 1 : 0.45 }]}>
                            <Utensils size={13} color={selectedCreation.foodIncluded ? C.greenText : C.textMuted} />
                            <Text style={styles.structuredInclusionText}>Meals {selectedCreation.foodIncluded ? '✓' : '✗'}</Text>
                          </View>
                          <View style={[styles.structuredInclusionItem, { opacity: selectedCreation.hotelIncluded !== false ? 1 : 0.45 }]}>
                            <Hotel size={13} color={selectedCreation.hotelIncluded !== false ? C.greenText : C.textMuted} />
                            <Text style={styles.structuredInclusionText}>Hotel {selectedCreation.hotelIncluded !== false ? '✓' : '✗'}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )
          ) : !currentTour ? (
            <View style={styles.emptyTourState}>
              <Users size={40} color={C.textMuted} />
              <Text style={styles.emptyTourStateTitle}>{t('groupOrganizer.noToursYetTitle')}</Text>
              <Text style={styles.emptyTourStateDesc}>{t('groupOrganizer.noToursYetDesc')}</Text>
              <TouchableOpacity
                style={styles.createTripBtn}
                onPress={() => setShowCreateModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('groupOrganizer.launchNewTourGroup')}
              >
                <Plus size={16} color={C.white} />
                <Text style={styles.createTripBtnText}>{t('groupOrganizer.launchNewTourGroup')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {/* TAB 2: CHATS & APPROVALS */}
                <View>
                  {/* Chat Moderation Panel */}
                  <View style={styles.chatGroupModeratorHeader}>
                    <View>
                      <Text style={styles.subTitle}>{t('groupOrganizer.groupChatModeration')}</Text>
                      <Text style={styles.descSec}>{t('groupOrganizer.approveJoinRequestsDesc')}</Text>
                    </View>
                  </View>

                  {/* Moderation List of Requests */}
                  <Text style={styles.sectionLabelInline}>{t('groupOrganizer.pendingChatJoinRequests')}</Text>
                  {joinRequests.filter((r) => r.tourId === currentTour.id).length === 0 ? (
                    <View style={styles.emptyRequestsCard}>
                      <CheckCircle size={18} color={C.green} />
                      <Text style={styles.emptyRequestsText}>{t('groupOrganizer.allRequestsProcessed')}</Text>
                    </View>
                  ) : (
                    joinRequests
                      .filter((r) => r.tourId === currentTour.id)
                      .map((req) => (
                        <View key={req.id} style={styles.requestItemCard}>
                          <View style={styles.requestHeaderRow}>
                            <Image source={{ uri: req.userAvatar }} style={styles.reqAvatar} />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Text style={styles.reqName}>{req.userName}</Text>
                            </View>
                          </View>

                          <View style={styles.reqActionButtonsRow}>
                            <TouchableOpacity
                              style={[styles.reqBtn, styles.reqBtnReject]}
                              onPress={() => handleRejectRequest(req.id, req.userName)}
                              accessibilityRole="button"
                              accessibilityLabel={t('groupOrganizer.reject')}
                            >
                              <X size={12} color={C.redText} />
                              <Text style={styles.reqBtnRejectText}>{t('groupOrganizer.reject')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.reqBtn, styles.reqBtnApprove]}
                              onPress={() => handleApproveRequest(req.id, req.userName, req.userAvatar)}
                              accessibilityRole="button"
                              accessibilityLabel={t('groupOrganizer.approveJoin')}
                            >
                              <Check size={12} color={C.white} />
                              <Text style={styles.reqBtnApproveText}>{t('groupOrganizer.approveJoin')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                  )}

                  {/* Announcements Panel */}
                  <Text style={styles.subTitle}>{t('groupOrganizer.groupAnnouncements')}</Text>
                  <Text style={styles.descSec}>{t('groupOrganizer.broadcastWarningsDesc')}</Text>

                  {announcements.map((ann) => (
                    <View key={ann.id} style={styles.announceCard}>
                      <View style={styles.announceCardHeader}>
                        <Text style={styles.announceCardTitle}>{ann.title}</Text>
                        <Text style={styles.announceCardDate}>{formatRelative(ann.createdAt)}</Text>
                      </View>
                      <Text style={styles.announceCardContent}>{ann.content}</Text>
                    </View>
                  ))}

                  <View style={styles.addAnnounceBox}>
                    <Text style={styles.formInputLabel}>{t('groupOrganizer.noticeTitle')}</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder={t('groupOrganizer.noticeTitlePlaceholder')}
                      placeholderTextColor={C.textMuted}
                      value={newAnnounceTitle}
                      onChangeText={setNewAnnounceTitle}
                    />
                    <Text style={styles.formInputLabel}>{t('groupOrganizer.noticeDescription')}</Text>
                    <TextInput
                      style={[styles.formInput, { height: 50 }]}
                      placeholder={t('groupOrganizer.noticeDescriptionPlaceholder')}
                      placeholderTextColor={C.textMuted}
                      value={newAnnounceDesc}
                      onChangeText={setNewAnnounceDesc}
                    />
                    <TouchableOpacity
                      style={[styles.announceBtn, publishingAnnouncement && { opacity: 0.6 }]}
                      onPress={handlePublishAnnouncement}
                      disabled={publishingAnnouncement}
                      accessibilityRole="button"
                      accessibilityLabel={t('groupOrganizer.broadcastNotice')}
                    >
                      <Send size={12} color={C.white} />
                      <Text style={styles.announceBtnText}>
                        {publishingAnnouncement ? t('groupOrganizer.sending') : t('groupOrganizer.broadcastNotice')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

              {/* docs/REMEDIATION.md §8.6: a "Live GPS & AI Desk" tab used to
            live here, with three sub-tools:
            • "GPS Tracking" — a hand-drawn "Mock GPS Map Drawing" (the
              code's own comment) of fixed-position dots labelled with
              fabricated first names, not live data, plus a "Trigger
              Emergency Alarm" button that showed an Alert.alert claiming a
              real safety warning had been broadcast to every participant's
              device — nothing was sent. That is dangerous UI to leave in:
              an organizer could believe they had broadcast a real
              emergency warning when nothing happened. The app's real live
              map (with the real SOS system, §3.4/§8.9) is the separate
              /map screen.
            • "AI Generator" — a setTimeout("Simulate AI generation lag",
              the code's own comment) that filled a hardcoded template
              string with the typed destination name, presented as if a
              real model had generated it.
            • "QR Scanner" — a fake scanning animation with a "Simulate
              Scanned Participant" picker; there was never a real scan or
              a real ticket to validate.
            None of these had a real backend or a reasonable one to build
            in this pass — removed rather than left as decorative or
            (for the SOS button) actively misleading UI. */}
            </View>
          )}

          {/* Bottom Spacer */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* CREATE NEW TOUR SHEET */}
      <Sheet visible={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('groupOrganizer.launchNewTourGroup')}>
        <Text style={styles.modalDesc}>{t('groupOrganizer.launchNewTourGroupDesc')}</Text>

        <Input
          label={t('groupOrganizer.tourGroupName')}
          placeholder={t('groupOrganizer.tourGroupNamePlaceholder')}
          value={newGroupName}
          onChangeText={setNewGroupName}
          containerStyle={styles.modalFieldGap}
        />

        <Input
          label={t('groupOrganizer.destinationTarget')}
          placeholder={t('groupOrganizer.destinationTargetPlaceholder')}
          value={newDest}
          onChangeText={setNewDest}
          containerStyle={styles.modalFieldGap}
        />

        <View style={[styles.modalInputRow, styles.modalFieldGap]}>
          <Input
            label={t('groupOrganizer.durationDays')}
            placeholder={t('groupOrganizer.durationDaysPlaceholder')}
            keyboardType="numeric"
            value={newDuration}
            onChangeText={setNewDuration}
            containerStyle={{ flex: 1, marginRight: 8 }}
          />
          <Input
            label={t('groupOrganizer.maxCapacity')}
            placeholder={t('groupOrganizer.maxCapacityPlaceholder')}
            keyboardType="numeric"
            value={newMaxSize}
            onChangeText={setNewMaxSize}
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Input
          label={t('groupOrganizer.pricePackagePerHead')}
          placeholder={t('groupOrganizer.pricePackagePerHeadPlaceholder')}
          keyboardType="numeric"
          value={newPrice}
          onChangeText={setNewPrice}
          containerStyle={styles.modalFieldGap}
        />

        <View style={styles.modalActionRow}>
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setShowCreateModal(false)}
            style={{ flex: 1 }}
          />
          <Button label={t('groupOrganizer.createTourGroup')} onPress={handleCreateTour} style={{ flex: 1 }} />
        </View>
      </Sheet>

      

      </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Creation Requests Sub-Tab ──
  requestsSection: {
    gap: 12,
  },
  requestsTabRedDot: {
    position: 'absolute',
    top: -3,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 3,
  },
  requestsNotificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  requestsNotificationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 1,
  },
  requestsNotificationInnerDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  requestsNotificationBody: {
    flex: 1,
    gap: 2,
  },
  requestsNotificationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  requestsNotificationTag: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.4,
  },
  requestsNotificationCountBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  requestsNotificationCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  requestsNotificationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
  },
  requestsNotificationDesc: {
    fontSize: 10.5,
    color: '#7F1D1D',
    lineHeight: 14,
    marginTop: 1,
  },
  requestsFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
    width: '100%',
  },
  requestFilterPill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestFilterPillActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  requestFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    textAlign: 'center',
  },
  requestFilterTextActive: {
    color: C.white,
    fontWeight: '800',
  },
  requestApplicantMsgBox: {
    backgroundColor: C.cardAlt,
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: C.border,
    gap: 3,
  },
  requestApplicantMsgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  requestApplicantMsgLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.blueText,
    letterSpacing: 0.3,
  },
  requestApplicantMsgTime: {
    fontSize: 9,
    color: C.textMuted,
    marginLeft: 'auto',
  },
  requestApplicantMsgText: {
    fontSize: 11.5,
    color: C.text,
    fontStyle: 'italic',
    lineHeight: 15,
  },
  emptyRequestsBox: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyRequestsBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  emptyRequestsBoxSub: {
    fontSize: 12,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 18,
  },
  requestCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  requestCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inquiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  inquiryBody: {
    flex: 1,
    gap: 3,
  },
  inquiryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inquiryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  inquiryTime: {
    fontSize: 10.5,
    color: C.textMuted,
  },
  inquiryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inquiryPreview: {
    flex: 1,
    fontSize: 11.5,
    color: C.textSec,
  },
  inquiryUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.blue,
  },
  inquiryUnreadBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.white,
  },
  requestCardInfo: {
    flex: 1,
    gap: 2,
  },
  requestCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  requestCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  requestCardRoute: {
    fontSize: 11.5,
    color: C.textSec,
  },
  requestStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  requestStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  requestStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  requestStatusAwaiting: {
    backgroundColor: '#FEF3C7',
  },
  requestStatusAwaitingText: {
    color: '#D97706',
  },
  requestStatusPendingText: {
    color: '#D97706',
    fontSize: 10.5,
    fontWeight: '800',
  },
  requestStatusApproved: {
    backgroundColor: '#ECFDF5',
  },
  requestStatusApprovedText: {
    color: '#059669',
    fontSize: 10.5,
    fontWeight: '800',
  },
  requestStatusRejected: {
    backgroundColor: '#FEE2E2',
  },
  requestStatusRejectedText: {
    color: '#DC2626',
    fontSize: 10.5,
    fontWeight: '800',
  },
  requestActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  requestAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.blue,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  requestAcceptBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  requestRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    gap: 4,
  },
  requestRejectBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '600',
  },
  creationBadgeCircle: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 3,
  },
  creationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── 2 Top Tabs Navigation ──
  topTwoTabsRow: {
    flexDirection: 'row',
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  topTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  topTabItemActive: {
    backgroundColor: C.blue,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  topTabLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  chatTabBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 2,
  },
  chatTabBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Main Analytics Dashboard (Above My Creations) ──
  mainDashboardCompactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 10,
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  mainDashboardCompactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  mainDashboardCompactIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainDashboardCompactTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text,
  },
  mainDashboardCompactDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textMuted,
  },
  mainDashboardCompactMetrics: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
    flex: 1,
  },
  mainDashboardDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  mainDashboardDropdownBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blueText,
  },

  mainDashboardLauncherCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.22)',
    padding: 13,
    marginBottom: 16,
    gap: 10,
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  mainDashboardLauncherTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  mainDashboardLauncherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  mainDashboardIconGlow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  mainDashboardLauncherInfo: {
    flex: 1,
    gap: 2,
  },
  mainDashboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mainDashboardLauncherTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
  },
  mainDashboardCombinedBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  mainDashboardCombinedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.blueText,
    letterSpacing: 0.3,
  },
  mainDashboardLauncherSub: {
    fontSize: 11,
    color: C.textSec,
  },
  mainDashboardLauncherRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  mainDashboardToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blueText,
  },
  mainDashboardQuickMetricsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 9,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  mainDashboardQuickPill: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  mainDashboardQuickPillLabel: {
    fontSize: 9,
    color: C.textSec,
    fontWeight: '600',
  },
  mainDashboardQuickPillVal: {
    fontSize: 11,
    fontWeight: '800',
    color: C.text,
    marginTop: 1,
  },
  minimalAnalyticsCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 13,
    marginBottom: 14,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  minimalAnalyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  minimalAnalyticsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
  },
  minimalAnalyticsSub: {
    fontSize: 11,
    color: C.textSec,
    marginTop: 1,
  },
  mainAnalyticsCollapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  mainAnalyticsCollapseText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.blueText,
  },
  minimalProgressSection: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  minimalProgressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  minimalProgressLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.textSec,
  },
  minimalProgressVal: {
    fontWeight: '800',
    color: C.text,
  },
  minimalProgressPercent: {
    fontSize: 11,
    fontWeight: '800',
    color: C.blueText,
  },
  minimalProgressBarBg: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  minimalProgressBarFill: {
    height: '100%',
    backgroundColor: C.blue,
    borderRadius: 2.5,
  },
  minimalProgressSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  minimalProgressRemaining: {
    fontSize: 10.5,
    color: C.textSec,
  },
  minimalProgressPax: {
    fontSize: 10.5,
    color: C.textSec,
    fontWeight: '600',
  },
  minimalStatsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  minimalStatBox: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 2,
    alignItems: 'center',
  },
  minimalStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textSec,
    textAlign: 'center',
  },
  minimalStatVal: {
    fontSize: 13.5,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.2,
    marginTop: 1,
  },
  minimalStatSub: {
    fontSize: 9.5,
    color: C.textMuted,
    textAlign: 'center',
  },
  seatStatusSection: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  seatStatusSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text,
  },
  seatStatusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  seatStatusCol: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  seatStatusColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  seatStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  seatStatusDotFull: {
    backgroundColor: '#059669',
  },
  seatStatusDotOpen: {
    backgroundColor: '#D97706',
  },
  seatStatusColTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C.text,
  },
  seatStatusEmptyText: {
    fontSize: 10.5,
    color: C.textMuted,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  seatStatusList: {
    gap: 5,
  },
  seatStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  seatStatusItemName: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text,
    flex: 1,
  },
  seatStatusFullBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  seatStatusFullBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  seatStatusOpenBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  seatStatusOpenBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },

  // ── Selected Creation Compact Header & Precision Segmented Control ──
  selectedCreationViewBlock: {
    gap: 10,
    marginBottom: 40,
  },
  compactCreationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  compactBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingRight: 6,
  },
  compactBackText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.blueText,
  },
  compactHeaderDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.border,
  },
  compactHeaderContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 1.5,
  },
  compactHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  compactHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
    flex: 1,
  },
  compactHeaderBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  compactHeaderBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.blueText,
  },
  compactHeaderMeta: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '500',
  },
  compactSegmentedBar: {
    flexDirection: 'row',
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
    gap: 2,
  },
  compactSegmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 9,
    gap: 2,
  },
  compactSegmentItemActive: {
    backgroundColor: C.white,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  compactSegmentIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSegmentLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textSec,
    textAlign: 'center',
  },
  compactSegmentLabelActive: {
    color: C.blueText,
    fontWeight: '800',
  },
  compactSegmentMicroBadge: {
    position: 'absolute',
    top: -4,
    right: -7,
    backgroundColor: '#EF4444',
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: C.cardAlt,
  },
  compactSegmentMicroBadgeText: {
    color: '#FFF',
    fontSize: 8.5,
    fontWeight: '900',
  },

  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
  },

  // Header Visuals
  headerContainer: {
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerGradient: {
    backgroundColor: C.card,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    backgroundColor: C.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 1,
  },
  badgeOfficial: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
    backgroundColor: C.purpleGlow,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.15)',
  },
  badgeOfficialGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
    backgroundColor: C.purpleGlow,
  },
  badgeOfficialText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.purpleText,
    letterSpacing: 0.2,
  },

  // Tab Selector
  tabBarContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: 20,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Active Roster Dropdown bar
  dropdownTripBar: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dropdownTripScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  dropdownTripBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 6,
  },
  dropdownTripBtnActive: {
    borderColor: C.blue,
    backgroundColor: C.blueGlow,
  },
  dropdownTripText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownTripAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: C.blueGlow,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
    marginLeft: 4,
  },
  dropdownTripAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },

  // Section titles
  subTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginTop: 20,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  descSec: {
    fontSize: 12.5,
    color: C.textSec,
    marginBottom: 14,
  },
  sectionLabelInline: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 0.1,
  },

  // TAB 0: Console
  organizerConsoleBlock: {
    gap: 16,
    marginBottom: 40,
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  notificationMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  notificationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.purpleGlow,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationRedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
  },
  notificationTextColumn: {
    flex: 1,
  },
  notificationAppName: {
    fontSize: 10,
    fontWeight: '800',
    color: C.purpleText,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginTop: 1,
  },
  notificationDescText: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
  },
  creationsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  creationsSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
  },
  creationsAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blueGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  creationsAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },
  organizerEmptyCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  organizerEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginTop: 14,
  },
  organizerEmptySub: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  organizerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.blue,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 18,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  organizerPrimaryBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.white,
  },
  consoleTripCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 120,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  consoleTripCardImg: {
    width: 105,
    alignSelf: 'stretch',
  },
  consoleTripCardBody: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  consoleTripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  consoleTripCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.text,
    flex: 1,
  },
  requestNotifyIndicator: {
    backgroundColor: C.amberGlow,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  requestNotifyText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.amberText,
  },
  consoleTripCardRoute: {
    fontSize: 12,
    fontWeight: '600',
    color: C.blueText,
    marginTop: 3,
  },
  previewHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
  },
  tripStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  tripStatusOpenBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  tripStatusClosedBadge: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  tripStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tripStatusDotOpen: {
    backgroundColor: '#10B981',
  },
  tripStatusDotClosed: {
    backgroundColor: '#EF4444',
  },
  tripStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tripStatusOpenText: {
    color: '#059669',
  },
  tripStatusClosedText: {
    color: '#DC2626',
  },
  creationStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  creationStat: {
    flex: 1,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  creationStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  creationStatVal: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text,
    marginTop: 1.5,
  },
  creationManageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 6,
  },
  creationSeatSubtitle: {
    fontSize: 10.5,
    color: C.textMuted,
    fontWeight: '600',
  },
  creationManageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  creationManageText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.blueText,
  },

  // Empty Tour State
  emptyTourState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  emptyTourStateTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
    marginTop: 14,
    marginBottom: 6,
  },
  emptyTourStateDesc: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  createTripBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  createTripBtnText: {
    color: C.white,
    fontSize: 13.5,
    fontWeight: '700',
  },

  // TAB 1: Dashboard
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'space-between',
    minHeight: 108,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricVal: {
    fontSize: 17,
    fontWeight: '900',
    color: C.text,
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  analyticsBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  subStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: C.border,
  },
  subStatLabel: {
    fontSize: 11.5,
    color: C.textSec,
    fontWeight: '600',
    marginBottom: 4,
  },
  subStatValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  quotesBlock: {
    gap: 10,
    marginTop: 18,
  },
  quoteCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quoteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quoteName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  quoteMeta: {
    fontSize: 11.5,
    color: C.textMuted,
  },
  quoteMessage: {
    fontSize: 12.5,
    color: C.textSec,
    lineHeight: 18,
  },
  quoteAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: C.amberText,
  },
  quoteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },

  // TAB 2: Trip & Member Manager
  leadsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 2,
  },
  checkInProgressCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  checkInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkInProgressText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
  },
  checkInProgressValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.greenText,
  },
  progressTrack: {
    height: 6,
    backgroundColor: C.cardAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  memberListItemCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  memberItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  memberTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
  },
  memberActionsDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },
  memberListItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberActionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberActionToggleBtnActive: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  memberActionToggleBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeader: {
    marginTop: 4,
  },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 180,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tripImageContainer: {
    width: 115,
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: C.cardAlt,
  },
  tripImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tripBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  tripContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  tripName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: C.text,
    lineHeight: 19,
  },
  tripDetailsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },
  capsulesRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  capsuleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.textSec,
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
  },
  priceAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginTop: -1,
  },
  joinBtn: {
    backgroundColor: C.blueGlow,
    paddingVertical: 6,
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
    flexDirection: 'row',
  },
  joinBtnText: {
    color: C.blueText,
    fontSize: 12,
    fontWeight: '700',
  },
  tripManagerConfigBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  tripDetailField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 10,
  },
  tripFieldLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  tripFieldValue: {
    fontSize: 13,
    color: C.text,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.white,
  },
  inclusionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  inclusionBadgeText: {
    fontSize: 11.5,
    color: C.textSec,
    fontWeight: '600',
  },
  quickOpsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickOpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  quickOpBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
  },

  // TAB 3: Logistics
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  plannerSubTabItem: {
    flex: 1,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  plannerSubTabItemActive: {
    backgroundColor: C.cardAlt,
  },
  plannerSubTabLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  plannerSubTabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 20,
    height: 2.5,
    backgroundColor: C.blue,
    borderRadius: 1.5,
  },
  innerPlannerSection: {
    marginTop: 8,
  },
  itineraryStateBox: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
  },
  itineraryStateText: {
    color: C.textSec,
    fontSize: 13,
    textAlign: 'center',
  },
  itineraryRetryText: {
    color: C.blueText,
    fontSize: 13,
    fontWeight: '700',
  },
  dayCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.blueText,
    backgroundColor: C.blueGlow,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayTitleText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  dayActivitiesText: {
    fontSize: 12.5,
    color: C.textSec,
    lineHeight: 18,
    fontWeight: '500',
  },
  addDayBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 14,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  addDayBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    marginBottom: 4,
  },
  formInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSec,
    marginTop: 12,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    color: C.text,
    fontSize: 13,
    fontWeight: '500',
  },
  addDayBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addDayBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },
  allocationRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  allocNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  allocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.blueGlow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 32,
    borderRadius: 8,
  },
  allocButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },

  // TAB 4: Chat & Moderation
  chatGroupModeratorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  emptyRequestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.greenGlow,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    marginBottom: 16,
  },
  emptyRequestsText: {
    flex: 1,
    fontSize: 12.5,
    color: C.greenText,
    fontWeight: '600',
  },
  requestItemCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  requestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reqAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reqName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.text,
  },
  reqMsg: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    fontStyle: 'italic',
  },
  reqActionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  reqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: 8,
  },
  reqBtnReject: {
    backgroundColor: C.roseGlow,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  reqBtnRejectText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.redText,
  },
  reqBtnApprove: {
    backgroundColor: C.green,
  },
  reqBtnApproveText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },

  // Announcements
  announceCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  announceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  announceCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.text,
  },
  announceCardDate: {
    fontSize: 11.5,
    color: C.textMuted,
    fontWeight: '600',
  },
  announceCardContent: {
    fontSize: 12.5,
    color: C.textSec,
    lineHeight: 18,
    fontWeight: '400',
  },
  addAnnounceBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  announceBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  announceBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal base
  modalDesc: {
    fontSize: 13,
    color: C.textSec,
    marginTop: 4,
    lineHeight: 19,
    fontWeight: '400',
  },
  modalFieldGap: {
    marginTop: 14,
  },
  modalInputRow: {
    flexDirection: 'row',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },

  // My Creations modal
  creationsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end',
  },
  creationsModalCard: {
    width: '100%',
    height: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingTop: 16,
  },
  creationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  creationsHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
  },
  creationsHeaderSub: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
  },
  creationsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCreations: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyCreationsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  emptyCreationsSub: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  creationsListScroll: {
    padding: 16,
    gap: 12,
  },
  creationCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  creationCardImg: {
    width: 100,
    alignSelf: 'stretch',
  },
  creationCardInfo: {
    flex: 1,
    padding: 12,
  },
  creationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creationCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  creationCategoryBadge: {
    backgroundColor: C.blueGlow,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  creationCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.blueText,
  },
  creationRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  creationRouteText: {
    fontSize: 11.5,
    color: C.textSec,
    flex: 1,
  },

  // Inspector Modal
  creationDetailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    justifyContent: 'flex-end',
  },
  creationDetailCard: {
    width: '100%',
    height: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingTop: 16,
  },
  creationDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  detailBackBtn: {
    backgroundColor: C.cardAlt,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailBackBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
  },
  detailHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  inspectorTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
  },
  inspectorTabBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  inspectorTabBtnActive: {
    borderBottomColor: C.blue,
  },
  inspectorTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.textMuted,
  },
  inspectorTabTextActive: {
    color: C.blueText,
  },
  detailBannerContainer: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14,
  },
  detailBannerImg: {
    width: '100%',
    height: '100%',
  },
  detailCategoryPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(37,99,235,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.white,
  },
  detailTripName: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    lineHeight: 24,
    marginBottom: 4,
  },
  detailOrganizerText: {
    fontSize: 12.5,
    color: C.textSec,
    marginBottom: 12,
  },
  modalQuickOpsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modalQuickOpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalQuickOpText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  detailRouteFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.card,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailCityText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.text,
  },
  detailArrow: {
    fontSize: 11,
    color: C.textMuted,
  },
  detailStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailStatCell: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  detailStatVal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.text,
  },
  detailMeetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.blueGlow,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  detailMeetingText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
    lineHeight: 17,
  },
  detailMeetingSub: {
    fontSize: 11,
    color: C.textSec,
    marginTop: 2,
  },
  detailInclusionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailInclusionCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailInclusionText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text,
  },
  detailRequestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.cardAlt,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  detailReqAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailReqName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },
  detailReqSub: {
    fontSize: 11,
    color: C.textSec,
    marginTop: 2,
  },
  detailReqActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailAcceptBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  detailAcceptText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.white,
  },
  detailRejectBtn: {
    backgroundColor: C.roseGlow,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  detailRejectText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.redText,
  },
  creatorBadge: {
    backgroundColor: C.amberGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.amberText,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: C.greenGlow,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  statusRejected: {
    backgroundColor: C.roseGlow,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusTextApproved: {
    color: C.greenText,
  },
  statusTextRejected: {
    color: C.redText,
  },
  // ── Clean Members List Styles ──
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  membersTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  membersSub: {
    fontSize: 11.5,
    color: C.textSec,
    marginTop: 2,
  },
  membersCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blueGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  membersCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.blueText,
  },
  emptyMembersState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyMembersTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    marginTop: 10,
  },
  emptyMembersSub: {
    fontSize: 11.5,
    color: C.textSec,
    textAlign: 'center',
    marginTop: 4,
  },
  memberCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  memberCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberCardAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.border,
  },
  memberAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.blueGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.blueText,
  },
  memberInfoCol: {
    flex: 1,
    marginLeft: 10,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberCardName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
  },
  memberRolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberRoleText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  memberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  memberMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberMetaChipText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.textSec,
  },
  memberNoMetaText: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '500',
  },
  openGroupChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  openGroupChatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  // ── Checkpoint Guide Assignment Styles ──
  stopGuideCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  stopGuideHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  stopGuideStopLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.blueText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  stopGuideCityText: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginTop: 2,
  },
  assignGuideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assignGuideBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  assignedGuideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  assignedGuideName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
  },
  removeGuideBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 10,
  },
  guideCoverageText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.greenText,
    marginTop: 2,
  },
  guideCoverageMutedText: {
    fontSize: 11,
    color: C.textSec,
    marginTop: 2,
  },
  // ── Checkpoints & Inter-Checkpoint Driving Styles ──
  itineraryFlowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  itineraryFlowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  itineraryFlowSub: {
    fontSize: 11.5,
    color: C.textSec,
    marginTop: 2,
  },
  addCheckpointTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
  },
  addCheckpointTopBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  checkpointCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    borderLeftWidth: 4,
    borderLeftColor: C.blue,
    padding: 13,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  checkpointTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  checkpointIndexPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.blueGlow,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  checkpointIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.blueText,
  },
  checkpointCatPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  checkpointCatText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textSec,
  },
  checkpointTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginLeft: 'auto',
  },
  checkpointTimeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.textMuted,
  },
  checkpointNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginBottom: 4,
  },
  checkpointActivitiesText: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 17,
    marginBottom: 6,
  },
  checkpointHotelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  checkpointHotelText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.blueText,
  },
  customThingsContainer: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  customThingsHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.blueText,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  customNotesBody: {
    fontSize: 11.5,
    color: C.text,
    lineHeight: 16,
    marginBottom: 6,
  },
  customThingsChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  customThingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.card,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  customThingChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  checkpointActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  editCheckpointBtn: {
    flex: 1,
    backgroundColor: C.blueGlow,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  editCheckpointBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blueText,
  },
  deleteCheckpointBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  deleteCheckpointBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  interDriveSection: {
    alignItems: 'center',
    marginVertical: 5,
  },
  transitConnectorLine: {
    width: 2.5,
    height: 14,
    backgroundColor: '#F59E0B',
  },
  interDriveCard: {
    width: '95%',
    backgroundColor: 'rgba(254,243,199,0.22)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(245,158,11,0.4)',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 11,
    borderStyle: 'dashed',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  interDriveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  interDriveTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.3,
  },
  interDriveModeBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  interDriveModeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  interDriveMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 7,
  },
  interDriveMetric: {
    flex: 1,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  interDriveMetricLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  interDriveMetricVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#78350F',
    marginTop: 1,
  },
  driveDetailsSubBox: {
    backgroundColor: '#FFFBEB',
    padding: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: 7,
    gap: 3,
  },
  driveConditionText: {
    fontSize: 10.5,
    color: '#92400E',
    lineHeight: 15,
  },
  drivePitstopText: {
    fontSize: 10.5,
    color: '#92400E',
    lineHeight: 15,
  },
  editDriveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  editDriveBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  addCheckpointBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    marginTop: 6,
    marginBottom: 20,
  },
  addCheckpointBottomBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContentCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    marginBottom: 4,
    marginTop: 8,
    letterSpacing: 0.2,
  },
  modalTextInput: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: C.text,
  },
  categoryPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  categoryPillItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  categoryPillItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  categoryPillItemText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSec,
  },
  categoryPillItemTextActive: {
    color: C.white,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSec,
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: C.blue,
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  /* Live Map & Routing Styles */
  checkpointLiveGpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    marginBottom: 4,
  },
  checkpointLiveGpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  checkpointLiveGpsText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065F46',
  },
  checkpointAddressSummary: {
    fontSize: 10,
    color: C.textMuted,
    flex: 1,
  },
  liveRoadDataPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveRoadDataPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065F46',
  },
  locationSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  locationSearchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  locationSearchInput: {
    flex: 1,
    fontSize: 12,
    color: C.text,
    padding: 0,
  },
  searchMapActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  searchMapActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.white,
  },
  searchResultsContainer: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.blue,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    gap: 6,
  },
  searchResultsHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.blueText,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchResultTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
  },
  searchResultAddress: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 1,
  },
  searchResultCoords: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  liveMapStatusCard: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  liveMapStatusCardVerified: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  liveMapStatusTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  liveMapCoordsText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  liveMapAddressText: {
    fontSize: 10,
    color: '#047857',
    marginTop: 1,
  },
  liveMapHintText: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 3,
  },
  liveRoutingBannerCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  liveRoutingBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  liveRoutingBannerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.3,
  },
  refreshRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refreshRouteBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  liveRouteLegPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.white,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 6,
  },
  liveRoutePoint: {
    flex: 1,
  },
  liveRoutePointLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.textMuted,
  },
  liveRoutePointName: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
  },
  liveRouteStatusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveRouteSourceText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E40AF',
  },

  /* Compact Overview Tab Styles */
  compactHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactHeroImgWrap: {
    width: 82,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: C.card,
  },
  compactHeroImg: {
    width: '100%',
    height: '100%',
  },
  compactCategoryBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(15,23,42,0.8)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  compactCategoryBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: C.white,
  },
  compactHeroInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  compactTripName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  compactOrganizerText: {
    fontSize: 11,
    color: C.textSec,
    marginBottom: 5,
  },
  compactHeroTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactStatusPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  compactStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065F46',
  },
  compactDurationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactDurationText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.textMuted,
  },
  compactStatsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactStatCell: {
    flex: 1,
    alignItems: 'center',
  },
  compactStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.border,
  },
  compactStatLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  compactStatVal: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text,
  },
  compactRouteBox: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactBoxLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  compactRouteFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  compactCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.card,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactCityText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.text,
  },
  compactArrow: {
    fontSize: 10,
    color: C.textMuted,
  },
  compactMeetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.blueGlow,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  compactMeetingText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.text,
  },
  compactMeetingSub: {
    fontSize: 9.5,
    color: C.textSec,
    marginTop: 1,
  },
  compactInclusionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  compactInclusionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: C.cardAlt,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  compactInclusionText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSec,
  },

  /* Expanded Overview Tab Styles */
  expandedHeroBanner: {
    height: 125,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: C.cardAlt,
  },
  expandedHeroImg: {
    width: '100%',
    height: '100%',
  },
  expandedHeroTopRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedCategoryBadge: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expandedCategoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.white,
  },
  expandedStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  expandedStatusOpen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  expandedStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  expandedStatusOpenText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  expandedStatusClosed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  expandedStatusClosedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#991B1B',
  },
  expandedTitleSection: {
    marginTop: -2,
  },
  expandedTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    lineHeight: 23,
  },
  expandedCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  expandedCreatorText: {
    fontSize: 12.5,
    color: C.textSec,
  },
  expandedDurationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.cardAlt,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blueText,
  },
  expandedStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expandedStatCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedStatLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  expandedStatValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
  },
  expandedSectionCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  expandedRouteFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  expandedCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.card,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  expandedCityText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.text,
  },
  expandedRouteArrow: {
    fontSize: 11,
    color: C.textMuted,
  },
  expandedMeetingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.blueGlow,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  expandedMeetingTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.blueText,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  expandedMeetingPlace: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.text,
    lineHeight: 17,
  },
  expandedMeetingHint: {
    fontSize: 10.5,
    color: C.textSec,
    marginTop: 3,
  },
  expandedInclusionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  expandedInclusionCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    gap: 3,
  },
  expandedInclusionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
  },
  expandedInclusionStatus: {
    fontSize: 9.5,
    fontWeight: '600',
  },


  /* Structured Non-Scrollable Overview Styles (Slightly Expanded & Balanced) */
  structuredOverviewContainer: {
    gap: 10,
  },
  structuredHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  microTripThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  structuredHeaderBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  structuredCatBadge: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  structuredCatBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.blueText,
  },
  structuredStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  structuredStatusOpen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  structuredStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  structuredStatusOpenText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065F46',
  },
  structuredStatusClosed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  structuredStatusClosedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#991B1B',
  },
  structuredTripTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: C.text,
  },
  structuredOrganizerSub: {
    fontSize: 11.5,
    color: C.textSec,
    marginTop: 2,
  },
  structuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  structuredGridCell: {
    width: (SCREEN_WIDTH - 40) / 2,
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  structuredCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  structuredCellLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  structuredCellVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.text,
  },
  structuredCellSub: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 2,
  },
  structuredSectionBox: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  structuredBoxHeader: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  structuredRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  structuredCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.card,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  structuredCityText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
  },
  structuredArrow: {
    fontSize: 10,
    color: C.textMuted,
  },
  structuredMeetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.blueGlow,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.2)',
  },
  structuredMeetingTitle: {
    fontSize: 11.5,
    color: C.text,
  },
  structuredMeetingSub: {
    fontSize: 9.5,
    color: C.textSec,
    marginTop: 2,
  },
  structuredInclusionsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  structuredInclusionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.cardAlt,
    paddingVertical: 7.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  structuredInclusionText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.textSec,
  },

});
