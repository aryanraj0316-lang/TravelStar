import { ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';
import { formatINR } from '@/lib/money';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';
import type { TripReceipt } from '@/types/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ArrowDownLeft from 'lucide-react-native/icons/arrow-down-left';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Every trip payment this user was a party to, kept permanently: what they
// paid as a traveller and what their own trips took in as an organizer. The
// rows are the captured payment orders themselves, so a receipt can never
// disagree with the money it records.

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function ReceiptsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn } = useApp();

  const receiptsQuery = useQuery({
    queryKey: queryKeys.tripReceipts(),
    queryFn: async () => (await apiService.getTripReceipts()) ?? [],
    enabled: isLoggedIn,
  });
  const { data: receipts = [], refetch, isRefetching } = receiptsQuery;
  const state = sectionState(receiptsQuery, receiptsQuery.data != null);

  const totals = useMemo(() => {
    let paid = 0;
    let received = 0;
    for (const r of receipts) {
      if (r.direction === 'PAID') paid += Number(r.amount);
      else received += Number(r.amount);
    }
    return { paid, received };
  }, [receipts]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <ArrowLeft size={19} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('receipts.title', 'Payment Receipts')}</Text>
        <View style={styles.backBtn} />
      </View>

      {!isLoggedIn ? (
        <ScreenEmpty
          title={t('receipts.signInTitle', 'Sign in to view receipts')}
          message={t('receipts.signInMessage', 'Your trip payment history is tied to your account.')}
          actionLabel={t('notifications.signIn', 'Sign In')}
          onAction={() => router.push('/auth')}
        />
      ) : state.kind === 'loading' ? (
        <ScreenLoading label={t('receipts.loading', 'Loading your receipts...')} />
      ) : state.kind === 'error' ? (
        <ScreenError
          title={t('receipts.couldNotLoad', "Couldn't load receipts")}
          message={state.offline ? t('common.offlineMessage') : t('receipts.couldNotLoadMessage', 'Please try again.')}
          onRetry={() => void refetch()}
        />
      ) : receipts.length === 0 ? (
        <ScreenEmpty
          title={t('receipts.emptyTitle', 'No receipts yet')}
          message={t(
            'receipts.emptyMessage',
            'Payments you make for a trip, and payments your own trips receive, are kept here permanently.',
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#2563EB" />
          }
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('receipts.totalPaid', 'Total Paid')}</Text>
              <Text style={[styles.summaryValue, { color: '#B91C1C' }]}>{formatINR(totals.paid)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t('receipts.totalReceived', 'Total Received')}</Text>
              <Text style={[styles.summaryValue, { color: '#15803D' }]}>{formatINR(totals.received)}</Text>
            </View>
          </View>

          {receipts.map((r: TripReceipt) => {
            const isPaid = r.direction === 'PAID';
            const Icon = isPaid ? ArrowUpRight : ArrowDownLeft;
            const accent = isPaid ? '#B91C1C' : '#15803D';
            const accentBg = isPaid ? '#FEF2F2' : '#F0FDF4';

            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, { backgroundColor: accentBg }]}>
                    <Icon size={17} color={accent} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripName} numberOfLines={2}>
                      {r.tripName}
                    </Text>
                    <Text style={styles.counterparty} numberOfLines={1}>
                      {isPaid
                        ? t('receipts.paidTo', 'Paid to {{name}}', { name: r.counterpartyName })
                        : t('receipts.receivedFrom', 'Received from {{name}}', { name: r.counterpartyName })}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: accent }]}>
                    {isPaid ? '−' : '+'}
                    {formatINR(r.amount)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('receipts.date', 'Date')}</Text>
                    <Text style={styles.metaValue}>{formatDate(r.paidAt)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('receipts.seats', 'Seats')}</Text>
                    <Text style={styles.metaValue}>{r.seats}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('receipts.reference', 'Reference')}</Text>
                    <Text style={styles.metaValue}>{r.reference}</Text>
                  </View>
                </View>

                {r.tripCities?.length > 0 && (
                  <Text style={styles.cities} numberOfLines={1}>
                    {r.tripCities.join(' · ')}
                  </Text>
                )}
              </View>
            );
          })}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
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
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  scroll: { padding: 16, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 4,
  },
  summaryLabel: { fontSize: 11.5, fontWeight: '700', color: '#64748B', letterSpacing: 0.3 },
  summaryValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripName: { fontSize: 14.5, fontWeight: '800', color: '#0F172A', lineHeight: 19 },
  counterparty: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0' },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metaItem: { flex: 1, gap: 3 },
  metaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaValue: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  cities: { fontSize: 11.5, fontWeight: '500', color: '#64748B' },
});
