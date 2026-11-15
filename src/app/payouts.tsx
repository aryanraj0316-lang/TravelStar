// /payouts — the organizer's payout wallet. They link a bank account once
// (a Razorpay Route linked account); from then on their 95.5% share of
// every confirmed booking is sent there automatically, held until the trip
// starts and then released to the bank by Razorpay. This screen shows where
// every rupee is.
import { ScreenError, ScreenLoading } from '@/components/ui/ScreenState';
import { errorToastMessage, toast } from '@/lib/feedback';
import { formatINR, type Money } from '@/lib/money';
import { useKeyboardLift, useScrollToFocused } from '@/lib/useKeyboardAwareSheet';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { PayoutAccount, PayoutAccountInput, PayoutItem, PayoutState } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Building2 from 'lucide-react-native/icons/building-2';
import Clock from 'lucide-react-native/icons/clock';
import Landmark from 'lucide-react-native/icons/landmark';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Wallet from 'lucide-react-native/icons/wallet';
import X from 'lucide-react-native/icons/x';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

const STATE_LABEL: Record<PayoutState, { label: string; color: string; bg: string }> = {
  AWAITING_CONFIRMATION: { label: 'Confirm booking to release', color: '#B45309', bg: '#FFFBEB' },
  AWAITING_ACCOUNT: { label: 'Link your bank to receive', color: '#B45309', bg: '#FFFBEB' },
  PROCESSING: { label: 'Sending…', color: '#1D4ED8', bg: '#EFF6FF' },
  ON_HOLD: { label: 'On hold until trip start', color: '#1D4ED8', bg: '#EFF6FF' },
  RELEASED: { label: 'Sent to your bank', color: '#15803D', bg: '#F0FDF4' },
  PARTIALLY_REVERSED: { label: 'Part refunded to traveller', color: '#B45309', bg: '#FFFBEB' },
  REVERSED: { label: 'Refunded to traveller', color: '#64748B', bg: '#F1F5F9' },
  REFUNDED: { label: 'Refunded to traveller', color: '#64748B', bg: '#F1F5F9' },
  FAILED: { label: 'Transfer failed — we will retry', color: '#B91C1C', bg: '#FEF2F2' },
  MANUAL: { label: 'Paid by wallet — settled by support', color: '#64748B', bg: '#F1F5F9' },
  NOT_APPLICABLE: { label: 'No payout (test booking)', color: '#64748B', bg: '#F1F5F9' },
};

export default function PayoutsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn } = useApp();
  const [linkOpen, setLinkOpen] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['payouts', 'account'],
    queryFn: () => apiService.getPayoutAccount(),
    enabled: isLoggedIn,
  });
  const earningsQuery = useQuery({
    queryKey: ['payouts', 'earnings'],
    queryFn: () => apiService.getPayoutEarnings(),
    enabled: isLoggedIn,
  });

  const refetch = () => {
    void accountQuery.refetch();
    void earningsQuery.refetch();
  };

  const account = accountQuery.data?.account ?? null;
  const earnings = earningsQuery.data ?? null;
  const loading = accountQuery.isLoading || earningsQuery.isLoading;
  const failed = accountQuery.isError || earningsQuery.isError;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <ArrowLeft size={19} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payouts.title', 'Payouts')}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ScreenLoading label={t('payouts.loading', 'Loading your payouts…')} />
      ) : failed ? (
        <ScreenError
          title={t('payouts.couldNotLoad', "Couldn't load payouts")}
          message={errorToastMessage(accountQuery.error ?? earningsQuery.error, t('common.tryAgain', 'Please try again.'))}
          onRetry={refetch}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={accountQuery.isRefetching || earningsQuery.isRefetching}
              onRefresh={refetch}
              tintColor="#2563EB"
            />
          }
        >
          {/* Wallet */}
          <View style={styles.walletCard}>
            <View style={styles.walletTop}>
              <Wallet size={18} color="#BFDBFE" />
              <Text style={styles.walletLabel}>{t('payouts.onHold', 'Releasing to your bank')}</Text>
            </View>
            <Text style={styles.walletValue}>{formatINR(earnings?.totals.onHold ?? '0')}</Text>
            <Text style={styles.walletSub}>
              {t('payouts.onHoldSub', 'Held safely until each trip starts, then released to your bank automatically.')}
            </Text>
            <View style={styles.walletRow}>
              <WalletStat label={t('payouts.released', 'Sent to bank')} value={earnings?.totals.released ?? '0'} />
              <WalletStat
                label={t('payouts.awaitingConfirmation', 'Awaiting confirmation')}
                value={earnings?.totals.awaitingConfirmation ?? '0'}
              />
            </View>
          </View>

          {/* Bank account */}
          {account ? (
            <BankCard account={account} />
          ) : (
            <View style={styles.linkCard}>
              <View style={styles.linkIcon}>
                <Landmark size={22} color={C.blueText} />
              </View>
              <Text style={styles.linkTitle}>{t('payouts.linkTitle', 'Link your bank account')}</Text>
              <Text style={styles.linkSub}>
                {Number(earnings?.totals.awaitingAccount ?? 0) > 0
                  ? t('payouts.linkSubWaiting', {
                      amount: formatINR(earnings?.totals.awaitingAccount ?? '0'),
                      defaultValue: '{{amount}} from confirmed bookings is waiting for you. Link your bank to receive it.',
                    })
                  : t(
                      'payouts.linkSub',
                      'Your share of every confirmed booking (95.5%) is sent straight to this account.',
                    )}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, accountQuery.data?.payoutsAvailable === false && styles.disabled]}
                onPress={() => setLinkOpen(true)}
                disabled={accountQuery.data?.payoutsAvailable === false}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>{t('payouts.linkCta', 'Link bank account')}</Text>
              </TouchableOpacity>
              {accountQuery.data?.payoutsAvailable === false ? (
                <Text style={styles.muted}>{t('payouts.unavailable', 'Payouts are being set up. Please check back soon.')}</Text>
              ) : null}
            </View>
          )}

          {/* How it works */}
          <View style={styles.infoCard}>
            <InfoRow icon={<ShieldCheck size={15} color={C.greenText} />} text={t('payouts.howSplit', 'Travellers pay securely through Razorpay. You receive 95.5%; the 4.5% platform fee is kept by Yatrenzo.')} />
            <InfoRow icon={<Clock size={15} color={C.blueText} />} text={t('payouts.howHold', 'Your share is sent when you confirm a booking and held until the trip starts, so cancellation refunds can be returned from it.')} />
            <InfoRow icon={<Building2 size={15} color={C.textSec} />} text={t('payouts.howBank', 'After release, Razorpay settles it to your bank, usually within 2 working days.')} />
          </View>

          {/* Bookings */}
          <Text style={styles.sectionTitle}>{t('payouts.history', 'Bookings')}</Text>
          {!earnings || earnings.items.length === 0 ? (
            <Text style={styles.muted}>
              {t('payouts.empty', 'Payments for your trips will appear here.')}
            </Text>
          ) : (
            earnings.items.map((item) => <PayoutRow key={item.orderId} item={item} />)
          )}
        </ScrollView>
      )}

      <LinkBankModal
        visible={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={() => {
          setLinkOpen(false);
          toast(t('payouts.linked', 'Bank account linked. Payouts will be sent here.'), 'success');
          refetch();
        }}
      />
    </SafeAreaView>
  );
}

function WalletStat({ label, value }: { label: string; value: Money }) {
  return (
    <View style={styles.walletStat}>
      <Text style={styles.walletStatLabel}>{label}</Text>
      <Text style={styles.walletStatValue}>{formatINR(value)}</Text>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={{ marginTop: 1 }}>{icon}</View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function BankCard({ account }: { account: PayoutAccount }) {
  const { t } = useTranslation();
  const ready = account.bankVerification === 'verified' && account.activationStatus === 'activated';
  const problem = account.bankVerification === 'failed' || account.activationStatus === 'needs_clarification' || account.activationStatus === 'suspended';
  const status = ready
    ? { text: t('payouts.statusActive', 'Active'), color: C.greenText, bg: '#F0FDF4' }
    : problem
      ? { text: t('payouts.statusProblem', 'Needs attention'), color: C.redText, bg: '#FEF2F2' }
      : { text: t('payouts.statusVerifying', 'Verifying bank'), color: '#B45309', bg: '#FFFBEB' };
  return (
    <View style={styles.bankCard}>
      <View style={styles.bankTop}>
        <View style={styles.linkIcon}>
          <Landmark size={20} color={C.blueText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bankName}>{account.beneficiaryName}</Text>
          <Text style={styles.bankMeta}>
            A/c •••• {account.bankAccountLast4} · {account.ifsc}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          {ready ? <BadgeCheck size={12} color={status.color} /> : null}
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>
      <Text style={styles.muted}>
        {problem
          ? t('payouts.problemSub', 'Razorpay could not verify this account. Contact support to update your bank details.')
          : ready
            ? t('payouts.readySub', 'Payouts for confirmed bookings are sent to this account.')
            : t('payouts.verifyingSub', 'Razorpay is verifying your bank account (a ₹1 check, usually under 15 minutes). Payouts are already being recorded.')}
      </Text>
      <Text style={styles.bankFoot}>
        PAN {account.panMasked} · {t('payouts.linkedOn', { date: formatDate(account.linkedAt), defaultValue: 'Linked {{date}}' })}
      </Text>
    </View>
  );
}

function PayoutRow({ item }: { item: PayoutItem }) {
  const s = STATE_LABEL[item.state] ?? STATE_LABEL.PROCESSING;
  const detail =
    item.state === 'ON_HOLD' && item.releaseOn
      ? `Releases ${formatDate(item.releaseOn)}`
      : item.state === 'RELEASED' && item.releaseOn
        ? `Released ${formatDate(item.releaseOn)}`
        : null;
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTrip} numberOfLines={1}>
            {item.tripName}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.travellerName} · {item.seats} {item.seats === 1 ? 'seat' : 'seats'} · {formatDate(item.paidAt)}
          </Text>
        </View>
        <Text style={styles.rowAmount}>{formatINR(item.net)}</Text>
      </View>
      <View style={styles.rowBottom}>
        <View style={[styles.statePill, { backgroundColor: s.bg }]}>
          <Text style={[styles.stateText, { color: s.color }]}>{s.label}</Text>
        </View>
        {detail ? <Text style={styles.rowMeta}>{detail}</Text> : null}
      </View>
      <Text style={styles.rowFoot}>
        Paid {formatINR(item.amountPaid)} · your share {formatINR(item.yourShare)}
        {Number(item.reversed) > 0 ? ` · refunded ${formatINR(item.reversed)}` : ''}
      </Text>
    </View>
  );
}

// ── Link bank form ────────────────────────────────────────────────────────

type Draft = PayoutAccountInput & { confirmAccountNumber: string };
const EMPTY: Draft = {
  legalName: '',
  pan: '',
  email: '',
  phone: '',
  beneficiaryName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifsc: '',
};

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (d.legalName.trim().length < 4) e.legalName = 'Enter your full name as on PAN';
  if (!/^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/.test(d.pan.trim().toUpperCase())) e.pan = 'Enter a valid personal PAN (e.g. ABCPK1234F)';
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Enter a valid email';
  if (!/^(\+91)?[6-9][0-9]{9}$/.test(d.phone.trim())) e.phone = 'Enter a valid 10-digit mobile number';
  if (d.beneficiaryName.trim().length < 3) e.beneficiaryName = 'Enter the account holder’s name';
  if (!/^[0-9]{9,18}$/.test(d.accountNumber.trim())) e.accountNumber = 'Enter a valid account number';
  if (d.confirmAccountNumber.trim() !== d.accountNumber.trim()) e.confirmAccountNumber = 'Account numbers do not match';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.ifsc.trim().toUpperCase())) e.ifsc = 'Enter a valid IFSC (e.g. HDFC0001234)';
  return e;
}

function LinkBankModal({ visible, onClose, onLinked }: { visible: boolean; onClose: () => void; onLinked: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {visible ? <LinkBankSheet onClose={onClose} onLinked={onLinked} /> : null}
    </Modal>
  );
}

function LinkBankSheet({ onClose, onLinked }: { onClose: () => void; onLinked: () => void }) {
  const { t } = useTranslation();
  const { profile } = useApp();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { keyboardHeight, lift, availableHeight, onBackdropLayout } = useKeyboardLift();
  const { scrollRef, contentRef, field } = useScrollToFocused(keyboardHeight);
  const sheetMaxHeight = Math.max(260, (availableHeight || windowHeight) - insets.top - 8);

  const [d, setD] = useState<Draft>(() => ({
    ...EMPTY,
    legalName: profile?.name ?? '',
    beneficiaryName: profile?.name ?? '',
    email: profile?.email ?? '',
    phone: (profile?.phoneNumber ?? '').replace(/^\+91/, ''),
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof Draft, v: string) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const submit = async () => {
    const found = validate(d);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setFormError(t('payouts.fixErrors', 'Please correct the highlighted fields.'));
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await apiService.linkPayoutAccount({
        legalName: d.legalName.trim(),
        pan: d.pan.trim().toUpperCase(),
        email: d.email.trim(),
        phone: d.phone.trim(),
        beneficiaryName: d.beneficiaryName.trim(),
        accountNumber: d.accountNumber.trim(),
        ifsc: d.ifsc.trim().toUpperCase(),
      });
      onLinked();
    } catch (e) {
      setFormError(errorToastMessage(e, t('payouts.linkFailed', 'Could not link this bank account.')));
    } finally {
      setSaving(false);
    }
  };

  const input = (
    k: keyof Draft,
    label: string,
    opts: Partial<React.ComponentProps<typeof TextInput>> = {},
  ) => (
    <View style={{ gap: 5 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...field(k)}
        style={[styles.input, errors[k] && styles.inputError]}
        value={d[k]}
        onChangeText={(v) => set(k, v)}
        placeholderTextColor={C.textMuted}
        autoCorrect={false}
        {...opts}
      />
      {errors[k] ? <Text style={styles.fieldError}>{errors[k]}</Text> : null}
    </View>
  );

  return (
    <View style={styles.backdrop} onLayout={onBackdropLayout}>
      <View style={{ maxHeight: sheetMaxHeight, marginBottom: lift }}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{t('payouts.linkTitle', 'Link your bank account')}</Text>
              <Text style={styles.muted}>
                {t('payouts.linkFormSub', 'Verified by Razorpay. Details must match your PAN and bank records.')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', 'Close')}
            >
              <X size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            <View ref={contentRef} style={{ gap: 12, paddingBottom: 8 }}>
              <Text style={styles.groupTitle}>{t('payouts.you', 'About you')}</Text>
              {input('legalName', t('payouts.legalName', 'Full name (as on PAN)'), { autoCapitalize: 'words' })}
              {input('pan', t('payouts.pan', 'PAN'), { autoCapitalize: 'characters', maxLength: 10, placeholder: 'ABCPK1234F' })}
              {input('email', t('payouts.email', 'Email'), { keyboardType: 'email-address', autoCapitalize: 'none' })}
              {input('phone', t('payouts.phone', 'Mobile number'), { keyboardType: 'phone-pad', maxLength: 13 })}

              <Text style={styles.groupTitle}>{t('payouts.bank', 'Bank account')}</Text>
              {input('beneficiaryName', t('payouts.beneficiary', 'Account holder name'), { autoCapitalize: 'words' })}
              {input('accountNumber', t('payouts.accountNumber', 'Account number'), { keyboardType: 'number-pad', maxLength: 18, secureTextEntry: true })}
              {input('confirmAccountNumber', t('payouts.confirmAccount', 'Re-enter account number'), { keyboardType: 'number-pad', maxLength: 18 })}
              {input('ifsc', t('payouts.ifsc', 'IFSC code'), { autoCapitalize: 'characters', maxLength: 11, placeholder: 'HDFC0001234' })}
            </View>
          </ScrollView>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={() => void submit()}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : null}
            <Text style={styles.primaryBtnText}>{t('payouts.linkCta', 'Link bank account')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  walletCard: { backgroundColor: '#1E3A8A', borderRadius: 18, padding: 18, gap: 6 },
  walletTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletLabel: { fontSize: 13, fontWeight: '700', color: '#BFDBFE' },
  walletValue: { fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.6 },
  walletSub: { fontSize: 12, color: '#DBEAFE', lineHeight: 17 },
  walletRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  walletStat: { flex: 1, gap: 2 },
  walletStatLabel: { fontSize: 11.5, color: '#BFDBFE', fontWeight: '600' },
  walletStatValue: { fontSize: 16, color: '#FFFFFF', fontWeight: '800' },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  linkSub: { fontSize: 13, color: '#475569', lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  muted: { fontSize: 12.5, color: '#64748B', lineHeight: 18 },
  bankCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, gap: 10 },
  bankTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  bankMeta: { fontSize: 12.5, color: '#64748B', marginTop: 2, letterSpacing: 0.3 },
  bankFoot: { fontSize: 11.5, color: '#94A3B8' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 10 },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 12.5, color: '#334155', lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  rowCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTrip: { fontSize: 14.5, fontWeight: '800', color: '#0F172A' },
  rowMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  statePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  stateText: { fontSize: 11.5, fontWeight: '800' },
  rowFoot: { fontSize: 11.5, color: '#94A3B8' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    maxHeight: '100%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  groupTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 },
  label: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  inputError: { borderColor: C.redText },
  fieldError: { fontSize: 11.5, color: C.redText, fontWeight: '600' },
  formError: { fontSize: 12.5, color: C.redText, fontWeight: '600', textAlign: 'center' },
});
