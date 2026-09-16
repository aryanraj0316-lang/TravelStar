import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Info from 'lucide-react-native/icons/info';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Wallet from 'lucide-react-native/icons/wallet';
import { ScreenError, ScreenLoading } from '@/components/ui/ScreenState';
import { toast, useConfirm } from '@/lib/feedback';
import { formatINR } from '@/lib/money';
import { apiService } from '@/services/api';
import { openRazorpayCheckout } from '@/services/razorpay';
import { useApp } from '@/store/AppContext';
import { C, fontSize, fontWeight, radii, space } from '@/theme/tokens';
import type { TripPaymentOrder } from '@/types/api';

export default function TripPaymentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ joinRequestId: string }>();
  const { setActiveRoomId, refreshTrips, reloadJoinRequests } = useApp();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TripPaymentOrder | null>(null);
  const [payingGateway, setPayingGateway] = useState(false);
  const [payingWallet, setPayingWallet] = useState(false);

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

  const handlePayDirect = async () => {
    if (!order || payingWallet) return;
    const confirmed = await confirm({
      title: 'Confirm Payment',
      message: `Pay ${formatINR(order.amount)} to secure your seat on this trip? This amount goes to the organizer's trip budget.`,
      confirmLabel: 'Pay Now',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setPayingWallet(true);
    try {
      const res = await apiService.payTripDirect({ joinRequestId: order.joinRequestId });
      if (res?.joinRequestId) {
        toast('Payment confirmed! Welcome to the group journey.', 'success');
        refreshTrips();
        reloadJoinRequests();
        if (res.chatRoomId) {
          setActiveRoomId(res.chatRoomId);
          router.replace('/chat');
        } else {
          router.replace('/bookings');
        }
      } else {
        toast('Payment could not be completed. Please try again.', 'error');
      }
    } catch (err: any) {
      toast(err?.message || 'Payment failed', 'error');
    } finally {
      setPayingWallet(false);
    }
  };

  const handlePayRazorpay = async () => {
    if (!order || payingGateway) return;
    setPayingGateway(true);

    try {
      const idempotencyKey = 'pay-' + order.joinRequestId + '-' + Date.now();
      const init = await apiService.initiateTripPayment({
        joinRequestId: order.joinRequestId,
        idempotencyKey,
      });

      if (!init?.orderId) {
        toast('Failed to initialize payment gateway order', 'error');
        setPayingGateway(false);
        return;
      }

      let checkoutRes;
      try {
        const amountPaise = Math.round(Number(init.amount) * 100);
        checkoutRes = await openRazorpayCheckout({
          key: init.keyId || '',
          amount: amountPaise,
          currency: 'INR',
          name: 'TravelStar',
          description: `Trip joining fee for ${order.tripName || 'group trip'}`,
          order_id: init.orderId,
          theme: { color: C.blue },
        });
      } catch (sdkErr: any) {
        if (sdkErr?.message?.includes('EXPO_GO_UNSUPPORTED')) {
          toast(
            'Razorpay native checkout requires a Dev Build. Please use Wallet payment in Expo Go preview.',
            'info',
          );
          setPayingGateway(false);
          return;
        }
        if (sdkErr?.message?.includes('PAYMENT_CANCELLED')) {
          toast('Payment cancelled', 'info');
          setPayingGateway(false);
          return;
        }
        throw sdkErr;
      }

      if (checkoutRes?.razorpay_signature) {
        const verifyRes = await apiService.verifyTripPayment({
          razorpayOrderId: checkoutRes.razorpay_order_id,
          razorpayPaymentId: checkoutRes.razorpay_payment_id,
          razorpaySignature: checkoutRes.razorpay_signature,
        });

        if (verifyRes?.joinRequestId) {
          toast('Payment verified! Welcome to the group journey.', 'success');
          refreshTrips();
          reloadJoinRequests();
          if (verifyRes.chatRoomId) {
            setActiveRoomId(verifyRes.chatRoomId);
            router.replace('/chat');
          } else {
            router.replace('/bookings');
          }
        }
      }
    } catch (err: any) {
      toast(err?.message || 'Payment failed', 'error');
    } finally {
      setPayingGateway(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenLoading label="Loading payment details..." />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenError
          title="Payment Not Available"
          message={error || 'No active payment found for this join request.'}
          onRetry={loadOrder}
        />
      </SafeAreaView>
    );
  }

  const isAlreadyPaid = order.status === 'CAPTURED' || order.joinRequestStatus === 'APPROVED';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Joining Fee</Text>
        <View style={{ width: 40 }} />
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
                {isAlreadyPaid ? 'CONFIRMED' : 'AWAITING PAYMENT'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Amount Display */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Total Payable</Text>
            <Text style={styles.amountValue}>{formatINR(order.amount)}</Text>
          </View>

          {/* Breakdown items */}
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Seat Joining Contribution</Text>
            <Text style={styles.breakdownValue}>{formatINR(order.amount)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform Service Fee</Text>
            <Text style={[styles.breakdownValue, { color: C.green }]}>Free (₹0)</Text>
          </View>
        </View>

        {/* Payment Methods Section */}
        {isAlreadyPaid ? (
          <View style={styles.confirmedBox}>
            <CheckCircle2 size={36} color={C.green} />
            <Text style={styles.confirmedTitle}>Payment Completed</Text>
            <Text style={styles.confirmedSub}>
              Your seat has been reserved and your group membership is active.
            </Text>
            <TouchableOpacity
              style={styles.chatActionBtn}
              onPress={() => router.navigate('/bookings')}
              activeOpacity={0.85}
            >
              <Text style={styles.chatActionBtnText}>View My Journeys</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionHeading}>SELECT PAYMENT METHOD</Text>

            {/* Pay the seat fee. There is no stored balance to fund first —
                the amount itself is captured and goes straight into the
                organizer's collected budget for this trip. */}
            <View style={styles.methodCard}>
              <View style={styles.methodTop}>
                <View style={[styles.methodIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  <Wallet size={22} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Pay Seat Fee</Text>
                  <Text style={styles.methodSub}>
                    Goes directly to the organizer&apos;s trip budget
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.payBtn, styles.payBtnGreen]}
                disabled={payingWallet}
                onPress={handlePayDirect}
                activeOpacity={0.85}
              >
                {payingWallet ? (
                  <ActivityIndicator color={C.white} size="small" />
                ) : (
                  <>
                    <ShieldCheck size={18} color={C.white} />
                    <Text style={styles.payBtnText}>
                      {`Pay ${formatINR(order.amount)}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

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
                    <Text style={styles.payBtnText}>Pay with Razorpay</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Guarantee Note */}
            <View style={styles.guaranteeBox}>
              <Info size={16} color={C.textMuted} />
              <Text style={styles.guaranteeText}>
                Seats are securely claimed upon payment confirmation. If the organiser cancels or rejects the journey, your fee is automatically refunded to your in-app wallet.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
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
  },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: C.textMuted,
    letterSpacing: 0.5,
    marginLeft: 2,
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
