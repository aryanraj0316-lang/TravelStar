import { apiService } from '@/services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import Clock from 'lucide-react-native/icons/clock';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mountain from 'lucide-react-native/icons/mountain';
import Phone from 'lucide-react-native/icons/phone';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Waves from 'lucide-react-native/icons/waves-horizontal';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card, ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';

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

// Human-readable label keys for the AlertCategory enum values the API
// returns (e.g. "FLOOD_RAIN") — see backend/prisma/schema.prisma.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  FLOOD_RAIN: 'monsoonAdvisory.categoryFloodRain',
  LANDSLIDE: 'monsoonAdvisory.categoryLandslide',
  CLOUDBURST: 'monsoonAdvisory.categoryCloudburst',
  TRAFFIC_RUSH: 'monsoonAdvisory.categoryTrafficRush',
};

// Reuses notifications.tsx's severity keys — same Alert model, same enum.
const SEVERITY_LABEL_KEYS: Record<string, string> = {
  CRITICAL: 'notifications.severityCritical',
  WARNING: 'notifications.severityWarning',
  ADVISORY: 'notifications.severityAdvisory',
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
  const { t } = useTranslation();
  const sev = getSeverityStyle(alert.severity);
  const severityLabelKey = SEVERITY_LABEL_KEYS[alert.severity] ?? 'notifications.severityAdvisory';

  return (
    <Card style={styles.alertCard}>
      {/* Card Header Info */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardCategoryWrap}>
          <View style={[styles.iconBox, { backgroundColor: sev.bg }]}>{getAlertIcon(alert.category)}</View>
          <View>
            <Text style={styles.categoryLabel}>
              {CATEGORY_LABEL_KEYS[alert.category] ? t(CATEGORY_LABEL_KEYS[alert.category]) : alert.category}
            </Text>
            <View style={styles.locationRow}>
              <MapPin size={10} color={C.textSec} />
              <Text style={styles.locationText} numberOfLines={1}>
                {alert.location}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[styles.severityBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}
          accessibilityRole="text"
          accessibilityLabel={t(severityLabelKey)}
        >
          <Text style={[styles.severityBadgeText, { color: sev.text }]}>{t(severityLabelKey)}</Text>
        </View>
      </View>

      {/* disaster image */}
      <View style={styles.alertImageContainer}>
        <Image source={{ uri: alert.image }} style={styles.alertImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      </View>

      {/* Main Title & Description */}
      <Text style={styles.alertCardTitle}>{alert.title}</Text>
      <Text style={styles.alertCardDesc}>{alert.desc}</Text>

      {/* Highlighted Affected Route */}
      <View style={styles.routeWrap}>
        <Text style={styles.routeHeader}>{t('monsoonAdvisory.affectedRouteHeader')}</Text>
        <Text style={styles.routeName}>{alert.affectedRoute}</Text>
      </View>

      {/* Precautions Guidelines List */}
      <View style={styles.precautionsSection}>
        <Text style={styles.precautionsHeader}>{t('monsoonAdvisory.precautionsHeader')}</Text>
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
        <Text style={styles.cardTimeText}>{t('monsoonAdvisory.issuedTime', { time: alert.time })}</Text>
      </View>
    </Card>
  );
}

const keyExtractor = (a: HazardAlert) => a.id;

export default function MonsoonAdvisoryScreen() {
  const { t } = useTranslation();
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
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('monsoonAdvisory.goBack')}
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{t('monsoonAdvisory.headerTitle')}</Text>
          <View style={styles.liveBadge}>
            <View style={styles.livePulseDot} />
            <Text style={styles.liveBadgeText}>{t('monsoonAdvisory.liveUpdates')}</Text>
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
                <Text style={styles.introTitle}>{t('monsoonAdvisory.introTitle')}</Text>
                <Text style={styles.introDesc}>{t('monsoonAdvisory.introDesc')}</Text>
              </View>
            </LinearGradient>

            {/* ─── Filter Tabs ─────────────────────────────────────────────────── */}
            <View style={styles.filterTabs}>
              {(
                [
                  { key: 'ALL', labelKey: 'monsoonAdvisory.tabAll' },
                  { key: 'CRITICAL', labelKey: 'monsoonAdvisory.tabCritical' },
                  { key: 'WARNING', labelKey: 'monsoonAdvisory.tabWarning' },
                  { key: 'ADVISORY', labelKey: 'monsoonAdvisory.tabAdvisory' },
                ] as const
              ).map((tab) => {
                const isActive = filter === tab.key;
                const count =
                  tab.key === 'ALL' ? (alerts ?? []).length : (alerts ?? []).filter((a) => a.severity === tab.key).length;
                const label = t('monsoonAdvisory.filterTabWithCount', { label: t(tab.labelKey), count });

                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.8}
                    onPress={() => setFilter(tab.key)}
                    style={[
                      styles.filterTabItem,
                      isActive && styles.filterTabItemActive,
                      isActive && tab.key === 'CRITICAL' && styles.filterTabCriticalActive,
                    ]}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        isActive && styles.filterTabTextActive,
                        tab.key === 'CRITICAL' && { color: C.red },
                        tab.key === 'WARNING' && { color: C.orange },
                        tab.key === 'ADVISORY' && { color: C.blue },
                        isActive && { color: C.white },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        }
        ListEmptyComponent={
          alerts === null && !loadError ? (
            <ScreenLoading label={t('monsoonAdvisory.loadingHazardAlerts')} />
          ) : loadError ? (
            <ScreenError message={t('monsoonAdvisory.couldNotLoadHazardAlerts')} onRetry={loadAlerts} />
          ) : (
            <ScreenEmpty
              title={t('monsoonAdvisory.noActiveAlertsTitle')}
              message={t('monsoonAdvisory.noActiveAlertsMessage')}
            />
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
                <Text style={styles.emergencyTitle}>{t('monsoonAdvisory.emergencyHelplineTitle')}</Text>
                <Text style={styles.emergencySub}>{t('monsoonAdvisory.emergencyHelplineSub')}</Text>
                <Text style={styles.emergencyNumbers}>{t('monsoonAdvisory.emergencyHelplineNumbers')}</Text>
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
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
    fontSize: 12,
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
    fontSize: 12,
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
    minHeight: MIN_TOUCH_TARGET,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    color: C.textSec,
    marginBottom: 6,
  },
  emergencyNumbers: {
    fontSize: 12,
    fontWeight: '700',
    color: C.red,
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
