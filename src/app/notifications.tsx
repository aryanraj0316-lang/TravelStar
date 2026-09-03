import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Calendar from 'lucide-react-native/icons/calendar';
import Car from 'lucide-react-native/icons/car';
import CheckCheck from 'lucide-react-native/icons/check-check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mountain from 'lucide-react-native/icons/mountain';
import Navigation from 'lucide-react-native/icons/navigation';
import Plane from 'lucide-react-native/icons/plane';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Waves from 'lucide-react-native/icons/waves-horizontal';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { AppNotification } from '@/types/api';
import { useApp } from '../store/AppContext';
import { logger } from '@/lib/logger';
import { syncBadgeCount } from '@/lib/push';
import { toast, errorToastMessage } from '@/lib/feedback';
import { queryKeys } from '@/lib/query-keys';
import { formatDateRange } from '@/lib/datetime';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';



type TabType = 'ALL' | 'TRIPS' | 'HAZARDS';

// ─── Data Definitions ───────────────────────────────────────────────
//
// This screen used to render a "My Active & Upcoming Trips" section and a
// "Weather & Seasonal Picks" section that were both fabricated, in two
// different ways:
//
// - The trips section read real Notification rows (type: 'TRIP', which the
//   backend only ever creates for JOIN_ACCEPTED/CHAT_ADDED — the exact same
//   rows the "Group Chat Invitations" section above already renders
//   honestly) and grafted a hardcoded route/passenger/cover-image/countdown
//   onto each one BY ARRAY INDEX. A join-acceptance notification for any
//   real trip displayed a fake "Ranchi ➔ Vrindavan" route, a fake seat
//   assignment, and a fake monsoon notice — exactly the "grafted mock data
//   onto a real row" bug this file's own comment on mappedHazards already
//   describes as dangerous, just not yet applied to this section too. If
//   there were zero such notifications, it fell back to a fully invented
//   TRIP_NOTIFICATIONS array shown as if real, for every user.
// - The seasonal section had no backing feature at all: nothing in
//   backend/prisma/schema.prisma's NotificationType enum's SEASONAL case is
//   ever created anywhere in backend/src, so `dbSeasonal` was always empty
//   and every user saw the same three fully-fabricated
//   SEASONAL_RECOMMENDATIONS cards, permanently, with no path to real data
//   ever landing there.
//
// Fixed: "My Active & Upcoming Trips" now sources GET /trips/mine (the same
// real endpoint bookings.tsx uses) instead of Notification rows, so it
// shows an honest status, route, meeting point, and cover image, and a
// real countdown computed from the trip's actual `startDate` instead of a
// fabricated initialSeconds. The seasonal section is removed outright — a
// real "recommended for this month" feature does not exist yet, and per
// this project's own convention (see docs/REMEDIATION.md's "remove it"
// guidance, applied identically to map.tsx's fabricated turn-by-turn guide
// in §8.8), an unbuildable feature is removed rather than faked.

// Real Alert data → display styling (REMEDIATION.md §8.10). Keyed by the
// Prisma enum member names the API actually returns (e.g. `FLOOD_RAIN`),
// not the `@map`-ped DB strings — matches monsoon-advisory.tsx's mapping,
// which reads from the same /alerts endpoint.
const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: C.red, bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)' },
  WARNING: { color: C.orange, bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)' },
  ADVISORY: { color: C.blue, bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)' },
};

const SEVERITY_LABEL_KEYS: Record<string, string> = {
  CRITICAL: 'notifications.severityCritical',
  WARNING: 'notifications.severityWarning',
  ADVISORY: 'notifications.severityAdvisory',
};

const TRIP_STATUS_LABEL_KEYS: Record<string, string> = {
  ONGOING: 'bookings.statusOngoing',
  UPCOMING: 'bookings.statusUpcoming',
};

const CATEGORY_ICON: Record<string, typeof Mountain> = {
  LANDSLIDE: Mountain,
  FLOOD_RAIN: Waves,
  CLOUDBURST: CloudRain,
  TRAFFIC_RUSH: Car,
};

// Each trip card owns its own countdown, ticking down to that specific
// trip's real `startDate` (REMEDIATION.md §8.10 — the old code had one
// `secondsLeft` state shared across every card in the list, so all trips
// displayed the exact same countdown regardless of when each actually
// departs — and counted down from a fabricated number rather than the
// trip's real start time).
function TripCountdownBadge({ targetDate }: { targetDate: string }) {
  const targetMs = new Date(targetDate).getTime();
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((targetMs - Date.now()) / 1000)));

  useEffect(() => {
    if (Number.isNaN(targetMs) || targetMs <= Date.now()) return;
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((targetMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetMs]);

  if (secondsLeft <= 0) return null;

  const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.timerBadge}>
      <Clock size={11} color={C.orange} />
      <Text style={styles.timerBadgeText}>{`${hours}h ${minutes}m ${seconds}s`}</Text>
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveRoomId, checkUnreadNotifications } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('ALL');

  // REMEDIATION.md §6.3: fetching now goes through TanStack Query for
  // caching/retry/offline-cache benefits.
  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: async () => (await apiService.getNotifications()) ?? [],
  });

  // Hazard alerts come from the real Alert API, not the generic
  // notification feed (REMEDIATION.md §8.10). The old code sourced
  // HAZARD-type rows from the Notification model — which has no
  // location/category/affectedRoute fields at all — and grafted those
  // fields on from a hardcoded mock array BY ARRAY INDEX, so a real
  // landslide alert could render with Kerala's location, Manali's
  // affected route, and a snowfall icon. On a screen whose only purpose
  // is telling travellers which road is unsafe, that's dangerous. The
  // Alert model already has every field this UI needs — no grafting
  // required — and mappedHazards below renders only real data, or none.
  const { data: realAlerts = [] } = useQuery({
    queryKey: queryKeys.alerts(),
    queryFn: async () => (await apiService.getAlerts()) ?? [],
  });

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllRead = async () => {
    try {
      await apiService.markNotificationsRead();
      queryClient.setQueryData(queryKeys.notifications(), (prev: AppNotification[] = []) =>
        prev.map((n) => ({ ...n, unread: false }))
      );
      await refetchNotifications();
      // Keep the app-icon badge honest (docs/REMEDIATION.md §8.18) — it
      // otherwise only resyncs on the next foreground.
      await syncBadgeCount();
    } catch (e) {
      logger.warn('[Notifications] Mark-all-read failed:', e);
      toast(errorToastMessage(e, t('notifications.couldNotMarkRead')), 'error');
    }
  };

  const mappedHazards = realAlerts.map((a) => {
    const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.ADVISORY;
    const Icon = CATEGORY_ICON[a.category] || ShieldAlert;
    return {
      id: a.id,
      severity: a.severity,
      category: a.category,
      location: a.location,
      title: a.title,
      icon: Icon,
      iconColor: sev.color,
      bgColor: sev.bg,
      borderColor: sev.border,
      affectedRoute: a.affectedRoute,
      desc: a.desc,
      time: a.time,
    };
  });

  // "My Active & Upcoming Trips" — real trips the caller organizes or has
  // joined, the same endpoint and status derivation bookings.tsx uses.
  const { data: myTrips = [] } = useQuery({
    queryKey: queryKeys.myTrips(),
    queryFn: async () => (await apiService.getMyTrips()) ?? [],
  });
  const activeTrips = myTrips.filter((t) => t.status === 'ONGOING' || t.status === 'UPCOMING');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ════════════════════════════════════════════════
          1. TOP NAVIGATION HEADER
          ════════════════════════════════════════════════ */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.goBack')}
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{t('notifications.unreadCount', { count: unreadCount })}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.markReadBtn}
          activeOpacity={0.8}
          onPress={handleMarkAllRead}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.markAllRead')}
        >
          <CheckCheck size={18} color={unreadCount > 0 ? C.blue : C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ════════════════════════════════════════════════
          2. FILTER TABS
          ════════════════════════════════════════════════ */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {(
            [
              { key: 'ALL', labelKey: 'notifications.tabAllFeed' },
              { key: 'TRIPS', labelKey: 'notifications.tabTripsPasses' },
              { key: 'HAZARDS', labelKey: 'notifications.tabDisasterAlerts' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.8}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                accessibilityRole="tab"
                accessibilityLabel={t(tab.labelKey)}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {t(tab.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ════════════════════════════════════════════════
          3. MAIN NOTIFICATIONS FEED
          ════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedScrollContent}
      >
        {/* ── JOIN REQUEST ACCEPTANCES ── */}
        {(activeTab === 'ALL' || activeTab === 'TRIPS') && notifications.some(n => n.category === 'JOIN_ACCEPTED' || n.category === 'CHAT_ADDED') && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <CheckCheck size={18} color={C.green} />
                <Text style={styles.sectionHeaderTitle}>{t('notifications.groupChatInvitations')}</Text>
              </View>
            </View>

            {notifications.filter(n => n.category === 'JOIN_ACCEPTED' || n.category === 'CHAT_ADDED').map((notif) => (
              <TouchableOpacity
                key={notif.id}
                style={[
                  styles.hazardCard,
                  {
                    backgroundColor: notif.unread ? 'rgba(16, 185, 129, 0.08)' : C.card,
                    borderColor: notif.unread ? 'rgba(16, 185, 129, 0.3)' : C.border,
                  }
                ]}
                activeOpacity={0.85}
                onPress={async () => {
                  try {
                    await apiService.markNotificationRead(notif.id);
                  } catch (e) {
                    logger.warn('[Notifications] Mark-read failed:', e);
                  }
                  await refetchNotifications();
                  checkUnreadNotifications();
                  void syncBadgeCount();
                  if (notif.chatRoomId) {
                    setActiveRoomId(notif.chatRoomId);
                    // Navigating to a tab route that's already an ancestor
                    // in the stack (the (tabs) group always is) pops back to
                    // it rather than pushing a duplicate — this both closes
                    // the notifications screen and focuses the chat tab.
                    router.navigate('/chat');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={notif.title}
                accessibilityHint={t('notifications.tapToOpenGroupChat')}
              >
                <View style={styles.hazardHeader}>
                  <View style={styles.hazardCategoryGroup}>
                    <View style={[styles.hazardIconWrap, { backgroundColor: C.green }]}>
                      <CheckCheck size={14} color={C.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hazardTitle}>{notif.title}</Text>
                      <Text style={styles.hazardLocation} numberOfLines={2}>{notif.content}</Text>
                    </View>
                  </View>
                  <View style={styles.hazardMetaRight}>
                    {notif.unread && (
                      <View style={[styles.severityPill, { backgroundColor: C.green }]}>
                        <Text style={styles.severityText}>{t('notifications.new')}</Text>
                      </View>
                    )}
                    <Text style={styles.hazardTime}>{notif.time}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: C.blue, fontWeight: '700' }}>{t('notifications.tapToOpenGroupChat')}</Text>
                  <ChevronRight size={12} color={C.blue} style={{ marginLeft: 2 }} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── REAL-TIME HAZARD & DISASTER NEWS ALERTS ── */}
        {(activeTab === 'ALL' || activeTab === 'HAZARDS') && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <ShieldAlert size={18} color={C.red} />
                <Text style={styles.sectionHeaderTitle}>{t('notifications.liveHazardAlerts')}</Text>
              </View>
              <View style={styles.liveNewsChip}>
                <View style={styles.liveNewsDot} />
                <Text style={styles.liveNewsText}>{t('notifications.newsWire')}</Text>
              </View>
            </View>

            {mappedHazards.length === 0 && (
              <Text style={{ fontSize: 12, color: C.textMuted }}>{t('notifications.noActiveHazards')}</Text>
            )}

            {mappedHazards.map((alert) => {
              const IconComponent = alert.icon;
              return (
                <View
                  key={alert.id}
                  style={[
                    styles.hazardCard,
                    { backgroundColor: alert.bgColor, borderColor: alert.borderColor },
                  ]}
                >
                  <View style={styles.hazardHeader}>
                    <View style={styles.hazardCategoryGroup}>
                      <View style={[styles.hazardIconWrap, { backgroundColor: alert.borderColor }]}>
                        <IconComponent size={14} color={C.white} />
                      </View>
                      <View>
                        <Text style={styles.hazardTitle}>{alert.title}</Text>
                        <Text style={styles.hazardLocation}>{alert.location}</Text>
                      </View>
                    </View>
                    <View style={styles.hazardMetaRight}>
                      <View style={[styles.severityPill, { backgroundColor: alert.iconColor }]}>
                        <Text style={styles.severityText}>
                          {t(SEVERITY_LABEL_KEYS[alert.severity] ?? 'notifications.severityAdvisory')}
                        </Text>
                      </View>
                      <Text style={styles.hazardTime}>{alert.time}</Text>
                    </View>
                  </View>

                  <Text style={styles.hazardDesc}>{alert.desc}</Text>

                  <View style={styles.hazardFooter}>
                    <View style={styles.affectedRouteRow}>
                      <Navigation size={12} color={C.textSec} />
                      <Text style={styles.affectedRouteText}>
                        {t('notifications.affected', { route: alert.affectedRoute })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.altRouteBtn}
                      activeOpacity={0.8}
                      hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('notifications.detourRoute')}
                    >
                      <Text style={styles.altRouteBtnText}>{t('notifications.detourRoute')}</Text>
                      <ChevronRight size={12} color={alert.iconColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── ONGOING & UPCOMING TRIPS ── */}
        {(activeTab === 'ALL' || activeTab === 'TRIPS') && activeTrips.length > 0 && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <Plane size={18} color={C.blue} />
                <Text style={styles.sectionHeaderTitle}>{t('notifications.myActiveTrips')}</Text>
              </View>
            </View>

            {activeTrips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.fullCardWrap}
                activeOpacity={0.9}
                onPress={() => {
                  if (trip.status === 'ONGOING') {
                    router.navigate('/map');
                  } else if (trip.chatRoomId) {
                    setActiveRoomId(trip.chatRoomId);
                    router.navigate('/chat');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={trip.name}
                accessibilityHint={
                  trip.status === 'ONGOING'
                    ? t('notifications.trackLiveTrip')
                    : trip.chatRoomId
                      ? t('notifications.openTripChat')
                      : t('notifications.viewTrip')
                }
              >
                {/* Full Tourist Location Background Image */}
                <Image source={{ uri: trip.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(10,12,22,0.45)', 'rgba(10,12,22,0.85)', 'rgba(10,12,22,0.96)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />

                {/* Top Header Row: Status Badge + Countdown Timer */}
                <View style={styles.tripCardHeader}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          trip.status === 'ONGOING'
                            ? 'rgba(16, 185, 129, 0.9)'
                            : 'rgba(59, 130, 246, 0.9)',
                      },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {t(TRIP_STATUS_LABEL_KEYS[trip.status] ?? 'bookings.statusUpcoming')}
                    </Text>
                  </View>
                  {trip.status === 'UPCOMING' && <TripCountdownBadge targetDate={trip.startDate} />}
                </View>

                {/* Main Card Content */}
                <View style={styles.tripCardBody}>
                  <Text style={styles.fullTripTitle}>{trip.name}</Text>
                  <Text style={styles.fullTripRoute}>{trip.cities.join(' → ')}</Text>

                  <View style={styles.tripInfoRow}>
                    <View style={styles.tripInfoItem}>
                      <Calendar size={13} color={C.cyan} />
                      <Text style={styles.tripInfoText}>
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </Text>
                    </View>
                    <View style={styles.tripInfoItem}>
                      <MapPin size={13} color={C.green} />
                      <Text style={styles.tripInfoText} numberOfLines={1}>
                        {trip.meetingPoint}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.trackItineraryBtn}>
                    <Text style={styles.trackItineraryText}>
                      {trip.status === 'ONGOING'
                        ? t('notifications.trackLiveTrip')
                        : trip.chatRoomId
                          ? t('notifications.openTripChat')
                          : t('notifications.viewTrip')}
                    </Text>
                    <ChevronRight size={14} color={C.white} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Bottom Clearance */}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header Bar ──────────────────────────────────────
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.border,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.3,
  },
  unreadBadge: {
    backgroundColor: C.blue,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
  },
  markReadBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Tabs ────────────────────────────────────────────
  tabsWrap: {
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSec,
  },
  tabTextActive: {
    color: C.white,
  },

  // ── Feed Scroll Content ─────────────────────────────
  feedScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 24,
  },
  sectionBlock: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  liveNewsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  liveNewsDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.red,
  },
  liveNewsText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.red,
    letterSpacing: 0.5,
  },

  // ── Hazard & Disaster Cards ─────────────────────────
  hazardCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  hazardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hazardCategoryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  hazardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
  },
  hazardLocation: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 1,
  },
  hazardMetaRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },
  hazardTime: {
    fontSize: 12,
    color: C.textMuted,
  },
  hazardDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
  },
  hazardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  affectedRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  affectedRouteText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '500',
  },
  altRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  altRouteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // ── Trip Cards ──────────────────────────────────────
  fullCardWrap: {
    minHeight: 230,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 4,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.5,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,12,22,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  timerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.orange,
  },
  tripCardBody: {
    gap: 8,
  },
  fullTripTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.3,
  },
  fullTripRoute: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  tripInfoRow: {
    gap: 6,
    marginVertical: 4,
  },
  tripInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripInfoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  trackItineraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.blue,
    paddingVertical: 10,
    borderRadius: 12,
  },
  trackItineraryText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
});
