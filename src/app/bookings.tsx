import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Calendar, ChevronRight, MapPin, MessageCircle, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { MyTripBooking, useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { formatDateRange } from '@/lib/datetime';
import { formatINR } from '@/lib/money';
import { ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';


type BookingFilter = 'ALL' | 'ONGOING' | 'UPCOMING' | 'COMPLETED';

const STATUS_LABEL_KEYS = {
  ONGOING: 'bookings.statusOngoing',
  UPCOMING: 'bookings.statusUpcoming',
  COMPLETED: 'bookings.statusCompleted',
} as const;

function StatusBadge({ status }: { status: 'ONGOING' | 'UPCOMING' | 'COMPLETED' }) {
  const { t } = useTranslation();
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
          <Text style={[styles.badgeText, { color: C.green }]}>{t(STATUS_LABEL_KEYS.ONGOING)}</Text>
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
          <Text style={[styles.badgeText, { color: C.amber }]}>{t(STATUS_LABEL_KEYS.UPCOMING)}</Text>
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
          <Text style={[styles.badgeText, { color: C.purple }]}>{t(STATUS_LABEL_KEYS.COMPLETED)}</Text>
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
  const { t } = useTranslation();
  return (
    <View style={styles.bookingCard}>
      {/* Card Image Header */}
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: booking.coverImage }} style={styles.cardImage} />
        <LinearGradient colors={['rgba(7,9,19,0.15)', 'rgba(7,9,19,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={styles.cardHeaderOverlay}>
          <StatusBadge status={booking.status} />
          {booking.memberRole !== 'MEMBER' && (
            <Text style={styles.bookingIdText}>{booking.memberRole === 'ORGANIZER' ? t('bookings.roleOrganizer') : t('bookings.roleCoLead')}</Text>
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
            {formatDateRange(booking.startDate, booking.endDate)}
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
            {t('bookings.meetingPoint', { point: booking.meetingPoint })}
          </Text>
        </View>

        {/* Travelers and Budget Divider */}
        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View style={styles.footerCol}>
            <View style={styles.footerIconLabel}>
              <Users size={12} color={C.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.footerLabel}>{t('bookings.travelers')}</Text>
            </View>
            <Text style={styles.footerValue}>
              {booking.membersCount}/{booking.totalSeats}
            </Text>
          </View>

          <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
            <View style={styles.footerIconLabel}>
              <Text style={styles.footerLabel}>{t('bookings.estBudget')}</Text>
            </View>
            <Text style={[styles.footerValue, { color: C.green }]}>
              {formatINR(booking.budget)}
            </Text>
          </View>
        </View>

        {/* Contextual Action Button */}
        {booking.status === 'ONGOING' ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.actionBtn}
            onPress={onTrackLive}
            accessibilityRole="button"
            accessibilityLabel={t('bookings.trackLiveTrip')}
          >
            <Text style={styles.actionBtnText}>{t('bookings.trackLiveTrip')}</Text>
            <ChevronRight size={14} color={C.white} />
          </TouchableOpacity>
        ) : booking.status === 'UPCOMING' && booking.chatRoomId ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.actionBtn}
            onPress={() => onOpenChat(booking.chatRoomId)}
            accessibilityRole="button"
            accessibilityLabel={t('bookings.openTripChat')}
          >
            <MessageCircle size={14} color={C.white} style={{ marginRight: 2 }} />
            <Text style={styles.actionBtnText}>{t('bookings.openTripChat')}</Text>
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
const FILTER_LABEL_KEYS: Record<BookingFilter, string> = {
  ALL: 'bookings.filterAll',
  ONGOING: 'bookings.filterOngoing',
  UPCOMING: 'bookings.filterUpcoming',
  COMPLETED: 'bookings.filterCompleted',
};

export default function BookingsScreen() {
  const { t } = useTranslation();
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
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('bookings.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bookings.title')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      {/* Tabs / Segment Filter */}
      <View style={styles.tabsRow}>
        {(['ALL', 'ONGOING', 'UPCOMING', 'COMPLETED'] as BookingFilter[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.8}
              onPress={() => setFilter(tab)}
              style={styles.tabBtn}
              accessibilityRole="button"
              accessibilityLabel={t(FILTER_LABEL_KEYS[tab])}
              accessibilityState={{ selected: isActive }}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#00F2FE', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeTabGradient}
                >
                  <Text style={[styles.tabText, styles.activeTabText]}>
                    {t(FILTER_LABEL_KEYS[tab])}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveTabBox}>
                  <Text style={[styles.tabText, styles.inactiveTabText]}>
                    {t(FILTER_LABEL_KEYS[tab])}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookings List */}
      {!isLoggedIn ? (
        <ScreenEmpty
          title={t('bookings.signInRequired')}
          message={t('bookings.signInRequiredMessage')}
          actionLabel={t('bookings.signIn')}
          onAction={() => router.navigate('/auth')}
        />
      ) : isLoading ? (
        <ScreenLoading label={t('bookings.loadingBookings')} />
      ) : isError ? (
        <ScreenError
          message={error instanceof Error ? error.message : t('bookings.couldNotLoadBookings')}
          onRetry={() => refetch()}
        />
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
            <ScreenEmpty
              title={t('bookings.noBookings')}
              message={myTrips.length === 0 ? t('bookings.noBookingsAtAll') : t('bookings.noBookingsInCategory')}
            />
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
    height: MIN_TOUCH_TARGET,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bookingIdText: {
    color: C.textSec,
    fontSize: 12,
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
    fontSize: 12,
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
