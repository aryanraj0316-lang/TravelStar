import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  Check,
  ChevronRight,
  Hotel,
  MapPin,
  Plus,
  ShoppingBag,
  Ticket,
  Trash2,
  Utensils,
  X,
} from 'lucide-react-native';

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { toast, errorToastMessage } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';

// docs/REMEDIATION.md §8.12: this screen was pure local useState — a
// hardcoded ₹15,000 budget and five hardcoded expense rows that reset the
// moment it unmounted. It is now backed by the real TripExpense model:
// expenses are shared across everyone on a chosen trip and split equally,
// with the split derived server-side at read time so it never drifts.

const C = {
  bg: '#070913',
  card: '#121524',
  cardAlt: '#1A1D30',
  border: '#1D2138',
  white: '#FFFFFF',
  textSec: '#8A92A6',
  textMuted: '#6A7182',
  blue: '#0066FF',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#FF2D55',
};

const CATEGORIES = [
  { key: 'TRANSPORT', label: 'Transport', color: C.blue, Icon: Car },
  { key: 'LODGING', label: 'Lodging', color: C.purple, Icon: Hotel },
  { key: 'FOOD', label: 'Food', color: C.amber, Icon: Utensils },
  { key: 'ACTIVITY', label: 'Activity', color: C.green, Icon: Ticket },
  { key: 'OTHER', label: 'Other', color: C.rose, Icon: ShoppingBag },
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
  const meta = catMeta(expense.category);

  return (
    <View style={styles.expenseRow}>
      <View style={[styles.expenseIcon, { backgroundColor: meta.color + '22' }]}>
        <meta.Icon size={16} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseTitle}>{expense.description}</Text>
        <Text style={styles.expenseSub}>
          {meta.label} · paid by {expense.paidByName} · {new Date(expense.createdAt).toLocaleDateString('en-IN')}
        </Text>
      </View>
      <Text style={styles.expenseAmount}>{inr(expense.amount)}</Text>
      {expense.canDelete && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(expense.id)}
          disabled={deleteDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${expense.description}`}
        >
          <Trash2 size={15} color={C.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const keyExtractor = (e: ExpenseItem) => e.id;

export default function BudgetTrackerScreen() {
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
      toast('Expense added', 'success');
      setShowAdd(false);
      setDesc('');
      setAmount('');
      setCategory('TRANSPORT');
      if (activeTripId) void queryClient.invalidateQueries({ queryKey: queryKeys.tripExpenses(activeTripId) });
    },
    onError: (e) => toast(errorToastMessage(e, 'Could not add the expense.'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (expenseId: string) => apiService.deleteTripExpense(activeTripId as string, expenseId),
    onSuccess: () => {
      toast('Expense removed', 'success');
      if (activeTripId) void queryClient.invalidateQueries({ queryKey: queryKeys.tripExpenses(activeTripId) });
    },
    onError: (e) => toast(errorToastMessage(e, 'Could not remove the expense.'), 'error'),
  });

  const canSubmit = desc.trim().length > 0 && Number(amount) > 0 && !addMutation.isPending;

  // ── Not signed in / no trips ──────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <Shell title="Budget Tracker" onBack={() => router.back()}>
        <View style={styles.stateWrap}>
          <MapPin size={52} color={C.textMuted} strokeWidth={1.3} />
          <Text style={styles.stateText}>Sign in to track a trip budget.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.navigate('/auth')}>
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </Shell>
    );
  }

  if (tripsLoading) {
    return (
      <Shell title="Budget Tracker" onBack={() => router.back()}>
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.stateText}>Loading your trips…</Text>
        </View>
      </Shell>
    );
  }

  if (tripsError || myTrips.length === 0) {
    return (
      <Shell title="Budget Tracker" onBack={() => router.back()}>
        <View style={styles.stateWrap}>
          <MapPin size={52} color={C.textMuted} strokeWidth={1.3} />
          <Text style={styles.stateText}>
            {tripsError ? 'Could not load your trips.' : 'Join or create a trip to start tracking a shared budget.'}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.navigate('/search')}>
            <Text style={styles.primaryBtnText}>Browse trips</Text>
          </TouchableOpacity>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title="Budget Tracker" onBack={() => router.back()}>
      {/* Trip selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>
        {myTrips.map((t) => {
          const active = t.id === activeTripId;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.tripChip, active && styles.tripChipActive]}
              onPress={() => setTripId(t.id)}
            >
              <Text style={[styles.tripChipText, active && styles.tripChipTextActive]} numberOfLines={1}>
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {budgetLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={C.blue} />
          <Text style={styles.stateText}>Loading expenses…</Text>
        </View>
      ) : budgetError || !budget ? (
        <View style={styles.stateWrap}>
          <AlertCircle size={48} color={C.rose} strokeWidth={1.4} />
          <Text style={styles.stateText}>
            {error instanceof Error ? error.message : 'Could not load this trip budget.'}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => refetch()}>
            <Text style={styles.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
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
                <Text style={styles.summaryLabel}>TOTAL TRIP SPEND</Text>
                <Text style={styles.summaryValue}>{inr(budget.total)}</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryColLabel}>Split {budget.headCount} ways</Text>
                    <Text style={styles.summaryColValue}>{inr(budget.yourShare)} / person</Text>
                  </View>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryColLabel}>Your balance</Text>
                    <Text style={[styles.summaryColValue, { color: Number(budget.yourNet) >= 0 ? C.green : C.rose }]}>
                      {Number(budget.yourNet) >= 0 ? 'you are owed ' : 'you owe '}
                      {inr(Math.abs(Number(budget.yourNet)))}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Per-member balances */}
              {budget.balances.length > 1 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Who owes what</Text>
                  {budget.balances.map((b) => (
                    <View key={b.userId} style={styles.balanceRow}>
                      <Image source={{ uri: b.avatar }} style={styles.balanceAvatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.balanceName}>
                          {b.name}
                          {b.isOrganizer ? ' · organizer' : ''}
                        </Text>
                        <Text style={styles.balanceSub}>
                          paid {inr(b.paid)} of {inr(b.share)} share
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
              <Text style={styles.expensesTitle}>Expenses</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.emptyExpenses}>No expenses logged for this trip yet.</Text>}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      {/* Add button */}
      {budget && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
        >
          <Plus size={22} color={C.white} />
        </TouchableOpacity>
      )}

      {/* Add expense modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add expense{activeTrip ? ` · ${activeTrip.name}` : ''}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={C.textSec} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="What was it for?"
              placeholderTextColor={C.textMuted}
              value={desc}
              onChangeText={setDesc}
              accessibilityLabel="Expense description"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (₹)"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              accessibilityLabel="Expense amount"
            />

            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catPill, active && { backgroundColor: c.color + '22', borderColor: c.color }]}
                    onPress={() => setCategory(c.key)}
                  >
                    <c.Icon size={13} color={active ? c.color : C.textMuted} />
                    <Text style={[styles.catPillText, active && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
              disabled={!canSubmit}
              onPress={() => addMutation.mutate()}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Check size={16} color={C.white} />
                  <Text style={styles.submitBtnText}>Add expense</Text>
                  <ChevronRight size={16} color={C.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Shell>
  );
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  stateText: { color: C.textSec, fontSize: 13.5, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  primaryBtn: { backgroundColor: C.blue, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
  primaryBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
  tripChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tripChip: {
    maxWidth: 200,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  tripChipActive: { backgroundColor: C.blue, borderColor: C.blue },
  tripChipText: { fontSize: 12, fontWeight: '700', color: C.textSec },
  tripChipTextActive: { color: C.white },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  summaryCard: { borderRadius: 20, padding: 18, gap: 6, marginBottom: 16 },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: C.textSec, letterSpacing: 1 },
  summaryValue: { fontSize: 30, fontWeight: '900', color: C.white },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  summaryCol: { gap: 3 },
  summaryColLabel: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
  summaryColValue: { fontSize: 13, fontWeight: '800', color: C.white },
  section: { marginBottom: 20 },
  // The "Expenses" heading sits in the FlatList header rather than inside a
  // `section` card, so it carries the section's spacing itself.
  expensesTitle: { fontSize: 13, fontWeight: '800', color: C.white, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 10 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  balanceAvatar: { width: 34, height: 34, borderRadius: 17 },
  balanceName: { fontSize: 12.5, fontWeight: '700', color: C.white },
  balanceSub: { fontSize: 10.5, color: C.textMuted },
  balanceNet: { fontSize: 13, fontWeight: '800' },
  emptyExpenses: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
  },
  expenseIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseTitle: { fontSize: 13, fontWeight: '700', color: C.white },
  expenseSub: { fontSize: 10, color: C.textMuted, marginTop: 2 },
  expenseAmount: { fontSize: 13.5, fontWeight: '800', color: C.white },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: C.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '800', color: C.white, flex: 1, marginRight: 10 },
  modalInput: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    color: C.white,
    fontSize: 13.5,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  catPillText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.blue,
    height: 48,
    borderRadius: 14,
    marginTop: 4,
  },
  submitBtnText: { color: C.white, fontSize: 14, fontWeight: '800' },
});
