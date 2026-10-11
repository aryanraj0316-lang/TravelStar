// The booking half of the trip details sheet (TripDetailModal.tsx and its
// .web twin both render this): the code of conduct, the cancellation
// policy, the consent checkbox and the one action that fits where this
// traveller's booking currently stands —
//
//   none / rejected / cancelled → consent + "Proceed to Payment • ₹X"
//                                 (or "Request to Join" on a free trip)
//   PENDING                     → waiting for the organizer (withdraw)
//   PAYMENT_PENDING             → complete payment
//   PAYMENT_COMPLETED /
//   ALLOCATION_PENDING          → paid; organizer is assigning seat & rooms
//   CONFIRMED                   → Trip Pass + Enter Group Chat
//
// Nothing here decides money or seats: the server prices the booking and
// owns every status. This only shows them and sends the traveller onward.
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import Clock from 'lucide-react-native/icons/clock';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Ticket from 'lucide-react-native/icons/ticket';
import X from 'lucide-react-native/icons/x';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { errorToastMessage, toast } from '@/lib/feedback';
import { formatINR } from '@/lib/money';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

export type BookingRequestOpts = {
  midway?: boolean;
  fromCity?: string;
  toCity?: string;
  familyMemberCount?: number;
  fromStopId?: string;
  toStopId?: string;
  joiningDate?: string;
};

type Props = {
  trip: { id: string; availableSeats: number; rules?: string | null };
  /** Per-person price shown to the traveller (midway-adjusted when segmented). */
  perPersonPrice: number;
  /** Requester + family members. */
  partySize: number;
  /** Midway / Family Connect choices, sent with the booking. */
  requestOpts?: BookingRequestOpts;
  isMyTrip: boolean;
  onClose: () => void;
  /** A free trip's request was sent; the sheet shows its own confirmation. */
  onFreeRequestSent: () => void;
};

const CONDUCT_KEYS: [string, string][] = [
  ['booking.conductSubstances', 'Strictly no smoking, alcohol or substance abuse during the trip.'],
  ['booking.conductHarassment', 'Zero tolerance for harassment of any kind — offenders are removed without refund.'],
  ['booking.conductHeritage', 'Respect local communities, heritage sites and your guide’s instructions.'],
  ['booking.conductSafety', 'Follow the organizer’s safety briefings and assembly times.'],
];

const POLICY_KEYS: [string, string][] = [
  ['booking.policy7Days', '7+ days before departure: 95.5% refund (the 4.5% platform fee is non-refundable).'],
  ['booking.policy3Days', '3–7 days before departure: 50% refund.'],
  ['booking.policyUnder3Days', 'Less than 3 days before departure: no refund.'],
];

export default function TripBookingActions({
  trip,
  perPersonPrice,
  partySize,
  requestOpts,
  isMyTrip,
  onClose,
  onFreeRequestSent,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn, joinTrip, cancelJoinRequest, joinRequestStatuses, setActiveRoomId } = useApp();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  if (isMyTrip) return null;

  const myRequest = joinRequestStatuses.get(trip.id);
  const status = myRequest?.status;
  const total = Math.max(0, perPersonPrice) * Math.max(1, partySize);
  const isPaid = total > 0;
  const soldOut = trip.availableSeats < Math.max(1, partySize);

  const openPass = () => {
    onClose();
    router.push({ pathname: '/trip-pass', params: { tripId: trip.id } });
  };

  const enterChat = async () => {
    setOpeningChat(true);
    try {
      const booking = await apiService.getMyBooking(trip.id);
      if (!booking?.chatRoomId) {
        toast(t('booking.chatNotReady', 'The group chat opens once the organizer confirms your booking.'), 'info');
        return;
      }
      onClose();
      setActiveRoomId(booking.chatRoomId);
      router.push({ pathname: '/(tabs)/chat', params: { roomId: booking.chatRoomId } });
    } catch (e) {
      toast(errorToastMessage(e, t('booking.couldNotOpenChat', 'Could not open the group chat.')), 'error');
    } finally {
      setOpeningChat(false);
    }
  };

  const book = async () => {
    if (!isLoggedIn) {
      onClose();
      router.push('/auth');
      return;
    }
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      const created = await joinTrip(trip.id, { ...(requestOpts ?? {}), acceptedTerms: true });
      if (!created) return;
      if (created.status === 'PAYMENT_PENDING') {
        onClose();
        router.push({ pathname: '/trip-payment', params: { joinRequestId: created.id } });
      } else if (created.status === 'PENDING') {
        onFreeRequestSent();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Live booking states ──────────────────────────────────────────────
  if (status === 'PENDING') {
    return (
      <StatusCard
        tone="green"
        icon={<CheckCircle size={18} color={C.greenText} />}
        title={t('tripDetailModal.requestSubmittedTitle', 'Request submitted')}
        sub={t('booking.awaitingOrganizerFree', 'The organizer will approve your request and assign your seat and rooms.')}
      >
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => cancelJoinRequest(trip.id)} accessibilityRole="button">
          <Text style={styles.secondaryBtnText}>{t('tripDetailModal.withdrawRequest', 'Withdraw request')}</Text>
        </TouchableOpacity>
      </StatusCard>
    );
  }

  if (status === 'PAYMENT_PENDING' && myRequest) {
    return (
      <StatusCard
        tone="blue"
        icon={<Clock size={18} color={C.blueText} />}
        title={t('tripDetailModal.paymentRequiredTitle', 'Payment pending')}
        sub={t('booking.paymentPendingSub', 'Complete your payment to reserve your seat.')}
      >
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            onClose();
            router.push({ pathname: '/trip-payment', params: { joinRequestId: myRequest.id } });
          }}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{t('tripDetailModal.completePayment', 'Complete payment')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => cancelJoinRequest(trip.id)} accessibilityRole="button">
          <Text style={styles.secondaryBtnText}>{t('booking.cancelBooking', 'Cancel booking')}</Text>
        </TouchableOpacity>
      </StatusCard>
    );
  }

  if (status === 'PAYMENT_COMPLETED' || status === 'ALLOCATION_PENDING') {
    return (
      <StatusCard
        tone="blue"
        icon={<Ticket size={18} color={C.blueText} />}
        title={
          status === 'PAYMENT_COMPLETED'
            ? t('booking.paymentVerifiedTitle', 'Payment verified')
            : t('booking.seatReservedTitle', 'Seat reserved')
        }
        sub={t('booking.awaitingAllocationSub', 'The organizer will verify your token and assign your seat and hotel rooms shortly.')}
      >
        <TouchableOpacity style={styles.primaryBtn} onPress={openPass} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>{t('booking.viewBooking', 'View booking & token')}</Text>
        </TouchableOpacity>
      </StatusCard>
    );
  }

  if (status === 'CONFIRMED') {
    return (
      <StatusCard
        tone="green"
        icon={<CheckCircle size={18} color={C.greenText} />}
        title={t('booking.confirmedTitle', 'Booking confirmed')}
        sub={t('booking.confirmedSub', 'Your seat and rooms are assigned. See your Trip Pass and say hello to the group.')}
      >
        <TouchableOpacity style={styles.primaryBtn} onPress={openPass} accessibilityRole="button">
          <Ticket size={15} color="#FFF" />
          <Text style={styles.primaryBtnText}>{t('booking.viewTripPass', 'View Trip Pass')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void enterChat()} disabled={openingChat} accessibilityRole="button">
          {openingChat ? <ActivityIndicator size="small" color={C.accent} /> : <MessageCircle size={15} color={C.accent} />}
          <Text style={styles.secondaryBtnText}>{t('booking.enterGroupChat', 'Enter Group Chat')}</Text>
        </TouchableOpacity>
      </StatusCard>
    );
  }

  // ── Not booked (or a closed booking): rules, policy, consent, CTA ────
  const closedNotice =
    status === 'REJECTED'
      ? t('tripDetailModal.requestRejectedSub', 'The organizer declined your last request. You can book again.')
      : status === 'CANCELLED' || status === 'REFUNDED'
        ? t('booking.previouslyCancelled', 'You cancelled an earlier booking for this trip. You can book again.')
        : null;

  const ctaLabel = !isLoggedIn
    ? t('tripDetailModal.signInToJoin', 'Sign in to join')
    : soldOut
      ? t('booking.soldOut', 'No seats left')
      : isPaid
        ? t('booking.proceedToPayment', { amount: formatINR(total), defaultValue: 'Proceed to Payment • {{amount}}' })
        : t('booking.requestFreeJoin', 'Request to Join');
  const disabled = isLoggedIn && (!agreed || soldOut || submitting);

  return (
    <View style={styles.wrap}>
      {closedNotice ? (
        <View style={styles.noticeRow}>
          <X size={14} color={C.redText} />
          <Text style={styles.noticeText}>{closedNotice}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t('booking.conductTitle', 'Code of Conduct & Safety')}</Text>
      <View style={styles.card}>
        {CONDUCT_KEYS.map(([key, fallback]) => (
          <View key={key} style={styles.bulletRow}>
            <ShieldCheck size={13} color={C.accent} />
            <Text style={styles.bulletText}>{t(key, fallback)}</Text>
          </View>
        ))}
        {trip.rules ? (
          <View style={[styles.bulletRow, { marginTop: 4 }]}>
            <ShieldCheck size={13} color={C.amberText} />
            <Text style={styles.bulletText}>
              <Text style={{ fontWeight: '700' }}>{t('booking.organizerRules', 'Organizer’s rules: ')}</Text>
              {trip.rules}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>{t('booking.policyTitle', 'Cancellation Policy')}</Text>
      <View style={styles.card}>
        {POLICY_KEYS.map(([key, fallback]) => (
          <View key={key} style={styles.bulletRow}>
            <Clock size={13} color={C.textSecondary} />
            <Text style={styles.bulletText}>{t(key, fallback)}</Text>
          </View>
        ))}
      </View>

      {isLoggedIn ? (
        <Pressable
          style={styles.consentRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel={t('booking.consentLabel', 'I have read and agree to the Trip Rules, Guidelines, and Cancellation Policy.')}
          hitSlop={6}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed ? <CheckCircle size={14} color="#FFF" /> : null}
          </View>
          <Text style={styles.consentText}>
            {t('booking.consentLabel', 'I have read and agree to the Trip Rules, Guidelines, and Cancellation Policy.')}
          </Text>
        </Pressable>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryBtn, styles.ctaBtn, disabled && styles.btnDisabled]}
        onPress={() => void book()}
        disabled={disabled}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        accessibilityState={{ disabled }}
      >
        {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryBtnText}>{ctaLabel}</Text>}
      </TouchableOpacity>
      {isPaid && isLoggedIn ? (
        <Text style={styles.footnote}>
          {t('booking.payFootnote', 'Your seat is reserved the moment payment succeeds. You’ll get a booking token, and the organizer then assigns your seat and rooms.')}
        </Text>
      ) : null}
    </View>
  );
}

function StatusCard({
  tone,
  icon,
  title,
  sub,
  children,
}: {
  tone: 'green' | 'blue';
  icon: React.ReactNode;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.statusCard, tone === 'green' ? styles.statusGreen : styles.statusBlue]}>
      <View style={styles.statusRow}>
        <View style={styles.statusIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{title}</Text>
          <Text style={styles.statusSub}>{sub}</Text>
        </View>
      </View>
      {children ? <View style={{ gap: 8, marginTop: 12 }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 6 },
  card: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 8,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.roseGlow,
    borderRadius: 10,
    padding: 10,
  },
  noticeText: { flex: 1, fontSize: 12, color: C.redText, fontWeight: '600' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.borderGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  consentText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaBtn: { marginTop: 6 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.45 },
  secondaryBtn: {
    flexDirection: 'row',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  footnote: { fontSize: 11.5, color: C.textMuted, textAlign: 'center', lineHeight: 16 },
  statusCard: { marginTop: 14, borderRadius: 14, padding: 14, borderWidth: 1 },
  statusGreen: { backgroundColor: C.greenGlow, borderColor: '#A7F3D0' },
  statusBlue: { backgroundColor: C.blueGlow, borderColor: '#BFDBFE' },
  statusRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  statusSub: { fontSize: 12.5, color: C.textSec, marginTop: 2, lineHeight: 18 },
});
