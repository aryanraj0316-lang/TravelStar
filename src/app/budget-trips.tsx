import { Trip, useApp } from '@/store/AppContext';
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
  Users
} from 'lucide-react-native';
import { useState } from 'react';
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
  imageUrl: string;
  isBestValueDeal?: boolean;
  dealTagline?: string;
  meetingPoint: string;
  rating: number;
}

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
  const { addTrip } = useApp();

  const [userMaxBudget, setUserMaxBudget] = useState<number>(15000);
  const [budgetTextInput, setBudgetTextInput] = useState<string>('15000');
  const [selectedOrgType, setSelectedOrgType] = useState<'ALL' | 'TOURIST_GUIDE' | 'GROUP_ORGANIZER' | 'INDIVIDUAL_TOURIST'>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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

  // Filter trips matching user's budget and organizer filter
  const filteredTrips = BUDGET_TRIPS_DATA.filter((trip) => {
    const matchesBudget = trip.pricePerPerson <= userMaxBudget;
    const matchesOrg = selectedOrgType === 'ALL' || trip.organizerType === selectedOrgType;
    return matchesBudget && matchesOrg;
  });

  const bestValueDeals = BUDGET_TRIPS_DATA.filter((t) => t.isBestValueDeal && t.pricePerPerson <= userMaxBudget);

  const handleJoinTrip = (trip: BudgetTripItem) => {
    const newTrip: Trip = {
      id: `joined-${trip.id}-${Date.now()}`,
      name: trip.title,
      creator: trip.organizerName,
      cities: trip.cities,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budget: trip.pricePerPerson,
      availableSeats: Math.max(0, trip.availableSeats - 1),
      totalSeats: trip.totalSeats,
      meetingPoint: trip.meetingPoint,
      guideIncluded: trip.organizerType === 'TOURIST_GUIDE',
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: trip.totalSeats - trip.availableSeats + 1,
    };

    addTrip(newTrip);

    Alert.alert(
      '🎉 Seat Booked Successfully!',
      `You joined "${trip.title}" organized by ${trip.organizerName} for ₹${trip.pricePerPerson}. Total budget fits in your ₹${userMaxBudget.toLocaleString('en-IN')} limit!`,
      [
        { text: 'View Search Feed', onPress: () => router.push('/search') },
      ]
    );
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
              👨‍🏫 Tourist Guides
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'GROUP_ORGANIZER' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('GROUP_ORGANIZER')}
          >
            <Users size={13} color={selectedOrgType === 'GROUP_ORGANIZER' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'GROUP_ORGANIZER' && styles.orgTabTextActive]}>
              👥 Group Organizers
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.orgTab, selectedOrgType === 'INDIVIDUAL_TOURIST' && styles.orgTabActive]}
            onPress={() => setSelectedOrgType('INDIVIDUAL_TOURIST')}
          >
            <User size={13} color={selectedOrgType === 'INDIVIDUAL_TOURIST' ? C.white : C.textSec} />
            <Text style={[styles.orgTabText, selectedOrgType === 'INDIVIDUAL_TOURIST' && styles.orgTabTextActive]}>
              👤 User/Tourists
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
                  onPress={() => handleJoinTrip(deal)}
                >
                  <Image source={{ uri: deal.imageUrl }} style={styles.dealImg} />
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
            return (
              <View key={trip.id} style={styles.tripCard}>

                {/* HERO IMAGE BANNER */}
                <View style={styles.tripImgWrap}>
                  <Image source={{ uri: trip.imageUrl }} style={styles.tripImg} />
                  <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(6,8,20,0.85)']} style={StyleSheet.absoluteFill} />

                  {/* PRICE & SAVINGS TAG */}
                  <View style={styles.priceTagBox}>
                    <Text style={styles.priceTagText}>₹{trip.pricePerPerson.toLocaleString('en-IN')}</Text>
                    <Text style={styles.savingsTagText}>
                      {savings > 0 ? `Save ₹${savings.toLocaleString('en-IN')} vs budget` : 'Fits Budget'}
                    </Text>
                  </View>

                  {/* ORGANIZER TYPE BADGE */}
                  <View style={styles.orgBadgePill}>
                    <User size={10} color={C.blue} />
                    <Text style={styles.orgBadgeText}>
                      {trip.organizerType === 'TOURIST_GUIDE'
                        ? '👨‍🏫 TOURIST GUIDE'
                        : trip.organizerType === 'GROUP_ORGANIZER'
                          ? '👥 GROUP ORGANIZER'
                          : '👤 INDIVIDUAL TOURIST'}
                    </Text>
                  </View>
                </View>

                {/* TRIP CARD BODY */}
                <View style={styles.tripCardBody}>

                  {/* ORGANIZER ROW */}
                  <View style={styles.orgRow}>
                    <Image source={{ uri: trip.organizerAvatar }} style={styles.orgAvatar} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.orgName}>{trip.organizerName}</Text>
                        {trip.verified && <ShieldCheck size={14} color={C.green} />}
                      </View>
                      <Text style={styles.ratingSub}>⭐ {trip.rating} • Verified Trip Host</Text>
                    </View>

                    <View style={styles.seatsPill}>
                      <Users size={12} color={C.amber} />
                      <Text style={styles.seatsText}>{trip.availableSeats} Seats Left</Text>
                    </View>
                  </View>

                  {/* TRIP TITLE */}
                  <Text style={styles.tripTitle}>{trip.title}</Text>

                  {/* CITIES & DISTANCE META */}
                  <View style={styles.metaRow}>
                    <MapPin size={13} color={C.green} />
                    <Text style={styles.metaText}>{trip.cities.join(' ➔ ')} ({trip.distanceKm} km total)</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Calendar size={13} color={C.purple} />
                    <Text style={styles.metaText}>{trip.startDate} to {trip.endDate} • {trip.placesCoveredCount} Spots Covered</Text>
                  </View>

                  {/* JOIN BUTTON */}
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => handleJoinTrip(trip)}
                  >
                    <Sparkles size={16} color={C.white} />
                    <Text style={styles.joinBtnText}>Join Trip @ ₹{trip.pricePerPerson.toLocaleString('en-IN')}</Text>
                  </TouchableOpacity>

                </View>
              </View>
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
    backgroundColor: C.card,
    borderRadius: 22,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  tripImgWrap: {
    height: 140,
    position: 'relative',
  },
  tripImg: {
    width: '100%',
    height: '100%',
  },
  priceTagBox: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(6,8,20,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  priceTagText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.amber,
  },
  savingsTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.green,
  },
  orgBadgePill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,8,20,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  orgBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.blue,
  },

  tripCardBody: {
    padding: 14,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  orgAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  orgName: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  ratingSub: {
    fontSize: 9.5,
    color: C.textSec,
  },
  seatsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  seatsText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.amber,
  },

  tripTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 11,
    color: C.textSec,
  },

  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blue,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
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
