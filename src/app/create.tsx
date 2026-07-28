import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Calendar as CalendarIcon,
  Car,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Compass,
  Globe,
  Hotel,
  Image as ImageIcon,
  IndianRupee,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Sparkles,
  Square,
  User,
  MessageSquare,
  UserPlus,
  Users,
  Utensils,
  X,
  XCircle
} from 'lucide-react-native';
import React, { useRef, useState, useEffect, memo } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { eventBus } from '@/services/event-bus';

// Coordinates registry for Indian cities
const CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  // Northern India
  'Delhi': { latitude: 28.6139, longitude: 77.2090 },
  'New Delhi': { latitude: 28.6139, longitude: 77.2090 },
  'Noida': { latitude: 28.5355, longitude: 77.3910 },
  'Gurugram': { latitude: 28.4595, longitude: 77.0266 },
  'Gurgaon': { latitude: 28.4595, longitude: 77.0266 },
  'Faridabad': { latitude: 28.4089, longitude: 77.3178 },
  'Ghaziabad': { latitude: 28.6692, longitude: 77.4538 },
  'Agra': { latitude: 27.1767, longitude: 78.0081 },
  'Mathura': { latitude: 27.4924, longitude: 77.6737 },
  'Vrindavan': { latitude: 27.5650, longitude: 77.7008 },
  'Varanasi': { latitude: 25.3176, longitude: 82.9739 },
  'Sarnath': { latitude: 25.3762, longitude: 83.0227 },
  'Lucknow': { latitude: 26.8467, longitude: 80.9462 },
  'Kanpur': { latitude: 26.4499, longitude: 80.3319 },
  'Ayodhya': { latitude: 26.7922, longitude: 82.1998 },
  'Allahabad': { latitude: 25.4358, longitude: 81.8463 },
  'Prayagraj': { latitude: 25.4358, longitude: 81.8463 },
  'Haridwar': { latitude: 29.9457, longitude: 78.1642 },
  'Rishikesh': { latitude: 30.0869, longitude: 78.2676 },
  'Dehradun': { latitude: 30.3165, longitude: 78.0322 },
  'Shimla': { latitude: 31.1048, longitude: 77.1734 },
  'Manali': { latitude: 32.2396, longitude: 77.1887 },
  'Srinagar': { latitude: 34.0837, longitude: 74.7973 },
  'Gulmarg': { latitude: 34.0484, longitude: 74.3805 },
  'Pahalgam': { latitude: 34.0161, longitude: 75.1950 },
  'Leh': { latitude: 34.1526, longitude: 77.5771 },
  'Ladakh': { latitude: 34.1526, longitude: 77.5771 },
  'Amritsar': { latitude: 31.6340, longitude: 74.8723 },
  'Chandigarh': { latitude: 30.7333, longitude: 76.7794 },

  // Western India
  'Jaipur': { latitude: 26.9124, longitude: 75.7873 },
  'Udaipur': { latitude: 24.5854, longitude: 73.7125 },
  'Jodhpur': { latitude: 26.2389, longitude: 73.0243 },
  'Jaisalmer': { latitude: 26.9157, longitude: 70.9083 },
  'Mumbai': { latitude: 19.0760, longitude: 72.8777 },
  'Pune': { latitude: 18.5204, longitude: 73.8567 },
  'Nagpur': { latitude: 21.1458, longitude: 79.0882 },
  'Ahmedabad': { latitude: 23.0225, longitude: 72.5714 },
  'Surat': { latitude: 21.1702, longitude: 72.8311 },
  'Vadodara': { latitude: 22.3072, longitude: 73.1812 },
  'Goa': { latitude: 15.2993, longitude: 74.1240 },
  'North Goa': { latitude: 15.5898, longitude: 73.8278 },
  'South Goa': { latitude: 15.0644, longitude: 74.0229 },
  'Dudhsagar': { latitude: 15.3185, longitude: 74.3142 },

  // Eastern India
  'Patna': { latitude: 25.5941, longitude: 85.1376 },
  'Gaya': { latitude: 24.7955, longitude: 85.0002 },
  'Ranchi': { latitude: 23.3441, longitude: 85.3090 },
  'Jamshedpur': { latitude: 22.8046, longitude: 86.2029 },
  'Kolkata': { latitude: 22.5726, longitude: 88.3639 },
  'Bhubaneswar': { latitude: 20.2961, longitude: 85.8245 },
  'Puri': { latitude: 19.8135, longitude: 85.8312 },
  'Darjeeling': { latitude: 27.0410, longitude: 88.2627 },
  'Gangtok': { latitude: 27.3314, longitude: 88.6138 },
  'Guwahati': { latitude: 26.1445, longitude: 91.7362 },
  'Shillong': { latitude: 25.5788, longitude: 91.8833 },

  // Southern India
  'Bengaluru': { latitude: 12.9716, longitude: 77.5946 },
  'Bangalore': { latitude: 12.9716, longitude: 77.5946 },
  'Mysore': { latitude: 12.2958, longitude: 76.6394 },
  'Mysuru': { latitude: 12.2958, longitude: 76.6394 },
  'Ooty': { latitude: 11.4102, longitude: 76.6950 },
  'Chennai': { latitude: 13.0827, longitude: 80.2707 },
  'Madurai': { latitude: 9.9252, longitude: 78.1198 },
  'Hyderabad': { latitude: 17.3850, longitude: 78.4867 },
  'Secunderabad': { latitude: 17.4399, longitude: 78.5000 },
  'Visakhapatnam': { latitude: 17.6868, longitude: 83.2185 },
  'Kochi': { latitude: 9.9312, longitude: 76.2673 },
  'Munnar': { latitude: 10.0889, longitude: 77.0595 },
  'Alleppey': { latitude: 9.4981, longitude: 76.3388 },
  'Trivandrum': { latitude: 8.5241, longitude: 76.9366 },
  'Thiruvananthapuram': { latitude: 8.5241, longitude: 76.9366 },

  // Central India
  'Bhopal': { latitude: 23.2599, longitude: 77.4126 },
  'Indore': { latitude: 22.7196, longitude: 75.8577 },
  'Raipur': { latitude: 21.2514, longitude: 81.6296 },
};

// Build Leaflet HTML preview
function buildPreviewMapHTML(routeCoords: { latitude: number; longitude: number; name: string }[]) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <style>
      body, html, #map {
        margin: 0; padding: 0; width: 100%; height: 100%;
        background: #080A12;
      }
      .leaflet-control-attribution { display: none !important; }
      .leaflet-control-zoom { display: none !important; }
      .leaflet-tooltip {
        background: rgba(17, 20, 34, 0.9) !important;
        border: 1px solid rgba(59, 130, 246, 0.3) !important;
        color: #F8FAFC !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        border-radius: 6px !important;
        padding: 4px 8px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var pathPoints = ${JSON.stringify(routeCoords.map(c => [c.latitude, c.longitude]))};
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
      });

      if (pathPoints.length > 0) {
        map.setView(pathPoints[0], 6);
      } else {
        map.setView([20.5937, 78.9629], 4); // Center of India
      }

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: ['a','b','c','d'],
      }).addTo(map);

      // Route polyline
      if (pathPoints.length > 1) {
        L.polyline(pathPoints, {
          color: '#3B82F6', weight: 4, opacity: 0.9,
          smoothFactor: 1.5, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
        map.fitBounds(pathPoints, { padding: [30, 30] });
      }

      var routeCities = ${JSON.stringify(routeCoords)};
      routeCities.forEach(function(city, idx) {
        var isStart = idx === 0;
        var isEnd = idx === routeCities.length - 1;
        var badgeBg = '#10B981'; // Emerald Green
        var iconPrefix = '📍';
        if (isStart) {
          badgeBg = '#3B82F6'; // Blue
          iconPrefix = '🚩';
        } else if (isEnd) {
          badgeBg = '#F59E0B'; // Amber Gold
          iconPrefix = '🏁';
        }

        var markerHtml = '<div class="checkpoint-badge" style="' +
          'background: ' + badgeBg + '; ' +
          'color: #FFF; ' +
          'font-family: -apple-system, BlinkMacSystemFont, \\'Segoe UI\\', Roboto, sans-serif; ' +
          'font-size: 10px; ' +
          'font-weight: 800; ' +
          'padding: 4px 10px; ' +
          'border-radius: 20px; ' +
          'border: 2px solid #FFF; ' +
          'box-shadow: 0 4px 12px rgba(0,0,0,0.35); ' +
          'white-space: nowrap; ' +
          'display: flex; ' +
          'align-items: center; ' +
          'gap: 4px; ' +
          '">' + iconPrefix + ' ' + (idx + 1) + '. ' + city.name + '</div>';

        var checkpointIcon = L.divIcon({
          html: markerHtml,
          className: '',
          iconSize: [120, 26],
          iconAnchor: [60, 13]
        });

        L.marker([city.latitude, city.longitude], { icon: checkpointIcon }).addTo(map);
      });
    <\/script>
  </body>
  </html>
  `;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#080A12',
  card: '#111422',
  cardAlt: '#181C2E',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
};

const PRESET_COVERS = [
  { label: 'Taj Mahal', url: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80' },
  { label: 'Mountain', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80' },
  { label: 'Beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80' },
  { label: 'Valley/Lake', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80' },
  { label: 'Desert', url: 'https://images.unsplash.com/photo-1547234935-80c7145ec969?w=800&q=80' },
];

const TRIP_CATEGORIES = ['Adventure', 'Religious', 'Family', 'Road Trip', 'Beach', 'Wildlife', 'Heritage', 'Honeymoon'];



function CreateTripScreen() {
  useEffect(() => {
    console.log('Screen mounted: CreateTripScreen');
  }, []);
  const router = useRouter();
  const lastScrollYRef = useRef(0);
  const scrollAccumulatorRef = useRef(0);
  const navbarHiddenRef = useRef(false);
  const { trips, addTrip, profile, reloadIncomingRequestsCount, setActiveRoomId, setNavbarHidden } = useApp();
  const scrollRef = useRef<ScrollView>(null);

  const [tripName, setTripName] = useState('');
  const [citiesInput, setCitiesInput] = useState('');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-07');
  const [budget, setBudget] = useState('');
  const [totalSeats, setTotalSeats] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [guideIncluded, setGuideIncluded] = useState(true);
  const [foodIncluded, setFoodIncluded] = useState(true);
  const [hotelIncluded, setHotelIncluded] = useState(true);
  const [cabIncluded, setCabIncluded] = useState(false);
  const [privacy, setPrivacy] = useState<'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY'>('PUBLIC');
  const [selectedCategory, setSelectedCategory] = useState('Adventure');
  const [verifiedCoords, setVerifiedCoords] = useState<Record<string, { latitude: number; longitude: number }>>({});

  // Dynamic geocoding via Nominatim with local fallback
  React.useEffect(() => {
    const fetchGeocoding = async () => {
      const cities = citiesInput
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c !== '');

      const newCoords = { ...verifiedCoords };
      let changed = false;

      for (const city of cities) {
        if (!CITY_COORDS[city] && !newCoords[city]) {
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ', India')}`,
              {
                headers: {
                  'User-Agent': 'TravelStarApp/1.0',
                },
              }
            );
            const data = await response.json();
            if (data && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              newCoords[city] = { latitude: lat, longitude: lon };
              changed = true;
            }
          } catch (e) {
            console.warn('Geocoding failed for city:', city, e);
          }
        }
      }

      if (changed) {
        setVerifiedCoords(newCoords);
      }
    };

    const timer = setTimeout(() => {
      fetchGeocoding();
    }, 800);

    return () => clearTimeout(timer);
  }, [citiesInput]);

  // Creations Modal state
  const [showCreationsModal, setShowCreationsModal] = useState(false);
  const [selectedCreation, setSelectedCreation] = useState<any | null>(null);

  // Cover Image State (preset or gallery)
  const [coverImage, setCoverImage] = useState(PRESET_COVERS[0].url);
  const [customCoverUri, setCustomCoverUri] = useState<string | null>(null);

  // Custom Trip Studio Tab Switcher
  const [activeTab, setActiveTab] = useState<'PLANNER' | 'TIMELINE' | 'TRAVELERS' | 'CHECKLIST'>('PLANNER');

  // Keyboard avoidance height offset state
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Custom form inputs
  const [shortDesc, setShortDesc] = useState('');
  const [transportMode, setTransportMode] = useState('AC Vehicle');
  const [selectedTripType, setSelectedTripType] = useState('Group');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [creationMembers, setCreationMembers] = useState<any[]>([]);
  const fetchCreationMembers = async (tripId: string) => {
    try {
      const data = await apiService.getTripMembers(tripId);
      if (data) {
        setCreationMembers(data);
      }
    } catch (e) {
      console.warn('[Create] Failed to fetch trip members:', e);
    }
  };
  const fetchIncomingRequests = async () => {
    try {
      const data = await apiService.getIncomingRequests();
      if (data) {
        setJoinRequests(data);
      }
      reloadIncomingRequestsCount();
    } catch (e) {
      console.warn('[Create] Failed to fetch incoming requests:', e);
    }
  };

  React.useEffect(() => {
    if (profile?.id) {
      fetchIncomingRequests();
    }
  }, [profile?.id]);

  const [participants, setParticipants] = useState([
    { id: 'p-1', name: 'Aarav Sharma (Creator)', isCreator: true },
  ]);

  // Essential Packing Checklist
  const [checklist, setChecklist] = useState([
    { id: '1', item: 'Passport & National ID / Aadhaar Card', checked: false },
    { id: '2', item: 'Driving License & Required Travel Permits', checked: false },
    { id: '3', item: 'Flight / Bus / Train Tickets & Hotel Vouchers', checked: false },
    { id: '4', item: 'Powerbank, Portable Chargers & Universal Cable', checked: false },
    { id: '5', item: 'First Aid Kit & Personal Prescription Medications', checked: false },
    { id: '6', item: 'Sunscreen, Sunglasses & Personal Toiletries', checked: false },
    { id: '7', item: 'Weather-Appropriate Clothing & Trekking Shoes', checked: false },
    { id: '8', item: 'Emergency Cash & Credit / Debit Cards', checked: false },
  ]);

  // Meeting Point details
  const [meetingDate, setMeetingDate] = useState('2026-08-01');
  const [meetingTime, setMeetingTime] = useState('10:00 AM');

  // Calendar Modal State
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'end' | 'meeting' | null>(null);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(7); // August (0-indexed)

  const pickImageFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to pick a cover image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],   // strict portrait — matches the card image slot on Search tab
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCustomCoverUri(result.assets[0].uri);
      }
    } catch (e) {
      console.log('Gallery pick error:', e);
    }
  };

  // Parsed Cities for live route diagram
  const parsedCities = citiesInput
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '');

  const previewRouteCoords = parsedCities
    .map((city) => {
      const clean = city.trim();
      const found = verifiedCoords[clean] || CITY_COORDS[clean] || Object.entries(CITY_COORDS).find(([k]) => clean.toLowerCase().includes(k.toLowerCase()))?.[1];
      if (found) {
        return { latitude: found.latitude, longitude: found.longitude, name: clean };
      } else {
        // Deterministic fallback based on name hash
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
          hash = clean.charCodeAt(i) + ((hash << 5) - hash);
        }
        const lat = 18.0 + (Math.abs(hash % 100) / 100) * 8.0;
        const lon = 74.0 + (Math.abs((hash >> 8) % 100) / 100) * 10.0;
        return { latitude: lat, longitude: lon, name: clean };
      }
    });



  const handleCreate = () => {
    if (!tripName || !citiesInput || !startDate || !budget || !totalSeats) {
      Alert.alert('Missing Info', 'Please fill in all required fields marked with *');
      return;
    }

    if (parsedCities.length < 2) {
      Alert.alert('Route Error', 'Please enter at least 2 cities separated by commas (e.g. Delhi, Jaipur).');
      return;
    }

    const newTrip = {
      id: `trip-${Date.now()}`,
      name: tripName,
      creator: `${profile?.name || 'Aarav Sharma'} (Organizer)`,
      creatorId: profile?.id,
      cities: parsedCities,
      startDate,
      endDate: endDate || startDate,
      budget: parseFloat(budget),
      availableSeats: parseInt(totalSeats),
      totalSeats: parseInt(totalSeats),
      meetingPoint: meetingPoint
        ? `${meetingPoint} (on ${meetingDate} at ${meetingTime})`
        : `Central Point (on ${meetingDate} at ${meetingTime})`,
      guideIncluded,
      foodIncluded,
      hotelIncluded,
      cabIncluded,
      privacy,
      membersCount: 1,
      coverImage: customCoverUri || coverImage,
      category: selectedCategory,
      coordinates: previewRouteCoords,
    };

    addTrip(newTrip);
    Alert.alert('✨ Trip Route Published!', 'Your group tour itinerary is live for travelers to explore and join.', [
      {
        text: 'View Home Feed',
        onPress: () => {
          setTripName('');
          setCitiesInput('');
          setStartDate('2026-08-01');
          setEndDate('2026-08-07');
          setBudget('');
          setTotalSeats('');
          setMeetingPoint('');
          setMeetingDate('2026-08-01');
          setMeetingTime('10:00 AM');
          setShortDesc('');
          setTransportMode('AC Vehicle');
          router.replace('/');
        },
      },
    ]);
  };

  const handleSaveDraft = () => {
    if (!tripName) {
      Alert.alert('Missing Name', 'Please enter a Trip Name before saving a draft.');
      return;
    }
    const newTrip = {
      id: `draft-${Date.now()}`,
      name: `[DRAFT] ${tripName}`,
      creator: `${profile?.name || 'Aarav Sharma'} (Organizer)`,
      creatorId: profile?.id,
      cities: parsedCities.length > 0 ? parsedCities : ['Delhi', 'Destination'],
      startDate,
      endDate: endDate || startDate,
      budget: budget ? parseFloat(budget) : 0,
      availableSeats: totalSeats ? parseInt(totalSeats) : 0,
      totalSeats: totalSeats ? parseInt(totalSeats) : 0,
      meetingPoint: meetingPoint || 'To be decided',
      guideIncluded,
      foodIncluded,
      hotelIncluded,
      cabIncluded,
      privacy: 'PRIVATE' as const,
      membersCount: 1,
      coverImage: customCoverUri || coverImage,
      category: selectedCategory,
      coordinates: previewRouteCoords,
    };
    addTrip(newTrip);
    showToast('📝 Trip saved to Drafts successfully!');
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const toggleChecklist = (id: string) => {
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  };

  const handleAcceptRequest = async (reqId: string, name: string) => {
    try {
      await apiService.updateJoinRequestStatus(reqId, 'APPROVED');
      showToast(`✅ Accepted ${name}'s join request!`);
      fetchIncomingRequests();
      if (selectedCreation) {
        fetchCreationMembers(selectedCreation.id);
      }
    } catch (e) {
      showToast('❌ Failed to accept request');
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    try {
      await apiService.updateJoinRequestStatus(reqId, 'REJECTED');
      showToast('❌ Join request declined');
      fetchIncomingRequests();
      if (selectedCreation) {
        fetchCreationMembers(selectedCreation.id);
      }
    } catch (e) {
      showToast('❌ Failed to decline request');
    }
  };

  const selectCalendarDay = (day: number) => {
    const formatted = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (activeDatePicker === 'start') {
      setStartDate(formatted);
    } else if (activeDatePicker === 'end') {
      setEndDate(formatted);
    } else if (activeDatePicker === 'meeting') {
      setMeetingDate(formatted);
    }
  };

  const openDatePicker = (type: 'start' | 'end' | 'meeting') => {
    setActiveDatePicker(type);

    // Parse currently selected date to sync calendar display
    let dateToParse = '';
    if (type === 'start') dateToParse = startDate;
    else if (type === 'end') dateToParse = endDate;
    else if (type === 'meeting') dateToParse = meetingDate;

    if (dateToParse) {
      const parts = dateToParse.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // 0-indexed
        setCalendarYear(year);
        setCalendarMonth(month);
      }
    }
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Platform.OS === 'ios' ? 140 : keyboardHeight + 140 }
          ]}
          keyboardShouldPersistTaps="handled"
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

          {/* ─── ORGANIZER CREATIONS NOTIFICATION BANNER (TOP LEVEL) ─── */}
          {(() => {
            const myTrips = trips.filter(t => !!(profile && profile.id && t.creatorId === profile.id));
            const pendingCount = joinRequests.filter(req => req.status === 'PENDING').length;
            const hasAlert = pendingCount > 0;

            return (
              <TouchableOpacity
                style={styles.notificationBannerTouch}
                onPress={() => {
                  fetchIncomingRequests();
                  setShowCreationsModal(true);
                }}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={hasAlert ? ['#2A1B54', '#150D33'] : ['#1E123C', '#0E0720']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.notificationBanner,
                    hasAlert && styles.notificationBannerActive
                  ]}
                >
                  <View style={styles.notificationMain}>
                    <View style={[styles.notificationIconWrap, hasAlert && styles.notificationIconWrapAlert]}>
                      <Compass size={15} color={hasAlert ? '#F59E0B' : '#8B5CF6'} />
                      {hasAlert && <View style={styles.notificationRedDot} />}
                    </View>
                    <View style={styles.notificationTextColumn}>
                      <Text style={styles.notificationAppName}>ORGANIZER CONSOLE</Text>
                      <Text style={styles.notificationTitle}>My Creations</Text>
                      <Text style={styles.notificationDescText} numberOfLines={1}>
                        {hasAlert
                          ? `${pendingCount} new request${pendingCount !== 1 ? 's' : ''} pending approval`
                          : `${myTrips.length} active group route${myTrips.length !== 1 ? 's' : ''} published`}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {hasAlert && (
                      <View style={styles.notificationAlertPill}>
                        <Text style={styles.notificationAlertPillText}>Action Required</Text>
                      </View>
                    )}
                    <ChevronRight size={13} color={hasAlert ? '#F59E0B' : '#8B5CF6'} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })()}

          {/* ─── SECTION TITLE: NEW TRIP BUILDER ─── */}
          <View style={styles.sectionDividerWrap}>
            <Text style={styles.sectionDividerTitle}>NEW TRIP BUILDER</Text>
            <Text style={styles.sectionDividerSub}>
              Configure parameters, plan routes, and publish new custom itineraries below.
            </Text>
          </View>

          {/* ════════════════════════════════════════════════
            SCENIC TOURIST HERO BANNER WITH IMAGE OVERLAY
            ════════════════════════════════════════════════ */}
          <View style={styles.heroWrap}>
            <Image
              source={{ uri: customCoverUri || coverImage }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(18,21,36,0.2)', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Sparkles size={12} color={C.amber} />
                <Text style={styles.heroBadgeText}>ORGANIZER SUITE</Text>
              </View>
              {/* Gallery pick button inside hero — clean pill */}
              <TouchableOpacity style={styles.galleryPickBtn} onPress={pickImageFromGallery} activeOpacity={0.8}>
                <ImageIcon size={13} color={customCoverUri ? C.green : C.white} />
                <Text style={[styles.galleryPickBtnText, customCoverUri && { color: C.green }]}>
                  {customCoverUri ? 'Custom Photo' : 'Upload Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.heroTitle}>Create Group Trip Route</Text>
            <Text style={styles.heroSub}>
              Set up custom tour itineraries, assign route segments, budget, and open seats.
            </Text>
          </View>

          {/* ────────────────────────────────────────────
            COVER PHOTO SECTION
            ─────────────────────────────────────────── */}
          <View style={styles.coverSectionWrap}>
            {/* Gallery Picker Card */}
            <TouchableOpacity
              style={[styles.galleryCard, customCoverUri && styles.galleryCardSelected]}
              onPress={pickImageFromGallery}
              activeOpacity={0.85}
            >
              <View style={[styles.galleryIconCircle, customCoverUri && styles.galleryIconCircleSelected]}>
                <ImageIcon size={20} color={customCoverUri ? C.green : C.blue} />
              </View>
              <View style={styles.galleryCardContent}>
                <Text style={styles.galleryCardTitle}>
                  {customCoverUri ? 'Custom Cover Photo Applied' : 'Upload Cover Photo'}
                </Text>
                <Text style={styles.galleryCardSub}>
                  {customCoverUri
                    ? 'Tap to replace with a different image from your gallery'
                    : 'Select an image from your device photo library'}
                </Text>
              </View>
              <View style={[styles.galleryChevron, customCoverUri && styles.galleryChevronSelected]}>
                <Text style={[styles.galleryChevronText, customCoverUri && styles.galleryChevronTextSelected]}>
                  {customCoverUri ? 'CHANGE' : 'BROWSE'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.coverDivider}>
              <View style={styles.coverDividerLine} />
              <Text style={styles.coverDividerText}>OR USE A PRESET</Text>
              <View style={styles.coverDividerLine} />
            </View>

            {/* Preset chips strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsList}>
              {PRESET_COVERS.map((cov) => {
                const isSelected = !customCoverUri && coverImage === cov.url;
                return (
                  <TouchableOpacity
                    key={cov.label}
                    style={[styles.presetChip, isSelected && styles.presetChipActive]}
                    onPress={() => { setCustomCoverUri(null); setCoverImage(cov.url); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>{cov.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ════════════════════════════════════════════════
            CUSTOM TRIP STUDIO TAB SWITCHER
            ════════════════════════════════════════════════ */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'PLANNER' && styles.tabItemActive]}
              onPress={() => setActiveTab('PLANNER')}
              activeOpacity={0.8}
            >
              <Compass size={14} color={activeTab === 'PLANNER' ? C.white : C.textSec} />
              <Text style={[styles.tabText, activeTab === 'PLANNER' && styles.tabTextActive]}>Plan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'TIMELINE' && styles.tabItemActive]}
              onPress={() => setActiveTab('TIMELINE')}
              activeOpacity={0.8}
            >
              <Clock size={14} color={activeTab === 'TIMELINE' ? C.white : C.textSec} />
              <Text style={[styles.tabText, activeTab === 'TIMELINE' && styles.tabTextActive]}>Timeline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'TRAVELERS' && styles.tabItemActive]}
              onPress={() => setActiveTab('TRAVELERS')}
              activeOpacity={0.8}
            >
              <Users size={14} color={activeTab === 'TRAVELERS' ? C.white : C.textSec} />
              <Text style={[styles.tabText, activeTab === 'TRAVELERS' && styles.tabTextActive]}>Travelers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'CHECKLIST' && styles.tabItemActive]}
              onPress={() => setActiveTab('CHECKLIST')}
              activeOpacity={0.8}
            >
              <CheckSquare size={14} color={activeTab === 'CHECKLIST' ? C.white : C.textSec} />
              <Text style={[styles.tabText, activeTab === 'CHECKLIST' && styles.tabTextActive]}>Checklist</Text>
            </TouchableOpacity>
          </View>

          {/* ─── TAB 1: PLANNER & TRIP DETAILS ────────────────── */}
          {activeTab === 'PLANNER' && (
            <View style={styles.formContainer}>

              {/* 1. BASIC INFORMATION */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#3B82F6', '#1E40AF']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>01</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Basic Trip Overview</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>TRIP NAME *</Text>
                <View style={styles.inputWrapper}>
                  <Compass size={17} color={C.blue} style={styles.inputIcon} />
                  <TextInput
                    placeholder="e.g. Royal Rajasthan Grand Expedition"
                    placeholderTextColor={C.textMuted}
                    style={styles.textInput}
                    value={tripName}
                    onChangeText={setTripName}
                  />
                </View>
              </View>

              {/* Short Description (Merged feature) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>SHORT DESCRIPTION</Text>
                <View style={styles.inputWrapper}>
                  <ImageIcon size={17} color={C.blue} style={styles.inputIcon} />
                  <TextInput
                    placeholder="e.g. Exploring Grand Palaces, Desert camping & Camel safari"
                    placeholderTextColor={C.textMuted}
                    style={styles.textInput}
                    value={shortDesc}
                    onChangeText={setShortDesc}
                  />
                </View>
              </View>

              {/* 2. ROUTE SEQUENCE & QUICK ADD CHIPS */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#10B981', '#065F46']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>02</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Route Sequence & Destinations</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CITIES & STOPS (COMMA SEPARATED) *</Text>
                <View style={styles.inputWrapper}>
                  <MapPin size={17} color={C.green} style={styles.inputIcon} />
                  <TextInput
                    placeholder="e.g. Delhi, Agra, Jaipur, Udaipur"
                    placeholderTextColor={C.textMuted}
                    style={styles.textInput}
                    value={citiesInput}
                    onChangeText={setCitiesInput}
                  />
                </View>
                <Text style={styles.helperText}>
                  Order matters! Travelers can join midway along any segment.
                </Text>



                {/* Live Interactive Route Flow Card */}
                {parsedCities.length > 0 && (
                  <View style={styles.routeFlowCard}>
                    <Text style={styles.routeFlowTitle}>LIVE ROUTE PATH:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routePillRow}>
                      {parsedCities.map((city, idx) => (
                        <React.Fragment key={idx}>
                          <View style={styles.cityPill}>
                            <MapPin size={10} color={C.blue} />
                            <Text style={styles.cityPillText}>{city}</Text>
                          </View>
                          {idx < parsedCities.length - 1 && (
                            <ChevronRight size={14} color={C.textMuted} style={{ marginHorizontal: 2 }} />
                          )}
                        </React.Fragment>
                      ))}
                    </ScrollView>

                    {previewRouteCoords.length > 0 && (
                      <View style={styles.mapPreviewWrap}>
                        {Platform.OS === 'web' ? (
                          <iframe
                            srcDoc={buildPreviewMapHTML(previewRouteCoords)}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Route Preview Map"
                          />
                        ) : (
                          <WebView
                            originWhitelist={['*']}
                            source={{ html: buildPreviewMapHTML(previewRouteCoords) }}
                            style={{ flex: 1 }}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            scrollEnabled={false}
                          />
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* 3. TRIP CATEGORY */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#EC4899', '#BE185D']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>03</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Trip Category</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>SELECT A CATEGORY *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                  {TRIP_CATEGORIES.map((cat) => {
                    const isActive = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                        onPress={() => setSelectedCategory(cat)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 4. DATES & TIMINGS (TOUCH TO OPEN CALENDAR MODAL) */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#8B5CF6', '#581C87']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>04</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Schedule & Dates</Text>
              </View>

              <View style={styles.gridRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>START DATE *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.inputWrapper}
                    onPress={() => setActiveDatePicker('start')}
                  >
                    <CalendarIcon size={16} color={C.purple} style={styles.inputIcon} />
                    <Text style={[styles.textInput, !startDate && { color: C.textMuted }]}>
                      {startDate || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>END DATE</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.inputWrapper}
                    onPress={() => setActiveDatePicker('end')}
                  >
                    <CalendarIcon size={16} color={C.purple} style={styles.inputIcon} />
                    <Text style={[styles.textInput, !endDate && { color: C.textMuted }]}>
                      {endDate || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 5. BUDGET & CAPACITY */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#F59E0B', '#B45309']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>05</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Budget & Capacity</Text>
              </View>

              <View style={styles.gridRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>BUDGET PER PERSON (₹) *</Text>
                  <View style={styles.inputWrapper}>
                    <IndianRupee size={16} color={C.amber} style={styles.inputIcon} />
                    <TextInput
                      placeholder="e.g. 14500"
                      placeholderTextColor={C.textMuted}
                      keyboardType="numeric"
                      style={styles.textInput}
                      value={budget}
                      onChangeText={setBudget}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>TOTAL SLOTS *</Text>
                  <View style={styles.inputWrapper}>
                    <Users size={16} color={C.amber} style={styles.inputIcon} />
                    <TextInput
                      placeholder="e.g. 12"
                      placeholderTextColor={C.textMuted}
                      keyboardType="numeric"
                      style={styles.textInput}
                      value={totalSeats}
                      onChangeText={setTotalSeats}
                    />
                  </View>
                </View>
              </View>

              {/* Transport Mode (Merged feature) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>TRANSPORTATION MODE</Text>
                <View style={styles.inputWrapper}>
                  <Car size={16} color={C.blue} style={styles.inputIcon} />
                  <TextInput
                    placeholder="e.g. AC SUV / Sedan / Luxury Coach"
                    placeholderTextColor={C.textMuted}
                    style={styles.textInput}
                    value={transportMode}
                    onChangeText={setTransportMode}
                  />
                </View>
              </View>

              {/* PICKUP / MEETING POINT */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PICKUP / MEETING POINT</Text>
                <View style={styles.inputWrapper}>
                  <Navigation size={16} color={C.blue} style={styles.inputIcon} />
                  <TextInput
                    placeholder="e.g. Terminal 3 Exit Gate 4 or New Delhi Railway Station"
                    placeholderTextColor={C.textMuted}
                    style={styles.textInput}
                    value={meetingPoint}
                    onChangeText={setMeetingPoint}
                  />
                </View>
              </View>

              {/* MEETING DATE & TIME */}
              <View style={styles.gridRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>MEETING DATE *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.inputWrapper}
                    onPress={() => openDatePicker('meeting')}
                  >
                    <CalendarIcon size={16} color={C.purple} style={styles.inputIcon} />
                    <Text style={[styles.textInput, !meetingDate && { color: C.textMuted }]}>
                      {meetingDate || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>MEETING TIME *</Text>
                  <View style={styles.inputWrapper}>
                    <Clock size={16} color={C.amber} style={styles.inputIcon} />
                    <TextInput
                      placeholder="e.g. 10:00 AM"
                      placeholderTextColor={C.textMuted}
                      style={styles.textInput}
                      value={meetingTime}
                      onChangeText={setMeetingTime}
                    />
                  </View>
                </View>
              </View>

              {/* 6. INCLUDED SERVICES */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#06B6D4', '#0891B2']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>06</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Included Services</Text>
              </View>

              <View style={styles.amenitiesGrid}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.amenityCard, guideIncluded && styles.amenityCardActive]}
                  onPress={() => setGuideIncluded(!guideIncluded)}
                >
                  <View style={[styles.amenityIconCircle, guideIncluded && { backgroundColor: C.blue }]}>
                    <Compass size={16} color={guideIncluded ? C.white : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.amenityTitle, guideIncluded && styles.amenityTitleActive]}>
                      Verified Guide
                    </Text>
                    <Text style={styles.amenitySub}>Local Tour Leader</Text>
                  </View>
                  <View style={[styles.checkDot, guideIncluded && styles.checkDotActive]}>
                    {guideIncluded && <Check size={10} color={C.white} />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.amenityCard, foodIncluded && styles.amenityCardActive]}
                  onPress={() => setFoodIncluded(!foodIncluded)}
                >
                  <View style={[styles.amenityIconCircle, foodIncluded && { backgroundColor: C.purple }]}>
                    <Utensils size={16} color={foodIncluded ? C.white : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.amenityTitle, foodIncluded && styles.amenityTitleActive]}>
                      Meals & Food
                    </Text>
                    <Text style={styles.amenitySub}>Breakfast & Dinner</Text>
                  </View>
                  <View style={[styles.checkDot, foodIncluded && styles.checkDotActive]}>
                    {foodIncluded && <Check size={10} color={C.white} />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.amenityCard, hotelIncluded && styles.amenityCardActive]}
                  onPress={() => setHotelIncluded(!hotelIncluded)}
                >
                  <View style={[styles.amenityIconCircle, hotelIncluded && { backgroundColor: C.green }]}>
                    <Hotel size={16} color={hotelIncluded ? C.white : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.amenityTitle, hotelIncluded && styles.amenityTitleActive]}>
                      Hotel Stays
                    </Text>
                    <Text style={styles.amenitySub}>Rated 4★ Accommodations</Text>
                  </View>
                  <View style={[styles.checkDot, hotelIncluded && styles.checkDotActive]}>
                    {hotelIncluded && <Check size={10} color={C.white} />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.amenityCard, cabIncluded && styles.amenityCardActive]}
                  onPress={() => setCabIncluded(!cabIncluded)}
                >
                  <View style={[styles.amenityIconCircle, cabIncluded && { backgroundColor: C.amber }]}>
                    <Car size={16} color={cabIncluded ? C.white : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.amenityTitle, cabIncluded && styles.amenityTitleActive]}>
                      AC Vehicle
                    </Text>
                    <Text style={styles.amenitySub}>Dedicated Sightseeing</Text>
                  </View>
                  <View style={[styles.checkDot, cabIncluded && styles.checkDotActive]}>
                    {cabIncluded && <Check size={10} color={C.white} />}
                  </View>
                </TouchableOpacity>
              </View>

              {/* 7. PRIVACY & VISIBILITY */}
              <View style={styles.sectionHeaderRow}>
                <LinearGradient colors={['#EC4899', '#BE185D']} style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>07</Text>
                </LinearGradient>
                <Text style={styles.sectionTitle}>Privacy Settings</Text>
              </View>

              <View style={styles.privacyGrid}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.privacyCard, privacy === 'PUBLIC' && styles.privacyCardActive]}
                  onPress={() => setPrivacy('PUBLIC')}
                >
                  <Globe size={20} color={privacy === 'PUBLIC' ? C.blue : C.textMuted} />
                  <Text style={[styles.privacyTitle, privacy === 'PUBLIC' && styles.privacyTitleActive]}>Public</Text>
                  <Text style={styles.privacySub}>Open for all</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.privacyCard, privacy === 'PRIVATE' && styles.privacyCardActive]}
                  onPress={() => setPrivacy('PRIVATE')}
                >
                  <Lock size={20} color={privacy === 'PRIVATE' ? C.amber : C.textMuted} />
                  <Text style={[styles.privacyTitle, privacy === 'PRIVATE' && styles.privacyTitleActive]}>Private</Text>
                  <Text style={styles.privacySub}>Approval needed</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.privacyCard, privacy === 'INVITE_ONLY' && styles.privacyCardActive]}
                  onPress={() => setPrivacy('INVITE_ONLY')}
                >
                  <Mail size={20} color={privacy === 'INVITE_ONLY' ? C.purple : C.textMuted} />
                  <Text style={[styles.privacyTitle, privacy === 'INVITE_ONLY' && styles.privacyTitleActive]}>Invite Only</Text>
                  <Text style={styles.privacySub}>Link sharing</Text>
                </TouchableOpacity>
              </View>

              {/* TWO BUTTON ACTIONS at bottom */}
              <View style={styles.publishBtnRow}>
                <TouchableOpacity activeOpacity={0.9} style={styles.primaryPublishBtn} onPress={handleCreate}>
                  <LinearGradient
                    colors={['#3B82F6', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    <Sparkles size={16} color={C.white} />
                    <Text style={styles.submitText}>Publish Itinerary</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.85} style={styles.secondaryDraftBtn} onPress={handleSaveDraft}>
                  <Text style={styles.secondaryDraftBtnText}>Save Draft</Text>
                </TouchableOpacity>
              </View>

            </View>
          )}

          {/* ─── TAB 2: DYNAMIC DAY-BY-DAY VISUAL TIMELINE ────── */}
          {activeTab === 'TIMELINE' && (
            <View style={styles.timelineContainer}>
              <Text style={styles.timelineHeaderTitle}>
                Dynamic Day-by-Day Itinerary Timeline
              </Text>

              {parsedCities.length > 0 ? (
                parsedCities.map((loc, idx) => (
                  <View key={idx} style={styles.timelineItem}>
                    <View style={styles.timelineDotLine}>
                      <View
                        style={[
                          styles.timelineDot,
                          { backgroundColor: idx === 0 ? C.blue : idx === 1 ? C.green : C.amber },
                        ]}
                      />
                      {idx < parsedCities.length - 1 && <View style={styles.timelineVerticalLine} />}
                    </View>

                    <View style={styles.timelineContentCard}>
                      <Text style={styles.dayBadge}>DAY {idx + 1} • {loc.toUpperCase()}</Text>
                      <Text style={styles.timelineTitle}>
                        {idx === 0
                          ? `Departure & Arrival at ${loc}`
                          : `Sightseeing & Exploration at ${loc}`}
                      </Text>
                      <Text style={styles.timelineTime}>⏰ Morning & Afternoon Schedule</Text>
                      <Text style={styles.timelineDesc}>
                        {idx === 0
                          ? `Check in at the assembly/stay point, relax, and explore local spots.`
                          : `Guided tour of key attraction spots around ${loc}, photo sessions & group evening sunset view.`}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyTimelineCard}>
                  <Compass size={32} color={C.blue} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTimelineTitle}>Prepare Your Custom Itinerary</Text>
                  <Text style={styles.emptyTimelineSub}>
                    Enter stopover locations in the Plan tab (e.g. "Delhi, Jaipur, Udaipur") to automatically generate your day-by-day travel timeline here!
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ─── TAB 3: TRAVELERS & JOIN REQUESTS ────────────── */}
          {activeTab === 'TRAVELERS' && (
            <View style={styles.travelersContainer}>

              {/* CAPACITY SELECTOR */}
              <View style={styles.capacityBox}>
                <Text style={styles.boxTitle}>GROUP CAPACITY (CO-TRAVELERS)</Text>
                <View style={styles.capacityCounterRow}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => {
                      const curr = parseInt(totalSeats) || 0;
                      setTotalSeats(String(Math.max(1, curr - 1)));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>

                  <View style={styles.counterDisplay}>
                    <Text style={styles.counterValueText}>{totalSeats || '0'}</Text>
                    <Text style={styles.counterSubText}>Total Slots</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => {
                      const curr = parseInt(totalSeats) || 0;
                      setTotalSeats(String(curr + 1));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* TRIP TYPE SELECTION */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>TRIP TYPE</Text>
                <View style={styles.pillsRow}>
                  {['Solo', 'Couple', 'Family', 'Friends', 'Group', 'Business'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.categoryPill, selectedTripType === t && styles.categoryPillActive]}
                      onPress={() => setSelectedTripType(t)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.categoryPillText, selectedTripType === t && styles.categoryPillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* PENDING JOIN REQUESTS */}
              {privacy !== 'PRIVATE' && joinRequests.filter(req => req.status === 'PENDING').length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <UserPlus size={16} color={C.amber} />
                    <Text style={styles.sectionTitle}>
                      Pending Join Requests ({joinRequests.filter(req => req.status === 'PENDING').length})
                    </Text>
                  </View>

                  {joinRequests.filter(req => req.status === 'PENDING').map((req) => (
                    <View key={req.id} style={styles.requestItem}>
                      <View style={styles.reqAvatarWrap}>
                        <User size={15} color={C.white} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reqName}>{req.applicantName}</Text>
                        <Text style={styles.reqSub}>Requested to join group route</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleAcceptRequest(req.id, req.applicantName)}
                        activeOpacity={0.8}
                      >
                        <Check size={14} color='#FFF' />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleRejectRequest(req.id)}
                        activeOpacity={0.8}
                      >
                        <XCircle size={15} color='#EF4444' />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

            </View>
          )}

          {/* ─── TAB 4: ESSENTIAL CHECKLIST ──────────────────── */}
          {activeTab === 'CHECKLIST' && (
            <View style={styles.checklistContainer}>
              <Text style={styles.checklistTitle}>Essential Packing & Travel Documents Checklist</Text>
              <Text style={styles.checklistSub}>
                Review and tick off items before sharing the itinerary with co-travelers.
              </Text>

              {checklist.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  style={[styles.checklistCard, item.checked && styles.checklistCardChecked]}
                  onPress={() => toggleChecklist(item.id)}
                >
                  {item.checked ? (
                    <CheckSquare size={18} color={C.green} />
                  ) : (
                    <Square size={18} color={C.textMuted} />
                  )}
                  <Text style={[styles.checkItemText, item.checked && styles.checkItemTextChecked]}>
                    {item.item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ════════════════════════════════════════════════
          INTERACTIVE DATE PICKER CALENDAR MODAL
          ════════════════════════════════════════════════ */}
        {/* ════════════════════════════════════════════════
          INTERACTIVE DATE PICKER CALENDAR MODAL
          ════════════════════════════════════════════════ */}
        {activeDatePicker && (
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalCard}>
              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity style={styles.monthNavBtn} onPress={handlePrevMonth}>
                  <Text style={styles.monthNavText}>◀</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.calendarHeaderTitle}>
                    Select {activeDatePicker.toUpperCase()} Date
                  </Text>
                  <Text style={styles.calendarMonthText}>
                    {new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </Text>
                </View>
                <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth}>
                  <Text style={styles.monthNavText}>▶</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveDatePicker(null)}>
                  <X size={16} color={C.white} />
                </TouchableOpacity>
              </View>

              {/* Days Grid Headers */}
              <View style={styles.weekDaysRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <Text key={i} style={styles.weekDayText}>{day}</Text>
                ))}
              </View>

              {/* Days Grid Items */}
              <View style={styles.daysGrid}>
                {(() => {
                  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
                  const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                  const cells = [];

                  // 1. Spacers for prefix weekdays
                  for (let s = 0; s < firstDayOfMonth; s++) {
                    cells.push(<View key={`empty-${s}`} style={styles.dayCellEmpty} />);
                  }

                  // 2. Days of month
                  for (let d = 1; d <= totalDays; d++) {
                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    let isSelected = false;
                    if (activeDatePicker === 'start') isSelected = startDate === dateStr;
                    else if (activeDatePicker === 'end') isSelected = endDate === dateStr;
                    else if (activeDatePicker === 'meeting') isSelected = meetingDate === dateStr;

                    cells.push(
                      <TouchableOpacity
                        key={`day-${d}`}
                        style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                        onPress={() => selectCalendarDay(d)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return cells;
                })()}
              </View>

              <TouchableOpacity
                style={styles.calendarConfirmBtn}
                onPress={() => setActiveDatePicker(null)}
              >
                <Text style={styles.calendarConfirmText}>Confirm Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════
          MY CREATIONS MODAL
          ════════════════════════════════════════════════ */}
        <Modal
          visible={showCreationsModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCreationsModal(false)}
        >
          <View style={styles.creationsModalOverlay}>
            <LinearGradient
              colors={['#0F1225', '#080A12']}
              style={styles.creationsModalCard}
            >
              {/* Header */}
              <View style={styles.creationsHeader}>
                <View>
                  <Text style={styles.creationsHeaderTitle}>Published Route Creations</Text>
                  <Text style={styles.creationsHeaderSub}>Verify bookings and accept join requests</Text>
                </View>
                <TouchableOpacity
                  style={styles.creationsCloseBtn}
                  onPress={() => setShowCreationsModal(false)}
                >
                  <X size={16} color={C.white} />
                </TouchableOpacity>
              </View>

              {/* List */}
              {(() => {
                const myTrips = trips.filter(t => !!(profile && profile.id && t.creatorId === profile.id));
                if (myTrips.length === 0) {
                  return (
                    <View style={styles.emptyCreations}>
                      <Sparkles size={36} color='#64748B' style={{ marginBottom: 12 }} />
                      <Text style={styles.emptyCreationsTitle}>No Creations Yet</Text>
                      <Text style={styles.emptyCreationsSub}>
                        Use the Plan tab to publish your first group tour route itinerary.
                      </Text>
                    </View>
                  );
                }

                return (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.creationsListScroll}>
                    {myTrips.map((trip) => {
                      const isCustomImage = trip.coverImage && (trip.coverImage.startsWith('http') || trip.coverImage.startsWith('file'));
                      const displayImage = isCustomImage ? trip.coverImage : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600';

                      return (
                        <TouchableOpacity
                          key={trip.id}
                          style={styles.creationCard}
                          onPress={() => {
                            setSelectedCreation(trip);
                            fetchCreationMembers(trip.id);
                          }}
                          activeOpacity={0.85}
                        >
                          <Image source={{ uri: displayImage }} style={styles.creationCardImg} />
                          <View style={styles.creationCardInfo}>
                            <View style={styles.creationCardHeader}>
                              <Text style={styles.creationCardTitle} numberOfLines={1}>
                                {trip.name}
                              </Text>
                              {(() => {
                                const tripPendingCount = joinRequests.filter(
                                  (req) => req.tripId === trip.id && req.status === 'PENDING'
                                ).length;
                                if (tripPendingCount === 0) return null;
                                return (
                                  <View style={styles.requestNotifyIndicator}>
                                    <Text style={styles.requestNotifyText}>
                                      {tripPendingCount} Pending Request{tripPendingCount !== 1 ? 's' : ''}
                                    </Text>
                                  </View>
                                );
                              })()}
                              <View style={styles.creationCategoryBadge}>
                                <Text style={styles.creationCategoryText}>{trip.category || 'Tour'}</Text>
                              </View>
                            </View>

                            <View style={styles.creationRouteRow}>
                              <MapPin size={11} color={C.blue} />
                              <Text style={styles.creationRouteText} numberOfLines={1}>
                                {trip.cities.join(' ➔ ')}
                              </Text>
                            </View>

                            <View style={styles.creationStatsRow}>
                              <View style={styles.creationStat}>
                                <Text style={styles.creationStatLabel}>BUDGET</Text>
                                <Text style={styles.creationStatVal}>₹{trip.budget.toLocaleString('en-IN')}</Text>
                              </View>
                              <View style={styles.creationStat}>
                                <Text style={styles.creationStatLabel}>SLOTS</Text>
                                <Text style={styles.creationStatVal}>{trip.availableSeats} Left</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                );
              })()}

            </LinearGradient>
          </View>
        </Modal>

        {/* ════════════════════════════════════════════════
          MY CREATIONS DETAIL INSPECTOR DRAWER MODAL
          ════════════════════════════════════════════════ */}
        {selectedCreation && (
          <Modal
            visible={!!selectedCreation}
            transparent
            animationType="slide"
            onRequestClose={() => setSelectedCreation(null)}
          >
            <View style={styles.creationDetailOverlay}>
              <View style={[styles.creationDetailCard, { backgroundColor: '#0B0D19', borderColor: '#1E243B' }]}>
                {/* Header */}
                <View style={styles.creationDetailHeader}>
                  <TouchableOpacity
                    style={styles.detailBackBtn}
                    onPress={() => setSelectedCreation(null)}
                  >
                    <Text style={styles.detailBackBtnText}>✕ Close</Text>
                  </TouchableOpacity>
                  <Text style={styles.detailHeaderTitle}>Itinerary Overview</Text>
                  <View style={{ width: 60 }} />
                </View>

                {/* Content Scroll */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                  {/* Visual Banner */}
                  <View style={styles.detailBannerContainer}>
                    <Image
                      source={{
                        uri: selectedCreation.coverImage && (selectedCreation.coverImage.startsWith('http') || selectedCreation.coverImage.startsWith('file'))
                          ? selectedCreation.coverImage
                          : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600'
                      }}
                      style={styles.detailBannerImg}
                    />
                    <LinearGradient colors={['transparent', 'rgba(11,13,25,0.95)']} style={StyleSheet.absoluteFill} />
                    <View style={styles.detailCategoryPill}>
                      <Text style={styles.detailCategoryText}>{selectedCreation.category || 'Adventure'}</Text>
                    </View>
                  </View>

                  {/* Title & Desc */}
                  <Text style={styles.detailTripName}>{selectedCreation.name}</Text>
                  <Text style={styles.detailOrganizerText}>Organized by {selectedCreation.creator}</Text>

                  <TouchableOpacity
                    style={styles.viewOnMapHeaderBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedCreation(null);
                      setShowCreationsModal(false);
                      router.push({ pathname: '/map', params: { tripId: selectedCreation.id } });
                    }}
                  >
                    <Compass size={12} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.viewOnMapHeaderBtnText}>View Route on Map</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.viewOnMapHeaderBtn,
                      { marginTop: 10, backgroundColor: selectedCreation.chatRoomId ? '#10B981' : '#374151' }
                    ]}
                    activeOpacity={0.8}
                    disabled={!selectedCreation.chatRoomId}
                    onPress={() => {
                      if (selectedCreation.chatRoomId) {
                        setActiveRoomId(selectedCreation.chatRoomId);
                        setSelectedCreation(null);
                        setShowCreationsModal(false);
                        router.push('/chat');
                      }
                    }}
                  >
                    <MessageSquare size={12} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.viewOnMapHeaderBtnText}>
                      {selectedCreation.chatRoomId ? 'Open Group Chat' : 'Chat room setup pending'}
                    </Text>
                  </TouchableOpacity>

                  {/* Cities stops */}
                  <Text style={styles.detailSectionTitle}>ITINERARY FLOW</Text>
                  <View style={styles.detailRouteFlow}>
                    {selectedCreation.cities.map((city: string, idx: number) => (
                      <React.Fragment key={idx}>
                        <View style={styles.detailCityChip}>
                          <MapPin size={10} color='#3B82F6' />
                          <Text style={styles.detailCityText}>{city}</Text>
                        </View>
                        {idx < selectedCreation.cities.length - 1 && (
                          <Text style={styles.detailArrow}>➔</Text>
                        )}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* Details stats */}
                  <Text style={styles.detailSectionTitle}>TRIP LOGISTICS & DETAILS</Text>
                  <View style={styles.detailStatsGrid}>
                    <View style={styles.detailStatCell}>
                      <Text style={styles.detailStatLabel}>START DATE</Text>
                      <Text style={styles.detailStatVal}>{selectedCreation.startDate}</Text>
                    </View>
                    <View style={styles.detailStatCell}>
                      <Text style={styles.detailStatLabel}>END DATE</Text>
                      <Text style={styles.detailStatVal}>{selectedCreation.endDate || selectedCreation.startDate}</Text>
                    </View>
                    <View style={styles.detailStatCell}>
                      <Text style={styles.detailStatLabel}>BUDGET</Text>
                      <Text style={[styles.detailStatVal, { color: '#10B981' }]}>₹{selectedCreation.budget.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.detailStatCell}>
                      <Text style={styles.detailStatLabel}>AVAILABILITY</Text>
                      <Text style={[styles.detailStatVal, { color: '#F59E0B' }]}>{selectedCreation.availableSeats} / {selectedCreation.totalSeats} Slots</Text>
                    </View>
                  </View>

                  {/* Meeting point */}
                  <Text style={styles.detailSectionTitle}>ASSEMBLY / DEPARTURE</Text>
                  <View style={styles.detailMeetingCard}>
                    <MapPin size={14} color='#3B82F6' />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailMeetingText}>{selectedCreation.meetingPoint}</Text>
                      <Text style={styles.detailMeetingSub}>Please report 30 mins before time.</Text>
                    </View>
                  </View>

                  {/* Included Services */}
                  <Text style={styles.detailSectionTitle}>SERVICES INCLUDED</Text>
                  <View style={styles.detailInclusionsRow}>
                    <View style={[styles.detailInclusionCell, { opacity: selectedCreation.guideIncluded ? 1 : 0.4 }]}>
                      <Compass size={12} color={selectedCreation.guideIncluded ? '#10B981' : '#64748B'} />
                      <Text style={styles.detailInclusionText}>Local Guide</Text>
                    </View>
                    <View style={[styles.detailInclusionCell, { opacity: selectedCreation.foodIncluded ? 1 : 0.4 }]}>
                      <Utensils size={12} color={selectedCreation.foodIncluded ? '#10B981' : '#64748B'} />
                      <Text style={styles.detailInclusionText}>Meals / Food</Text>
                    </View>
                    <View style={[styles.detailInclusionCell, { opacity: selectedCreation.hotelIncluded !== false ? 1 : 0.4 }]}>
                      <Hotel size={12} color={selectedCreation.hotelIncluded !== false ? '#10B981' : '#64748B'} />
                      <Text style={styles.detailInclusionText}>Hotel Stay</Text>
                    </View>
                  </View>

                  {/* PENDING JOIN REQUESTS */}
                  {joinRequests.filter(req => req.tripId === selectedCreation.id && req.status === 'PENDING').length > 0 && (
                    <>
                      <Text style={styles.detailSectionTitle}>
                        PENDING JOIN REQUESTS ({joinRequests.filter(req => req.tripId === selectedCreation.id && req.status === 'PENDING').length})
                      </Text>
                      {joinRequests
                        .filter(req => req.tripId === selectedCreation.id && req.status === 'PENDING')
                        .map((req) => (
                          <View key={req.id} style={styles.detailRequestItem}>
                            <View style={styles.detailReqAvatarWrap}>
                              <User size={14} color={C.white} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailReqName}>{req.applicantName}</Text>
                              <Text style={styles.detailReqSub}>Wants to join this trip</Text>
                            </View>
                            <View style={styles.detailReqActionRow}>
                              <TouchableOpacity
                                style={styles.detailAcceptBtn}
                                onPress={() => handleAcceptRequest(req.id, req.applicantName)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.detailAcceptText}>Accept</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.detailRejectBtn}
                                onPress={() => handleRejectRequest(req.id)}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.detailRejectText}>Decline</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                    </>
                  )}
                  {/* CONFIRMED TRAVELERS */}
                  {creationMembers.length > 0 && (
                    <>
                      <Text style={styles.detailSectionTitle}>CONFIRMED TRAVELERS ({creationMembers.length})</Text>
                      <View style={{ gap: 8, marginTop: 6 }}>
                        {creationMembers.map((p) => (
                          <View key={p.id} style={styles.detailRequestItem}>
                            <View style={styles.detailReqAvatarWrap}>
                              {p.avatar ? (
                                <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                              ) : (
                                <User size={14} color={C.white} />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailReqName}>{p.name}</Text>
                              <Text style={styles.detailReqSub}>{p.isCreator ? 'Organizer / Creator' : 'Confirmed Traveler'}</Text>
                            </View>
                            {p.isCreator && (
                              <View style={styles.creatorBadge}>
                                <Text style={styles.creatorBadgeText}>CREATOR</Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 140,
  },
  heroWrap: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: 160,
    justifyContent: 'center',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 17,
  },

  formContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 14,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.2,
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textSec,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: C.white,
    padding: 0,
  },
  helperText: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 4,
    marginLeft: 2,
  },

  chipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    marginBottom: 6,
  },
  chipHeaderLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
    letterSpacing: 0.3,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  quickDestChip: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  quickDestText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.white,
  },

  routeFlowCard: {
    backgroundColor: '#181C2E',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  routeFlowTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: C.blue,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  routePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  cityPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.white,
  },

  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },

  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  amenityCard: {
    width: (SCREEN_WIDTH - 76) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  amenityCardActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: C.blue,
  },
  amenityIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amenityTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSec,
  },
  amenityTitleActive: {
    color: C.white,
    fontWeight: '700',
  },
  amenitySub: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 1,
  },
  checkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },

  privacyGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  privacyCard: {
    flex: 1,
    backgroundColor: '#181C2E',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  privacyCardActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: C.blue,
  },
  privacyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    marginTop: 6,
  },
  privacyTitleActive: {
    color: C.white,
  },
  privacySub: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  submitBtnWrap: {
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },

  // Date Picker Modal Styles
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 999,
  },
  calendarModalCard: {
    width: '100%',
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  calendarMonthText: {
    fontSize: 12,
    color: C.blue,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    width: 32,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  dayCellSelected: {
    backgroundColor: C.blue,
    borderRadius: 18,
  },
  dayCellText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: C.white,
  },
  dayCellTextSelected: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calendarConfirmBtn: {
    backgroundColor: C.blue,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  calendarConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
  monthNavBtn: {
    padding: 8,
  },
  monthNavText: {
    fontSize: 14,
    color: C.blue,
  },

  // ── Cover Photo Redesign styles ──
  coverSectionWrap: {
    marginBottom: 16,
  },
  galleryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  galleryCardSelected: {
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.02)',
  },
  galleryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59,130,246,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  galleryIconCircleSelected: {
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  galleryCardContent: {
    flex: 1,
  },
  galleryCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
    marginBottom: 2,
  },
  galleryCardSub: {
    fontSize: 9.5,
    color: C.textMuted,
    lineHeight: 13,
  },
  galleryChevron: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  galleryChevronSelected: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  galleryChevronText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.blue,
  },
  galleryChevronTextSelected: {
    color: C.green,
  },
  coverDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  coverDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  coverDividerText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.textMuted,
    paddingHorizontal: 12,
    letterSpacing: 0.6,
  },
  presetsList: {
    gap: 8,
  },
  presetChip: {
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetChipActive: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: C.blue,
  },
  presetChipText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: C.white,
    fontWeight: '700',
  },

  // ── Gallery pick button on Hero ──
  galleryPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  galleryPickBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.white,
  },

  // ── Category Chips selector styles ──
  categoryRow: {
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#181C2E',
    borderWidth: 1,
    borderColor: '#252D4A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: C.blue,
  },
  categoryChipIcon: {
    fontSize: 13,
  },
  categoryChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: C.white,
    fontWeight: '700',
  },

  // ── Two Actions Button block ──
  publishBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryPublishBtn: {
    flex: 2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  secondaryDraftBtn: {
    flex: 1,
    backgroundColor: '#181C2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252D4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDraftBtnText: {
    fontSize: 13.5,
    color: C.white,
    fontWeight: '700',
  },

  // ── Tab Switcher Row ──
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#111422',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1E243B',
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.textSec,
  },
  tabTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  // ── Timeline Tab Styles ──
  timelineContainer: {
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E243B',
  },
  timelineHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.white,
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineDotLine: {
    alignItems: 'center',
    width: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  timelineVerticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#252D4A',
    marginVertical: 4,
  },
  timelineContentCard: {
    flex: 1,
    backgroundColor: '#181C2E',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#252D4A',
    marginBottom: 12,
  },
  dayBadge: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timelineTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
    marginBottom: 4,
  },
  timelineTime: {
    fontSize: 10,
    color: C.amber,
    marginBottom: 6,
  },
  timelineDesc: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
  },
  emptyTimelineCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTimelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    marginBottom: 6,
  },
  emptyTimelineSub: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── Travelers Tab Styles ──
  travelersContainer: {
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E243B',
  },
  capacityBox: {
    backgroundColor: '#181C2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252D4A',
    marginBottom: 16,
  },
  boxTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: C.textSec,
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  capacityCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  counterBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#111422',
    borderWidth: 1,
    borderColor: '#252D4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 20,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  counterDisplay: {
    alignItems: 'center',
  },
  counterValueText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  counterSubText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryPill: {
    backgroundColor: '#181C2E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: '#3B82F6',
  },
  categoryPillText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  participantsList: {
    gap: 8,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  creatorBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  creatorBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#F59E0B',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252D4A',
    marginBottom: 8,
  },
  reqAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  reqSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },

  // ── Checklist Tab Styles ──
  checklistContainer: {
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E243B',
  },
  checklistTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  checklistSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginBottom: 20,
  },
  checklistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  checklistCardChecked: {
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.04)',
  },
  checkItemText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
    flex: 1,
  },
  checkItemTextChecked: {
    color: '#10B981',
    fontWeight: '600',
  },

  // ── Organizer Operations Notification Banner styles ──
  notificationBannerTouch: {
    marginBottom: 20,
    borderRadius: 18,
    overflow: 'hidden',
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  notificationBannerActive: {
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  notificationMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  notificationIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  notificationIconWrapAlert: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  notificationRedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  notificationTextColumn: {
    flex: 1,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2.5,
  },
  notificationAppName: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  notificationTime: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '500',
    marginRight: 6,
  },
  notificationTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  notificationDescText: {
    fontSize: 10.5,
    color: '#94A3B8',
    lineHeight: 14,
  },
  notificationAlertPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  notificationAlertPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.2,
  },
  sectionDividerWrap: {
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionDividerTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sectionDividerSub: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },

  // ── Creations list modal styles ──
  creationsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  creationsModalCard: {
    width: '100%',
    height: '80%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  creationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 14,
  },
  creationsHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  creationsHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  creationsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCreations: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyCreationsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptyCreationsSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 32,
  },
  creationsListScroll: {
    paddingBottom: 40,
    gap: 12,
  },
  creationCard: {
    flexDirection: 'row',
    backgroundColor: '#181C2E',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#252D4A',
    height: 100,
  },
  creationCardImg: {
    width: 90,
    height: '100%',
  },
  creationCardInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  creationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  creationCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
    flex: 1,
  },
  requestNotifyIndicator: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  requestNotifyText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
  },
  creationCategoryBadge: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  creationCategoryText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#3B82F6',
  },
  creationRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  creationRouteText: {
    fontSize: 10.5,
    color: '#94A3B8',
    flex: 1,
  },
  creationStatsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  creationStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creationStatLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  creationStatVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },

  // ── Creation Details overlay and modal styles ──
  creationDetailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  creationDetailCard: {
    width: '100%',
    height: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 16,
  },
  creationDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  detailBackBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailBackBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  detailHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  detailBannerContainer: {
    width: '100%',
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  detailBannerImg: {
    width: '100%',
    height: '100%',
  },
  detailCategoryPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(59,130,246,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailCategoryText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  detailTripName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    lineHeight: 24,
    marginBottom: 4,
  },
  detailOrganizerText: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 18,
  },
  detailSectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 10,
  },
  detailRouteFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#181C2E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  detailCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  detailCityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  detailArrow: {
    fontSize: 11,
    color: '#64748B',
  },
  detailStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailStatCell: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: '#181C2E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  detailStatLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  detailStatVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  detailMeetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
  },
  detailMeetingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    lineHeight: 16,
  },
  detailMeetingSub: {
    fontSize: 9.5,
    color: '#64748B',
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
    backgroundColor: '#181C2E',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#252D4A',
  },
  detailInclusionText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  detailRequestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252D4A',
    marginBottom: 8,
  },
  detailReqAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailReqName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  detailReqSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  detailReqActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailAcceptBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailAcceptText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailRejectBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailRejectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  mapPreviewWrap: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E243B',
  },
  viewOnMapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 5,
  },
  viewOnMapHeaderBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default memo(CreateTripScreen);
