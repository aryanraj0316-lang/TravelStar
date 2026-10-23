import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Info from 'lucide-react-native/icons/info';
import Ticket from 'lucide-react-native/icons/ticket';
import TravellerDetailsForm from '@/components/booking/TravellerDetailsForm';
import { ScreenError, ScreenLoading } from '@/components/ui/ScreenState';
import { toast, useConfirm } from '@/lib/feedback';
import { formatINR } from '@/lib/money';
import { ApiError, apiService } from '@/services/api';
import { openRazorpayCheckout } from '@/services/razorpay';
import { useApp } from '@/store/AppContext';
import { C, fontSize, fontWeight, radii, space } from '@/theme/tokens';
import type { TravellerDetails, TripPaymentOrder, VerifyPaymentResult } from '@/types/api';
import { SEAT_HOLDING_STATUSES } from '@/types/api';

export default function TripPaymentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // autostart=1: arrived from "Proceed to Payment" — open the checkout at once.
  const params = useLocalSearchParams<{ joinRequestId: string; autostart?: string }>();
  const { refreshTrips, reloadJoinRequests } = useApp();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TripPaymentOrder | null>(null);
  const [payingGateway, setPayingGateway] = useState(false);
  const [payingWallet, setPayingWallet] = useState(false);
  // Set once a payment succeeds: the receipt with the booking token is shown
  // in place of the payment methods. Paying never opens the group chat —
  // that follows the organizer's allocation.
  const [receipt, setReceipt] = useState<Pick<VerifyPaymentResult, 'verificationToken' | 'amount'> | null>(null);
  // Why the last checkout attempt did not complete, with a retry right
  // beside it — a cancelled or failed payment never silently resets.
  const [paymentNotice, setPaymentNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  // The automatic checkout opens once per visit, never again on re-render.
  const autostartedRef = useRef(false);
  // A booking without the traveller details form (made before it existed)
  // gets the form here first; the payment the traveller chose follows.
  const [detailsFormOpen, setDetailsFormOpen] = useState(false);
  const detailsSavedRef = useRef(false);
  const afterDetailsRef = useRef<'gateway' | 'skip'>('gateway');

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0);

  const joinRequestId = params.joinRequestId;

  const loadOrder = useCallback(async () => {
    if (!joinRequestId) {
      setError('Missing join request ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getTripPaymentOrder(joinRequestId);
      if (!res) {
        setError('Payment details could not be found.');
      } else {
        setOrder(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment details.');
    } finally {
      setLoading(false);
    }
  }, [joinRequestId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // ⚠️ DEVELOPMENT BYPASS — REMOVE BEFORE LAUNCH (with POST /trip-payments/pay).
  // No money moves, but it runs the real post-payment flow: seat held,
  // verification token issued, organizer notified to allocate. Only the
  // paying step itself is skipped.
  const onPaid = (res: VerifyPaymentResult) => {
    setReceipt({ verificationToken: res.verificationToken, amount: res.amount });
    refreshTrips();
    reloadJoinRequests();
  };

  const needsDetails = () => !detailsSavedRef.current && order?.travellerDetailsSubmitted === false;
  const askForDetails = (next: 'gateway' | 'skip') => {
    afterDetailsRef.current = next;
    setDetailsFormOpen(true);
  };
  const isDetailsRequired = (err: unknown) => err instanceof ApiError && (err.code as string) === 'TRAVELLER_DETAILS_REQUIRED';

  const handleSkipPayment = async (afterDetails = false) => {
    if (!order || payingWallet) return;
    if (needsDetails()) {
      askForDetails('skip');
      return;
    }
    // Already confirmed before the details form opened.
    if (!afterDetails) {
      const confirmed = await confirm({
        title: 'Skip payment (testing)',
        message:
          'Continue without paying? Your booking goes through the real flow (seat held, token issued, organizer asked to allocate) with no money taken. Intended for testing only.',
        confirmLabel: 'Skip & continue',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }

    setPayingWallet(true);
    try {
      const res = await apiService.payTripDirect({ joinRequestId: order.joinRequestId });
      if (res?.verificationToken) {
        toast('Payment skipped (testing) — booking token issued.', 'success');
        onPaid(res);
      } else {
        toast('Could not complete the booking. Please try again.', 'error');
      }
    } catch (err: any) {
      if (isDetailsRequired(err)) {
        askForDetails('skip');
        return;
      }
      toast(err?.message || 'Could not skip payment', 'error');
    } finally {
      setPayingWallet(false);
    }
  };

  const handlePayRazorpay = async () => {
    if (!order || payingGateway) return;
    if (needsDetails()) {
      askForDetails('gateway');
      return;
    }
    setPayingGateway(true);
    setPaymentNotice(null);

    // Step B: create (or reuse) the gateway order on the server.
    let init;
    try {
      init = await apiService.initiateTripPayment({
        joinRequestId: order.joinRequestId,
        // The server reuses this booking's open Razorpay order, so a retry
        // never creates a second charge.
        idempotencyKey: 'pay-' + order.joinRequestId + '-' + Date.now(),
      });
    } catch (err) {
      setPayingGateway(false);
      if (isDetailsRequired(err)) {
        askForDetails('gateway');
        return;
      }
      if (err instanceof ApiError && err.statusCode === 503) {
        setPaymentNotice({ tone: 'error', text: 'Online payment is not available right now. Please try again shortly.' });
      } else if (err instanceof ApiError && err.code === 'TRIP_FULL') {
        setPaymentNotice({ tone: 'error', text: err.message || 'This trip no longer has enough seats.' });
      } else {
        setPaymentNotice({ tone: 'error', text: err instanceof Error && err.message ? err.message : 'Could not start the payment.' });
      }
      return;
    }
    if (!init?.orderId) {
      setPayingGateway(false);
      setPaymentNotice({ tone: 'error', text: 'Could not start the payment. Please try again.' });
      return;
    }

    // Step C: open the gateway with that order.
    let checkoutRes;
    try {
      checkoutRes = await openRazorpayCheckout({
        key: init.keyId || '',
        amount: Math.round(Number(init.amount) * 100),
        currency: 'INR',
        name: 'Yatrenzo',
        description: `Trip booking — ${order.tripName || 'group trip'}`,
        order_id: init.orderId,
        theme: { color: C.blue },
      });
    } catch (sdkErr) {
      setPayingGateway(false);
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      if (msg.includes('EXPO_GO_UNSUPPORTED')) {
        setPaymentNotice({ tone: 'error', text: 'Card/UPI checkout needs the installed app build; it is not available in Expo Go.' });
      } else if (msg.includes('PAYMENT_CANCELLED')) {
        // Step F: cancelled — nothing was charged; offer the retry.
        setPaymentNotice({ tone: 'info', text: 'Payment cancelled. Nothing was charged — tap "Pay with Razorpay" to try again.' });
      } else {
        setPaymentNotice({ tone: 'error', text: 'The payment did not go through. You have not been charged — please try again.' });
      }
      return;
    }

    // Step E: confirm it server-side, then show the receipt.
    try {
      if (!checkoutRes?.razorpay_signature) throw new Error('Missing payment signature');
      const verifyRes = await apiService.verifyTripPayment({
        razorpayOrderId: checkoutRes.razorpay_order_id,
        razorpayPaymentId: checkoutRes.razorpay_payment_id,
        razorpaySignature: checkoutRes.razorpay_signature,
      });
      if (!verifyRes?.verificationToken) throw new Error('Payment could not be confirmed');
      toast('Payment successful!', 'success');
      onPaid(verifyRes);
    } catch (err) {
      // The money may have been taken even though confirmation failed here
      // (e.g. the connection dropped); Razorpay's webhook confirms it on the
      // server. Re-check rather than inviting a second payment.
      setPaymentNotice({
        tone: 'error',
        text:
          err instanceof ApiError && err.code === 'TRIP_FULL'
            ? err.message
            : 'We could not confirm your payment yet. If you were charged it will confirm automatically — refreshing your booking…',
      });
      void loadOrder();
    } finally {
      setPayingGateway(false);
    }
  };

  // Step A → C in one tap: arriving from "Proceed to Payment" opens the
  // checkout straight away (once), instead of making the traveller find
  // and tap a second Pay button.
  useEffect(() => {
    if (params.autostart !== '1' || autostartedRef.current || !order || receipt) return;
    const paid = order.status === 'CAPTURED' || (!!order.joinRequestStatus && SEAT_HOLDING_STATUSES.includes(order.joinRequestStatus));
    if (paid) return;
    autostartedRef.current = true;
    void handlePayRazorpay();
    // handlePayRazorpay is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, params.autostart, receipt]);

  const saveDetails = async (travellerDetails: TravellerDetails[]) => {
    if (!order) return;
    await apiService.saveTravellerDetails(order.joinRequestId, travellerDetails);
    detailsSavedRef.current = true;
    setOrder((o) => (o ? { ...o, travellerDetailsSubmitted: true } : o));
    setDetailsFormOpen(false);
    // Carry on with the payment the traveller had started.
    if (afterDetailsRef.current === 'skip') void handleSkipPayment(true);
    else void handlePayRazorpay();
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <ScreenLoading label="Loading payment details..." />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <ScreenError
          title="Payment Not Available"
          message={error || 'No active payment found for this join request.'}
          onRetry={loadOrder}
        />
      </SafeAreaView>
    );
  }

  const isAlreadyPaid =
    !!receipt ||
    order.status === 'CAPTURED' ||
    (!!order.joinRequestStatus && SEAT_HOLDING_STATUSES.includes(order.joinRequestStatus));
  const token = receipt?.verificationToken ?? order.verificationToken ?? null;
  const isConfirmed = order.joinRequestStatus === 'CONFIRMED';
  const seatsLabel = (order.partySize ?? 1) > 1 ? ` × ${order.partySize} seats` : '';

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header lowered down past status bar / notch */}
      <View style={[styles.headerWrap, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Payment</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Journey Card */}
        <View style={styles.journeyCard}>
          <View style={styles.journeyCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripLabel}>GROUP JOURNEY</Text>
              <Text style={styles.tripName} numberOfLines={2}>
                {order.tripName || 'Selected Journey'}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                isAlreadyPaid ? styles.statusPillPaid : styles.statusPillPending,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  isAlreadyPaid ? styles.statusPillTextPaid : styles.statusPillTextPending,
                ]}
              >
                {isConfirmed ? 'CONFIRMED' : isAlreadyPaid ? 'PAID' : 'AWAITING PAYMENT'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Amount Display */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>{isAlreadyPaid ? 'Amount Paid' : 'Total Payable'}</Text>
            <Text style={styles.amountValue}>{formatINR(receipt?.amount ?? order.amount)}</Text>
          </View>

          {/* Breakdown: the fare is all the traveller pays; the 4.5%
              platform fee comes out of it (it is not added on top). */}
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{`Trip fare${seatsLabel}`}</Text>
            <Text style={styles.breakdownValue}>{formatINR(order.amount)}</Text>
          </View>
          {order.platformFee ? (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Platform fee (4.5%, included)</Text>
              <Text style={styles.breakdownValue}>{formatINR(order.platformFee)}</Text>
            </View>
          ) : null}
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Taxes</Text>
            <Text style={styles.breakdownValue}>Included</Text>
          </View>
        </View>

        {/* Payment Methods Section */}
        {isAlreadyPaid ? (
          <View style={styles.confirmedBox}>
            <CheckCircle2 size={36} color={C.green} />
            <Text style={styles.confirmedTitle}>{isConfirmed ? 'Booking Confirmed' : 'Payment Verified'}</Text>
            {token ? (
              <View style={styles.tokenBadge} accessibilityLabel={`Booking reference token ${token}`}>
                <Text style={styles.tokenLabel}>BOOKING REFERENCE TOKEN</Text>
                <Text style={styles.tokenValue} selectable>{token}</Text>
              </View>
            ) : null}
            <Text style={styles.confirmedSub}>
              {isConfirmed
                ? 'Your seat and rooms are assigned. Open your Trip Pass to see them and enter the group chat.'
                : 'Payment verified! The organizer will verify your token and assign your seat and hotel rooms shortly.'}
            </Text>
            <TouchableOpacity
              style={styles.chatActionBtn}
              onPress={() => {
                if (order.tripId) router.replace({ pathname: '/trip-pass', params: { tripId: order.tripId } });
                else router.replace('/bookings');
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ticket size={16} color={C.white} />
                <Text style={styles.chatActionBtnText}>{isConfirmed ? 'View Trip Pass' : 'View My Booking'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionHeading}>SELECT PAYMENT METHOD</Text>

            {payingGateway ? (
              <View style={styles.noticeBox}>
                <ActivityIndicator size="small" color={C.blue} />
                <Text style={styles.noticeText}>Opening secure checkout…</Text>
              </View>
            ) : paymentNotice ? (
              <View style={[styles.noticeBox, paymentNotice.tone === 'error' && styles.noticeBoxError]} accessibilityLiveRegion="polite">
                <Info size={16} color={paymentNotice.tone === 'error' ? C.redText : C.blueText} />
                <Text style={[styles.noticeText, paymentNotice.tone === 'error' && { color: C.redText }]}>{paymentNotice.text}</Text>
              </View>
            ) : null}

            {/* Razorpay Gateway Card */}
            <View style={styles.methodCard}>
              <View style={styles.methodTop}>
                <View style={[styles.methodIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <CreditCard size={22} color={C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Online Payment (Razorpay)</Text>
                  <Text style={styles.methodSub}>UPI, Debit/Credit Card, Net Banking</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.payBtn, styles.payBtnBlue]}
                disabled={payingGateway}
                onPress={handlePayRazorpay}
                activeOpacity={0.85}
              >
                {payingGateway ? (
                  <ActivityIndicator color={C.white} size="small" />
                ) : (
                  <>
                    <CreditCard size={18} color={C.white} />
                    <Text style={styles.payBtnText}>{paymentNotice ? 'Try again — Pay with Razorpay' : 'Pay with Razorpay'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.skipPaymentBtn}
              onPress={() => void handleSkipPayment()}
              disabled={payingWallet}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Skip payment for testing"
            >
              <Text style={styles.skipPaymentText}>Skip payment for now (testing)</Text>
              <Text style={styles.skipPaymentSub}>
                Development only — runs the real booking flow with no money taken
              </Text>
            </TouchableOpacity>

            {/* Guarantee Note */}
            <View style={styles.guaranteeBox}>
              <Info size={16} color={C.textMuted} />
              <Text style={styles.guaranteeText}>
                Your seat is reserved the moment payment is verified, and you get a booking token. If the organizer rejects the booking you are refunded in full to your original payment method. Cancellations: 95.5% back 7+ days before departure, 50% within 3–7 days, none inside 3 days.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
      <TravellerDetailsForm
        visible={detailsFormOpen}
        partySize={order.partySize ?? 1}
        submitLabel={`Continue to payment • ${formatINR(order.amount)}`}
        onClose={() => setDetailsFormOpen(false)}
        onSubmit={saveDetails}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: C.blueGlow,
    borderRadius: radii.md,
    padding: space[3],
  },
  noticeBoxError: { backgroundColor: C.roseGlow },
  noticeText: { flex: 1, fontSize: fontSize.sm, color: C.blueText, lineHeight: 19, fontWeight: fontWeight.semibold },
  skipPaymentBtn: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
    backgroundColor: C.cardAlt,
    alignItems: 'center',
    gap: 2,
  },
  skipPaymentText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.textSec,
  },
  skipPaymentSub: {
    fontSize: 11,
    color: C.textMuted,
  },
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerWrap: {
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    backgroundColor: C.white,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: C.text,
  },
  scrollContent: {
    padding: space[4],
    gap: space[4],
  },
  journeyCard: {
    backgroundColor: C.white,
    borderRadius: radii.lg,
    padding: space[4],
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  journeyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[2],
  },
  tripLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: C.blueText,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tripName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: C.text,
  },
  statusPill: {
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusPillPending: {
    backgroundColor: '#FEF3C7',
  },
  statusPillPaid: {
    backgroundColor: '#ECFDF5',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  statusPillTextPending: {
    color: '#D97706',
  },
  statusPillTextPaid: {
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: space[3],
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space[3],
  },
  amountLabel: {
    fontSize: fontSize.sm,
    color: C.textSec,
    fontWeight: fontWeight.medium,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: fontWeight.bold,
    color: C.text,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
    color: C.textSec,
  },
  breakdownValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: C.text,
  },
  paymentSection: {
    gap: space[3],
    marginTop: space[3],
  },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: C.textMuted,
    letterSpacing: 0.8,
    marginLeft: 2,
    lineHeight: 18,
    paddingVertical: 2,
  },
  methodCard: {
    backgroundColor: C.white,
    borderRadius: radii.lg,
    padding: space[4],
    borderWidth: 1,
    borderColor: C.border,
    gap: space[3],
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  methodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: C.text,
  },
  methodSub: {
    fontSize: fontSize.xs,
    color: C.textSec,
    marginTop: 2,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: 48,
    borderRadius: radii.md,
  },
  payBtnGreen: {
    backgroundColor: '#059669',
  },
  payBtnBlue: {
    backgroundColor: C.blue,
  },
  payBtnDisabled: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  payBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: C.white,
  },
  payBtnTextDisabled: {
    color: C.textMuted,
  },
  confirmedBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: radii.lg,
    padding: space[6],
    alignItems: 'center',
    gap: space[2],
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  confirmedTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#15803D',
  },
  confirmedSub: {
    fontSize: fontSize.sm,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 20,
  },
  chatActionBtn: {
    marginTop: space[3],
    backgroundColor: '#16A34A',
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radii.pill,
  },
  tokenBadge: {
    marginTop: space[2],
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: '#16A34A',
    borderStyle: 'dashed',
    paddingVertical: space[2],
    paddingHorizontal: space[5],
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#166534',
    letterSpacing: 0.8,
  },
  tokenValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#14532D',
    letterSpacing: 2,
    marginTop: 2,
  },
  chatActionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: C.white,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    backgroundColor: '#F1F5F9',
    borderRadius: radii.md,
    padding: space[3],
    marginTop: space[1],
  },
  guaranteeText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: C.textSec,
    lineHeight: 18,
  },
});
