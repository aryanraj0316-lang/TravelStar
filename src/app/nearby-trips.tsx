import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  MapPin,
  Compass,
  Sparkles,
  ArrowLeft,
  Navigation,
  Star,
  IndianRupee,
  ChevronRight,
  TrendingDown,
  Award,
  Zap,
  Info,
  X,
  Car,
  Clock,
  ShieldCheck,
} from 'lucide-react-native';

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

export interface NearbyPlace {
  id: string;
  name: string;
  category: string;
  distanceKm: number;
  driveTime: string;
  pricePerHead: number;
  priceDiffText: string;
  isCheapest?: boolean;
  isNearest?: boolean;
  isBestRated?: boolean;
  rating: number;
  reviewsCount: number;
  imageUrl: string;
  shortDesc: string;
  transportCost: number;
  stayMealCost: number;
  entryCost: number;
}

const NEARBY_PLACES: NearbyPlace[] = [
  {
    id: 'place-1',
    name: 'Sultanpur Bird Sanctuary & Lake',
    category: 'Nature & Wildlife',
    distanceKm: 42,
    driveTime: '1 hr 05 mins',
    pricePerHead: 1800,
    priceDiffText: '✨ SASTA TRIP (Minimal Expense - Save ₹3,100)',
    isCheapest: true,
    rating: 4.6,
    reviewsCount: 1240,
    imageUrl: 'https://images.unsplash.com/photo-1511497584788-876761c119ef?w=800&q=80',
    shortDesc: 'Serene wetland lake sanctuary with migratory birds & peaceful walking trails.',
    transportCost: 600,
    stayMealCost: 1000,
    entryCost: 200,
  },
  {
    id: 'place-2',
    name: 'Surajkund Heritage Lake & Asola Reserve',
    category: 'Heritage & Nature',
    distanceKm: 24,
    driveTime: '35 mins',
    pricePerHead: 2200,
    priceDiffText: '📍 NEAREST LOCATION (Only 24 km away)',
    isNearest: true,
    rating: 4.5,
    reviewsCount: 890,
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
    shortDesc: 'Ancient 10th-century amphitheater reservoir surrounded by lush green hills.',
    transportCost: 500,
    stayMealCost: 1500,
    entryCost: 200,
  },
  {
    id: 'place-3',
    name: 'Agra Taj Mahal & Agra Fort',
    category: 'World Wonder Heritage',
    distanceKm: 210,
    driveTime: '3 hrs 15 mins (Expressway)',
    pricePerHead: 4900,
    priceDiffText: '👑 BEST RATED #1 DESTINATION (4.9★)',
    isBestRated: true,
    rating: 4.9,
    reviewsCount: 4820,
    imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    shortDesc: 'Iconic marble monument of eternal love & Mughal grand citadel fort.',
    transportCost: 1800,
    stayMealCost: 2500,
    entryCost: 600,
  },
  {
    id: 'place-4',
    name: 'Neemrana Fort Palace & Zipline',
    category: 'Royal Heritage & Adventure',
    distanceKm: 122,
    driveTime: '2 hrs 10 mins',
    pricePerHead: 3800,
    priceDiffText: '+₹2,000 vs Sasta Trip',
    rating: 4.7,
    reviewsCount: 2150,
    imageUrl: 'https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&q=80',
    shortDesc: '15th-century cliffside palace with flying-fox zipline over Rajasthan hills.',
    transportCost: 1200,
    stayMealCost: 2100,
    entryCost: 500,
  },
  {
    id: 'place-5',
    name: 'Rishikesh Ganga Ghats & Rafting',
    category: 'Adventure & Yoga Capital',
    distanceKm: 240,
    driveTime: '4 hrs 20 mins',
    pricePerHead: 3400,
    priceDiffText: '+₹1,600 vs Sasta Trip',
    rating: 4.8,
    reviewsCount: 3910,
    imageUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
    shortDesc: 'White-water river rafting on River Ganges & evening divine Ganga Aarti.',
    transportCost: 1400,
    stayMealCost: 1600,
    entryCost: 400,
  },
];

export default function NearbyTripsScreen() {
  const router = useRouter();

  const [activeSort, setActiveSort] = useState<'CHEAPEST' | 'NEAREST' | 'BEST_RATED'>('CHEAPEST');
  const [selectedPlaceForModal, setSelectedPlaceForModal] = useState<NearbyPlace | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const cheapestPlace = NEARBY_PLACES.find((p) => p.isCheapest) || NEARBY_PLACES[0];
  const nearestPlace = NEARBY_PLACES.find((p) => p.isNearest) || NEARBY_PLACES[1];
  const bestRatedPlace = NEARBY_PLACES.find((p) => p.isBestRated) || NEARBY_PLACES[2];

  const sortedPlaces = [...NEARBY_PLACES].sort((a, b) => {
    if (activeSort === 'CHEAPEST') return a.pricePerHead - b.pricePerHead;
    if (activeSort === 'NEAREST') return a.distanceKm - b.distanceKm;
    return b.rating - a.rating;
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* TOP NAV BAR */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.topNavTitle}>Nearby Tourist Places</Text>
          <TouchableOpacity style={styles.gpsSyncBtn} onPress={() => showToast('📍 GPS Location Synced: New Delhi')}>
            <Navigation size={15} color={C.blue} />
            <Text style={styles.gpsSyncText}>Sync GPS</Text>
          </TouchableOpacity>
        </View>

        {/* GPS LOCATION DETECTOR HEADER BANNER */}
        <View style={styles.gpsBannerCard}>
          <View style={styles.gpsHeaderRow}>
            <View style={styles.gpsIconCircle}>
              <MapPin size={18} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpsDetectedTitle}>CURRENT GPS LOCATION</Text>
              <Text style={styles.gpsLocationText}>📍 New Delhi, NCR (Lat: 28.6139, Lng: 77.2090)</Text>
            </View>
          </View>
          <Text style={styles.gpsSubNote}>
            Scanning nearby tourist getaways within 250 km radius with live price & distance comparisons.
          </Text>
        </View>

        {/* ════════════════════════════════════════════════
            SMART AI HIGHLIGHT CARDS (SASTA, NEAREST, BEST RATED)
            ════════════════════════════════════════════════ */}
        <Text style={styles.sectionHeaderTitle}>Smart AI Travel Suggestions</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightRow}>
          
          {/* 1. SASTA TRIP CARD (MINIMAL EXPENSE) */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.highlightCard, { borderColor: C.green }]}
            onPress={() => setSelectedPlaceForModal(cheapestPlace)}
          >
            <LinearGradient colors={['rgba(16,185,129,0.2)', 'rgba(17,19,34,0.95)']} style={StyleSheet.absoluteFill} />
            <View style={[styles.badgePill, { backgroundColor: C.green }]}>
              <TrendingDown size={11} color={C.white} />
              <Text style={styles.badgeText}>SASTA TRIP (MINIMAL COST)</Text>
            </View>
            <Image source={{ uri: cheapestPlace.imageUrl }} style={styles.highlightImg} />
            <Text style={styles.highlightTitle} numberOfLines={1}>{cheapestPlace.name}</Text>
            <View style={styles.highlightMetaRow}>
              <Text style={styles.highlightPriceText}>₹{cheapestPlace.pricePerHead} / person</Text>
              <Text style={styles.highlightDistText}>{cheapestPlace.distanceKm} km away</Text>
            </View>
          </TouchableOpacity>

          {/* 2. NEAREST LOCATION CARD */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.highlightCard, { borderColor: C.blue }]}
            onPress={() => setSelectedPlaceForModal(nearestPlace)}
          >
            <LinearGradient colors={['rgba(59,130,246,0.2)', 'rgba(17,19,34,0.95)']} style={StyleSheet.absoluteFill} />
            <View style={[styles.badgePill, { backgroundColor: C.blue }]}>
              <Zap size={11} color={C.white} />
              <Text style={styles.badgeText}>NEAREST LOCATION</Text>
            </View>
            <Image source={{ uri: nearestPlace.imageUrl }} style={styles.highlightImg} />
            <Text style={styles.highlightTitle} numberOfLines={1}>{nearestPlace.name}</Text>
            <View style={styles.highlightMetaRow}>
              <Text style={styles.highlightDistText}>📍 {nearestPlace.distanceKm} km ({nearestPlace.driveTime})</Text>
            </View>
          </TouchableOpacity>

          {/* 3. BEST RATED LOCATION CARD */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.highlightCard, { borderColor: C.amber }]}
            onPress={() => setSelectedPlaceForModal(bestRatedPlace)}
          >
            <LinearGradient colors={['rgba(245,158,11,0.2)', 'rgba(17,19,34,0.95)']} style={StyleSheet.absoluteFill} />
            <View style={[styles.badgePill, { backgroundColor: C.amber }]}>
              <Award size={11} color={C.white} />
              <Text style={styles.badgeText}>BEST RATED #1 PLACE</Text>
            </View>
            <Image source={{ uri: bestRatedPlace.imageUrl }} style={styles.highlightImg} />
            <Text style={styles.highlightTitle} numberOfLines={1}>{bestRatedPlace.name}</Text>
            <View style={styles.highlightMetaRow}>
              <Text style={styles.highlightRatingText}>⭐ {bestRatedPlace.rating} ({bestRatedPlace.reviewsCount})</Text>
            </View>
          </TouchableOpacity>

        </ScrollView>

        {/* ════════════════════════════════════════════════
            SORT TABS & COMPARISON LIST
            ════════════════════════════════════════════════ */}
        <View style={styles.sortHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>All Nearby Tourist Destinations</Text>
        </View>

        <View style={styles.sortTabsRow}>
          <TouchableOpacity
            style={[styles.sortTab, activeSort === 'CHEAPEST' && styles.sortTabActive]}
            onPress={() => setActiveSort('CHEAPEST')}
          >
            <TrendingDown size={13} color={activeSort === 'CHEAPEST' ? C.white : C.textSec} />
            <Text style={[styles.sortTabText, activeSort === 'CHEAPEST' && styles.sortTabTextActive]}>
              Cheapest (Sasta)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortTab, activeSort === 'NEAREST' && styles.sortTabActive]}
            onPress={() => setActiveSort('NEAREST')}
          >
            <Navigation size={13} color={activeSort === 'NEAREST' ? C.white : C.textSec} />
            <Text style={[styles.sortTabText, activeSort === 'NEAREST' && styles.sortTabTextActive]}>
              Nearest (24 km)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortTab, activeSort === 'BEST_RATED' && styles.sortTabActive]}
            onPress={() => setActiveSort('BEST_RATED')}
          >
            <Star size={13} color={activeSort === 'BEST_RATED' ? C.white : C.textSec} />
            <Text style={[styles.sortTabText, activeSort === 'BEST_RATED' && styles.sortTabTextActive]}>
              Best Rated (4.9★)
            </Text>
          </TouchableOpacity>
        </View>

        {/* NEARBY DESTINATION CARDS LIST WITH PRICE & DISTANCE COMPARISONS */}
        {sortedPlaces.map((place) => (
          <View key={place.id} style={styles.placeCard}>
            <View style={styles.placeImgWrap}>
              <Image source={{ uri: place.imageUrl }} style={styles.placeImg} />
              
              {/* Category Tag */}
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{place.category.toUpperCase()}</Text>
              </View>

              {/* Price / Distance Tag Overlay */}
              <View style={[
                styles.priceDiffBadge,
                place.isCheapest ? { backgroundColor: C.green } : place.isNearest ? { backgroundColor: C.blue } : { backgroundColor: 'rgba(17,20,34,0.85)' }
              ]}>
                <Text style={styles.priceDiffBadgeText}>{place.priceDiffText}</Text>
              </View>
            </View>

            <View style={styles.placeCardBody}>
              <View style={styles.placeTitleRow}>
                <Text style={styles.placeTitle} numberOfLines={1}>{place.name}</Text>
                <View style={styles.ratingBox}>
                  <Star size={12} color={C.amber} fill={C.amber} />
                  <Text style={styles.ratingText}>{place.rating}</Text>
                </View>
              </View>

              <Text style={styles.placeDesc} numberOfLines={2}>{place.shortDesc}</Text>

              {/* Distance & Cost Comparison Grid */}
              <View style={styles.comparisonGrid}>
                <View style={styles.compTile}>
                  <Navigation size={12} color={C.blue} />
                  <Text style={styles.compValueText}>{place.distanceKm} km</Text>
                  <Text style={styles.compSubText}>{place.driveTime}</Text>
                </View>

                <View style={styles.compTile}>
                  <IndianRupee size={12} color={C.amber} />
                  <Text style={styles.compValueText}>₹{place.pricePerHead}</Text>
                  <Text style={styles.compSubText}>Per Head Expense</Text>
                </View>

                <TouchableOpacity
                  style={styles.detailsBtn}
                  onPress={() => setSelectedPlaceForModal(place)}
                >
                  <Info size={13} color={C.white} />
                  <Text style={styles.detailsBtnText}>Cost Sheet</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* TOAST OVERLAY */}
      {toastMsg && (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* COST BREAKDOWN MODAL SHEET */}
      {selectedPlaceForModal && (
        <Modal transparent animationType="slide" visible={!!selectedPlaceForModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedPlaceForModal.name}</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPlaceForModal(null)}>
                  <X size={18} color={C.white} />
                </TouchableOpacity>
              </View>

              <Text style={styles.costSheetSub}>Minimal Expense & Distance Breakdown from GPS Location</Text>

              <View style={styles.costRow}>
                <Car size={16} color={C.blue} />
                <Text style={styles.costLabel}>Estimated Transport Cost:</Text>
                <Text style={styles.costVal}>₹{selectedPlaceForModal.transportCost}</Text>
              </View>

              <View style={styles.costRow}>
                <Compass size={16} color={C.purple} />
                <Text style={styles.costLabel}>Stay & Food Expenses:</Text>
                <Text style={styles.costVal}>₹{selectedPlaceForModal.stayMealCost}</Text>
              </View>

              <View style={styles.costRow}>
                <ShieldCheck size={16} color={C.green} />
                <Text style={styles.costLabel}>Entry Tickets & Permits:</Text>
                <Text style={styles.costVal}>₹{selectedPlaceForModal.entryCost}</Text>
              </View>

              <View style={styles.totalCostRow}>
                <Text style={styles.totalCostLabel}>Total Minimal Cost per Person:</Text>
                <Text style={styles.totalCostVal}>₹{selectedPlaceForModal.pricePerHead}</Text>
              </View>

              <TouchableOpacity
                style={styles.bookTripBtn}
                onPress={() => {
                  setSelectedPlaceForModal(null);
                  router.push('/create');
                }}
              >
                <Sparkles size={16} color={C.white} />
                <Text style={styles.bookTripBtnText}>Plan Trip to {selectedPlaceForModal.name.split(' ')[0]}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  gpsSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  gpsSyncText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blue,
  },

  gpsBannerCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  gpsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  gpsIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsDetectedTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: C.green,
  },
  gpsLocationText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  gpsSubNote: {
    fontSize: 11,
    color: C.textSec,
    lineHeight: 16,
  },

  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
    marginBottom: 12,
  },

  highlightRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  highlightCard: {
    width: 220,
    height: 140,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.white,
  },
  highlightImg: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  highlightTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  highlightMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightPriceText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.amber,
  },
  highlightDistText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.white,
  },
  highlightRatingText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.amber,
  },

  sortHeaderRow: {
    marginTop: 4,
  },
  sortTabsRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sortTabActive: {
    backgroundColor: C.blue,
  },
  sortTabText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.textSec,
  },
  sortTabTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  placeCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  placeImgWrap: {
    height: 150,
    position: 'relative',
  },
  placeImg: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(6,8,20,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: C.amber,
  },
  priceDiffBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priceDiffBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.white,
  },

  placeCardBody: {
    padding: 14,
  },
  placeTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  placeTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.white,
    flex: 1,
    marginRight: 6,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: C.amber,
  },
  placeDesc: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
    marginBottom: 12,
  },

  comparisonGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181C2E',
    padding: 10,
    borderRadius: 14,
  },
  compTile: {
    alignItems: 'flex-start',
  },
  compValueText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  compSubText: {
    fontSize: 9,
    color: C.textSec,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  detailsBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.white,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#111422',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
    flex: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  costSheetSub: {
    fontSize: 11,
    color: C.textSec,
    marginBottom: 16,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  costLabel: {
    fontSize: 12,
    color: C.white,
    flex: 1,
  },
  costVal: {
    fontSize: 13,
    fontWeight: '700',
    color: C.amber,
  },
  totalCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 18,
  },
  totalCostLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  totalCostVal: {
    fontSize: 18,
    fontWeight: '800',
    color: C.green,
  },
  bookTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blue,
    paddingVertical: 14,
    borderRadius: 16,
  },
  bookTripBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
});
