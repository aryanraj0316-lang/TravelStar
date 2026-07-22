import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Compass,
  DollarSign,
  Info,
  MapPin,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
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

interface Booking {
  id: string;
  tripName: string;
  startDate: string;
  endDate: string;
  pricePaid: number;
  status: 'ONGOING' | 'UPCOMING' | 'COMPLETED';
  cities: string[];
  meetingPoint: string;
  bookingId: string;
  image: string;
  seatsBooked: number;
}

const MOCK_BOOKINGS: Booking[] = [
  {
    id: 'b-1',
    tripName: 'Ranchi to Vrindavan Spiritual Journey',
    startDate: '2026-07-20',
    endDate: '2026-07-25',
    pricePaid: 8500,
    status: 'ONGOING',
    cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
    meetingPoint: 'Ranchi Junction Platform 1',
    bookingId: 'TS-BK-99120',
    image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&q=80',
    seatsBooked: 2,
  },
  {
    id: 'b-2',
    tripName: 'Leh Ladakh Bike Expedition',
    startDate: '2026-09-05',
    endDate: '2026-09-14',
    pricePaid: 28000,
    status: 'UPCOMING',
    cities: ['Manali', 'Sarchu', 'Leh', 'Nubra Valley', 'Pangong Tso'],
    meetingPoint: 'Manali Mall Road',
    bookingId: 'TS-BK-99125',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=500&q=80',
    seatsBooked: 1,
  },
  {
    id: 'b-3',
    tripName: 'Golden Triangle Explorer',
    startDate: '2026-06-10',
    endDate: '2026-06-15',
    pricePaid: 12500,
    status: 'COMPLETED',
    cities: ['Delhi', 'Agra', 'Jaipur'],
    meetingPoint: 'New Delhi Railway Station Gate 1',
    bookingId: 'TS-BK-99081',
    image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500&q=80',
    seatsBooked: 3,
  },
];

type BookingFilter = 'ALL' | 'ONGOING' | 'UPCOMING' | 'COMPLETED';

export default function BookingsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<BookingFilter>('ALL');

  const filteredBookings = MOCK_BOOKINGS.filter((b) => {
    if (filter === 'ALL') return true;
    return b.status === filter;
  });

  const getStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'ONGOING':
        return (
          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: C.green }]}>
            <View style={[styles.pulseDot, { backgroundColor: C.green }]} />
            <Text style={[styles.badgeText, { color: C.green }]}>ONGOING</Text>
          </View>
        );
      case 'UPCOMING':
        return (
          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: C.amber }]}>
            <Clock size={11} color={C.amber} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: C.amber }]}>UPCOMING</Text>
          </View>
        );
      case 'COMPLETED':
        return (
          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: C.blue }]}>
            <CheckCircle size={11} color={C.blue} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: C.blue }]}>COMPLETED</Text>
          </View>
        );
    }
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
        <Text style={styles.headerTitle}>My Bookings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs / Segment Filter */}
      <View style={styles.tabsRow}>
        {(['ALL', 'ONGOING', 'UPCOMING', 'COMPLETED'] as BookingFilter[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.8}
              onPress={() => setFilter(tab)}
              style={styles.tabBtn}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#00F2FE', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeTabGradient}
                >
                  <Text style={[styles.tabText, styles.activeTabText]}>
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveTabBox}>
                  <Text style={[styles.tabText, styles.inactiveTabText]}>
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookings List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {filteredBookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Compass size={64} color={C.textMuted} strokeWidth={1.2} />
            <Text style={styles.emptyText}>No bookings found in this category.</Text>
          </View>
        ) : (
          filteredBookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              {/* Card Image Header */}
              <View style={styles.cardImageContainer}>
                <Image source={{ uri: booking.image }} style={styles.cardImage} />
                <LinearGradient
                  colors={['rgba(6,8,20,0.1)', 'rgba(6,8,20,0.85)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardHeaderOverlay}>
                  {getStatusBadge(booking.status)}
                  <Text style={styles.bookingIdText}>ID: {booking.bookingId}</Text>
                </View>
              </View>

              {/* Card Details */}
              <View style={styles.cardDetails}>
                <Text style={styles.tripName} numberOfLines={1}>{booking.tripName}</Text>

                {/* Dates */}
                <View style={styles.detailRow}>
                  <Calendar size={13} color={C.textSec} style={{ marginRight: 6 }} />
                  <Text style={styles.detailText}>
                    {booking.startDate} to {booking.endDate}
                  </Text>
                </View>

                {/* Route */}
                <View style={styles.detailRow}>
                  <MapPin size={13} color={C.textSec} style={{ marginRight: 6 }} />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {booking.cities.join(' → ')}
                  </Text>
                </View>

                {/* Meeting Point */}
                <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                  <Info size={13} color={C.textSec} style={{ marginRight: 6, marginTop: 2 }} />
                  <Text style={[styles.detailText, { flex: 1 }]} numberOfLines={2}>
                    Meeting: {booking.meetingPoint}
                  </Text>
                </View>

                {/* Seats and Cost Divider */}
                <View style={styles.divider} />

                {/* Seats and cost */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerCol}>
                    <View style={styles.footerIconLabel}>
                      <Users size={12} color={C.textSec} style={{ marginRight: 4 }} />
                      <Text style={styles.footerLabel}>Seats Booked</Text>
                    </View>
                    <Text style={styles.footerValue}>{booking.seatsBooked} {booking.seatsBooked === 1 ? 'Seat' : 'Seats'}</Text>
                  </View>

                  <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
                    <View style={styles.footerIconLabel}>
                      <DollarSign size={12} color={C.textSec} style={{ marginRight: 2 }} />
                      <Text style={styles.footerLabel}>Amount Paid</Text>
                    </View>
                    <Text style={[styles.footerValue, { color: C.green }]}>
                      ₹{booking.pricePaid.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Contextual Action Button */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.actionBtn}
                  onPress={() => {
                    // Logic based on status or general view
                  }}
                >
                  <Text style={styles.actionBtnText}>
                    {booking.status === 'ONGOING' && 'Track Live Trip'}
                    {booking.status === 'UPCOMING' && 'View E-Ticket'}
                    {booking.status === 'COMPLETED' && 'Review & Rate Trip'}
                  </Text>
                  <ChevronRight size={14} color={C.white} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginVertical: 10,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    height: 38,
  },
  activeTabGradient: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveTabBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  activeTabText: {
    color: C.white,
    fontWeight: '700',
  },
  inactiveTabText: {
    color: C.textSec,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 16,
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardImageContainer: {
    height: 140,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardHeaderOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bookingIdText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '600',
  },
  cardDetails: {
    padding: 16,
  },
  tripName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    color: C.textSec,
    fontSize: 12.5,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  footerCol: {
    gap: 4,
  },
  footerIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    height: 44,
    gap: 6,
  },
  actionBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
