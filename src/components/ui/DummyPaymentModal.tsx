import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Building2,
  Wallet,
  Sparkles,
  Receipt,
} from 'lucide-react-native';
import GlassCard from './GlassCard';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';

interface DummyPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  title: string;
  onSuccess?: (paymentDetails: any) => void;
}

export default function DummyPaymentModal({
  visible,
  onClose,
  amount,
  title,
  onSuccess,
}: DummyPaymentModalProps) {
  const { addWalletFunds } = useApp();
  const [selectedMethod, setSelectedMethod] = useState<'UPI' | 'CARD' | 'NETBANKING' | 'WALLET'>('UPI');
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<any | null>(null);

  const baseAmount = Math.max(100, Math.round(amount));
  const gstAmount = Math.round(baseAmount * 0.18);
  const totalAmount = baseAmount + gstAmount;

  const handlePayNow = async () => {
    setLoading(true);
    try {
      // 1. Call backend to create booking order
      const booking = (await apiService.createBooking('TRIP', `target-${Date.now()}`, totalAmount)) as any;
      const bookingId = booking?.bookingId || `book-${Date.now()}`;
 
      // Simulate payment network delay (1.2s)
      await new Promise((resolve) => setTimeout(resolve, 1200));
 
      // 2. Call backend to verify payment signature & generate GST invoice
      const paymentId = `pay_${Math.random().toString(36).substring(2, 12)}`;
      const signature = `sig_${Math.random().toString(36).substring(2, 15)}`;
      const verification = (await apiService.verifyPayment(bookingId, paymentId, signature)) as any;

      const result = {
        bookingId,
        paymentId,
        gstInvoiceId: verification?.gstInvoiceId || `GST-${Date.now()}`,
        amount: totalAmount,
        title,
        paymentMethod: selectedMethod,
      };

      setSuccessData(result);
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      Alert.alert('Payment Processed', 'Dummy Payment Completed Successfully');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    setSuccessData(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <GlassCard style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerBadge}>
                <ShieldCheck size={16} color="#60A5FA" style={{ marginRight: 6 }} />
                <Text style={styles.headerBadgeText}>256-Bit SSL Encrypted Payment</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {successData ? (
              // Success Screen View
              <View style={styles.successBox}>
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.successIconBadge}
                >
                  <CheckCircle2 size={36} color="#FFFFFF" />
                </LinearGradient>

                <Text style={styles.successTitle}>Payment Successful! 🎉</Text>
                <Text style={styles.successSub}>{title}</Text>

                <View style={styles.receiptBox}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Amount Paid:</Text>
                    <Text style={styles.receiptVal}>₹{successData.amount}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Booking Ref:</Text>
                    <Text style={styles.receiptVal}>{successData.bookingId}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Payment ID:</Text>
                    <Text style={styles.receiptVal}>{successData.paymentId}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>GST Invoice:</Text>
                    <Text style={styles.receiptVal}>{successData.gstInvoiceId}</Text>
                  </View>
                </View>

                <TouchableOpacity onPress={handleDone} style={{ width: '100%', marginTop: 10 }}>
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.payBtn}
                  >
                    <Text style={styles.payBtnText}>Done & View Details</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              // Payment Selection Form View
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.itemTitle}>{title}</Text>

                {/* Amount Summary */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Base Amount</Text>
                    <Text style={styles.summaryValue}>₹{baseAmount}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>GST (18%)</Text>
                    <Text style={styles.summaryValue}>₹{gstAmount}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.totalLabel}>Total Payable</Text>
                    <Text style={styles.totalValue}>₹{totalAmount}</Text>
                  </View>
                </View>

                {/* Method Options */}
                <Text style={styles.sectionTitle}>Select Payment Method</Text>

                <TouchableOpacity
                  style={[styles.methodCard, selectedMethod === 'UPI' && styles.methodCardActive]}
                  onPress={() => setSelectedMethod('UPI')}
                  activeOpacity={0.8}
                >
                  <Smartphone size={20} color={selectedMethod === 'UPI' ? '#60A5FA' : '#94A3B8'} />
                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodTitle, selectedMethod === 'UPI' && styles.methodTitleActive]}>
                      UPI / GPay / PhonePe / Paytm
                    </Text>
                    <Text style={styles.methodSub}>Instant 1-Tap Payment</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodCard, selectedMethod === 'CARD' && styles.methodCardActive]}
                  onPress={() => setSelectedMethod('CARD')}
                  activeOpacity={0.8}
                >
                  <CreditCard size={20} color={selectedMethod === 'CARD' ? '#60A5FA' : '#94A3B8'} />
                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodTitle, selectedMethod === 'CARD' && styles.methodTitleActive]}>
                      Credit / Debit Card
                    </Text>
                    <Text style={styles.methodSub}>Visa, Mastercard, RuPay</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodCard,
                    selectedMethod === 'NETBANKING' && styles.methodCardActive,
                  ]}
                  onPress={() => setSelectedMethod('NETBANKING')}
                  activeOpacity={0.8}
                >
                  <Building2
                    size={20}
                    color={selectedMethod === 'NETBANKING' ? '#60A5FA' : '#94A3B8'}
                  />
                  <View style={styles.methodInfo}>
                    <Text
                      style={[
                        styles.methodTitle,
                        selectedMethod === 'NETBANKING' && styles.methodTitleActive,
                      ]}
                    >
                      Net Banking
                    </Text>
                    <Text style={styles.methodSub}>HDFC, SBI, ICICI, Axis</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodCard,
                    selectedMethod === 'WALLET' && styles.methodCardActive,
                  ]}
                  onPress={() => setSelectedMethod('WALLET')}
                  activeOpacity={0.8}
                >
                  <Wallet size={20} color={selectedMethod === 'WALLET' ? '#60A5FA' : '#94A3B8'} />
                  <View style={styles.methodInfo}>
                    <Text
                      style={[
                        styles.methodTitle,
                        selectedMethod === 'WALLET' && styles.methodTitleActive,
                      ]}
                    >
                      TravelConnect Wallet
                    </Text>
                    <Text style={styles.methodSub}>Use Available Balance</Text>
                  </View>
                </TouchableOpacity>

                {/* Pay Button */}
                <TouchableOpacity
                  onPress={handlePayNow}
                  disabled={loading}
                  activeOpacity={0.85}
                  style={{ marginTop: 16 }}
                >
                  <LinearGradient
                    colors={['#0066FF', '#0044CC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.payBtn}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Sparkles size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.payBtnText}>Pay Dummy ₹{totalAmount}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    padding: 16,
  },
  card: {
    borderRadius: 28,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.3)',
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60A5FA',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  summaryValue: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#60A5FA',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 10,
  },
  methodCardActive: {
    borderColor: '#0066FF',
    backgroundColor: 'rgba(0, 102, 255, 0.18)',
  },
  methodInfo: {
    marginLeft: 12,
  },
  methodTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  methodTitleActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  methodSub: {
    fontSize: 11,
    color: '#64748B',
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  successIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  successSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
    textAlign: 'center',
  },
  receiptBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  receiptLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34D399',
  },
});
