import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import Users from 'lucide-react-native/icons/users';
import Wallet from 'lucide-react-native/icons/wallet';

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { toast, errorToastMessage } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';
import { ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';

const CATEGORIES = [
  { key: 'TRANSPORT', labelKey: 'budgetTracker.categoryTransport', color: '#2563EB', bg: '#EFF6FF', Icon: Car },
  { key: 'FOOD', labelKey: 'budgetTracker.categoryFood', color: '#D97706', bg: '#FFFBEB', Icon: Utensils },
  { key: 'LODGING', labelKey: 'budgetTracker.categoryLodging', color: '#7C3AED', bg: '#F5F3FF', Icon: Hotel },
  { key: 'ACTIVITY', labelKey: 'budgetTracker.categoryActivity', color: '#059669', bg: '#ECFDF5', Icon: Ticket },
  { key: 'OTHER', labelKey: 'budgetTracker.categoryOther', color: '#475569', bg: '#F1F5F9', Icon: ShoppingBag },
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

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

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
  const Icon = meta.Icon;

  return (
    <View style={styles.expenseItem}>
      <View style={[styles.expenseIconWrap, { backgroundColor: meta.bg }]}>
        <Icon size={16} color={meta.color} strokeWidth={2.2} />
      </View>

      <View style={styles.expenseDetails}>
        <Text style={styles.expenseTitle} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={styles.expenseSubtitle} numberOfLines={1}>
          {t(meta.labelKey)} • {expense.paidByName} • {formatDate(expense.createdAt)}
        </Text>
      </View>

      <Text style={styles.expenseAmount}>{inr(expense.amount)}</Text>

      {expense.canDelete && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(expense.id)}
          disabled={deleteDisabled}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('budgetTracker.deleteExpenseLabel', { description: expense.description })}
        >
          <Trash2 size={15} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </View>
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
  const [category, setCategory] = useState<CategoryKey>('FOOD');

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
      setCategory('FOOD');
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

  // ── Not signed in ──────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <Shell title={t('budgetTracker.title')} onBack={handleBack}>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Wallet size={26} color="#2563EB" strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>{t('budgetTracker.signInRequiredTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('budgetTracker.signInRequiredMessage')}</Text>

            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Check size={14} color="#059669" strokeWidth={2.5} />
                <Text style={styles.featureText}>{t('budgetTracker.signInBenefit1')}</Text>
              </View>
              <View style={styles.featureItem}>
                <Check size={14} color="#059669" strokeWidth={2.5} />
                <Text style={styles.featureText}>{t('budgetTracker.signInBenefit2')}</Text>
              </View>
              <View style={styles.featureItem}>
                <Check size={14} color="#059669" strokeWidth={2.5} />
                <Text style={styles.featureText}>{t('budgetTracker.signInBenefit3')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryActionBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/auth')}
              accessibilityRole="button"
              accessibilityLabel={t('budgetTracker.signIn')}
            >
              <Text style={styles.primaryActionBtnText}>{t('budgetTracker.signIn')}</Text>
              <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      </Shell>
    );
  }

  // ── Loading Trips ──────────────────────────────────────────────────
  if (tripsLoading) {
    return (
      <Shell title={t('budgetTracker.title')} onBack={handleBack}>
        <ScreenLoading label={t('budgetTracker.loadingTrips')} />
      </Shell>
    );
  }

  // ── No Trips ───────────────────────────────────────────────────────
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

  const yourNetNum = Number(budget?.yourNet ?? 0);
  const isOwed = yourNetNum > 0;
  const owes = yourNetNum < 0;

  return (
    <Shell
      title={t('budgetTracker.title')}
      onBack={handleBack}
      onAdd={() => setShowAdd(true)}
      showAddBtn={!!budget}
    >
      {/* Trip Switcher Pills */}
      {myTrips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tripSelectorScroll}
        >
          {myTrips.map((tItem) => {
            const isSelected = tItem.id === activeTripId;
            return (
              <TouchableOpacity
                key={tItem.id}
                style={[styles.tripPill, isSelected && styles.tripPillActive]}
                activeOpacity={0.7}
                onPress={() => setTripId(tItem.id)}
              >
                <Text style={[styles.tripPillText, isSelected && styles.tripPillTextActive]}>
                  {tItem.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

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
          renderItem={({ item, index }) => (
            <View>
              <ExpenseRow
                expense={item}
                onDelete={(id) => deleteMutation.mutate(id)}
                deleteDisabled={deleteMutation.isPending}
              />
              {index < budget.expenses.length - 1 && <View style={styles.divider} />}
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2563EB" />}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {/* Trip Name & Members Header */}
              {activeTrip && (
                <View style={styles.activeTripMeta}>
                  <Text style={styles.activeTripTitle} numberOfLines={1}>
                    {activeTrip.name}
                  </Text>
                  <View style={styles.activeTripMembersPill}>
                    <Users size={12} color="#64748B" />
                    <Text style={styles.activeTripMembersText}>
                      {budget.headCount} {budget.headCount === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Minimal Summary Card ── */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View>
                    <Text style={styles.summaryMicroLabel}>{t('budgetTracker.totalTripSpend')}</Text>
                    <Text style={styles.summaryMainValue}>{inr(budget.total)}</Text>
                  </View>

                  <View style={styles.summaryPerPersonWrap}>
                    <Text style={styles.summaryPerPersonLabel}>
                      {t('budgetTracker.splitWays', { count: budget.headCount })}
                    </Text>
                    <Text style={styles.summaryPerPersonValue}>
                      {t('budgetTracker.perPerson', { amount: inr(budget.yourShare) })}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryCardDivider} />

                <View style={styles.summaryBottomRow}>
                  <Text style={styles.summaryStatusLabel}>{t('budgetTracker.yourBalance')}</Text>

                  <View
                    style={[
                      styles.statusPill,
                      isOwed
                        ? styles.statusPillGreen
                        : owes
                          ? styles.statusPillRed
                          : styles.statusPillGray,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isOwed
                          ? styles.statusPillTextGreen
                          : owes
                            ? styles.statusPillTextRed
                            : styles.statusPillTextGray,
                      ]}
                    >
                      {isOwed
                        ? `+ ${inr(yourNetNum)} (you get back)`
                        : owes
                          ? `- ${inr(Math.abs(yourNetNum))} (you owe)`
                          : 'Settled up'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── Member Balances ── */}
              {budget.balances.length > 1 && (
                <View style={styles.sectionWrap}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('budgetTracker.whoOwesWhat')}</Text>
                  </View>

                  <View style={styles.cardContainer}>
                    {budget.balances.map((b, i) => {
                      const netVal = Number(b.net);
                      const isMemberOwed = netVal > 0;
                      const isMemberOwes = netVal < 0;

                      return (
                        <View key={b.userId}>
                          <View style={styles.balanceItem}>
                            {b.avatar ? (
                              <Image
                                source={{ uri: b.avatar }}
                                style={styles.balanceAvatar}
                                contentFit="cover"
                                transition={150}
                                cachePolicy="memory-disk"
                              />
                            ) : (
                              <View style={styles.balanceAvatarFallback}>
                                <Text style={styles.avatarFallbackText}>
                                  {b.name.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}

                            <View style={styles.balanceInfo}>
                              <View style={styles.balanceNameRow}>
                                <Text style={styles.balanceName} numberOfLines={1}>
                                  {b.name}
                                </Text>
                                {b.isOrganizer && (
                                  <View style={styles.organizerBadge}>
                                    <Text style={styles.organizerBadgeText}>Organizer</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.balanceSub}>
                                Paid {inr(b.paid)} • Share {inr(b.share)}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.balanceNetPill,
                                isMemberOwed
                                  ? styles.netPillGreen
                                  : isMemberOwes
                                    ? styles.netPillRed
                                    : styles.netPillGray,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.balanceNetText,
                                  isMemberOwed
                                    ? styles.netTextGreen
                                    : isMemberOwes
                                      ? styles.netTextRed
                                      : styles.netTextGray,
                                ]}
                              >
                                {isMemberOwed ? `+${inr(netVal)}` : isMemberOwes ? `-${inr(Math.abs(netVal))}` : '₹0'}
                              </Text>
                            </View>
                          </View>
                          {i < budget.balances.length - 1 && <View style={styles.divider} />}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── Expenses List Header ── */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t('budgetTracker.expenses')} ({budget.expenses.length})
                </Text>
              </View>

              {budget.expenses.length > 0 && <View style={styles.cardHeaderSpacer} />}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyExpensesBox}>
              <Receipt size={24} color="#94A3B8" />
              <Text style={styles.emptyExpensesText}>{t('budgetTracker.noExpensesYet')}</Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 96 }} />}
        />
      )}

      {/* ── Minimal Bottom Add Button ── */}
      {budget && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.addExpenseBtn}
            activeOpacity={0.88}
            onPress={() => setShowAdd(true)}
            accessibilityRole="button"
            accessibilityLabel={t('budgetTracker.addExpense')}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.addExpenseBtnText}>{t('budgetTracker.addExpense')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Minimal Add Expense Sheet ── */}
      <Sheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('budgetTracker.addExpense')}
        scrollable={false}
      >
        <View style={styles.modalBody}>
          {/* Amount Input */}
          <View style={styles.amountInputWrap}>
            <Text style={styles.rupeeSymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
              accessibilityLabel={t('budgetTracker.expenseAmountLabel')}
            />
          </View>

          {/* Description Input */}
          <TextInput
            style={styles.descInput}
            placeholder={t('budgetTracker.whatWasItFor')}
            placeholderTextColor="#94A3B8"
            value={desc}
            onChangeText={setDesc}
            accessibilityLabel={t('budgetTracker.expenseDescriptionLabel')}
          />

          {/* Category Selector */}
          <View style={styles.categoryWrap}>
            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((c) => {
                const isSelected = category === c.key;
                const Icon = c.Icon;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[
                      styles.categoryChip,
                      isSelected && { backgroundColor: c.bg, borderColor: c.color },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setCategory(c.key)}
                  >
                    <Icon size={14} color={isSelected ? c.color : '#64748B'} strokeWidth={2} />
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && { color: c.color, fontWeight: '700' },
                      ]}
                    >
                      {t(c.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.modalSubmitBtn, !canSubmit && styles.modalSubmitBtnDisabled]}
            disabled={!canSubmit}
            activeOpacity={0.85}
            onPress={() => addMutation.mutate()}
          >
            <Text style={styles.modalSubmitBtnText}>
              {addMutation.isPending ? 'Adding…' : t('budgetTracker.addExpense')}
            </Text>
          </TouchableOpacity>
        </View>
      </Sheet>
    </Shell>
  );
}

function Shell({
  title,
  onBack,
  onAdd,
  showAddBtn,
  children,
}: {
  title: string;
  onBack: () => void;
  onAdd?: () => void;
  showAddBtn?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel={t('budgetTracker.goBack')}
        >
          <ArrowLeft size={18} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{title}</Text>

        {showAddBtn && onAdd ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={onAdd}
            style={styles.headerAddBtn}
            accessibilityRole="button"
            accessibilityLabel={t('budgetTracker.addExpense')}
          >
            <Plus size={16} color="#2563EB" strokeWidth={2.5} />
            <Text style={styles.headerAddText}>Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerAddText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },

  // Trip selector pills
  tripSelectorScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  tripPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tripPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tripPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  tripPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // List layout
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // Active trip meta
  activeTripMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  activeTripTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginRight: 8,
  },
  activeTripMembersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeTripMembersText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── Clean Summary Card ──
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  summaryMicroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryMainValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  summaryPerPersonWrap: {
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryPerPersonLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  summaryPerPersonValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  summaryCardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryStatusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillGreen: {
    backgroundColor: '#ECFDF5',
  },
  statusPillRed: {
    backgroundColor: '#FEF2F2',
  },
  statusPillGray: {
    backgroundColor: '#F1F5F9',
  },
  statusPillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  statusPillTextGreen: {
    color: '#059669',
  },
  statusPillTextRed: {
    color: '#DC2626',
  },
  statusPillTextGray: {
    color: '#475569',
  },

  // Section
  sectionWrap: {
    marginBottom: 16,
  },
  sectionHeader: {
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  cardHeaderSpacer: {
    height: 2,
  },

  // Member balance item
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  balanceAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  balanceAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  balanceInfo: {
    flex: 1,
    gap: 2,
  },
  balanceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  organizerBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  organizerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  balanceSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  balanceNetPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  netPillGreen: {
    backgroundColor: '#ECFDF5',
  },
  netPillRed: {
    backgroundColor: '#FEF2F2',
  },
  netPillGray: {
    backgroundColor: '#F1F5F9',
  },
  balanceNetText: {
    fontSize: 12,
    fontWeight: '800',
  },
  netTextGreen: {
    color: '#059669',
  },
  netTextRed: {
    color: '#DC2626',
  },
  netTextGray: {
    color: '#64748B',
  },

  // Expense row
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  expenseIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseDetails: {
    flex: 1,
    gap: 2,
  },
  expenseTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  expenseSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  deleteBtn: {
    padding: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F1F5F9',
  },

  // Empty state for expenses
  emptyExpensesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyExpensesText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },

  // Bottom Add Button
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  addExpenseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    height: 46,
    borderRadius: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addExpenseBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Add Expense Sheet Modal Body
  modalBody: {
    gap: 14,
    paddingBottom: 16,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  rupeeSymbol: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 100,
    textAlign: 'left',
  },
  descInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  categoryWrap: {
    gap: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  modalSubmitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 11,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalSubmitBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  modalSubmitBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Empty state / Guest
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  featureList: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  primaryActionBtn: {
    width: '100%',
    height: 46,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
