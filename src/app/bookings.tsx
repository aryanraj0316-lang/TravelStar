import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Compass,
  MapPin,
  MessageCircle,
  Users,
} from 'lucide-react-native';
import React, { useState } from 'react';
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

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { MyTripBooking, useApp } from '@/store/AppContext';

const C = {
  bg: '#070913',
  card: '#121524',
  cardAlt: '#1A1D30',
  border: '#1D2138',
  white: '#FFFFFF',
  textSec: '#8A92A6',
  textMuted: '#6A7182',
  blue: '#0066FF',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#EC4899',
};

type BookingFilter = 'ALL' | 'ONGOING' | 'UPCOMING' | 'COMPLETED';

function StatusBadge({ status }: { status: 'ONGOING' | 'UPCOMING' | 'COMPLETED' }) {
  switch (status) {
    case 'ONGOING':
      return (
        <View
          style={[
            styles.badgeContainer,
            {
              backgroundColor: 'rgba(16,185,129,0.1)',
              borderColor: 'rgba(16,185,129,0.35)',
            },
          ]}
        >
          <View style={[styles.pulseDot, { backgroundColor: C.green }]} />
          <Text style={[styles.badgeText, { color: C.green }]}>ONGOING</Text>
        </View>
      );
    case 'UPCOMING':
      return (
        <View
          style={[
            styles.badgeContainer,
            {
              backgroundColor: 'rgba(245,158,11,0.1)',
              borderColor: 'rgba(245,158,11,0.35)',
            },
          ]}
        >
          <View style={[styles.pulseDot, { backgroundColor: C.amber }]} />
          <Text style={[styles.badgeText, { color: C.amber }]}>UPCOMING</Text>
        </View>
      );
    case 'COMPLETED':
      return (
        <View
          style={[
            styles.badgeContainer,
            {
              backgroundColor: 'rgba(139,92,246,0.1)',
              borderColor: 'rgba(139,92,246,0.35)',
            },
          ]}
        >
          <View style={[styles.pulseDot, { backgroundColor: C.purple }]} />
          <Text style={[styles.badgeText, { color: C.purple }]}>COMPLETED</Text>
        </View>
      );
  }
}

// Each row is its own component so the React Compiler
// (app.json > experiments.reactCompiler) memoizes rows independently. No
// hand-written React.memo/useCallback: when the compiler can't prove manual
// memoization matches what it would infer, it skips optimizing the component
// altogether. Virtualization is the part the compiler does not do, and that
// is what changed here (docs/REMEDIATION.md Phase 10).
function BookingCard({
  booking,
  onOpenChat,
  onTrackLive,
}: {
  booking: MyTripBooking;
  onOpenChat: (chatRoomId?: string) => void;
  onTrackLive: () => void;
}) {
  return (
    <View style={styles.bookingCard}>
      {/* Card Image Header */}
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: booking.coverImage }} style={styles.cardImage} />
        <LinearGradient colors={['rgba(7,9,19,0.15)', 'rgba(7,9,19,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={styles.cardHeaderOverlay}>
          <StatusBadge status={booking.status} />
          {booking.memberRole !== 'MEMBER' && (
            <Text style={styles.bookingIdText}>{booking.memberRole === 'ORGANIZER' ? 'Organizer' : 'Co-Lead'}</Text>
          )}
        </View>
      </View>

      {/* Card Details */}
      <View style={styles.cardDetails}>
        <Text style={styles.tripName} numberOfLines={1}>
          {booking.name}
        </Text>

        {/* Dates */}
        <View style={styles.detailRow}>
          <Calendar size={13} color={C.textSec} style={{ marginRight: 6 }} />
          <Text style={styles.detailText}>
            {booking.startDate} to {booking.endDate}
          </Text>
        </View>

        {/* Route */}
        <View style={styles.detailRow}>
          <MapPin size={13} color={C.textSec} style={{ marginRight: 6 }} />
          <Text style={styles.detailText} numberOfLines={1}>
            {booking.cities.join(' → ')}
          </Text>
        </View>

        {/* Meeting Point */}
        <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
          <MapPin size={13} color={C.textSec} style={{ marginRight: 6, marginTop: 2 }} />
          <Text style={[styles.detailText, { flex: 1 }]} numberOfLines={2}>
            Meeting: {booking.meetingPoint}
          </Text>
        </View>

        {/* Travelers and Budget Divider */}
        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View style={styles.footerCol}>
            <View style={styles.footerIconLabel}>
              <Users size={12} color={C.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.footerLabel}>Travelers</Text>
            </View>
            <Text style={styles.footerValue}>
              {booking.membersCount}/{booking.totalSeats}
            </Text>
          </View>

          <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
            <View style={styles.footerIconLabel}>
              <Text style={styles.footerLabel}>Est. Budget</Text>
            </View>
            <Text style={[styles.footerValue, { color: C.green }]}>
              ₹{Number(booking.budget).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Contextual Action Button */}
        {booking.status === 'ONGOING' ? (
          <TouchableOpacity activeOpacity={0.8} style={styles.actionBtn} onPress={onTrackLive}>
            <Text style={styles.actionBtnText}>Track Live Trip</Text>
            <ChevronRight size={14} color={C.white} />
          </TouchableOpacity>
        ) : booking.status === 'UPCOMING' && booking.chatRoomId ? (
          <TouchableOpacity activeOpacity={0.8} style={styles.actionBtn} onPress={() => onOpenChat(booking.chatRoomId)}>
            <MessageCircle size={14} color={C.white} style={{ marginRight: 2 }} />
            <Text style={styles.actionBtnText}>Open Trip Chat</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const keyExtractor = (b: MyTripBooking) => b.id;

// This screen used to render MOCK_BOOKINGS: fake trips with a fabricated
// "Amount Paid" and a bookingId, plus Alert.alert popups pretending to
// verify an e-ticket / accept a review (docs/REMEDIATION.md §8.11).
// Payments/wallet were removed for v1 (§5.5/§5.6), so there is nothing to
// pay, no ticket, and nothing to verify — a real, unfaked "booking" here is
// simply a trip the user has a confirmed seat on, sourced from
// GET /trips/mine (a TripMember row). No amount, no ticket ID, no rating
// flow are shown because none of those exist yet.
export default function BookingsScreen() {
  const router = useRouter();
  const { isLoggedIn, setActiveRoomId } = useApp();
  const [filter, setFilter] = useState<BookingFilter>('ALL');

  const {
    data: myTrips = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: queryKeys.myTrips(),
    queryFn: async () => (await apiService.getMyTrips()) ?? [],
    enabled: isLoggedIn,
  });

  const filteredBookings = myTrips.filter((b) => filter === 'ALL' || b.status === filter);

  const openTripChat = (chatRoomId?: string) => {
    if (!chatRoomId) return;
    setActiveRoomId(chatRoomId);
    // Navigating to a tab route that's already an ancestor in the stack pops
    // back to it rather than pushing a duplicate.
    router.navigate('/chat');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bookings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs / Segment Filter */}
      <View style={styles.tabsRow}>
        {(['ALL', 'ONGOING', 'UPCOMING', 'COMPLETED'] as BookingFilter[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity key={tab} activeOpacity={0.8} onPress={() => setFilter(tab)} style={styles.tabBtn}>
              {isActive ? (
                <LinearGradient
                  colors={['#00F2FE', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeTabGradient}
                >
                  <Text style={[styles.tabText, styles.activeTabText]}>
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveTabBox}>
                  <Text style={[styles.tabText, styles.inactiveTabText]}>
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookings List */}
      {!isLoggedIn ? (
        <View style={styles.emptyContainer}>
          <Compass size={64} color={C.textMuted} strokeWidth={1.2} />
          <Text style={styles.emptyText}>Sign in to see your bookings.</Text>
          <TouchableOpacity activeOpacity={0.8} style={styles.retryBtn} onPress={() => router.navigate('/auth')}>
            <Text style={styles.retryBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={C.blue} size="large" />
          <Text style={styles.emptyText}>Loading your bookings…</Text>
        </View>
      ) : isError ? (
        <View style={styles.emptyContainer}>
          <AlertCircle size={56} color={C.rose} strokeWidth={1.4} />
          <Text style={styles.emptyText}>
            {error instanceof Error ? error.message : 'Could not load your bookings.'}
          </Text>
          <TouchableOpacity activeOpacity={0.8} style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => (
            <BookingCard booking={item} onOpenChat={openTripChat} onTrackLive={() => router.navigate('/map')} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.blue} />}
          initialNumToRender={3}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Compass size={64} color={C.textMuted} strokeWidth={1.2} />
              <Text style={styles.emptyText}>
                {myTrips.length === 0 ? "You haven't joined any trips yet." : 'No bookings found in this category.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginVertical: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    height: 40,
  },
  activeTabGradient: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveTabBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#121524',
    borderWidth: 1,
    borderColor: '#1D2138',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabText: {
    color: C.white,
    fontWeight: '700',
  },
  inactiveTabText: {
    color: C.textSec,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },
  bookingCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardImageContainer: {
    height: 170,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardHeaderOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bookingIdText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '600',
  },
  cardDetails: {
    padding: 16,
  },
  tripName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    color: C.textSec,
    fontSize: 12.5,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  footerCol: {
    gap: 4,
  },
  footerIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    height: 44,
    gap: 6,
  },
  actionBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
