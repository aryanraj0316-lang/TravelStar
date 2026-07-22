import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  Car,
  CheckCheck,
  ChevronRight,
  Clock,
  CloudRain,
  CloudSnow,
  Compass,
  MapPin,
  Mountain,
  Navigation,
  Plane,
  Share2,
  ShieldAlert,
  Sparkles,
  Sun,
  Waves,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const HAZARD_DISASTER_ALERTS = [
  {
    id: 'h1',
    type: 'HAZARD',
    severity: 'CRITICAL',
    title: 'Landslide Warning — NH-44 Zoji La Pass',
    category: 'LANDSLIDE',
    location: 'Ladakh - Srinagar Highway',
    time: '14 mins ago',
    icon: Mountain,
    iconColor: C.red,
    bgColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    desc: 'Heavy rockfall near Zoji La Pass has blocked NH-44. Traffic temporarily suspended. Alternative route via Kargil-Zanskar advised.',
    affectedRoute: 'Srinagar ➔ Leh Route',
  },
  {
    id: 'h2',
    type: 'HAZARD',
    severity: 'CRITICAL',
    title: 'Heavy Rainfall & Flood Flash Warning',
    category: 'FLOOD & RAIN',
    location: 'Wayanad & Idukki Districts, Kerala',
    time: '42 mins ago',
    icon: Waves,
    iconColor: C.red,
    bgColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    desc: 'Red Alert issued. River water levels rising near Periyar. Tourist boat rides suspended for 48 hours.',
    affectedRoute: 'Kochi ➔ Munnar Road',
  },
  {
    id: 'h3',
    type: 'HAZARD',
    severity: 'WARNING',
    title: 'Early Snowfall Road Closure',
    category: 'SNOWFALL',
    location: 'Rohtang Pass, Himachal Pradesh',
    time: '2 hours ago',
    icon: CloudSnow,
    iconColor: C.orange,
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    desc: 'Unseasonal snow has made road slippery. Only 4x4 vehicles with tire chains permitted above Gulaba checkpoint.',
    affectedRoute: 'Manali ➔ Keylong Route',
  },
  {
    id: 'h4',
    type: 'HAZARD',
    severity: 'WARNING',
    title: 'Severe Traffic Jam (3h Delay)',
    category: 'TRAFFIC RUSH',
    location: 'Shimla - Solan Highway (NH-5)',
    time: '3 hours ago',
    icon: Car,
    iconColor: C.orange,
    bgColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    desc: 'Massive weekend tourist influx causing 12km traffic queue near Koti tunnel. Drive with patience.',
    affectedRoute: 'Chandigarh ➔ Shimla Route',
  },
];

// ─── Main Component ─────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [unreadCount, setUnreadCount] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(8140);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 8140));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  const handleMarkAllRead = () => {
    setUnreadCount(0);
  };

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

            {HAZARD_DISASTER_ALERTS.map((alert) => {
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

            {TRIP_NOTIFICATIONS.map((trip) => (
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
                  {trip.initialSeconds > 0 && (
                    <View style={styles.timerBadge}>
                      <Clock size={11} color={C.orange} />
                      <Text style={styles.timerBadgeText}>
                        {`${hours}h ${minutes}m ${seconds}s`}
                      </Text>
                    </View>
                  )}
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

            {SEASONAL_RECOMMENDATIONS.map((item) => (
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
                    onPress={() => router.push('/search')}
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
