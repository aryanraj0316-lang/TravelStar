import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { formatDateRange } from '@/lib/datetime';
import { useApp, type MyTripBooking } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Badge, ScreenEmpty, ScreenError, ScreenLoading, type BadgeTone } from '@/components/ui';
import type { AlertCategory, AlertSeverity, TripRouteHazard } from '@/types/api';

import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Activity from 'lucide-react-native/icons/activity';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import Calendar from 'lucide-react-native/icons/calendar';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import Flame from 'lucide-react-native/icons/flame';
import HelpCircle from 'lucide-react-native/icons/circle-question-mark';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mountain from 'lucide-react-native/icons/mountain';
import Tornado from 'lucide-react-native/icons/tornado';
import Waves from 'lucide-react-native/icons/waves-horizontal';

// "All Clear" on the home screen only ever pointed at the generic monsoon
// advisory feed, never at a specific trip's own route. This screen is the
// real destination: pick one of the signed-in user's trips (GET
// /trips/mine), then see that trip's own hazard report (GET
// /map/trips/:tripId/hazards) — which is either a genuine "all clear", a
// list of real nearby hazards, or an honest "we couldn't resolve this
// trip's route" when none of its cities are in the geocoding table. That
// last case is never presented as "all clear" — it is a distinct unknown
// state.

const STATUS_LABEL_KEYS = {
  ONGOING: 'tripSafetyAnalysis.statusOngoing',
  UPCOMING: 'tripSafetyAnalysis.statusUpcoming',
  COMPLETED: 'tripSafetyAnalysis.statusCompleted',
} as const;

const STATUS_TONE: Record<MyTripBooking['status'], BadgeTone> = {
  ONGOING: 'success',
  UPCOMING: 'info',
  COMPLETED: 'neutral',
};

// Same severity convention as monsoon-advisory.tsx / notifications.tsx
// (CRITICAL/WARNING/ADVISORY -> danger/warning/info), reused via the shared
// Badge component's tones rather than re-deriving colours by hand.
const SEVERITY_LABEL_KEYS: Record<AlertSeverity, string> = {
  CRITICAL: 'notifications.severityCritical',
  WARNING: 'notifications.severityWarning',
  ADVISORY: 'notifications.severityAdvisory',
};
const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  ADVISORY: 'info',
};
const SEVERITY_ACCENT: Record<AlertSeverity, string> = {
  CRITICAL: C.redText,
  WARNING: C.amberText,
  ADVISORY: C.blueText,
};

// Same category icon/label set as monsoon-advisory.tsx / home-screen.tsx —
// AlertCategory is the same enum on both HazardAlert and TripRouteHazard.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  FLOOD_RAIN: 'monsoonAdvisory.categoryFloodRain',
  LANDSLIDE: 'monsoonAdvisory.categoryLandslide',
  CLOUDBURST: 'monsoonAdvisory.categoryCloudburst',
  TRAFFIC_RUSH: 'monsoonAdvisory.categoryTrafficRush',
  CYCLONE: 'monsoonAdvisory.categoryCyclone',
  EARTHQUAKE: 'monsoonAdvisory.categoryEarthquake',
  WILDFIRE: 'monsoonAdvisory.categoryWildfire',
};
const CATEGORY_ICON: Record<AlertCategory, typeof Mountain> = {
  LANDSLIDE: Mountain,
  FLOOD_RAIN: Waves,
  CLOUDBURST: CloudRain,
  TRAFFIC_RUSH: Car,
  CYCLONE: Tornado,
  EARTHQUAKE: Activity,
  WILDFIRE: Flame,
};

function StatusBadge({ status }: { status: MyTripBooking['status'] }) {
  const { t } = useTranslation();
  return <Badge label={t(STATUS_LABEL_KEYS[status])} tone={STATUS_TONE[status]} />;
}

// Each row is its own component so the React Compiler
// (app.json > experiments.reactCompiler) memoizes rows independently.
function TripRow({ trip, onPress }: { trip: MyTripBooking; onPress: (trip: MyTripBooking) => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.tripRow}
      onPress={() => onPress(trip)}
      accessibilityRole="button"
      accessibilityLabel={trip.name}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.tripRowTitle} numberOfLines={1}>
          {trip.name}
        </Text>
        <View style={styles.tripRowMetaRow}>
          <Calendar size={12} color={C.textMuted} />
          <Text style={styles.tripRowMetaText}>{formatDateRange(trip.startDate, trip.endDate)}</Text>
        </View>
      </View>
      <StatusBadge status={trip.status} />
      <ChevronRight size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

function HazardCard({ hazard }: { hazard: TripRouteHazard }) {
  const { t } = useTranslation();
  const accent = SEVERITY_ACCENT[hazard.severity];
  const CategoryIcon = CATEGORY_ICON[hazard.category] ?? AlertTriangle;

  return (
    <View style={[styles.hazardCard, { borderLeftColor: accent }]}>
      <View style={styles.hazardCardHeader}>
        <View style={styles.hazardCardHeaderLeft}>
          <CategoryIcon size={15} color={accent} />
          <Text style={styles.hazardCategoryLabel} numberOfLines={1}>
            {CATEGORY_LABEL_KEYS[hazard.category] ? t(CATEGORY_LABEL_KEYS[hazard.category]) : hazard.category}
          </Text>
        </View>
        <Badge label={t(SEVERITY_LABEL_KEYS[hazard.severity])} tone={SEVERITY_TONE[hazard.severity]} />
      </View>

      <Text style={styles.hazardTitle}>{hazard.title}</Text>

      <View style={styles.hazardMetaRow}>
        <MapPin size={12} color={C.textMuted} />
        <Text style={styles.hazardMetaText} numberOfLines={1}>
          {hazard.location}
        </Text>
        <Text style={styles.hazardMetaText}>
          · {t('tripSafetyAnalysis.distanceFromRoute', { km: hazard.distanceFromRouteKm.toLocaleString('en-IN') })}
        </Text>
      </View>

      <Text style={styles.hazardDesc}>{hazard.desc}</Text>

      {hazard.precautions.length > 0 && (
        <View style={styles.precautionsSection}>
          <Text style={styles.precautionsHeader}>{t('monsoonAdvisory.precautionsHeader')}</Text>
          {hazard.precautions.map((p, idx) => (
            <View key={idx} style={styles.precautionRow}>
              <View style={styles.precautionDot} />
              <Text style={styles.precautionText}>{p}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const tripKeyExtractor = (t: MyTripBooking) => t.id;
const hazardKeyExtractor = (h: TripRouteHazard) => h.id;

export default function TripSafetyAnalysisScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn } = useApp();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const {
    data: myTrips = [],
    isLoading: tripsLoading,
    isError: tripsError,
    error: tripsErrorObj,
    refetch: refetchTrips,
    isRefetching: tripsRefetching,
  } = useQuery({
    queryKey: queryKeys.myTrips(),
    queryFn: async () => (await apiService.getMyTrips()) ?? [],
    enabled: isLoggedIn,
  });

  const {
    data: report,
    isLoading: hazardsLoading,
    isError: hazardsError,
    error: hazardsErrorObj,
    refetch: refetchHazards,
  } = useQuery({
    queryKey: queryKeys.tripHazards(selectedTripId ?? ''),
    queryFn: () => apiService.getTripHazards(selectedTripId as string),
    enabled: isLoggedIn && !!selectedTripId,
  });

  const selectedTrip = myTrips.find((trip) => trip.id === selectedTripId) ?? null;

  const goBack = () => {
    if (selectedTripId) {
      setSelectedTripId(null);
      return;
    }
    router.canGoBack() ? router.back() : router.replace('/');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.topNavRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('tripSafetyAnalysis.goBack')}
        >
          <ArrowLeft size={18} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle} numberOfLines={1}>
          {selectedTrip ? selectedTrip.name : t('tripSafetyAnalysis.title')}
        </Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      {!isLoggedIn ? (
        <ScreenEmpty
          title={t('tripSafetyAnalysis.signInRequiredTitle')}
          message={t('tripSafetyAnalysis.signInRequiredMessage')}
          actionLabel={t('tripSafetyAnalysis.signIn')}
          onAction={() => router.push('/auth')}
        />
      ) : selectedTripId === null ? (
        tripsLoading ? (
          <ScreenLoading label={t('tripSafetyAnalysis.loadingTrips')} />
        ) : tripsError ? (
          <ScreenError
            message={tripsErrorObj instanceof Error ? tripsErrorObj.message : t('tripSafetyAnalysis.couldNotLoadTrips')}
            onRetry={() => refetchTrips()}
          />
        ) : myTrips.length === 0 ? (
          <ScreenEmpty title={t('tripSafetyAnalysis.noTripsTitle')} message={t('tripSafetyAnalysis.noTripsMessage')} />
        ) : (
          <FlatList
            data={myTrips}
            keyExtractor={tripKeyExtractor}
            renderItem={({ item }) => <TripRow trip={item} onPress={(trip) => setSelectedTripId(trip.id)} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={tripsRefetching} onRefresh={refetchTrips} tintColor={C.blue} />}
            ListHeaderComponent={<Text style={styles.listHeader}>{t('tripSafetyAnalysis.pickTripHint')}</Text>}
          />
        )
      ) : hazardsLoading ? (
        <ScreenLoading label={t('tripSafetyAnalysis.checkingRoute')} />
      ) : hazardsError || !report ? (
        <ScreenError
          message={hazardsErrorObj instanceof Error ? hazardsErrorObj.message : t('tripSafetyAnalysis.couldNotLoadReport')}
          onRetry={() => refetchHazards()}
        />
      ) : !report.routeResolved ? (
        <View style={styles.stateWrap}>
          <View style={[styles.stateIconCircle, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
            <HelpCircle size={22} color={C.textMuted} />
          </View>
          <Text style={styles.stateTitle}>{t('tripSafetyAnalysis.routeUnknownTitle')}</Text>
          <Text style={styles.stateMessage}>{t('tripSafetyAnalysis.routeUnknownMessage')}</Text>
        </View>
      ) : report.clear ? (
        <View style={styles.stateWrap}>
          <View style={[styles.stateIconCircle, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <Check size={22} color="#059669" strokeWidth={2.6} />
          </View>
          <Text style={styles.stateTitle}>{t('tripSafetyAnalysis.allClearTitle')}</Text>
          <Text style={styles.stateMessage}>
            {t('tripSafetyAnalysis.allClearMessage', { km: report.proximityThresholdKm })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={report.hazards}
          keyExtractor={hazardKeyExtractor}
          renderItem={({ item }) => <HazardCard hazard={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {t('tripSafetyAnalysis.hazardsFoundHeader', { count: report.hazards.length })}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
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
  topNavTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: C.text },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  listHeader: { fontSize: 12, fontWeight: '700', color: C.textSec, marginBottom: 12 },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  tripRowTitle: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 6 },
  tripRowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tripRowMetaText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  stateIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 4,
  },
  stateTitle: { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center' },
  stateMessage: { fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 19 },

  hazardCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  hazardCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hazardCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  hazardCategoryLabel: { fontSize: 11, fontWeight: '800', color: C.textSec, letterSpacing: 0.3 },
  hazardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  hazardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hazardMetaText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  hazardDesc: { fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  precautionsSection: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 2, gap: 6 },
  precautionsHeader: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 0.3 },
  precautionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  precautionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.green, marginTop: 6 },
  precautionText: { flex: 1, fontSize: 12.5, color: C.textSec, lineHeight: 17.5 },
});
