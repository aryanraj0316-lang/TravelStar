import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Car,
  Hotel,
  Utensils,
  ShoppingBag,
  Calendar,
  X,
  TrendingDown,
  Clock,
} from 'lucide-react-native';

const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
  rose: '#EC4899',
};

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: 'TRANSPORT' | 'LODGING' | 'FOOD' | 'OTHER';
  date: string;
  time: string;
}

const CATEGORY_META = {
  TRANSPORT: { label: 'Transport', color: C.blue, Icon: Car, bg: 'rgba(59,130,246,0.15)' },
  LODGING: { label: 'Lodging', color: C.purple, Icon: Hotel, bg: 'rgba(139,92,246,0.15)' },
  FOOD: { label: 'Food & Meals', color: C.amber, Icon: Utensils, bg: 'rgba(245,158,11,0.15)' },
  OTHER: { label: 'Shopping & Other', color: C.rose, Icon: ShoppingBag, bg: 'rgba(236,72,153,0.15)' },
};

export default function BudgetTrackerScreen() {
  const router = useRouter();

  // Budget states
  const [totalBudget] = useState<number>(15000);
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', title: 'Hotel Booking Vrindavan', amount: 4000, category: 'LODGING', date: '2026-07-20', time: '11:30 AM' },
    { id: '2', title: 'Train ticket to Mathura', amount: 1800, category: 'TRANSPORT', date: '2026-07-20', time: '09:15 AM' },
    { id: '3', title: 'Lunch at Mathura Highway', amount: 750, category: 'FOOD', date: '2026-07-21', time: '02:00 PM' },
    { id: '4', title: 'Local Auto Fare', amount: 350, category: 'TRANSPORT', date: '2026-07-21', time: '05:30 PM' },
    { id: '5', title: 'Pooja Thali & Souvenirs', amount: 800, category: 'OTHER', date: '2026-07-22', time: '10:00 AM' },
  ]);

  // Modal form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<keyof typeof CATEGORY_META>('TRANSPORT');

  // Derived metrics
  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  const remaining = totalBudget - totalSpent;
  const spentPercentage = Math.min((totalSpent / totalBudget) * 100, 100);

  // Category totals
  const categoryTotals = expenses.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {} as Record<keyof typeof CATEGORY_META, number>);

  const handleAddExpense = () => {
    if (!newTitle.trim() || !newAmount.trim() || isNaN(parseFloat(newAmount))) {
      return;
    }

    const newExpense: Expense = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      amount: parseFloat(newAmount),
      category: newCategory,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setExpenses([newExpense, ...expenses]);
    setNewTitle('');
    setNewAmount('');
    setNewCategory('TRANSPORT');
    setShowAddModal(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Budget Tracker</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.addFloatBtnHeader}
          onPress={() => setShowAddModal(true)}
        >
          <Plus size={18} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Main Budget Dashboard Card */}
        <LinearGradient
          colors={['#14182B', '#0D0F1C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dashboardCard}
        >
          <View style={styles.tripContextRow}>
            <Text style={styles.tripContextLabel}>ACTIVE TRIP BUDGET</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>Ranchi → Vrindavan</Text>
            </View>
          </View>

          <Text style={styles.remainingBudgetAmount}>
            ₹{remaining.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.remainingBudgetSub}>Remaining Balance</Text>

          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={remaining < 2000 ? [C.rose, '#EF4444'] : ['#00F2FE', '#0066FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBar, { width: `${spentPercentage}%` }]}
            />
          </View>

          <View style={styles.progressMetaRow}>
            <Text style={styles.progressPercentText}>
              {spentPercentage.toFixed(0)}% Used
            </Text>
            <Text style={styles.progressBudgetTotal}>
              of ₹{totalBudget.toLocaleString('en-IN')}
            </Text>
          </View>
        </LinearGradient>

        {/* Dashboard Grid (Budget vs Spent) */}
        <View style={styles.statsGrid}>
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Total Budget</Text>
            <View style={styles.statsValueRow}>
              <Text style={[styles.statsValue, { color: C.blue }]}>
                ₹{totalBudget.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Total Spent</Text>
            <View style={styles.statsValueRow}>
              <Text style={[styles.statsValue, { color: C.rose }]}>
                ₹{totalSpent.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Category breakdown section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Category Breakdown</Text>
          <View style={styles.breakdownCard}>
            {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((key) => {
              const meta = CATEGORY_META[key];
              const amount = categoryTotals[key] || 0;
              const percent = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
              const Icon = meta.Icon;

              return (
                <View key={key} style={styles.categoryRow}>
                  <View style={[styles.categoryIconWrap, { backgroundColor: meta.bg }]}>
                    <Icon size={16} color={meta.color} />
                  </View>
                  <View style={styles.categoryInfo}>
                    <View style={styles.categoryMeta}>
                      <Text style={styles.categoryLabel}>{meta.label}</Text>
                      <Text style={styles.categoryAmount}>
                        ₹{amount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.categoryTrack}>
                      <View
                        style={[
                          styles.categoryBar,
                          { width: `${percent}%`, backgroundColor: meta.color },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={styles.categoryPercent}>{percent.toFixed(0)}%</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Ledger */}
        <View style={styles.sectionContainer}>
          <View style={styles.ledgerHeader}>
            <Text style={styles.sectionTitle}>Recent Expenses</Text>
            <TouchableOpacity style={styles.addTextBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addTextBtnLabel}>+ Add Expense</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.ledgerContainer}>
            {expenses.map((expense) => {
              const meta = CATEGORY_META[expense.category];
              const Icon = meta.Icon;

              return (
                <View key={expense.id} style={styles.expenseItem}>
                  <View style={[styles.expenseIconWrap, { backgroundColor: meta.bg }]}>
                    <Icon size={18} color={meta.color} />
                  </View>
                  <View style={styles.expenseMainInfo}>
                    <Text style={styles.expenseTitle} numberOfLines={1}>{expense.title}</Text>
                    <View style={styles.expenseTimeRow}>
                      <Calendar size={10} color={C.textMuted} style={{ marginRight: 4 }} />
                      <Text style={styles.expenseTimeText}>{expense.date}</Text>
                      <Clock size={10} color={C.textMuted} style={{ marginLeft: 8, marginRight: 4 }} />
                      <Text style={styles.expenseTimeText}>{expense.time}</Text>
                    </View>
                  </View>
                  <View style={styles.expenseAmountRow}>
                    <TrendingDown size={12} color={C.rose} style={{ marginRight: 2 }} />
                    <Text style={styles.expenseAmount}>
                      ₹{expense.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>

      {/* Add Expense Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Expense</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowAddModal(false)}
              >
                <X size={20} color={C.white} />
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>EXPENSE NAME</Text>
              <TextInput
                placeholder="e.g. Taxi to Temple"
                placeholderTextColor={C.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>AMOUNT (₹)</Text>
              <TextInput
                placeholder="0.00"
                placeholderTextColor={C.textMuted}
                value={newAmount}
                onChangeText={setNewAmount}
                keyboardType="numeric"
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>CATEGORY</Text>
              <View style={styles.categorySelectorGrid}>
                {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]).map((key) => {
                  const meta = CATEGORY_META[key];
                  const isSelected = newCategory === key;
                  const Icon = meta.Icon;

                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.8}
                      onPress={() => setNewCategory(key)}
                      style={[
                        styles.catOptionBtn,
                        isSelected && { borderColor: meta.color, backgroundColor: meta.bg },
                      ]}
                    >
                      <Icon size={16} color={isSelected ? meta.color : C.textSec} />
                      <Text style={[styles.catOptionLabel, isSelected && { color: C.white, fontWeight: '700' }]}>
                        {meta.label.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.saveExpenseBtn}
                onPress={handleAddExpense}
              >
                <LinearGradient
                  colors={['#00F2FE', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveExpenseBtnGradient}
                >
                  <Text style={styles.saveExpenseBtnText}>Add Expense</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  addFloatBtnHeader: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.4)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
  },
  dashboardCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  tripContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tripContextLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.green,
    marginRight: 5,
  },
  liveLabel: {
    fontSize: 9,
    color: C.green,
    fontWeight: '700',
  },
  remainingBudgetAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: C.white,
  },
  remainingBudgetSub: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    marginBottom: 16,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  progressBudgetTotal: {
    fontSize: 11,
    color: C.textMuted,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statsCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  statsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textMuted,
    marginBottom: 6,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
    marginBottom: 12,
  },
  breakdownCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
    gap: 6,
  },
  categoryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },
  categoryAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSec,
  },
  categoryTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  categoryBar: {
    height: '100%',
    borderRadius: 2,
  },
  categoryPercent: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '600',
    width: 28,
    textAlign: 'right',
  },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addTextBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addTextBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blue,
  },
  ledgerContainer: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 8,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  expenseIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  expenseMainInfo: {
    flex: 1,
    gap: 3,
  },
  expenseTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.white,
  },
  expenseTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseTimeText: {
    fontSize: 10,
    color: C.textMuted,
  },
  expenseAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0E1020',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    height: 48,
    color: C.white,
    paddingHorizontal: 16,
    fontSize: 14,
    marginBottom: 18,
  },
  categorySelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  catOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  catOptionLabel: {
    fontSize: 11.5,
    color: C.textSec,
  },
  saveExpenseBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveExpenseBtnGradient: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveExpenseBtnText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
