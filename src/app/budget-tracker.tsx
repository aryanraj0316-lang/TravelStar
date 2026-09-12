import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Hotel from 'lucide-react-native/icons/hotel';
import Plus from 'lucide-react-native/icons/plus';
import Receipt from 'lucide-react-native/icons/receipt';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import Ticket from 'lucide-react-native/icons/ticket';
import Trash2 from 'lucide-react-native/icons/trash-2';
import Utensils from 'lucide-react-native/icons/utensils';
import Wallet from 'lucide-react-native/icons/wallet';

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { toast, errorToastMessage } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Button, Card, Chip, Input, ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';

// docs/REMEDIATION.md §8.12: this screen was pure local useState — a
// hardcoded ₹15,000 budget and five hardcoded expense rows that reset the
// moment it unmounted. It is now backed by the real TripExpense model:
// expenses are shared across everyone on a chosen trip and split equally,
// with the split derived server-side at read time so it never drifts.


const CATEGORIES = [
  { key: 'TRANSPORT', labelKey: 'budgetTracker.categoryTransport', color: C.blue, Icon: Car },
  { key: 'LODGING', labelKey: 'budgetTracker.categoryLodging', color: C.purple, Icon: Hotel },
  { key: 'FOOD', labelKey: 'budgetTracker.categoryFood', color: C.amber, Icon: Utensils },
  { key: 'ACTIVITY', labelKey: 'budgetTracker.categoryActivity', color: C.green, Icon: Ticket },
  { key: 'OTHER', labelKey: 'budgetTracker.categoryOther', color: C.rose, Icon: ShoppingBag },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

function catMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[4];
}

interface ExpenseItem {
  id: string;
  description: string;
  amount: string;
  category: string;
  createdAt: string;
  paidById: string;
  paidByName: string;
  canDelete: boolean;
}

interface ExpensesResponse {
  tripId: string;
  headCount: number;
  total: string;
  yourShare: string;
  yourNet: string;
  expenses: ExpenseItem[];
  balances: {
    userId: string;
    name: string;
    avatar: string;
    isOrganizer: boolean;
    paid: string;
    share: string;
    net: string;
  }[];
}

const inr = (v: string | number) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`;

// The expense ledger is the only part of this screen that grows without
// bound, so it is the one that moves to a FlatList; the summary card, the
// per-member balances (one row per trip member) and the trip chips are small
// and fixed-size, so they ride along as the list header. Nesting a
// VirtualizedList inside another would cost more than it saves.
// Each row is its own component so the React Compiler
// (app.json > experiments.reactCompiler) can memoize rows independently —
// hand-written React.memo would make it skip the component instead
// (docs/REMEDIATION.md Phase 10).
function ExpenseRow({
  expense,
  onDelete,
  deleteDisabled,
}: {
  expense: ExpenseItem;
  onDelete: (id: string) => void;
  deleteDisabled: boolean;
}) {
  const { t } = useTranslation();
  const meta = catMeta(expense.category);

  return (
    <Card style={styles.expenseRow}>
      <View style={[styles.expenseIcon, { backgroundColor: meta.color + '22' }]}>
        <meta.Icon size={16} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseTitle}>{expense.description}</Text>
        <Text style={styles.expenseSub}>
          {t('budgetTracker.expenseSubline', {
            category: t(meta.labelKey),
            name: expense.paidByName,
            date: new Date(expense.createdAt).toLocaleDateString('en-IN'),
          })}
        </Text>
      </View>
      <Text style={styles.expenseAmount}>{inr(expense.amount)}</Text>
      {expense.canDelete && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(expense.id)}
          disabled={deleteDisabled}
          hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
          accessibilityRole="button"
          accessibilityLabel={t('budgetTracker.deleteExpenseLabel', { description: expense.description })}
        >
          <Trash2 size={15} color={C.textMuted} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

const keyExtractor = (e: ExpenseItem) => e.id;

export default function BudgetTrackerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn } = useApp();

  const [tripId, setTripId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryKey>('TRANSPORT');

  const {
    data: myTrips = [],
    isLoading: tripsLoading,
    isError: tripsError,
  } = useQuery({
    queryKey: queryKeys.myTrips(),
    queryFn: async () => (await apiService.getMyTrips()) ?? [],
    enabled: isLoggedIn,
  });

  const activeTripId = tripId ?? myTrips[0]?.id ?? null;
  const activeTrip = myTrips.find((t) => t.id === activeTripId) ?? null;

  const {
    data: budget,
    isLoading: budgetLoading,
    isError: budgetError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: activeTripId ? queryKeys.tripExpenses(activeTripId) : ['trips', 'none', 'expenses'],
    queryFn: async (): Promise<ExpensesResponse> =>
      (await apiService.getTripExpenses(activeTripId as string)) as ExpensesResponse,
    enabled: !!activeTripId,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiService.addTripExpense(activeTripId as string, {
        description: desc.trim(),
        amount: Number(amount),
        category,
      }),
    onSuccess: () => {
      toast(t('budgetTracker.expenseAdded'), 'success');
      setShowAdd(false);
      setDesc('');
      setAmount('');
      setCategory('TRANSPORT');
      if (activeTripId) void queryClient.invalidateQueries({ queryKey: queryKeys.tripExpenses(activeTripId) });
    },
    onError: (e) => toast(errorToastMessage(e, t('budgetTracker.couldNotAddExpense')), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (expenseId: string) => apiService.deleteTripExpense(activeTripId as string, expenseId),
    onSuccess: () => {
      toast(t('budgetTracker.expenseRemoved'), 'success');
      if (activeTripId) void queryClient.invalidateQueries({ queryKey: queryKeys.tripExpenses(activeTripId) });
    },
    onError: (e) => toast(errorToastMessage(e, t('budgetTracker.couldNotRemoveExpense')), 'error'),
  });

  const canSubmit = desc.trim().length > 0 && Number(amount) > 0 && !addMutation.isPending;

  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // ── Not signed in / no trips ──────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <Shell title={t('budgetTracker.title')} onBack={handleBack}>
        <View style={styles.guestContainer}>
          <View style={styles.guestCard}>
            <View style={styles.guestIconCircle}>
              <Wallet size={28} color={C.blue} strokeWidth={2.2} />
            </View>

            <Text style={styles.guestTitle}>{t('budgetTracker.signInRequiredTitle')}</Text>
            <Text style={styles.guestSubtitle}>{t('budgetTracker.signInRequiredMessage')}</Text>

            <View style={styles.guestBenefitList}>
              <View style={styles.guestBenefitRow}>
                <View style={styles.guestCheckCircle}>
                  <Check size={11} color={C.greenText} strokeWidth={3} />
                </View>
                <Text style={styles.guestBenefitText}>{t('budgetTracker.signInBenefit1')}</Text>
              </View>

              <View style={styles.guestBenefitRow}>
                <View style={styles.guestCheckCircle}>
                  <Check size={11} color={C.greenText} strokeWidth={3} />
                </View>
                <Text style={styles.guestBenefitText}>{t('budgetTracker.signInBenefit2')}</Text>
              </View>

              <View style={styles.guestBenefitRow}>
                <View style={styles.guestCheckCircle}>
                  <Check size={11} color={C.greenText} strokeWidth={3} />
                </View>
                <Text style={styles.guestBenefitText}>{t('budgetTracker.signInBenefit3')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.guestPrimaryBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/auth')}
              accessibilityRole="button"
              accessibilityLabel={t('budgetTracker.signIn')}
            >
              <Text style={styles.guestPrimaryBtnText}>{t('budgetTracker.signIn')}</Text>
              <ChevronRight size={16} color={C.white} strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.guestSecondaryBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/nearby-trips')}
              accessibilityRole="button"
              accessibilityLabel={t('budgetTracker.browseNearbyTrips')}
            >
              <Receipt size={15} color={C.blueText} style={{ marginRight: 6 }} />
              <Text style={styles.guestSecondaryBtnText}>{t('budgetTracker.browseNearbyTrips')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Shell>
    );
  }

  if (tripsLoading) {
    return (
      <Shell title={t('budgetTracker.title')} onBack={handleBack}>
        <ScreenLoading label={t('budgetTracker.loadingTrips')} />
      </Shell>
    );
  }

  if (tripsError || myTrips.length === 0) {
    return (
      <Shell title={t('budgetTracker.title')} onBack={handleBack}>
        <ScreenEmpty
          title={tripsError ? t('budgetTracker.couldNotLoadTripsTitle') : t('budgetTracker.noTripsYetTitle')}
          message={tripsError ? t('budgetTracker.couldNotLoadTripsMessage') : t('budgetTracker.noTripsYetMessage')}
          actionLabel={t('budgetTracker.browseTrips')}
          onAction={() => router.navigate('/search')}
        />
      </Shell>
    );
  }

  return (
    <Shell title={t('budgetTracker.title')} onBack={handleBack}>
      {/* Trip selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>
        {myTrips.map((t) => (
          <Chip key={t.id} label={t.name} selected={t.id === activeTripId} onPress={() => setTripId(t.id)} />
        ))}
      </ScrollView>

      {budgetLoading ? (
        <ScreenLoading label={t('budgetTracker.loadingExpenses')} />
      ) : budgetError || !budget ? (
        <ScreenError
          message={error instanceof Error ? error.message : t('budgetTracker.couldNotLoadBudget')}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={budget.expenses}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => (
            <ExpenseRow
              expense={item}
              onDelete={(id) => deleteMutation.mutate(id)}
              deleteDisabled={deleteMutation.isPending}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.blue} />}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {/* Summary */}
              <LinearGradient colors={['#12203D', '#0C1526']} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{t('budgetTracker.totalTripSpend')}</Text>
                <Text style={styles.summaryValue}>{inr(budget.total)}</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryColLabel}>{t('budgetTracker.splitWays', { count: budget.headCount })}</Text>
                    <Text style={styles.summaryColValue}>{t('budgetTracker.perPerson', { amount: inr(budget.yourShare) })}</Text>
                  </View>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryColLabel}>{t('budgetTracker.yourBalance')}</Text>
                    <Text style={[styles.summaryColValue, { color: Number(budget.yourNet) >= 0 ? C.green : C.rose }]}>
                      {Number(budget.yourNet) >= 0 ? t('budgetTracker.youAreOwed') : t('budgetTracker.youOwe')}
                      {inr(Math.abs(Number(budget.yourNet)))}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Per-member balances */}
              {budget.balances.length > 1 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('budgetTracker.whoOwesWhat')}</Text>
                  {budget.balances.map((b) => (
                    <View key={b.userId} style={styles.balanceRow}>
                      <Image
                        source={{ uri: b.avatar }}
                        style={styles.balanceAvatar}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.balanceName}>
                          {b.name}
                          {b.isOrganizer ? t('budgetTracker.organizerSuffix') : ''}
                        </Text>
                        <Text style={styles.balanceSub}>
                          {t('budgetTracker.paidOfShare', { paid: inr(b.paid), share: inr(b.share) })}
                        </Text>
                      </View>
                      <Text style={[styles.balanceNet, { color: Number(b.net) >= 0 ? C.green : C.rose }]}>
                        {Number(b.net) >= 0 ? '+' : '−'}
                        {inr(Math.abs(Number(b.net)))}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.expensesTitle}>{t('budgetTracker.expenses')}</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.emptyExpenses}>{t('budgetTracker.noExpensesYet')}</Text>}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      {/* Add button */}
      {budget && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
          accessibilityLabel={t('budgetTracker.addExpense')}
        >
          <Plus size={22} color={C.white} />
        </TouchableOpacity>
      )}

      {/* Add expense modal */}
      <Sheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title={
          activeTrip
            ? t('budgetTracker.addExpenseTitleWithTrip', { tripName: activeTrip.name })
            : t('budgetTracker.addExpenseTitle')
        }
        scrollable={false}
      >
        <View style={{ gap: 12, paddingBottom: 20 }}>
          <Input
            placeholder={t('budgetTracker.whatWasItFor')}
            value={desc}
            onChangeText={setDesc}
            accessibilityLabel={t('budgetTracker.expenseDescriptionLabel')}
          />
          <Input
            placeholder={t('budgetTracker.amountPlaceholder')}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            accessibilityLabel={t('budgetTracker.expenseAmountLabel')}
          />

          <View style={styles.catRow}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Chip
                  key={c.key}
                  label={t(c.labelKey)}
                  selected={active}
                  onPress={() => setCategory(c.key)}
                  icon={<c.Icon size={13} color={active ? c.color : C.textMuted} />}
                  style={active ? { backgroundColor: c.color + '22', borderColor: c.color } : undefined}
                />
              );
            })}
          </View>

          <Button
            label={t('budgetTracker.addExpense')}
            onPress={() => addMutation.mutate()}
            disabled={!canSubmit}
            loading={addMutation.isPending}
            icon={<Check size={16} color={C.white} />}
            fullWidth
          />
        </View>
      </Sheet>
    </Shell>
  );
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('budgetTracker.goBack')}
        >
          <ArrowLeft size={18} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
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
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  tripChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  summaryCard: { borderRadius: 20, padding: 18, gap: 6, marginBottom: 16 },
  summaryLabel: { fontSize: 12, fontWeight: '800', color: C.textSec, letterSpacing: 1 },
  summaryValue: { fontSize: 30, fontWeight: '900', color: C.white },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  summaryCol: { gap: 3 },
  summaryColLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  summaryColValue: { fontSize: 13, fontWeight: '800', color: C.white },
  section: { marginBottom: 20 },
  // The "Expenses" heading sits in the FlatList header rather than inside a
  // `section` card, so it carries the section's spacing itself.
  expensesTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 10 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  balanceAvatar: { width: 34, height: 34, borderRadius: 17 },
  balanceName: { fontSize: 12.5, fontWeight: '700', color: C.text },
  balanceSub: { fontSize: 12, color: C.textMuted },
  balanceNet: { fontSize: 13, fontWeight: '800' },
  emptyExpenses: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 8,
  },
  expenseIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  expenseSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  expenseAmount: { fontSize: 13.5, fontWeight: '800', color: C.text },
  deleteBtn: { padding: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // ── Guest / Sign-in Gate ────────────────────────────
  guestContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  guestCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  guestIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  guestSubtitle: {
    fontSize: 13.5,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  guestBenefitList: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  guestBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guestCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestBenefitText: {
    flex: 1,
    fontSize: 12.5,
    color: C.text,
    fontWeight: '500',
    lineHeight: 17,
  },
  guestPrimaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 13,
    backgroundColor: C.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 10,
  },
  guestPrimaryBtnText: {
    color: C.white,
    fontSize: 14.5,
    fontWeight: '700',
  },
  guestSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  guestSecondaryBtnText: {
    color: C.blueText,
    fontSize: 13,
    fontWeight: '600',
  },
});
