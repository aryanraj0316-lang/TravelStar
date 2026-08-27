import React, { useMemo, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import TripDetailModal from '@/components/TripDetailModal';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  Compass,
  IndianRupee,
  MapPin,
  User,
  Users,
} from 'lucide-react-native';

// docs/REMEDIATION.md §8.15: this screen used to map real DB trips onto a
// hardcoded BUDGET_TRIPS_DATA array by id (trip-1 -> bt-3, ...), hardcode
// duration as "5 Nights / 6 Days" for every trip, and infer transport from
// whether the title contained the word "bike". It now shows real trips
// only, filters by budget server-side (GET /trips?maxBudget=), and derives
// every field from real trip data.

const C = {
  bg: '#060814',
  card: '#111322',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#EC4899',
};

const PRESET_BUDGETS = [5000, 10000, 15000, 25000, 50000];

type OrgFilter = 'ALL' | 'GUIDE' | 'ORGANIZER';

type BudgetTrip = {
  id: string;
  name: string;
  creator: string;
  creatorId: string;
  cities: string[];
  startDate: string;
  endDate: string;
  budget: string;
  availableSeats: number;
  totalSeats: number;
  membersCount: number;
  meetingPoint: string;
  coverImage: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  hotelIncluded: boolean;
  cabIncluded: boolean;
};

function nightsBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / (24 * 60 * 60 * 1000));
}

// Each card is its own component so the React Compiler
// (app.json > experiments.reactCompiler) memoizes cards independently — a
// hand-written React.memo here would make the compiler skip the component
// instead. The Phase 10 change is virtualization: this list used to be a
// ScrollView + .map() that mounted every trip and every cover image at once
// (docs/REMEDIATION.md Phase 10).
function BudgetTripCard({
  trip,
  isMyTrip,
  onPress,
}: {
  trip: BudgetTrip;
  isMyTrip: boolean;
  onPress: (trip: BudgetTrip) => void;
}) {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const inclusions =
    [
      trip.guideIncluded && 'guide',
      trip.hotelIncluded && 'hotel',
      trip.foodIncluded && 'meals',
      trip.cabIncluded && 'transport',
    ]
      .filter(Boolean)
      .join(', ') || 'no inclusions listed';

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.tripCard} onPress={() => onPress(trip)}>
      <View style={styles.tripImgWrap}>
        <Image source={{ uri: trip.coverImage }} style={styles.tripImg} />
        <LinearGradient colors={['rgba(6,8,20,0.15)', 'rgba(6,8,20,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>₹{Number(trip.budget).toLocaleString('en-IN')}</Text>
        </View>
        {isMyTrip && (
          <View style={styles.myTripBadge}>
            <Text style={styles.myTripBadgeText}>YOUR TRIP</Text>
          </View>
        )}
      </View>
      <View style={styles.tripBody}>
        <Text style={styles.tripTitle} numberOfLines={1}>
          {trip.name}
        </Text>
        <Text style={styles.tripOrganizer} numberOfLines={1}>
          {trip.creator}
        </Text>

        <View style={styles.tripRow}>
          <MapPin size={12} color={C.green} />
          <Text style={styles.tripRowText} numberOfLines={1}>
            {trip.cities.join(' → ')} · {trip.cities.length} {trip.cities.length === 1 ? 'place' : 'places'}
          </Text>
        </View>
        <View style={styles.tripRow}>
          <Calendar size={12} color={C.textMuted} />
          <Text style={styles.tripMetaText}>
            {trip.startDate} → {trip.endDate}
            {nights > 0 ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        <View style={styles.tripRow}>
          <User size={12} color={C.textMuted} />
          <Text style={styles.tripMetaText}>
            {trip.membersCount}/{trip.totalSeats} joined · {inclusions}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const keyExtractor = (t: BudgetTrip) => t.id;
const listFooter = <View style={{ height: 100 }} />;

export default function BudgetTripsScreen() {
  const router = useRouter();
  const { profile, isLoggedIn } = useApp();

  const [maxBudget, setMaxBudget] = useState(50000);
  const [budgetText, setBudgetText] = useState('50000');
  const [orgFilter, setOrgFilter] = useState<OrgFilter>('ALL');
  const [selectedTrip, setSelectedTrip] = useState<BudgetTrip | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const {
    data: trips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: [...queryKeys.trips(), 'budget', maxBudget],
    queryFn: async (): Promise<BudgetTrip[]> => {
      const res = await apiService.getTrips(`?maxBudget=${maxBudget}&limit=50`);
      // The wire shape (mapTrip on the server) sends budget as a string per
      // CONVENTIONS §3; the client Trip type still says number. Number(...)
      // below handles both.
      return (res ?? []) as unknown as BudgetTrip[];
    },
  });

  const visibleTrips = useMemo(() => {
    const byOrg = trips.filter((t) => {
      if (orgFilter === 'ALL') return true;
      if (orgFilter === 'GUIDE') return t.guideIncluded;
      return !t.guideIncluded;
    });
    return [...byOrg].sort((a, b) => Number(a.budget) - Number(b.budget));
  }, [trips, orgFilter]);

  const handleBudgetText = (text: string) => {
    setBudgetText(text);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed) && parsed > 0) setMaxBudget(parsed);
  };

  const selectPreset = (val: number) => {
    setMaxBudget(val);
    setBudgetText(String(val));
  };

  const openTrip = (trip: BudgetTrip) => {
    setSelectedTrip(trip);
    setShowJoinModal(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.topNavRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>Budget Trips</Text>
        <View style={styles.budgetBadge}>
          <IndianRupee size={12} color={C.amber} />
          <Text style={styles.budgetBadgeText}>{maxBudget.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Budget filter */}
      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Maximum budget per person</Text>
        <View style={styles.inputWrapper}>
          <IndianRupee size={15} color={C.amber} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.textInput}
            keyboardType="numeric"
            value={budgetText}
            onChangeText={handleBudgetText}
            placeholder="e.g. 15000"
            placeholderTextColor={C.textMuted}
            accessibilityLabel="Maximum budget"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {PRESET_BUDGETS.map((b) => {
            const active = maxBudget === b;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.presetPill, active && styles.presetPillActive]}
                onPress={() => selectPreset(b)}
              >
                <Text style={[styles.presetText, active && styles.presetTextActive]}>≤ ₹{(b / 1000).toFixed(0)}k</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Organizer filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orgTabsRow}>
        {(
          [
            { key: 'ALL', label: 'All trips', Icon: Compass },
            { key: 'GUIDE', label: 'Guided', Icon: Briefcase },
            { key: 'ORGANIZER', label: 'Community', Icon: Users },
          ] as { key: OrgFilter; label: string; Icon: typeof Compass }[]
        ).map(({ key, label, Icon }) => {
          const active = orgFilter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.orgTab, active && styles.orgTabActive]}
              onPress={() => setOrgFilter(key)}
            >
              <Icon size={13} color={active ? C.white : C.textSec} />
              <Text style={[styles.orgTabText, active && styles.orgTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.stateText}>Loading trips…</Text>
        </View>
      ) : isError ? (
        <View style={styles.stateWrap}>
          <AlertCircle size={52} color={C.rose} strokeWidth={1.4} />
          <Text style={styles.stateText}>{error instanceof Error ? error.message : 'Could not load trips.'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visibleTrips.length === 0 ? (
        <View style={styles.stateWrap}>
          <Compass size={54} color={C.textMuted} strokeWidth={1.2} />
          <Text style={styles.stateText}>No trips under ₹{maxBudget.toLocaleString('en-IN')} right now.</Text>
        </View>
      ) : (
        <FlatList
          data={visibleTrips}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => (
            <BudgetTripCard
              trip={item}
              isMyTrip={isLoggedIn && !!(profile?.id && item.creatorId && item.creatorId === profile.id)}
              onPress={openTrip}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.blue} />}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {visibleTrips.length} trip{visibleTrips.length === 1 ? '' : 's'} ≤ ₹{maxBudget.toLocaleString('en-IN')}
            </Text>
          }
          ListFooterComponent={listFooter}
        />
      )}

      <TripDetailModal visible={showJoinModal} trip={selectedTrip} onClose={() => setShowJoinModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  topNavTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  budgetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  budgetBadgeText: { fontSize: 11, fontWeight: '800', color: C.amber },
  filterCard: {
    marginHorizontal: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 10,
  },
  filterTitle: { fontSize: 12, fontWeight: '700', color: C.white },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C2E',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: { flex: 1, color: C.white, fontSize: 14, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#181C2E',
    borderWidth: 1,
    borderColor: C.border,
  },
  presetPillActive: { backgroundColor: C.blue, borderColor: C.blue },
  presetText: { fontSize: 11, fontWeight: '700', color: C.textSec },
  presetTextActive: { color: C.white },
  orgTabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  orgTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  orgTabActive: { backgroundColor: C.blue, borderColor: C.blue },
  orgTabText: { fontSize: 11, fontWeight: '700', color: C.textSec },
  orgTabTextActive: { color: C.white },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  stateText: { color: C.textSec, fontSize: 13.5, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  retryBtn: { backgroundColor: C.blue, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listHeader: { fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 12 },
  tripCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  tripImgWrap: { height: 140, position: 'relative' },
  tripImg: { width: '100%', height: '100%' },
  priceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(245,158,11,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
  },
  priceBadgeText: { fontSize: 12, fontWeight: '800', color: '#1A1206' },
  myTripBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(59,130,246,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  myTripBadgeText: { fontSize: 8.5, fontWeight: '800', color: C.white, letterSpacing: 0.5 },
  tripBody: { padding: 14, gap: 6 },
  tripTitle: { fontSize: 14.5, fontWeight: '800', color: C.white },
  tripOrganizer: { fontSize: 11, color: C.textMuted, marginBottom: 2 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripRowText: { fontSize: 11.5, fontWeight: '600', color: C.green, flex: 1 },
  tripMetaText: { fontSize: 11, color: C.textSec, flex: 1 },
});
