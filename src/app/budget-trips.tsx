import { Trip, useApp } from '@/store/AppContext';
import TripDetailModal from '@/components/TripDetailModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Compass,
  Flame,
  IndianRupee,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Check,
  ChevronRight,
  Bus,
  Bike,
  Clock
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
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

const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#EC4899',
};

const PRESET_BUDGETS = [5000, 10000, 15000, 25000, 50000];

export interface BudgetTripItem {
  id: string;
  title: string;
  organizerName: string;
  organizerType: 'TOURIST_GUIDE' | 'GROUP_ORGANIZER' | 'INDIVIDUAL_TOURIST';
  organizerAvatar: string;
  verified: boolean;
  pricePerPerson: number;
  placesCoveredCount: number;
  distanceKm: number;
  cities: string[];
  startDate: string;
  endDate: string;
  availableSeats: number;
  totalSeats: number;
  imageUrl: any;
  isBestValueDeal?: boolean;
  dealTagline?: string;
  meetingPoint: string;
  rating: number;
  creatorId?: string;
}

const TRIP_IMAGES: Record<string, any> = {
  'trip-1': require('@/assets/images/spiritual-journey.png'),
  'trip-2': require('@/assets/images/leh-expedition.jpg'),
  'trip-3': require('@/assets/images/kerala.jpg'),
};

const BUDGET_TRIPS_DATA: BudgetTripItem[] = [
  {
    id: 'bt-1',
    title: 'Golden Triangle Expedition (Delhi ➔ Agra ➔ Jaipur)',
    organizerName: 'Rajesh Kumar (Certified Guide)',
    organizerType: 'TOURIST_GUIDE',
    organizerAvatar: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&q=80',
    verified: true,
    pricePerPerson: 11900,
    placesCoveredCount: 7,
    distanceKm: 540,
    cities: ['Delhi', 'Agra', 'Jaipur'],
    startDate: '2026-08-12',
    endDate: '2026-08-16',
    availableSeats: 4,
    totalSeats: 10,
    imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    isBestValueDeal: true,
    dealTagline: '🔥 BEST VALUE DEAL: 3 Major Cities & 7 Tourist Spots in ₹11.9k!',
    meetingPoint: 'New Delhi Railway Station Gate 2',
    rating: 4.9,
  },
  {
    id: 'bt-2',
    title: 'Varanasi Spiritual Ghats & Sarnath Heritage Tour',
    organizerName: 'Anjali Sharma (Local Guide)',
    organizerType: 'TOURIST_GUIDE',
    organizerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80',
    verified: true,
    pricePerPerson: 6500,
    placesCoveredCount: 5,
    distanceKm: 310,
    cities: ['Varanasi', 'Sarnath'],
    startDate: '2026-08-18',
    endDate: '2026-08-20',
    availableSeats: 6,
    totalSeats: 12,
    imageUrl: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800&q=80',
    isBestValueDeal: true,
    dealTagline: '✨ ULTRA BUDGET: Spiritual Boat Ride & Food Tour in ₹6.5k!',
    meetingPoint: 'Dashashwamedh Ghat Varanasi',
    rating: 4.8,
  },
  {
    id: 'bt-3',
    title: 'Ranchi-Vrindavan Group Yatra & Mathura Temples',
    organizerName: 'Vikram Singh (Group Organizer)',
    organizerType: 'GROUP_ORGANIZER',
    organizerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80',
    verified: true,
    pricePerPerson: 8500,
    placesCoveredCount: 6,
    distanceKm: 850,
    cities: ['Ranchi', 'Mathura', 'Vrindavan'],
    startDate: '2026-08-22',
    endDate: '2026-08-27',
    availableSeats: 5,
    totalSeats: 15,
    imageUrl: 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?w=800&q=80',
    isBestValueDeal: true,
    dealTagline: '🚩 LONG DISTANCE YATRA: 850 km Journey in ₹8.5k!',
    meetingPoint: 'Ranchi Railway Station',
    rating: 4.9,
  },
  {
    id: 'bt-4',
    title: 'Kashmir Backpacking (Srinagar, Gulmarg & Pahalgam)',
    organizerName: 'Aarav Sharma (Solo Traveler/User)',
    organizerType: 'INDIVIDUAL_TOURIST',
    organizerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
    verified: false,
    pricePerPerson: 14500,
    placesCoveredCount: 6,
    distanceKm: 680,
    cities: ['Srinagar', 'Gulmarg', 'Pahalgam'],
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    availableSeats: 3,
    totalSeats: 6,
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    isBestValueDeal: false,
    dealTagline: '🏔️ Budget Houseboat & Snow Trek Combo',
    meetingPoint: 'Srinagar Airport Gate 1',
    rating: 4.7,
  },
  {
    id: 'bt-5',
    title: 'Goa Beach Hopping & Dudhsagar Waterfalls Road Trip',
    organizerName: 'Priya & Friends (Tourist Group)',
    organizerType: 'INDIVIDUAL_TOURIST',
    organizerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80',
    verified: false,
    pricePerPerson: 9800,
    placesCoveredCount: 5,
    distanceKm: 420,
    cities: ['North Goa', 'South Goa', 'Dudhsagar'],
    startDate: '2026-08-28',
    endDate: '2026-09-01',
    availableSeats: 2,
    totalSeats: 8,
    imageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80',
    isBestValueDeal: false,
    dealTagline: '🏖️ Beach & Waterfall Getaway',
    meetingPoint: 'Mapusa Bus Terminal Goa',
    rating: 4.6,
  },
];

export default function BudgetTripsScreen() {
  const router = useRouter();
  const { trips, joinTrip, profile, isLoggedIn } = useApp();

  const [userMaxBudget, setUserMaxBudget] = useState<number>(50000);
  const [budgetTextInput, setBudgetTextInput] = useState<string>('50000');
  const [selectedOrgType, setSelectedOrgType] = useState<'ALL' | 'TOURIST_GUIDE' | 'GROUP_ORGANIZER' | 'INDIVIDUAL_TOURIST'>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleBudgetChange = (text: string) => {
    setBudgetTextInput(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && parsed > 0) {
      setUserMaxBudget(parsed);
    }
  };

  const selectPresetBudget = (val: number) => {
    setUserMaxBudget(val);
    setBudgetTextInput(val.toString());
  };

  // Map trips dynamically from our database state!
  const mappedTrips: BudgetTripItem[] = trips.map((t) => {
    // Map preset details strictly by ID to prevent fuzzy city hijacking!
    let staticId = t.id;
    if (t.id === 'trip-1') staticId = 'bt-3';
    else if (t.id === 'creation-2') staticId = 'bt-1';

    const staticItem = BUDGET_TRIPS_DATA.find((item) => item.id === staticId);
    const isUserCreation = isLoggedIn && !!(profile && profile.id && t.creatorId && t.creatorId === profile.id);

    if (staticItem) {
      return {
        ...staticItem,
        id: t.id,
        title: t.name,
        organizerName: t.creator,
        creatorId: t.creatorId,
        organizerType: isUserCreation ? 'INDIVIDUAL_TOURIST' : staticItem.organizerType,
        pricePerPerson: t.budget,
        availableSeats: t.availableSeats,
        totalSeats: t.totalSeats,
        imageUrl: TRIP_IMAGES[t.id] || staticItem.imageUrl,
      };
    }

    return {
      id: t.id,
      title: t.name,
      organizerName: t.creator,
      creatorId: t.creatorId,
      organizerType: isUserCreation
        ? 'INDIVIDUAL_TOURIST'
        : t.guideIncluded
        ? 'TOURIST_GUIDE'
        : 'GROUP_ORGANIZER',
      organizerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
      verified: t.creator === 'Aarav Sharma' || t.creator.includes('Organizer') || t.creator.includes('Guide'),
      pricePerPerson: t.budget,
      placesCoveredCount: t.cities.length,
      distanceKm: t.cities.length * 115,
      cities: t.cities,
      startDate: t.startDate,
      endDate: t.endDate || t.startDate,
      availableSeats: t.availableSeats,
      totalSeats: t.totalSeats,
      imageUrl: t.coverImage || TRIP_IMAGES[t.id] || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
      isBestValueDeal: t.budget < 15000,
      dealTagline: t.budget < 10000 ? '🚩 BEST VALUE BUDGET TRIP!' : undefined,
      meetingPoint: t.meetingPoint,
      rating: 4.8,
    };
  });

  // Filter trips matching user's budget and organizer filter
  const filteredTrips = mappedTrips.filter((trip) => {
    const matchesBudget = trip.pricePerPerson <= userMaxBudget;
    const matchesOrg = selectedOrgType === 'ALL' || trip.organizerType === selectedOrgType;
    return matchesBudget && matchesOrg;
  });

  const bestValueDeals = mappedTrips.filter((t) => t.isBestValueDeal && t.pricePerPerson <= userMaxBudget);

  const handleJoinTrip = (trip: any) => {
    const originalTrip = trips.find((t) => t.id === trip.id) || trip;
    setSelectedTrip(originalTrip);
    setShowJoinModal(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* TOP NAV BAR */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.topNavTitle}>Budget Trips Finder</Text>
          <View style={styles.budgetBadge}>
            <IndianRupee size={13} color={C.amber} />
            <Text style={styles.budgetBadgeText}>₹{userMaxBudget.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* ════════════════════════════════════════════════
            INTERACTIVE USER BUDGET FILTER CARD
            ════════════════════════════════════════════════ */}
        <View style={styles.filterCard}>
          <View style={styles.filterHeaderRow}>
            <View style={styles.filterIconWrap}>
              <IndianRupee size={18} color={C.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterCardTitle}>ENTER YOUR MAXIMUM BUDGET (₹)</Text>
              <Text style={styles.filterCardSub}>Showing active ongoing trips organized within your budget</Text>
            </View>
          </View>

          {/* Budget Input Box */}
          <View style={styles.inputWrapper}>
            <IndianRupee size={16} color={C.amber} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={budgetTextInput}
              onChangeText={handleBudgetChange}
              placeholder="Enter budget e.g. 15000"
              placeholderTextColor={C.textMuted}
            />
            <TouchableOpacity style={styles.applyBtn} onPress={() => showToast(`🔍 Filtered trips under ₹${userMaxBudget}`)}>
              <Text style={styles.applyBtnText}>Search Trips</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Preset Budget Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {PRESET_BUDGETS.map((b) => {
              const isSelected = userMaxBudget === b;
              return (
                <TouchableOpacity
                  key={b}
                  style={[styles.presetPill, isSelected && styles.presetPillActive]}
                  onPress={() => selectPresetBudget(b)}
                >
                  <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                    ≤ ₹{(b / 1000).toFixed(0)}k
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ORGANIZER TYPE TABS (GUIDES, GROUP ORGANIZERS, TOURISTS) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orgTabsRow}>
          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'ALL' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('ALL')}
          >
            <Compass size={13} color={selectedOrgType === 'ALL' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'ALL' && styles.orgTabTextActive]}>All Trips</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'TOURIST_GUIDE' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('TOURIST_GUIDE')}
          >
            <Briefcase size={13} color={selectedOrgType === 'TOURIST_GUIDE' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'TOURIST_GUIDE' && styles.orgTabTextActive]}>
              Tourist Guides
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'GROUP_ORGANIZER' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('GROUP_ORGANIZER')}
          >
            <Users size={13} color={selectedOrgType === 'GROUP_ORGANIZER' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'GROUP_ORGANIZER' && styles.orgTabTextActive]}>
              Group Organizers
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'INDIVIDUAL_TOURIST' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('INDIVIDUAL_TOURIST')}
          >
            <User size={13} color={selectedOrgType === 'INDIVIDUAL_TOURIST' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'INDIVIDUAL_TOURIST' && styles.orgTabTextActive]}>
              User/Tourists
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ════════════════════════════════════════════════
            HIGH DISTANCE & MULTI-LOCATION BEST VALUE DEALS
            ════════════════════════════════════════════════ */}
        {bestValueDeals.length > 0 && (
          <View style={styles.dealsSection}>
            <View style={styles.dealsHeaderRow}>
              <Flame size={18} color={C.amber} />
              <Text style={styles.dealsTitle}>🔥 Multi-Location & Long Distance Best Deals</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealsRow}>
              {bestValueDeals.map((deal) => (
                <TouchableOpacity
                  key={deal.id}
                  activeOpacity={0.85}
                  style={styles.dealCard}
                  onPress={() => router.push({ pathname: '/map', params: { tripId: deal.id } })}
                >
                  <Image source={typeof deal.imageUrl === 'string' ? { uri: deal.imageUrl } : deal.imageUrl} style={styles.dealImg} />
                  <LinearGradient colors={['rgba(6,8,20,0.2)', 'rgba(6,8,20,0.95)']} style={StyleSheet.absoluteFill} />

                  <View style={styles.dealBadgePill}>
                    <Flame size={10} color={C.amber} />
                    <Text style={styles.dealBadgeText}>BEST VALUE DEAL</Text>
                  </View>

                  <Text style={styles.dealTitle} numberOfLines={2}>{deal.title}</Text>

                  <View style={styles.dealMetaRow}>
                    <Text style={styles.dealPriceText}>₹{deal.pricePerPerson.toLocaleString('en-IN')}</Text>
                    <Text style={styles.dealDistanceText}>📍 {deal.distanceKm} km • {deal.placesCoveredCount} Places</Text>
                  </View>

                  <View style={styles.dealTagBox}>
                    <Text style={styles.dealTagText}>{deal.dealTagline}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ════════════════════════════════════════════════
            FILTERED BUDGET TRIPS LIST
            ════════════════════════════════════════════════ */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>
            Trips Matching ≤ ₹{userMaxBudget.toLocaleString('en-IN')} ({filteredTrips.length})
          </Text>
        </View>

        {filteredTrips.length > 0 ? (
          filteredTrips.map((trip) => {
            const savings = userMaxBudget - trip.pricePerPerson;
            const isMyTrip = isLoggedIn && !!(profile && profile.id && trip.creatorId && trip.creatorId === profile.id);
            const imageSource = typeof trip.imageUrl === 'string' ? { uri: trip.imageUrl } : trip.imageUrl;
            
            const duration = '5 Nights / 6 Days';
            const transport = trip.title.toLowerCase().includes('bike') ? 'Royal Enfield Bike' : 'AC Tour Bus';

            return (
              <TouchableOpacity
                key={trip.id}
                activeOpacity={0.85}
                onPress={() => handleJoinTrip(trip)}
                style={[
                  styles.tripCard,
                  { backgroundColor: C.card, borderColor: C.border },
                  isMyTrip && { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }
                ]}
              >
                {isMyTrip && (
                  <LinearGradient
                    colors={['#3B0764', '#13042A', '#06010F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                  />
                )}
                {/* Left side: Image */}
                <View style={styles.tripImageContainer}>
                  <Image source={imageSource} style={styles.tripImage} />
                  <LinearGradient
                    colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                    locations={[0, 0.45, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  {trip.verified && (
                    <View style={[styles.tripBadge, { backgroundColor: '#10B981' }]}>
                      <Text style={styles.tripBadgeText}>Verified</Text>
                    </View>
                  )}
                </View>

                {/* Right side: Detailed trip content */}
                <View style={styles.tripContent}>
                  <View style={styles.tripHeaderRow}>
                    <Text style={[styles.tripName, { color: C.white }]} numberOfLines={2}>
                      {trip.title}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 4 }}>
                    <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(59,130,246,0.15)', marginTop: 0, marginBottom: 0 }]}>
                      <Check size={9} color={C.blue} strokeWidth={3} />
                      <Text style={[styles.verifiedText, { color: C.blue }]}>Verified Host</Text>
                    </View>
                    <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#10B981' }}>{trip.availableSeats} left</Text>
                  </View>

                  {/* Route cities with arrow */}
                  <View style={styles.routeCities}>
                    {trip.cities.map((city, i) => (
                      <React.Fragment key={city}>
                        <Text style={[styles.cityText, { color: C.white }]}>{city}</Text>
                        {i < trip.cities.length - 1 && (
                          <Text style={[styles.routeArrow, { color: C.textSec }]}>➔</Text>
                        )}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* 2x2 grid of pill capsules */}
                  <View style={styles.capsulesContainer}>
                    <View style={styles.capsulesRow}>
                      <View style={[styles.capsule, { backgroundColor: '#1E243B' }]}>
                        <MapPin size={9} color={C.textSec} />
                        <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                          {trip.meetingPoint}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: '#1E243B' }]}>
                        <Calendar size={9} color={C.textSec} />
                        <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                          {trip.startDate}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.capsulesRow}>
                      <View style={[styles.capsule, { backgroundColor: '#1E243B' }]}>
                        <Clock size={9} color={C.textSec} />
                        <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                          {duration}
                        </Text>
                      </View>
                      <View style={[styles.capsule, { backgroundColor: '#1E243B' }]}>
                        {trip.title.toLowerCase().includes('bike') ? (
                          <Bike size={9} color={C.textSec} />
                        ) : (
                          <Bus size={9} color={C.textSec} />
                        )}
                        <Text style={[styles.capsuleText, { color: C.textSec }]} numberOfLines={1}>
                          {transport}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Price and Action Button row */}
                  <View style={[styles.priceRow, { borderTopColor: C.border }]}>
                    <View style={{ flex: 1, marginRight: 4 }}>
                      <Text style={[styles.priceLabel, { color: C.textSec }]} numberOfLines={1}>Full Trip Cost</Text>
                      <Text style={[styles.priceAmount, { color: C.amber }]} numberOfLines={1}>
                        ₹{trip.pricePerPerson}
                      </Text>
                      <Text style={[styles.pricePer, { color: C.textSec, marginTop: -2 }]} numberOfLines={1}>
                        {savings > 0 ? `Save ₹${savings}` : 'Fits Budget'}
                      </Text>
                    </View>
                    <View style={{ gap: 4, flexShrink: 0, width: 120 }}>
                      {!isMyTrip && (
                        <TouchableOpacity
                          style={styles.joinBtn}
                          onPress={() => handleJoinTrip(trip)}
                        >
                          <Text style={styles.joinBtnText} numberOfLines={1}>Request to Join</Text>
                          <ChevronRight size={11} color="#FFF" style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <IndianRupee size={32} color={C.amber} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>No Trips Found Under ₹{userMaxBudget.toLocaleString('en-IN')}</Text>
            <Text style={styles.emptySub}>
              Try increasing your budget slider or select a higher preset pill above (e.g. ₹25k) to see available trips.
            </Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* TOAST OVERLAY */}
      {toastMsg && (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <TripDetailModal
        visible={showJoinModal}
        trip={selectedTrip}
        onClose={() => setShowJoinModal(false)}
      />
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
    paddingTop: 10,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  topNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  budgetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  budgetBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.amber,
  },

  filterCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  filterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCardTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.amber,
  },
  filterCardSub: {
    fontSize: 11,
    color: C.textSec,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
  applyBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  applyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
  },

  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetPill: {
    backgroundColor: '#181C2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetPillActive: {
    backgroundColor: C.amber,
    borderColor: C.amber,
  },
  presetText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  presetTextActive: {
    color: C.bg,
    fontWeight: '800',
  },

  orgTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  orgTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  orgTabActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  orgTabText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '600',
  },
  orgTabTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  dealsSection: {
    marginBottom: 20,
  },
  dealsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dealsTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.white,
  },
  dealsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dealCard: {
    width: 240,
    height: 160,
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  dealImg: {
    ...StyleSheet.absoluteFill,
  },
  dealBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.amber,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  dealBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.bg,
  },
  dealTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  dealMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dealPriceText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.amber,
  },
  dealDistanceText: {
    fontSize: 10,
    color: C.white,
    fontWeight: '600',
  },
  dealTagBox: {
    backgroundColor: 'rgba(17,20,34,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dealTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.green,
  },

  listHeaderRow: {
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
  },

  tripCard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    minHeight: 200,
  },
  tripImageContainer: {
    width: 115,
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: '#000',
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
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFF',
  },
  tripContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: 4,
  },
  tripName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  verifiedText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  routeArrow: {
    fontSize: 10,
    marginHorizontal: 3,
  },
  capsulesContainer: {
    gap: 4,
    marginVertical: 4,
  },
  capsulesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    borderRadius: 6,
    gap: 3,
  },
  capsuleText: {
    fontSize: 8.5,
    fontWeight: '600',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 1,
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '900',
  },
  pricePer: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 3,
    flexShrink: 0,
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  emptyCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 11.5,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 17,
  },

  toastBox: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,41,59,0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 999,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },
});
