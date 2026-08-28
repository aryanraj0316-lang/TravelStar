import { apiService } from '@/services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  Check,
  Clock,
  CloudRain,
  MapPin,
  Mountain,
  Phone,
  ShieldAlert,
  Waves,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '@/theme/tokens';

interface HazardAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'ADVISORY';
  title: string;
  category: string;
  location: string;
  time: string;
  desc: string;
  affectedRoute: string;
  precautions: string[];
  image: string;
}

// Human-readable labels for the AlertCategory enum values the API returns
// (e.g. "FLOOD_RAIN") — see backend/prisma/schema.prisma.
const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_RAIN: 'Flood & Rain',
  LANDSLIDE: 'Landslide',
  CLOUDBURST: 'Cloudburst',
  TRAFFIC_RUSH: 'Traffic Rush',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');


type SeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'ADVISORY';

function getAlertIcon(category: string) {
  switch (category) {
    case 'LANDSLIDE':
      return <Mountain size={18} color={C.red} />;
    case 'FLOOD_RAIN':
      return <Waves size={18} color={C.cyan} />;
    case 'CLOUDBURST':
      return <CloudRain size={18} color={C.orange} />;
    case 'TRAFFIC_RUSH':
      return <Car size={18} color={C.orange} />;
    default:
      return <AlertTriangle size={18} color={C.orange} />;
  }
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return {
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'rgba(239, 68, 68, 0.3)',
        text: C.red,
        glow: '#EF4444',
      };
    case 'WARNING':
      return {
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'rgba(245, 158, 11, 0.3)',
        text: C.orange,
        glow: '#F59E0B',
      };
    default:
      return {
        bg: 'rgba(0, 102, 255, 0.1)',
        border: 'rgba(0, 102, 255, 0.3)',
        text: C.blue,
        glow: '#0066FF',
      };
  }
}

// Each hazard card is its own component so the React Compiler
// (app.json > experiments.reactCompiler) memoizes cards independently — no
// hand-written React.memo, which would make the compiler skip the component
// instead. The Phase 10 change here is virtualization: this list used to be a
// ScrollView + .map() that mounted and image-decoded every alert at once
// (docs/REMEDIATION.md Phase 10).
function AlertCard({ alert }: { alert: HazardAlert }) {
  const sev = getSeverityStyle(alert.severity);

  return (
    <View style={styles.alertCard}>
      {/* Card Header Info */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardCategoryWrap}>
          <View style={[styles.iconBox, { backgroundColor: sev.bg }]}>{getAlertIcon(alert.category)}</View>
          <View>
            <Text style={styles.categoryLabel}>{CATEGORY_LABELS[alert.category] ?? alert.category}</Text>
            <View style={styles.locationRow}>
              <MapPin size={10} color={C.textSec} />
              <Text style={styles.locationText} numberOfLines={1}>
                {alert.location}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.severityBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
          <Text style={[styles.severityBadgeText, { color: sev.text }]}>{alert.severity}</Text>
        </View>
      </View>

      {/* disaster image */}
      <View style={styles.alertImageContainer}>
        <Image source={{ uri: alert.image }} style={styles.alertImage} />
      </View>

      {/* Main Title & Description */}
      <Text style={styles.alertCardTitle}>{alert.title}</Text>
      <Text style={styles.alertCardDesc}>{alert.desc}</Text>

      {/* Highlighted Affected Route */}
      <View style={styles.routeWrap}>
        <Text style={styles.routeHeader}>Affected Route कॉरिडोर</Text>
        <Text style={styles.routeName}>{alert.affectedRoute}</Text>
      </View>

      {/* Precautions Guidelines List */}
      <View style={styles.precautionsSection}>
        <Text style={styles.precautionsHeader}>Precautions & Safety Guidelines</Text>
        {alert.precautions.map((precaution, idx) => (
          <View key={idx} style={styles.precautionItem}>
            <View style={styles.checkCircle}>
              <Check size={9} color={C.green} strokeWidth={3} />
            </View>
            <Text style={styles.precautionText}>{precaution}</Text>
          </View>
        ))}
      </View>

      {/* Alert Age / Timestamp Footer */}
      <View style={styles.cardFooter}>
        <Clock size={11} color={C.textMuted} />
        <Text style={styles.cardTimeText}>Issued {alert.time}</Text>
      </View>
    </View>
  );
}

const keyExtractor = (a: HazardAlert) => a.id;

export default function MonsoonAdvisoryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<SeverityFilter>('ALL');
  const [alerts, setAlerts] = useState<HazardAlert[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadAlerts = () => {
    apiService
      .getAlerts()
      .then((data) => {
        if (data) {
          setAlerts(data as HazardAlert[]);
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  // Filter alerts based on current state selection
  const filteredAlerts = (alerts ?? []).filter((alert) => filter === 'ALL' || alert.severity === filter);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Monsoon Advisory</Text>
          <View style={styles.liveBadge}>
            <View style={styles.livePulseDot} />
            <Text style={styles.liveBadgeText}>LIVE UPDATES</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredAlerts}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <AlertCard alert={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <>
            {/* ─── Informative Intro Banner ───────────────────────────────────── */}
            <LinearGradient
              colors={['#181C2E', '#111322']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.introCard}
            >
              <ShieldAlert size={24} color={C.orange} style={styles.introIcon} />
              <View style={styles.introTextWrap}>
                <Text style={styles.introTitle}>Monsoon Travel Security Desk</Text>
                <Text style={styles.introDesc}>
                  Real-time route hazards and safety advisories curated by weather stations and state emergency
                  operations. Check warning zones before route planning.
                </Text>
              </View>
            </LinearGradient>

            {/* ─── Filter Tabs ─────────────────────────────────────────────────── */}
            <View style={styles.filterTabs}>
              {(['ALL', 'CRITICAL', 'WARNING', 'ADVISORY'] as const).map((tab) => {
                const isActive = filter === tab;
                const count =
                  tab === 'ALL' ? (alerts ?? []).length : (alerts ?? []).filter((a) => a.severity === tab).length;

                return (
                  <TouchableOpacity
                    key={tab}
                    activeOpacity={0.8}
                    onPress={() => setFilter(tab)}
                    style={[
                      styles.filterTabItem,
                      isActive && styles.filterTabItemActive,
                      isActive && tab === 'CRITICAL' && styles.filterTabCriticalActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        isActive && styles.filterTabTextActive,
                        tab === 'CRITICAL' && { color: C.red },
                        tab === 'WARNING' && { color: C.orange },
                        tab === 'ADVISORY' && { color: C.blue },
                        isActive && { color: C.white },
                      ]}
                    >
                      {tab.charAt(0) + tab.slice(1).toLowerCase()} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        }
        ListEmptyComponent={
          alerts === null && !loadError ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator color={C.blue} />
            </View>
          ) : loadError ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Couldn&apos;t load hazard alerts.</Text>
              <TouchableOpacity onPress={loadAlerts} activeOpacity={0.8} style={{ marginTop: 12 }}>
                <Text style={[styles.emptyText, { color: C.blue, fontWeight: '700' }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No active alerts found in this category.</Text>
            </View>
          )
        }
        ListFooterComponent={
          <>
            {/* ─── Emergency Call Helpline Section ─────────────────────────────── */}
            <LinearGradient
              colors={['rgba(239, 68, 68, 0.15)', 'rgba(6, 8, 20, 0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.emergencyCard}
            >
              <View style={styles.emergencyIconWrap}>
                <Phone size={20} color={C.red} />
              </View>
              <View style={styles.emergencyInfo}>
                <Text style={styles.emergencyTitle}>National Emergency Helpline</Text>
                <Text style={styles.emergencySub}>For heavy floods, stranded vehicles or rescue requests</Text>
                <Text style={styles.emergencyNumbers}>NDRF desk: 011-23438091 • Toll Free: 1078</Text>
              </View>
            </LinearGradient>
          </>
        }
      />
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitleWrap: {
    marginLeft: 15,
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.orange,
    marginRight: 6,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.orange,
    letterSpacing: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 110, // leave space for bottom floating tabs dock
  },
  introCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 20,
  },
  introIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  introTextWrap: {
    flex: 1,
  },
  introTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    marginBottom: 4,
  },
  introDesc: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
  },
  filterTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    gap: 6,
  },
  filterTabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  filterTabCriticalActive: {
    backgroundColor: C.red,
    borderColor: C.red,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  filterTabTextActive: {
    color: C.white,
  },
  alertsList: {
    gap: 16,
  },
  alertCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardCategoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    fontSize: 10.5,
    color: C.textSec,
    fontWeight: '600',
    maxWidth: SCREEN_WIDTH * 0.45,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
    marginBottom: 8,
  },
  alertCardDesc: {
    fontSize: 13,
    color: C.textSec,
    lineHeight: 18,
    marginBottom: 16,
  },
  routeWrap: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    marginBottom: 18,
  },
  routeHeader: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  routeName: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  precautionsSection: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 14,
    marginBottom: 14,
  },
  precautionsHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  precautionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  checkCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  precautionText: {
    flex: 1,
    fontSize: 12,
    color: C.textSec,
    lineHeight: 16.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  cardTimeText: {
    fontSize: 10.5,
    color: C.textMuted,
    fontWeight: '600',
  },
  emergencyCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 26,
    alignItems: 'center',
  },
  emergencyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  emergencyInfo: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    marginBottom: 2,
  },
  emergencySub: {
    fontSize: 11,
    color: C.textSec,
    marginBottom: 6,
  },
  emergencyNumbers: {
    fontSize: 11,
    fontWeight: '700',
    color: C.red,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: C.textMuted,
  },
  alertImageContainer: {
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  alertImage: {
    width: '100%',
    height: '100%',
  },
});
