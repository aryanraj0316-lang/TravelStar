// The traveller's Trip Pass: their booking token, the receipt, and — once
// the organizer has allocated them — a pass for every day/checkpoint
// (hotel & room, vehicle & seat, assembly time), plus the way into the
// trip's group chat. Before allocation it shows where the booking stands;
// it is also where a booking is cancelled, with the refund the policy
// gives right now shown before the traveller commits.
import TravellerDetailsCard from '@/components/booking/TravellerDetailsCard';
import { ScreenError, ScreenLoading } from '@/components/ui/ScreenState';
import { formatDate } from '@/lib/datetime';
import { errorToastMessage, toast, useConfirm } from '@/lib/feedback';
import { formatINR } from '@/lib/money';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { MyBooking, TripAllocation } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BedDouble from 'lucide-react-native/icons/bed-double';
import Bus from 'lucide-react-native/icons/bus';
import Clock from 'lucide-react-native/icons/clock';
import MapPin from 'lucide-react-native/icons/map-pin';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import StickyNote from 'lucide-react-native/icons/sticky-note';
import Ticket from 'lucide-react-native/icons/ticket';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_COPY: Record<string, [string, string, string]> = {
  // status: [i18n key, fallback, colour]
  PENDING: ['tripPass.statusPending', 'Awaiting organizer', C.amberText],
  PAYMENT_PENDING: ['tripPass.statusPaymentPending', 'Payment pending', C.amberText],
  PAYMENT_COMPLETED: ['tripPass.statusPaid', 'Paid · awaiting allocation', C.blueText],
  ALLOCATION_PENDING: ['tripPass.statusVerified', 'Verified · awaiting allocation', C.blueText],
  CONFIRMED: ['tripPass.statusConfirmed', 'Confirmed', C.greenText],
  CANCELLED: ['tripPass.statusCancelled', 'Cancelled', C.redText],
  REFUNDED: ['tripPass.statusRefunded', 'Cancelled · refunded', C.redText],
  REJECTED: ['tripPass.statusRejected', 'Declined by organizer', C.redText],
};

const CANCELLABLE = new Set(['PENDING', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'ALLOCATION_PENDING', 'CONFIRMED']);

export default function TripPassScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const confirm = useConfirm();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { setActiveRoomId, reloadJoinRequests, refreshTrips } = useApp();
  const [cancelling, setCancelling] = useState(false);

  const query = useQuery({
    queryKey: ['booking', 'mine', tripId],
    queryFn: () => apiService.getMyBooking(tripId!),
    enabled: !!tripId,
  });
  const booking = query.data ?? null;

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
        <ArrowLeft size={20} color={C.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('tripPass.title', 'Trip Pass')}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (query.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        {header}
        <ScreenLoading label={t('tripPass.loading', 'Loading your booking…')} />
      </SafeAreaView>
    );
  }
  if (query.isError || !booking) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        {header}
        <ScreenError
          title={t('tripPass.notFoundTitle', 'Booking not available')}
          message={errorToastMessage(query.error, t('tripPass.notFound', 'We could not find a booking for this trip.'))}
          onRetry={() => void query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const [statusKey, statusFallback, statusColor] = STATUS_COPY[booking.status] ?? ['', booking.status, C.textSec];
  const token = booking.bookingReferenceToken;

  const enterChat = () => {
    if (!booking.chatRoomId) return;
    setActiveRoomId(booking.chatRoomId);
    router.push({ pathname: '/(tabs)/chat', params: { roomId: booking.chatRoomId } });
  };

  const cancel = async () => {
    const refund = booking.cancellation.refundAmount;
    const paid = booking.payment && Number(booking.payment.amount) > 0 && booking.payment.status === 'CAPTURED';
    const message = !paid
      ? t('tripPass.cancelUnpaid', 'Your booking will be withdrawn.')
      : Number(refund) > 0
        ? t('tripPass.cancelWithRefund', {
            amount: formatINR(refund),
            percent: booking.cancellation.refundPercent,
            defaultValue: 'You will be refunded {{amount}} ({{percent}}%) to your original payment method. Your seat will be released.',
          })
        : t('tripPass.cancelNoRefund', 'Departure is less than 3 days away, so no refund is due. Your seat will be released.');
    const ok = await confirm({
      title: t('tripPass.cancelTitle', 'Cancel this booking?'),
      message,
      confirmLabel: t('tripPass.cancelConfirm', 'Cancel booking'),
      cancelLabel: t('tripPass.keepBooking', 'Keep booking'),
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const result = await apiService.cancelBooking(booking.trip.id);
      toast(
        result && Number(result.refundAmount) > 0
          ? t('tripPass.cancelledRefund', { amount: formatINR(result.refundAmount), defaultValue: 'Booking cancelled. {{amount}} is on its way back to you.' })
          : t('tripPass.cancelled', 'Booking cancelled.'),
        'success',
      );
      reloadJoinRequests();
      refreshTrips();
      await query.refetch();
    } catch (e) {
      toast(errorToastMessage(e, t('tripPass.cancelFailed', 'Could not cancel the booking. Please try again.')), 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {/* Trip + status */}
        <View style={styles.passCard}>
          <View style={styles.passTop}>
            <Ticket size={18} color={C.accent} />
            <Text style={styles.passTripName} numberOfLines={2}>{booking.trip.name}</Text>
          </View>
          <Text style={styles.passDates}>
            {formatDate(booking.trip.startDate)} – {formatDate(booking.trip.endDate)}
            {booking.partySize > 1 ? `  ·  ${t('tripPass.partyOf', { count: booking.partySize, defaultValue: 'Party of {{count}}' })}` : ''}
          </Text>
          <View style={[styles.statusPill, { borderColor: statusColor }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusKey ? t(statusKey, statusFallback) : statusFallback}</Text>
          </View>

          {token ? (
            <View style={styles.tokenBox}>
              <Text style={styles.tokenLabel}>{t('tripPass.tokenLabel', 'BOOKING REFERENCE TOKEN')}</Text>
              <Text style={styles.tokenValue} selectable>{token}</Text>
              <Text style={styles.tokenHint}>{t('tripPass.tokenHint', 'Show this to your organizer at assembly.')}</Text>
            </View>
          ) : null}

          <View style={styles.meetRow}>
            <MapPin size={14} color={C.textSecondary} />
            <Text style={styles.meetText}>{booking.trip.meetingPoint}</Text>
          </View>
        </View>

        {/* Where the booking stands */}
        {booking.status === 'PAYMENT_PENDING' ? (
          <Banner tone="amber" text={t('tripPass.completePaymentBanner', 'Your seat is not reserved until payment is complete.')}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push({ pathname: '/trip-payment', params: { joinRequestId: booking.joinRequestId, autostart: '1' } })}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {t('tripPass.completePayment', { amount: formatINR(booking.amountDue ?? '0'), defaultValue: 'Complete payment • {{amount}}' })}
              </Text>
            </TouchableOpacity>
          </Banner>
        ) : null}
        {booking.status === 'PAYMENT_COMPLETED' || booking.status === 'ALLOCATION_PENDING' || booking.status === 'PENDING' ? (
          <Banner
            tone="blue"
            text={
              booking.status === 'PENDING'
                ? t('tripPass.pendingBanner', 'The organizer will review your request, then assign your seat and rooms.')
                : t('tripPass.awaitingAllocationBanner', 'Payment verified! The organizer will verify your token and assign your seat and hotel rooms shortly. Your Trip Pass and the group chat unlock then.')
            }
          />
        ) : null}

        {/* Day-by-day passes */}
        {booking.status === 'CONFIRMED' ? (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, !booking.chatRoomId && styles.btnDisabled]}
              onPress={enterChat}
              disabled={!booking.chatRoomId}
              accessibilityRole="button"
            >
              <MessageCircle size={17} color="#FFF" />
              <Text style={styles.primaryBtnText}>{t('tripPass.enterGroupChat', 'Enter Group Chat')}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>{t('tripPass.dayByDay', 'Your day-by-day pass')}</Text>
            {booking.allocations.length === 0 ? (
              <Text style={styles.muted}>{t('tripPass.noAllocations', 'Your organizer has not added stop details for this booking.')}</Text>
            ) : (
              booking.allocations.map((a) => <AllocationCard key={a.id ?? `${a.dayNumber}-${a.checkpointName}`} a={a} />)
            )}
          </>
        ) : null}

        {/* What the traveller submitted before paying */}
        {booking.travellerDetails && booking.travellerDetails.length > 0 ? (
          <TravellerDetailsCard
            travellers={booking.travellerDetails}
            title={t('tripPass.travellerDetails', 'Traveller details')}
            subtitle={t('tripPass.travellerDetailsSub', 'Shared with your organizer. Carry the same ID on the trip.')}
          />
        ) : null}

        {/* Receipt */}
        {booking.payment ? <Receipt booking={booking} /> : null}

        {CANCELLABLE.has(booking.status) ? (
          <View style={styles.cancelBox}>
            <Text style={styles.cancelTitle}>{t('tripPass.cancellationTitle', 'Cancellation')}</Text>
            <Text style={styles.muted}>
              {booking.payment?.status === 'CAPTURED'
                ? Number(booking.cancellation.refundAmount) > 0
                  ? t('tripPass.refundIfCancelledNow', {
                      amount: formatINR(booking.cancellation.refundAmount),
                      percent: booking.cancellation.refundPercent,
                      defaultValue: 'Cancel now and get {{amount}} back ({{percent}}%).',
                    })
                  : t('tripPass.noRefundNow', 'Departure is less than 3 days away — cancelling now gives no refund.')
                : t('tripPass.nothingPaid', 'Nothing has been paid, so cancelling costs nothing.')}
            </Text>
            <Text style={styles.policy}>
              {t('tripPass.policyShort', '7+ days before: 95.5% back · 3–7 days: 50% · under 3 days: no refund.')}
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => void cancel()} disabled={cancelling} accessibilityRole="button">
              {cancelling ? <ActivityIndicator size="small" color={C.redText} /> : <Text style={styles.cancelBtnText}>{t('tripPass.cancelConfirm', 'Cancel booking')}</Text>}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Banner({ tone, text, children }: { tone: 'amber' | 'blue'; text: string; children?: React.ReactNode }) {
  return (
    <View style={[styles.banner, tone === 'amber' ? styles.bannerAmber : styles.bannerBlue]}>
      <Clock size={16} color={tone === 'amber' ? C.amberText : C.blueText} />
      <View style={{ flex: 1, gap: 10 }}>
        <Text style={styles.bannerText}>{text}</Text>
        {children}
      </View>
    </View>
  );
}

function AllocationCard({ a }: { a: TripAllocation }) {
  const { t } = useTranslation();
  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{t('tripPass.dayN', { day: a.dayNumber, defaultValue: 'Day {{day}}' })}</Text>
        </View>
        <Text style={styles.dayCheckpoint} numberOfLines={1}>📍 {a.checkpointName}</Text>
      </View>
      <View style={styles.dayGrid}>
        <PassField icon={<BedDouble size={14} color={C.accent} />} label={a.hotelName ?? '—'} value={a.roomNumber} />
        <PassField
          icon={<Bus size={14} color={C.accent} />}
          label={[a.transitType, a.vehicleNumber].filter(Boolean).join(' · ') || '—'}
          value={a.seatNumber}
        />
      </View>
      {a.assemblyTime ? (
        <View style={styles.dayRow}>
          <Clock size={13} color={C.textSecondary} />
          <Text style={styles.dayRowText}>{t('tripPass.assembly', { time: a.assemblyTime, defaultValue: 'Assembly: {{time}}' })}</Text>
        </View>
      ) : null}
      {a.notes ? (
        <View style={styles.dayRow}>
          <StickyNote size={13} color={C.textSecondary} />
          <Text style={styles.dayRowText}>{a.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PassField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <View style={styles.passField}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.passFieldLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.passFieldValue}>{value ?? '—'}</Text>
      </View>
    </View>
  );
}

function Receipt({ booking }: { booking: MyBooking }) {
  const { t } = useTranslation();
  const p = booking.payment!;
  return (
    <View style={styles.receipt}>
      <Text style={styles.sectionTitle}>{t('tripPass.receipt', 'Receipt')}</Text>
      <Row label={t('tripPass.amountPaid', 'Amount paid')} value={formatINR(p.amount)} bold />
      {p.platformFee ? <Row label={t('tripPass.platformFee', 'Platform fee (4.5%, included)')} value={formatINR(p.platformFee)} /> : null}
      <Row label={t('tripPass.taxes', 'Taxes')} value={t('tripPass.included', 'Included')} />
      {p.paidAt ? <Row label={t('tripPass.paidOn', 'Paid on')} value={formatDate(p.paidAt)} /> : null}
      {p.gateway === 'DIRECT' ? <Row label={t('tripPass.method', 'Method')} value={t('tripPass.testBypass', 'Test bypass (no money taken)')} /> : null}
      {p.refundedAmount ? <Row label={t('tripPass.refunded', 'Refunded')} value={formatINR(p.refundedAmount)} /> : null}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: '800', fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  passCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  passTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passTripName: { flex: 1, fontSize: 18, fontWeight: '800', color: C.text },
  passDates: { fontSize: 13, color: C.textSec },
  statusPill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusPillText: { fontSize: 11.5, fontWeight: '800' },
  tokenBox: {
    marginTop: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.accent,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: C.accentLight,
  },
  tokenLabel: { fontSize: 10.5, fontWeight: '800', color: C.blueText, letterSpacing: 1 },
  tokenValue: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: 3, marginTop: 2 },
  tokenHint: { fontSize: 11.5, color: C.textSec, marginTop: 2 },
  meetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meetText: { flex: 1, fontSize: 13, color: C.textSec },
  banner: { flexDirection: 'row', gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  bannerAmber: { backgroundColor: C.amberGlow, borderColor: '#FDE68A' },
  bannerBlue: { backgroundColor: C.blueGlow, borderColor: '#BFDBFE' },
  bannerText: { fontSize: 13, color: C.text, lineHeight: 19, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.45 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  muted: { fontSize: 13, color: C.textSec, lineHeight: 19 },
  dayCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBadge: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  dayBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  dayCheckpoint: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  dayGrid: { flexDirection: 'row', gap: 10 },
  passField: { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: C.cardAlt, borderRadius: 12, padding: 10 },
  passFieldLabel: { fontSize: 11.5, color: C.textSec },
  passFieldValue: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dayRowText: { flex: 1, fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  receipt: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 13, color: C.textSec, flex: 1 },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '600' },
  cancelBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 6 },
  cancelTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  policy: { fontSize: 11.5, color: C.textMuted },
  cancelBtn: {
    marginTop: 6,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.redText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { color: C.redText, fontSize: 14, fontWeight: '700' },
});
