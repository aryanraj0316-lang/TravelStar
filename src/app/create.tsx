import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Calendar as CalendarIcon,
  Car,
  Check,
  ChevronRight,
  Compass,
  Globe,
  Hotel,
  IndianRupee,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Sparkles,
  Users,
  Utensils,
  X
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#080A12',
  card: '#111422',
  cardAlt: '#181C2E',
  border: '#1E243B',
  white: '#F8FAFC',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981',
  amber: '#F59E0B',
};

const POPULAR_DESTINATIONS = ['Jaipur', 'Agra', 'Varanasi', 'Munnar', 'Goa', 'Ladakh', 'Udaipur', 'Shimla'];

export default function CreateTripScreen() {
  const router = useRouter();
  const { addTrip } = useApp();

  const [tripName, setTripName] = useState('');
  const [citiesInput, setCitiesInput] = useState('');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-07');
  const [budget, setBudget] = useState('');
  const [totalSeats, setTotalSeats] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [guideIncluded, setGuideIncluded] = useState(true);
  const [foodIncluded, setFoodIncluded] = useState(true);
  const [hotelIncluded, setHotelIncluded] = useState(true);
  const [cabIncluded, setCabIncluded] = useState(false);
  const [privacy, setPrivacy] = useState<'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY'>('PUBLIC');

  // Calendar Modal State
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'end' | null>(null);
  const [selectedDay, setSelectedDay] = useState(15);
  const [selectedMonth, setSelectedMonth] = useState('August 2026');

  // Parsed Cities for live route diagram
  const parsedCities = citiesInput
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '');

  const appendCityChip = (city: string) => {
    if (!citiesInput) {
      setCitiesInput(city);
    } else if (!citiesInput.includes(city)) {
      setCitiesInput(`${citiesInput}, ${city}`);
    }
  };

  const handleCreate = () => {
    if (!tripName || !citiesInput || !startDate || !budget || !totalSeats) {
      Alert.alert('Missing Info', 'Please fill in all required fields marked with *');
      return;
    }

    if (parsedCities.length < 2) {
      Alert.alert('Route Error', 'Please enter at least 2 cities separated by commas (e.g. Delhi, Jaipur).');
      return;
    }

    const newTrip = {
      id: `trip-${Date.now()}`,
      name: tripName,
      creator: 'Aarav Sharma (Organizer)',
      cities: parsedCities,
      startDate,
      endDate: endDate || startDate,
      budget: parseFloat(budget),
      availableSeats: parseInt(totalSeats),
      totalSeats: parseInt(totalSeats),
      meetingPoint: meetingPoint || 'Central Station / Airport Exit',
      guideIncluded,
      foodIncluded,
      privacy,
      membersCount: 1,
    };

    addTrip(newTrip);
    Alert.alert('✨ Trip Route Published!', 'Your group tour itinerary is live for travelers to explore and join.', [
      {
        text: 'View Home Feed',
        onPress: () => {
          setTripName('');
          setCitiesInput('');
          setStartDate('2026-08-01');
          setEndDate('2026-08-07');
          setBudget('');
          setTotalSeats('');
          setMeetingPoint('');
          router.replace('/');
        },
      },
    ]);
  };

  const selectCalendarDay = (day: number) => {
    setSelectedDay(day);
    const formatted = `2026-08-${String(day).padStart(2, '0')}`;
    if (activeDatePicker === 'start') {
      setStartDate(formatted);
    } else if (activeDatePicker === 'end') {
      setEndDate(formatted);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ════════════════════════════════════════════════
            SCENIC TOURIST HERO BANNER WITH IMAGE OVERLAY
            ════════════════════════════════════════════════ */}
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(18,21,36,0.5)', 'rgba(8,10,18,0.95)']}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Sparkles size={12} color={C.amber} />
              <Text style={styles.heroBadgeText}>ORGANIZER SUITE</Text>
            </View>
            <Compass size={22} color={C.blue} />
          </View>

          <Text style={styles.heroTitle}>Create Group Trip Route</Text>
          <Text style={styles.heroSub}>
            Set up custom tour itineraries, assign route segments, budget, and open seats.
          </Text>
        </View>

        {/* ════════════════════════════════════════════════
            ELEGANT FORM SECTIONS
            ════════════════════════════════════════════════ */}
        <View style={styles.formContainer}>

          {/* 1. BASIC INFORMATION */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#3B82F6', '#1E40AF']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>01</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Basic Trip Overview</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>TRIP NAME *</Text>
            <View style={styles.inputWrapper}>
              <Compass size={17} color={C.blue} style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. Royal Rajasthan Grand Expedition"
                placeholderTextColor={C.textMuted}
                style={styles.textInput}
                value={tripName}
                onChangeText={setTripName}
              />
            </View>
          </View>

          {/* 2. ROUTE SEQUENCE & QUICK ADD CHIPS */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#10B981', '#065F46']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>02</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Route Sequence & Destinations</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CITIES & STOPS (COMMA SEPARATED) *</Text>
            <View style={styles.inputWrapper}>
              <MapPin size={17} color={C.green} style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. Delhi, Agra, Jaipur, Udaipur"
                placeholderTextColor={C.textMuted}
                style={styles.textInput}
                value={citiesInput}
                onChangeText={setCitiesInput}
              />
            </View>
            <Text style={styles.helperText}>
              Order matters! Travelers can join midway along any segment.
            </Text>

            {/* Quick Add Popular Destination Chips */}
            <View style={styles.chipHeaderRow}>
              <Sparkles size={11} color={C.amber} />
              <Text style={styles.chipHeaderLabel}>QUICK ADD POPULAR DESTINATIONS:</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAddRow}>
              {POPULAR_DESTINATIONS.map((dest) => (
                <TouchableOpacity
                  key={dest}
                  style={styles.quickDestChip}
                  onPress={() => appendCityChip(dest)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickDestText}>+ {dest}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Live Interactive Route Flow Card */}
            {parsedCities.length > 0 && (
              <View style={styles.routeFlowCard}>
                <Text style={styles.routeFlowTitle}>LIVE ROUTE PATH:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routePillRow}>
                  {parsedCities.map((city, idx) => (
                    <React.Fragment key={idx}>
                      <View style={styles.cityPill}>
                        <MapPin size={10} color={C.blue} />
                        <Text style={styles.cityPillText}>{city}</Text>
                      </View>
                      {idx < parsedCities.length - 1 && (
                        <ChevronRight size={14} color={C.textMuted} style={{ marginHorizontal: 2 }} />
                      )}
                    </React.Fragment>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* 3. DATES & TIMINGS (TOUCH TO OPEN CALENDAR MODAL) */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#8B5CF6', '#581C87']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>03</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Schedule & Dates</Text>
          </View>

          <View style={styles.gridRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>START DATE *</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.inputWrapper}
                onPress={() => setActiveDatePicker('start')}
              >
                <CalendarIcon size={16} color={C.purple} style={styles.inputIcon} />
                <Text style={[styles.textInput, !startDate && { color: C.textMuted }]}>
                  {startDate || 'Select Date'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>END DATE</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.inputWrapper}
                onPress={() => setActiveDatePicker('end')}
              >
                <CalendarIcon size={16} color={C.purple} style={styles.inputIcon} />
                <Text style={[styles.textInput, !endDate && { color: C.textMuted }]}>
                  {endDate || 'Select Date'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. BUDGET & SLOTS (NUMERIC KEYBOARD) */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#F59E0B', '#B45309']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>04</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Budget & Capacity</Text>
          </View>

          <View style={styles.gridRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>BUDGET PER PERSON (₹) *</Text>
              <View style={styles.inputWrapper}>
                <IndianRupee size={16} color={C.amber} style={styles.inputIcon} />
                <TextInput
                  placeholder="e.g. 14500"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  style={styles.textInput}
                  value={budget}
                  onChangeText={setBudget}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>TOTAL SLOTS *</Text>
              <View style={styles.inputWrapper}>
                <Users size={16} color={C.amber} style={styles.inputIcon} />
                <TextInput
                  placeholder="e.g. 12"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  style={styles.textInput}
                  value={totalSeats}
                  onChangeText={setTotalSeats}
                />
              </View>
            </View>
          </View>

          {/* PICKUP / MEETING POINT */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PICKUP / MEETING POINT</Text>
            <View style={styles.inputWrapper}>
              <Navigation size={16} color={C.blue} style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. Terminal 3 Exit Gate 4 or New Delhi Railway Station"
                placeholderTextColor={C.textMuted}
                style={styles.textInput}
                value={meetingPoint}
                onChangeText={setMeetingPoint}
              />
            </View>
          </View>

          {/* 5. INCLUDED SERVICES */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#06B6D4', '#0891B2']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>05</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Included Services</Text>
          </View>

          <View style={styles.amenitiesGrid}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.amenityCard, guideIncluded && styles.amenityCardActive]}
              onPress={() => setGuideIncluded(!guideIncluded)}
            >
              <View style={[styles.amenityIconCircle, guideIncluded && { backgroundColor: C.blue }]}>
                <Compass size={16} color={guideIncluded ? C.white : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.amenityTitle, guideIncluded && styles.amenityTitleActive]}>
                  Verified Guide
                </Text>
                <Text style={styles.amenitySub}>Local Tour Leader</Text>
              </View>
              <View style={[styles.checkDot, guideIncluded && styles.checkDotActive]}>
                {guideIncluded && <Check size={10} color={C.white} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.amenityCard, foodIncluded && styles.amenityCardActive]}
              onPress={() => setFoodIncluded(!foodIncluded)}
            >
              <View style={[styles.amenityIconCircle, foodIncluded && { backgroundColor: C.purple }]}>
                <Utensils size={16} color={foodIncluded ? C.white : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.amenityTitle, foodIncluded && styles.amenityTitleActive]}>
                  Meals & Food
                </Text>
                <Text style={styles.amenitySub}>Breakfast & Dinner</Text>
              </View>
              <View style={[styles.checkDot, foodIncluded && styles.checkDotActive]}>
                {foodIncluded && <Check size={10} color={C.white} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.amenityCard, hotelIncluded && styles.amenityCardActive]}
              onPress={() => setHotelIncluded(!hotelIncluded)}
            >
              <View style={[styles.amenityIconCircle, hotelIncluded && { backgroundColor: C.green }]}>
                <Hotel size={16} color={hotelIncluded ? C.white : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.amenityTitle, hotelIncluded && styles.amenityTitleActive]}>
                  Hotel Stays
                </Text>
                <Text style={styles.amenitySub}>Rated 4★ Accommodations</Text>
              </View>
              <View style={[styles.checkDot, hotelIncluded && styles.checkDotActive]}>
                {hotelIncluded && <Check size={10} color={C.white} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.amenityCard, cabIncluded && styles.amenityCardActive]}
              onPress={() => setCabIncluded(!cabIncluded)}
            >
              <View style={[styles.amenityIconCircle, cabIncluded && { backgroundColor: C.amber }]}>
                <Car size={16} color={cabIncluded ? C.white : C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.amenityTitle, cabIncluded && styles.amenityTitleActive]}>
                  AC Vehicle
                </Text>
                <Text style={styles.amenitySub}>Dedicated Sightseeing</Text>
              </View>
              <View style={[styles.checkDot, cabIncluded && styles.checkDotActive]}>
                {cabIncluded && <Check size={10} color={C.white} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* 6. PRIVACY & VISIBILITY */}
          <View style={styles.sectionHeaderRow}>
            <LinearGradient colors={['#EC4899', '#BE185D']} style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>06</Text>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Privacy Settings</Text>
          </View>

          <View style={styles.privacyGrid}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.privacyCard, privacy === 'PUBLIC' && styles.privacyCardActive]}
              onPress={() => setPrivacy('PUBLIC')}
            >
              <Globe size={20} color={privacy === 'PUBLIC' ? C.blue : C.textMuted} />
              <Text style={[styles.privacyTitle, privacy === 'PUBLIC' && styles.privacyTitleActive]}>Public</Text>
              <Text style={styles.privacySub}>Open for all</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.privacyCard, privacy === 'PRIVATE' && styles.privacyCardActive]}
              onPress={() => setPrivacy('PRIVATE')}
            >
              <Lock size={20} color={privacy === 'PRIVATE' ? C.amber : C.textMuted} />
              <Text style={[styles.privacyTitle, privacy === 'PRIVATE' && styles.privacyTitleActive]}>Private</Text>
              <Text style={styles.privacySub}>Approval needed</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.privacyCard, privacy === 'INVITE_ONLY' && styles.privacyCardActive]}
              onPress={() => setPrivacy('INVITE_ONLY')}
            >
              <Mail size={20} color={privacy === 'INVITE_ONLY' ? C.purple : C.textMuted} />
              <Text style={[styles.privacyTitle, privacy === 'INVITE_ONLY' && styles.privacyTitleActive]}>Invite Only</Text>
              <Text style={styles.privacySub}>Link sharing</Text>
            </TouchableOpacity>
          </View>

          {/* SUBMIT BUTTON */}
          <TouchableOpacity activeOpacity={0.9} style={styles.submitBtnWrap} onPress={handleCreate}>
            <LinearGradient
              colors={['#3B82F6', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              <Sparkles size={18} color={C.white} />
              <Text style={styles.submitText}>Publish Trip Itinerary</Text>
            </LinearGradient>
          </TouchableOpacity>

        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ════════════════════════════════════════════════
          INTERACTIVE DATE PICKER CALENDAR MODAL
          ════════════════════════════════════════════════ */}
      {activeDatePicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.calendarHeaderTitle}>
                  Select {activeDatePicker === 'start' ? 'Start' : 'End'} Date
                </Text>
                <Text style={styles.calendarMonthText}>{selectedMonth}</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveDatePicker(null)}>
                <X size={18} color={C.white} />
              </TouchableOpacity>
            </View>

            {/* Days Grid */}
            <View style={styles.weekDaysRow}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <Text key={i} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const isSelected = selectedDay === day;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    onPress={() => selectCalendarDay(day)}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.calendarConfirmBtn}
              onPress={() => setActiveDatePicker(null)}
            >
              <Text style={styles.calendarConfirmText}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroWrap: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: 160,
    justifyContent: 'center',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 17,
  },

  formContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 14,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.2,
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.textSec,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181C2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: C.white,
    padding: 0,
  },
  helperText: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 4,
    marginLeft: 2,
  },

  chipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    marginBottom: 6,
  },
  chipHeaderLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
    letterSpacing: 0.3,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  quickDestChip: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  quickDestText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: C.white,
  },

  routeFlowCard: {
    backgroundColor: '#181C2E',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  routeFlowTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: C.blue,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  routePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  cityPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.white,
  },

  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },

  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  amenityCard: {
    width: (SCREEN_WIDTH - 76) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#181C2E',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  amenityCardActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: C.blue,
  },
  amenityIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amenityTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSec,
  },
  amenityTitleActive: {
    color: C.white,
    fontWeight: '700',
  },
  amenitySub: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 1,
  },
  checkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },

  privacyGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  privacyCard: {
    flex: 1,
    backgroundColor: '#181C2E',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  privacyCardActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: C.blue,
  },
  privacyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    marginTop: 6,
  },
  privacyTitleActive: {
    color: C.white,
  },
  privacySub: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  submitBtnWrap: {
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },

  // Date Picker Modal Styles
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 999,
  },
  calendarModalCard: {
    width: '100%',
    backgroundColor: '#111422',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  calendarMonthText: {
    fontSize: 12,
    color: C.blue,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSec,
    width: 32,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dayCellSelected: {
    backgroundColor: C.blue,
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },
  dayCellTextSelected: {
    fontWeight: '800',
  },
  calendarConfirmBtn: {
    backgroundColor: C.blue,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  calendarConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
});
