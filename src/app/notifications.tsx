import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Car,
  CheckCheck,
  ChevronRight,
  Clock,
  CloudRain,
  Compass,
  MapPin,
  Mountain,
  Navigation,
  Plane,
  ShieldAlert,
  Sparkles,
  Sun,
  Waves,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useApp } from '../store/AppContext';
import { logger } from '@/lib/logger';
import { toast, errorToastMessage } from '@/lib/feedback';
import { queryKeys } from '@/lib/query-keys';
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


const C = {
  bg: '#0A0C16',
  card: '#131627',
  cardAlt: '#1A1D33',
  border: '#232742',
  white: '#FFFFFF',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  indigo: '#6366F1',
  blue: '#3B82F6',
  cyan: '#06B6D4',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  star: '#FBBF24',
  purple: '#8B5CF6',
  pink: '#EC4899',
};

type TabType = 'ALL' | 'TRIPS' | 'SEASONAL' | 'HAZARDS';

// ─── Data Definitions ───────────────────────────────────────────────

const TRIP_NOTIFICATIONS = [
  {
    id: 't1',
    type: 'TRIP',
    status: 'UPCOMING',
    title: 'Ranchi → Vrindavan Express',
    route: 'Ranchi ➔ Vrindavan',
    date: 'Starts Today • 03:30 PM',
    passenger: 'Aarav Sharma (Seat 42B)',
    image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&q=80',
    initialSeconds: 8140, // 2h 15m 40s
    monsoonNotice: 'Monsoon weather advisory in effect for UP region',
  },
  {
    id: 't2',
    type: 'TRIP',
    status: 'ONGOING',
    title: 'Goa Coastal Getaway',
    route: 'Day 2 of 5 • North Goa',
    date: 'Jul 20 - Jul 25, 2026',
    passenger: 'Baga & Calangute Beach Circuit',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    initialSeconds: 0,
    monsoonNotice: 'High tide warning between 4 PM - 7 PM at Baga',
  },
  {
    id: 't3',
    type: 'TRIP',
    status: 'UPCOMING',
    title: 'Manali Mountain Expedition',
    route: 'Delhi ➔ Manali ➔ Solang',
    date: 'Starts Aug 1, 2026',
    passenger: 'Group of 4 Travelers',
    image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=800&q=80',
    initialSeconds: 984000,
    monsoonNotice: null,
  },
];

const SEASONAL_RECOMMENDATIONS = [
  {
    id: 's1',
    type: 'SEASONAL',
    tag: 'JULY BEST PICK',
    title: 'Valley of Flowers, Uttarakhand',
    season: 'Peak Monsoon Bloom (July - August)',
    temp: '20°C',
    weather: 'Mist & Alpine Flora',
    aqi: 'Pure AQI • 10',
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
    reason: 'Over 500 species of wild mountain flowers are in full bloom this week!',
  },
  {
    id: 's2',
    type: 'SEASONAL',
    tag: 'MONSOON HEAVEN',
    title: 'Munnar Tea Plantations, Kerala',
    season: 'Refreshing Rain Season',
    temp: '19°C',
    weather: 'Lush Greenery & Clouds',
    aqi: 'Pure AQI • 12',
    image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&q=80',
    reason: 'Experience mist-covered hills, waterfalls in full gush & fresh tea tasting.',
  },
  {
    id: 's3',
    type: 'SEASONAL',
    tag: 'DRY HIMALAYAN PASS',
    title: 'Pangong Tso & Leh-Ladakh',
    season: 'Ideal Road Trip Window',
    temp: '16°C',
    weather: 'Sunny & Chilly Breeze',
    aqi: 'Pure AQI • 8',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
    reason: 'Rain-shadow zone with crystal clear blue skies and open mountain passes.',
  },
];

// Real Alert data → display styling (REMEDIATION.md §8.10). Keyed by the
// Prisma enum member names the API actually returns (e.g. `FLOOD_RAIN`),
// not the `@map`-ped DB strings — matches monsoon-advisory.tsx's mapping,
// which reads from the same /alerts endpoint.
const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: C.red, bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)' },
  WARNING: { color: C.orange, bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)' },
  ADVISORY: { color: C.blue, bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)' },
};

const CATEGORY_ICON: Record<string, typeof Mountain> = {
  LANDSLIDE: Mountain,
  FLOOD_RAIN: Waves,
  CLOUDBURST: CloudRain,
  TRAFFIC_RUSH: Car,
};

// Each trip card owns its own countdown, ticking down from that specific
// trip's initialSeconds (REMEDIATION.md §8.10 — the old code had one
// `secondsLeft` state shared across every card in the list, so all trips
// displayed the exact same countdown regardless of when each actually
// departs).
function TripCountdownBadge({ initialSeconds }: { initialSeconds: number }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (initialSeconds <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [initialSeconds]);

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

  // Matches the previous behaviour exactly: a placeholder count of 5 until
  // real notifications have actually loaded, then the real unread count.
  const unreadCount = notifications.length > 0 ? notifications.filter((n: any) => n.unread).length : 5;

  const handleMarkAllRead = async () => {
    try {
      await apiService.markNotificationsRead();
      queryClient.setQueryData(queryKeys.notifications(), (prev: any[] = []) =>
        prev.map((n) => ({ ...n, unread: false }))
      );
      await refetchNotifications();
    } catch (e) {
      logger.warn('[Notifications] Mark-all-read failed:', e);
      toast(errorToastMessage(e, 'Could not mark notifications as read.'), 'error');
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

  const dbTrips = notifications.filter(n => n.type === 'TRIP');
  const mappedTrips = dbTrips.length > 0 ? dbTrips.map((t, i) => {
    const defaultMocks = [
      {
        status: 'UPCOMING',
        route: 'Ranchi ➔ Vrindavan',
        date: 'Starts Today • 03:30 PM',
        passenger: 'Aarav Sharma (Seat 42B)',
        image: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=800&q=80',
        initialSeconds: 8140,
        monsoonNotice: 'Monsoon weather advisory in effect for UP region',
      }
    ];
    const mock = defaultMocks[i % defaultMocks.length];
    return {
      id: t.id,
      title: t.title,
      status: mock.status,
      route: mock.route,
      date: mock.date,
      passenger: mock.passenger,
      image: mock.image,
      initialSeconds: mock.initialSeconds,
      monsoonNotice: mock.monsoonNotice,
    };
  }) : TRIP_NOTIFICATIONS;

  const dbSeasonal = notifications.filter(n => n.type === 'SEASONAL');
  const mappedSeasonal = dbSeasonal.length > 0 ? dbSeasonal.map((s, i) => {
    const defaultMocks = [
      {
        tag: 'JULY BEST PICK',
        season: 'Peak Monsoon Bloom (July - August)',
        temp: '20°C',
        weather: 'Mist & Alpine Flora',
        aqi: 'Pure AQI • 10',
        image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
      },
      {
        tag: 'MONSOON HEAVEN',
        season: 'Refreshing Rain Season',
        temp: '19°C',
        weather: 'Lush Greenery & Clouds',
        aqi: 'Pure AQI • 12',
        image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&q=80',
      }
    ];
    const mock = defaultMocks[i % defaultMocks.length];
    return {
      id: s.id,
      tag: mock.tag,
      title: s.title,
      season: mock.season,
      temp: mock.temp,
      weather: mock.weather,
      aqi: mock.aqi,
      image: mock.image,
      reason: s.content,
    };
  }) : SEASONAL_RECOMMENDATIONS;

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
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Notifications & Alerts</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} NEW</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.markReadBtn}
          activeOpacity={0.8}
          onPress={handleMarkAllRead}
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
              { key: 'ALL', label: 'All Feed' },
              { key: 'TRIPS', label: 'Trips & Passes' },
              { key: 'SEASONAL', label: 'Weather Picks' },
              { key: 'HAZARDS', label: 'Disaster Alerts 🚨' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.8}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
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
                <Text style={styles.sectionHeaderTitle}>Group Chat Invitations</Text>
              </View>
            </View>

            {notifications.filter(n => n.category === 'JOIN_ACCEPTED' || n.category === 'CHAT_ADDED').map((notif: any) => (
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
                  if (notif.chatRoomId) {
                    setActiveRoomId(notif.chatRoomId);
                    // Navigating to a tab route that's already an ancestor
                    // in the stack (the (tabs) group always is) pops back to
                    // it rather than pushing a duplicate — this both closes
                    // the notifications screen and focuses the chat tab.
                    router.navigate('/chat');
                  }
                }}
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
                        <Text style={styles.severityText}>NEW</Text>
                      </View>
                    )}
                    <Text style={styles.hazardTime}>{notif.time}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: C.blue, fontWeight: '700' }}>Tap to open group chat</Text>
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
                <Text style={styles.sectionHeaderTitle}>Live Hazard & Disaster Alerts</Text>
              </View>
              <View style={styles.liveNewsChip}>
                <View style={styles.liveNewsDot} />
                <Text style={styles.liveNewsText}>NEWS WIRE</Text>
              </View>
            </View>

            {mappedHazards.length === 0 && (
              <Text style={{ fontSize: 12, color: C.textMuted }}>No active hazard alerts right now.</Text>
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
                        <Text style={styles.severityText}>{alert.severity}</Text>
                      </View>
                      <Text style={styles.hazardTime}>{alert.time}</Text>
                    </View>
                  </View>

                  <Text style={styles.hazardDesc}>{alert.desc}</Text>

                  <View style={styles.hazardFooter}>
                    <View style={styles.affectedRouteRow}>
                      <Navigation size={12} color={C.textSec} />
                      <Text style={styles.affectedRouteText}>Affected: {alert.affectedRoute}</Text>
                    </View>
                    <TouchableOpacity style={styles.altRouteBtn} activeOpacity={0.8}>
                      <Text style={styles.altRouteBtnText}>Detour Route</Text>
                      <ChevronRight size={12} color={alert.iconColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── ONGOING & UPCOMING TRIPS ── */}
        {(activeTab === 'ALL' || activeTab === 'TRIPS') && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <Plane size={18} color={C.blue} />
                <Text style={styles.sectionHeaderTitle}>My Active & Upcoming Trips</Text>
              </View>
            </View>

            {mappedTrips.map((trip: any) => (
              <TouchableOpacity key={trip.id} style={styles.fullCardWrap} activeOpacity={0.9}>
                {/* Full Tourist Location Background Image */}
                <Image source={{ uri: trip.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
                    <Text style={styles.statusBadgeText}>{trip.status}</Text>
                  </View>
                  <TripCountdownBadge initialSeconds={trip.initialSeconds} />
                </View>

                {/* Main Card Content */}
                <View style={styles.tripCardBody}>
                  <Text style={styles.fullTripTitle}>{trip.title}</Text>
                  <Text style={styles.fullTripRoute}>{trip.route}</Text>

                  <View style={styles.tripInfoRow}>
                    <View style={styles.tripInfoItem}>
                      <Calendar size={13} color={C.cyan} />
                      <Text style={styles.tripInfoText}>{trip.date}</Text>
                    </View>
                    <View style={styles.tripInfoItem}>
                      <MapPin size={13} color={C.green} />
                      <Text style={styles.tripInfoText}>{trip.passenger}</Text>
                    </View>
                  </View>

                  {trip.monsoonNotice && (
                    <View style={styles.monsoonAdvisoryWrap}>
                      <CloudRain size={13} color={C.orange} />
                      <Text style={styles.monsoonAdvisoryText}>{trip.monsoonNotice}</Text>
                    </View>
                  )}

                  <TouchableOpacity style={styles.trackItineraryBtn} activeOpacity={0.85}>
                    <Text style={styles.trackItineraryText}>View Boarding Pass & Route</Text>
                    <ChevronRight size={14} color={C.white} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── SEASONAL & WEATHER TRAVEL RECOMMENDATIONS ── */}
        {(activeTab === 'ALL' || activeTab === 'SEASONAL') && (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <Sparkles size={18} color={C.purple} />
                <Text style={styles.sectionHeaderTitle}>Weather & Seasonal Picks</Text>
              </View>
              <Text style={styles.monthBadge}>JULY RECS</Text>
            </View>

            {mappedSeasonal.map((item: any) => (
              <View key={item.id} style={styles.fullSeasonalCardWrap}>
                {/* Full Tourist Destination Background Image */}
                <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(10,12,22,0.45)', 'rgba(10,12,22,0.85)', 'rgba(10,12,22,0.96)']}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />

                {/* Top Seasonal Tag Pill */}
                <View style={styles.seasonalTagPill}>
                  <Text style={styles.seasonalTagPillText}>{item.tag}</Text>
                </View>

                {/* Card Body */}
                <View style={styles.seasonalBody}>
                  <Text style={styles.seasonalTitle}>{item.title}</Text>
                  <Text style={styles.seasonalSub}>{item.season}</Text>

                  <View style={styles.weatherMetricsRow}>
                    <View style={styles.metricItem}>
                      <Sun size={14} color={C.orange} />
                      <Text style={styles.metricText}>{item.temp}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <CloudRain size={14} color={C.cyan} />
                      <Text style={styles.metricText}>{item.weather}</Text>
                    </View>
                    <View style={styles.aqiChipSmall}>
                      <Text style={styles.aqiChipSmallText}>{item.aqi}</Text>
                    </View>
                  </View>

                  <Text style={styles.seasonalReason}>{item.reason}</Text>

                  <TouchableOpacity
                    style={styles.exploreDestBtn}
                    activeOpacity={0.85}
                    onPress={() => router.navigate('/search')}
                  >
                    <Compass size={14} color={C.blue} />
                    <Text style={styles.exploreDestBtnText}>Explore Itinerary & Booking</Text>
                    <ChevronRight size={14} color={C.blue} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                </View>
              </View>
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 8.5,
    fontWeight: '900',
    color: C.white,
  },
  markReadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 8,
    fontWeight: '900',
    color: C.red,
    letterSpacing: 0.5,
  },
  monthBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: C.purple,
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
    fontSize: 10.5,
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
    fontSize: 8,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },
  hazardTime: {
    fontSize: 9.5,
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
    fontSize: 10.5,
    color: C.textSec,
    fontWeight: '500',
  },
  altRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  altRouteBtnText: {
    fontSize: 11,
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
    fontSize: 9,
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
    fontSize: 10,
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
  monsoonAdvisoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginTop: 2,
  },
  monsoonAdvisoryText: {
    fontSize: 11,
    color: C.orange,
    fontWeight: '600',
  },
  tripActionRow: {
    marginTop: 4,
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

  // ── Seasonal Cards ──────────────────────────────────
  fullSeasonalCardWrap: {
    minHeight: 240,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    padding: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 6,
  },
  seasonalTagPill: {
    alignSelf: 'flex-start',
    backgroundColor: C.purple,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 24,
  },
  seasonalTagPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.5,
  },
  seasonalBody: {
    gap: 8,
  },
  seasonalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.3,
  },
  seasonalSub: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  seasonalContent: {
    padding: 14,
    gap: 10,
  },
  weatherMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.white,
  },
  aqiChipSmall: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginLeft: 'auto',
  },
  aqiChipSmallText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.green,
  },
  seasonalReason: {
    fontSize: 11.5,
    color: C.textSec,
    lineHeight: 16,
  },
  exploreDestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  exploreDestBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blue,
  },
});
