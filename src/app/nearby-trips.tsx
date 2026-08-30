import React, { useState } from 'react';
import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { getCurrentDeviceLocation } from '@/lib/device-location';
import TripDetailModal from '@/components/TripDetailModal';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, Compass, MapPin, Navigation, Users } from 'lucide-react-native';
import { C } from '@/theme/tokens';
import type { NearbyTrip } from '@/types/api';

// docs/REMEDIATION.md §8.13: this screen previously rendered a hardcoded
// list of Delhi-area "places" with a fake "CURRENT GPS LOCATION" banner and
// fabricated cost breakdowns, then handed a made-up trip object (id
// 'place-1') to the join modal — which POSTed a join request for a
// nonexistent trip. It now asks for the real device location, fetches real
// upcoming public trips from GET /trips/nearby sorted by straight-line
// distance, and only ever opens the join modal on a real trip.

// Each row is its own component so the React Compiler
// (app.json > experiments.reactCompiler) can memoize rows independently —
// which is why there is no hand-written React.memo/useCallback here. The
// compiler does NOT virtualize, though, so the FlatList below is the actual
// Phase 10 win: this list used to be a ScrollView + .map() that mounted
// every trip at once (docs/REMEDIATION.md Phase 10).
function NearbyTripCard({ trip, onPress }: { trip: NearbyTrip; onPress: (trip: NearbyTrip) => void }) {
  const distance =
    trip.distanceKm === null
      ? (trip.cities[0] ?? 'Route TBD')
      : `≈ ${trip.distanceKm.toLocaleString('en-IN')} km away · straight-line`;

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.tripCard} onPress={() => onPress(trip)}>
      <View style={styles.tripImgWrap}>
        <Image source={{ uri: trip.coverImage }} style={styles.tripImg} />
        <LinearGradient colors={['rgba(6,8,20,0.15)', 'rgba(6,8,20,0.9)']} style={StyleSheet.absoluteFill} />
        <View style={styles.distBadge}>
          <Navigation size={11} color={C.white} />
          <Text style={styles.distBadgeText}>{distance}</Text>
        </View>
      </View>
      <View style={styles.tripBody}>
        <Text style={styles.tripTitle} numberOfLines={1}>
          {trip.name}
        </Text>
        <View style={styles.tripRow}>
          <MapPin size={12} color={C.green} />
          <Text style={styles.tripRowText} numberOfLines={1}>
            {trip.cities.join(' → ')}
          </Text>
        </View>
        <View style={styles.tripMetaRow}>
          <View style={styles.tripRow}>
            <Users size={12} color={C.textMuted} />
            <Text style={styles.tripMetaText}>
              {trip.membersCount}/{trip.totalSeats} joined
            </Text>
          </View>
          <Text style={styles.tripPrice}>₹{Number(trip.budget).toLocaleString('en-IN')}</Text>
        </View>
        <Text style={styles.tripDates}>
          {trip.startDate} → {trip.endDate}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// No getItemLayout: the card's height is only *mostly* fixed (a user with a
// large system font scale grows the text rows), and a getItemLayout that
// lies about row height produces scroll jumps worse than the measurement it
// saves.
const keyExtractor = (t: NearbyTrip) => t.id;
const listFooter = <View style={{ height: 100 }} />;

type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' | 'unavailable' };

export default function NearbyTripsScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [selectedTrip, setSelectedTrip] = useState<NearbyTrip | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const requestLocation = async () => {
    setLocation({ status: 'loading' });
    const res = await getCurrentDeviceLocation();
    if (res.ok) {
      setLocation({
        status: 'granted',
        latitude: res.latitude,
        longitude: res.longitude,
      });
    } else {
      setLocation({
        status: res.reason === 'PERMISSION_DENIED' ? 'denied' : 'unavailable',
      });
    }
  };

  const coords = location.status === 'granted' ? { lat: location.latitude, lng: location.longitude } : null;

  const {
    data: trips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: [...queryKeys.nearbyPlaces(), coords?.lat ?? null, coords?.lng ?? null],
    queryFn: async (): Promise<NearbyTrip[]> => {
      const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
      const res = await apiService.getNearbyTrips(qs);
      return res ?? [];
    },
  });

  const openTrip = (trip: NearbyTrip) => {
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
        <Text style={styles.topNavTitle}>Trips Near You</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Location banner */}
      <View style={styles.locBanner}>
        <View style={styles.locIconCircle}>
          <MapPin size={16} color={location.status === 'granted' ? C.green : C.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          {location.status === 'granted' ? (
            <>
              <Text style={styles.locTitle}>Using your current location</Text>
              <Text style={styles.locSub}>
                {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)} — distances are straight-line estimates
              </Text>
            </>
          ) : location.status === 'loading' ? (
            <Text style={styles.locSub}>Getting your location…</Text>
          ) : location.status === 'denied' || location.status === 'unavailable' ? (
            <>
              <Text style={styles.locTitle}>
                {location.status === 'denied' ? 'Location permission denied' : 'Location unavailable'}
              </Text>
              <Text style={styles.locSub}>Showing all upcoming trips, unsorted by distance.</Text>
            </>
          ) : (
            <Text style={styles.locSub}>Share your location to sort trips by how close they are.</Text>
          )}
        </View>
        {location.status !== 'granted' && location.status !== 'loading' && (
          <TouchableOpacity
            style={styles.locBtn}
            onPress={requestLocation}
            accessibilityRole="button"
            accessibilityLabel="Use my location"
          >
            <Navigation size={13} color={C.blue} />
            <Text style={styles.locBtnText}>Use location</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.stateText}>Finding trips near you…</Text>
        </View>
      ) : isError ? (
        <View style={styles.stateWrap}>
          <AlertCircle size={52} color={C.rose} strokeWidth={1.4} />
          <Text style={styles.stateText}>
            {error instanceof Error ? error.message : 'Could not load nearby trips.'}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.stateWrap}>
          <Compass size={56} color={C.textMuted} strokeWidth={1.2} />
          <Text style={styles.stateText}>No upcoming trips are open right now.</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <NearbyTripCard trip={item} onPress={openTrip} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.blue} />}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
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
  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  locIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: { fontSize: 12, fontWeight: '700', color: C.white },
  locSub: { fontSize: 10.5, color: C.textSec, lineHeight: 15 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  locBtnText: { fontSize: 10.5, fontWeight: '700', color: C.blue },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 40,
  },
  stateText: {
    color: C.textSec,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
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
  distBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(59,130,246,0.9)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  distBadgeText: { fontSize: 10, fontWeight: '800', color: C.white },
  tripBody: { padding: 14, gap: 7 },
  tripTitle: { fontSize: 14.5, fontWeight: '800', color: C.white },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripRowText: { fontSize: 12, fontWeight: '600', color: C.green, flex: 1 },
  tripMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripMetaText: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  tripPrice: { fontSize: 13.5, fontWeight: '800', color: C.amber },
  tripDates: { fontSize: 10.5, color: C.textMuted },
});
