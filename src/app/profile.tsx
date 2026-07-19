import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  TextInput,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Shield,
  Wallet,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle,
  Plus,
  Coins,
  ChevronRight,
  TrendingUp,
  Sliders,
  Bell,
  LogOut,
} from 'lucide-react-native';
import { useApp, UserRole } from '@/store/AppContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import GlassCard from '@/components/ui/GlassCard';
import { Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const isDark = useColorScheme() === 'dark';
  const {
    currentRole,
    setCurrentRole,
    profile,
    updateProfile,
    walletTransactions,
    addWalletFunds,
    withdrawWalletFunds,
  } = useApp();

  const [activeSection, setActiveSection] = useState<'DETAILS' | 'WALLET' | 'DASHBOARD'>('DETAILS');
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');

  // Guide dashboard states
  const [hourlyRate, setHourlyRate] = useState('350');
  const [dailyRate, setDailyRate] = useState('2200');

  // Verify functions
  const handleAadhaarVerify = () => {
    if (aadhaarInput.length !== 12) {
      Alert.alert('Invalid Aadhaar', 'Aadhaar must be a 12-digit number.');
      return;
    }
    updateProfile({ aadhaarStatus: 'PENDING' });
    setTimeout(() => {
      updateProfile({ aadhaarStatus: 'VERIFIED', isVerified: true });
      Alert.alert('Verification Success', 'Your profile is now verified. Verified badge added!');
    }, 1500);
  };

  const handleApplyGuideLicense = () => {
    updateProfile({ guideLicenseStatus: 'PENDING' });
    setTimeout(() => {
      updateProfile({ guideLicenseStatus: 'VERIFIED' });
      Alert.alert('License Approved', 'Your tour guide license is verified.');
    }, 1500);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: isDark ? '#121214' : '#FAFAFC' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* User Card */}
        <GlassCard style={styles.profileHero}>
          <View style={styles.heroRow}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <ThemedText type="subtitle" style={{ fontWeight: '700' }}>{profile.name}</ThemedText>
                {profile.isVerified && (
                  <CheckCircle size={16} color="#00D1FF" fill="#00D1FF" style={{ marginLeft: 4 }} />
                )}
              </View>
              <ThemedText type="small" themeColor="textSecondary">Active Role: {currentRole}</ThemedText>
              <ThemedText type="small" style={styles.emailText}>aarav.sharma@example.com</ThemedText>
            </View>
          </View>
        </GlassCard>

        {/* Navigation Tabs */}
        <View style={styles.sectionTabs}>
          <TouchableOpacity
            style={[styles.tabButton, activeSection === 'DETAILS' && styles.tabButtonActive]}
            onPress={() => setActiveSection('DETAILS')}
          >
            <ThemedText type="smallBold" style={activeSection === 'DETAILS' ? styles.tabTextActive : null}>
              Details
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeSection === 'WALLET' && styles.tabButtonActive]}
            onPress={() => setActiveSection('WALLET')}
          >
            <ThemedText type="smallBold" style={activeSection === 'WALLET' ? styles.tabTextActive : null}>
              Wallet
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeSection === 'DASHBOARD' && styles.tabButtonActive]}
            onPress={() => setActiveSection('DASHBOARD')}
          >
            <ThemedText type="smallBold" style={activeSection === 'DASHBOARD' ? styles.tabTextActive : null}>
              Dashboard
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Render: Profile details & verification */}
        {activeSection === 'DETAILS' && (
          <View style={styles.sectionView}>
            {/* Identity Verification (Aadhaar/Selfie) */}
            <GlassCard style={styles.innerCard}>
              <ThemedText type="smallBold" style={styles.cardHeading}>
                IDENTITY VERIFICATION
              </ThemedText>

              {profile.aadhaarStatus === 'VERIFIED' ? (
                <View style={styles.verifiedRow}>
                  <CheckCircle size={20} color="#10B981" />
                  <ThemedText style={styles.verifiedMsg}>Aadhaar Identity Verified</ThemedText>
                </View>
              ) : profile.aadhaarStatus === 'PENDING' ? (
                <ThemedText style={{ fontStyle: 'italic' }}>Verification Pending...</ThemedText>
              ) : (
                <View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
                    Enter your 12-digit Aadhaar number to verify your travel profile:
                  </ThemedText>
                  <TextInput
                    placeholder="1234 5678 9012"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.textInput, { color: isDark ? '#FFF' : '#000' }]}
                    value={aadhaarInput}
                    onChangeText={setAadhaarInput}
                  />
                  <TouchableOpacity style={styles.verifyBtn} onPress={handleAadhaarVerify}>
                    <ThemedText style={styles.verifyBtnText}>Submit Aadhaar</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>

            {/* Profile Fields */}
            <GlassCard style={[styles.innerCard, { marginTop: Spacing.three }]}>
              <ThemedText type="smallBold" style={styles.cardHeading}>PROFILE SETTINGS</ThemedText>
              
              <View style={styles.profileSettingItem}>
                <ThemedText type="small" themeColor="textSecondary">Languages Spoken</ThemedText>
                <ThemedText type="smallBold">Hindi, English, Punjabi</ThemedText>
              </View>

              <View style={styles.profileSettingItem}>
                <ThemedText type="small" themeColor="textSecondary">Adventure Style</ThemedText>
                <ThemedText type="smallBold">Mountains, Backpacking, Photography</ThemedText>
              </View>

              <View style={styles.profileSettingItem}>
                <ThemedText type="small" themeColor="textSecondary">Budget Preference</ThemedText>
                <ThemedText type="smallBold">Moderate (₹5000 - ₹15000)</ThemedText>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Render: Wallet & Transaction history */}
        {activeSection === 'WALLET' && (
          <View style={styles.sectionView}>
            <GlassCard style={styles.walletCard}>
              <View style={styles.walletRow}>
                <View>
                  <ThemedText type="small" themeColor="textSecondary">WALLET BALANCE</ThemedText>
                  <ThemedText type="title" style={styles.balanceText}>
                    ₹{profile.walletBalance.toFixed(2)}
                  </ThemedText>
                </View>
                <View style={styles.rewardsBox}>
                  <Coins size={16} color="#F59E0B" />
                  <ThemedText type="smallBold" style={{ marginLeft: 4 }}>
                    {profile.rewardPoints} pts
                  </ThemedText>
                </View>
              </View>

              <View style={styles.walletActions}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    placeholder="Enter amount"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.walletInput, { color: isDark ? '#FFF' : '#000' }]}
                    value={fundingAmount}
                    onChangeText={setFundingAmount}
                  />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      const val = parseFloat(fundingAmount);
                      if (val > 0) {
                        addWalletFunds(val);
                        setFundingAmount('');
                      }
                    }}
                  >
                    <ArrowUpRight size={14} color="#FFF" />
                    <Text style={styles.actionBtnText}>Add Cash</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <TextInput
                    placeholder="Enter amount"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    style={[styles.walletInput, { color: isDark ? '#FFF' : '#000' }]}
                    value={withdrawalAmount}
                    onChangeText={setWithdrawalAmount}
                  />
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => {
                      const val = parseFloat(withdrawalAmount);
                      if (val > 0) {
                        withdrawWalletFunds(val);
                        setWithdrawalAmount('');
                      }
                    }}
                  >
                    <ArrowDownLeft size={14} color="#FFF" />
                    <Text style={styles.actionBtnText}>Withdraw</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GlassCard>

            {/* Transactions list */}
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.transactionsHeader}>
              TRANSACTION HISTORY
            </ThemedText>

            {walletTransactions.map((tx) => (
              <GlassCard key={tx.id} style={styles.txItem}>
                <View style={styles.txRow}>
                  <View>
                    <ThemedText type="smallBold">{tx.remark}</ThemedText>
                    <ThemedText style={{ fontSize: 9 }} themeColor="textSecondary">{tx.date}</ThemedText>
                  </View>
                  <ThemedText
                    type="smallBold"
                    style={{ color: tx.amount > 0 ? '#10B981' : '#EF4444' }}
                  >
                    {tx.amount > 0 ? `+₹${tx.amount}` : `-₹${Math.abs(tx.amount)}`}
                  </ThemedText>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Render: Role-specific dashboard */}
        {activeSection === 'DASHBOARD' && (
          <View style={styles.sectionView}>
            
            {/* 1. GUIDE DASHBOARD */}
            {currentRole === 'GUIDE' && (
              <View>
                <GlassCard style={styles.innerCard}>
                  <ThemedText type="smallBold" style={styles.cardHeading}>GUIDE DASHBOARD</ThemedText>
                  <View style={styles.dashboardMetricRow}>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="textSecondary">Active Bookings</ThemedText>
                      <ThemedText type="subtitle">4 Tours</ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="textSecondary">Guide Rating</ThemedText>
                      <ThemedText type="subtitle">4.95 ⭐</ThemedText>
                    </View>
                  </View>

                  <View style={styles.priceSettings}>
                    <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>Set Your Rates</ThemedText>
                    <View style={styles.rateInputs}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Hourly Charges (₹)</Text>
                        <TextInput
                          style={[styles.textInput, { color: isDark ? '#FFF' : '#000' }]}
                          value={hourlyRate}
                          onChangeText={setHourlyRate}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.label}>Daily Charges (₹)</Text>
                        <TextInput
                          style={[styles.textInput, { color: isDark ? '#FFF' : '#000' }]}
                          value={dailyRate}
                          onChangeText={setDailyRate}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>

                  {profile.guideLicenseStatus === 'VERIFIED' ? (
                    <View style={styles.verifiedRow}>
                      <CheckCircle size={20} color="#10B981" />
                      <ThemedText style={styles.verifiedMsg}>Official Guide License Verified</ThemedText>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.verifyBtn} onPress={handleApplyGuideLicense}>
                      <ThemedText style={styles.verifyBtnText}>Verify Guide License</ThemedText>
                    </TouchableOpacity>
                  )}
                </GlassCard>
              </View>
            )}

            {/* 2. ORGANIZER DASHBOARD */}
            {currentRole === 'ORGANIZER' && (
              <View>
                <GlassCard style={styles.innerCard}>
                  <ThemedText type="smallBold" style={styles.cardHeading}>ORGANIZER DASHBOARD</ThemedText>
                  
                  <View style={styles.dashboardMetricRow}>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="textSecondary">Groups Run</ThemedText>
                      <ThemedText type="subtitle">8 Groups</ThemedText>
                    </View>
                    <View style={styles.metricItem}>
                      <ThemedText type="small" themeColor="textSecondary">Active Members</ThemedText>
                      <ThemedText type="subtitle">42 Members</ThemedText>
                    </View>
                  </View>

                  <View style={styles.organizerActions}>
                    <TouchableOpacity style={styles.dashboardBtn}>
                      <Plus size={16} color="#FFF" />
                      <Text style={styles.dashboardBtnText}>Create Paid Group</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.dashboardBtn, { backgroundColor: '#F59E0B' }]}>
                      <Sliders size={16} color="#FFF" />
                      <Text style={styles.dashboardBtnText}>Manage Shared Expenses</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </View>
            )}

            {/* 3. FAMILY CONNECT INTERFACE */}
            {currentRole === 'FAMILY_TRAVELER' && (
              <View>
                <GlassCard style={styles.innerCard}>
                  <ThemedText type="smallBold" style={styles.cardHeading}>FAMILY CONNECT DASHBOARD</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three }}>
                    Discover groups traveling from/to stops near your current location. Dynamic segments will be auto-calculated.
                  </ThemedText>
                  
                  <View style={styles.familyInfoCard}>
                    <ThemedText type="smallBold" style={{ color: '#0066FF' }}>Current Stops Recommendation</ThemedText>
                    <ThemedText style={{ fontSize: 11, marginTop: 4 }}>
                      Ranchi → Delhi group is at stop "Delhi" today. If you are in Delhi, you can request to join Vrindavan next!
                    </ThemedText>
                  </View>
                </GlassCard>
              </View>
            )}

            {/* 4. ADMIN PANEL */}
            {currentRole === 'ADMIN' && (
              <View>
                <GlassCard style={styles.innerCard}>
                  <ThemedText type="smallBold" style={styles.cardHeading}>ADMIN CONTROL PANEL</ThemedText>
                  
                  <View style={styles.adminGrid}>
                    <View style={styles.adminCell}>
                      <ThemedText type="small" themeColor="textSecondary">Total Platform Revenue</ThemedText>
                      <ThemedText type="subtitle" style={{ color: '#10B981' }}>₹1,24,500</ThemedText>
                    </View>
                    <View style={styles.adminCell}>
                      <ThemedText type="small" themeColor="textSecondary">Active Bookings</ThemedText>
                      <ThemedText type="subtitle">1,024</ThemedText>
                    </View>
                  </View>

                  <View style={styles.adminActions}>
                    <TouchableOpacity style={styles.dashboardBtn} onPress={() => Alert.alert('Guide Verifications', 'No pending guides.')}>
                      <CheckCircle size={16} color="#FFF" />
                      <Text style={styles.dashboardBtnText}>Pending Guides (0)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.dashboardBtn, { backgroundColor: '#EF4444' }]} onPress={() => Alert.alert('Fraud Detection Logs', 'Zero system anomalies.')}>
                      <Shield size={16} color="#FFF" />
                      <Text style={styles.dashboardBtnText}>System Security Logs</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </View>
            )}

            {/* 5. TOURIST INTERFACE */}
            {currentRole === 'TOURIST' && (
              <View>
                <GlassCard style={styles.innerCard}>
                  <ThemedText type="smallBold" style={styles.cardHeading}>TOURIST DASHBOARD</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three }}>
                    Manage your upcoming bookings, ticket passes, and verify your ID badge.
                  </ThemedText>
                  
                  <View style={styles.bookingStatusItem}>
                    <ThemedText type="smallBold">Trip to Vrindavan (Midway)</ThemedText>
                    <ThemedText style={{ fontSize: 10, color: '#10B981' }}>Booking Status: Confirmed ✅</ThemedText>
                  </View>
                </GlassCard>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 110,
  },
  profileHero: {
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  heroInfo: {
    marginLeft: Spacing.three,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailText: {
    fontSize: 10,
  },
  sectionTabs: {
    flexDirection: 'row',
    marginVertical: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 12,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0066FF',
  },
  tabTextActive: {
    color: '#FFF',
  },
  sectionView: {
    marginTop: Spacing.three,
  },
  innerCard: {
    padding: Spacing.four,
  },
  cardHeading: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: Spacing.three,
  },
  textInput: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    marginBottom: Spacing.three,
  },
  verifyBtn: {
    backgroundColor: '#0066FF',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    padding: Spacing.three,
    borderRadius: 8,
  },
  verifiedMsg: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 8,
  },
  profileSettingItem: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  walletCard: {
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceText: {
    fontWeight: '800',
    color: '#0066FF',
  },
  rewardsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  walletActions: {
    flexDirection: 'row',
    marginTop: Spacing.four,
  },
  walletInput: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 8,
    fontSize: 11,
    marginBottom: 6,
  },
  actionBtn: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  transactionsHeader: {
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: Spacing.two,
  },
  txItem: {
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashboardMetricRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  metricItem: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: Spacing.three,
    borderRadius: 8,
  },
  priceSettings: {
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 10,
    color: '#888',
    marginBottom: 4,
  },
  rateInputs: {
    flexDirection: 'row',
  },
  dashboardBtn: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  dashboardBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  organizerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  familyInfoCard: {
    backgroundColor: 'rgba(0,102,255,0.03)',
    borderRadius: 8,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(0,102,255,0.08)',
  },
  adminGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  adminCell: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: Spacing.three,
    borderRadius: 8,
  },
  adminActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bookingStatusItem: {
    backgroundColor: 'rgba(16,185,129,0.04)',
    padding: Spacing.three,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(16,185,129,0.2)',
  },
});
