import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import {
  X,
  Calendar,
  MapPin,
  Users,
  Shield,
  UserCheck,
  Hotel,
  Utensils,
  Bike,
  Bus,
  Route,
  Navigation,
  CheckCircle,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/store/AppContext';

export interface TripDetailModalProps {
  visible: boolean;
  trip: any;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const C = {
  bg: '#080A12',
  card: '#111322',
  cardBorder: '#1E2340',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  divider: '#1E2340',
  accent: '#3B82F6',
  accentLight: 'rgba(59, 130, 246, 0.12)',
  amber: '#F59E0B',
};

export default function TripDetailModal({
  visible,
  trip,
  onClose,
}: TripDetailModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { joinTrip, profile, isLoggedIn, requestedTrips, setRequestedTrips } = useApp();

  const [midwayJoin, setMidwayJoin] = useState(false);
  const [startCity, setStartCity] = useState('');
  const [endCity, setEndCity] = useState('');
  const [joinedMsg, setJoinedMsg] = useState(false);

  if (!trip) return null;

  const tripName = trip.name || trip.title;
  const organizerName = trip.creator || trip.organizerName;
  const price = trip.budget !== undefined ? trip.budget : trip.pricePerPerson;
  const isMyTrip = isLoggedIn && !!(profile && profile.id && trip.creatorId && trip.creatorId === profile.id);

  const handleMidwayJoinSelect = (t: any) => {
    if (t.cities && t.cities.length > 2) {
      setStartCity(t.cities[1]);
      setEndCity(t.cities[t.cities.length - 1]);
      setMidwayJoin(true);
    } else {
      Alert.alert('Route Info', 'Midway joining is only available for trips covering 3 or more cities.');
    }
  };

  const calculateMidwayPrice = (t: any) => {
    const defaultPrice = t.budget !== undefined ? t.budget : t.pricePerPerson;
    if (!t.cities || t.cities.length <= 1) return defaultPrice;
    const startIdx = t.cities.indexOf(startCity);
    const endIdx = t.cities.indexOf(endCity);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return defaultPrice;
    
    const segmentCount = t.cities.length - 1;
    const travelledSegments = endIdx - startIdx;
    const ratio = travelledSegments / segmentCount;
    return Math.round(defaultPrice * ratio * 0.9);
  };

  const handleRequestJoin = () => {
    joinTrip(trip.id);
    setRequestedTrips((prev) => {
      const next = new Set(prev);
      next.add(trip.id);
      return next;
    });

    setJoinedMsg(true);
    setTimeout(() => {
      setJoinedMsg(false);
      onClose();
      setMidwayJoin(false);
    }, 2200);
  };

  const handleCancelRequest = () => {
    setRequestedTrips((prev) => {
      const next = new Set(prev);
      next.delete(trip.id);
      return next;
    });
    Alert.alert('Request Withdrawn', 'Your request to join this trip has been cancelled.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
          {/* Drag Handle */}
          <View style={styles.sheetHandle} />

          {joinedMsg ? (
            <View style={styles.successContainer}>
              <CheckCircle size={54} color="#2ECC71" />
              <Text style={styles.successTitle}>Request Submitted!</Text>
              <Text style={styles.successSub}>
                {midwayJoin
                  ? `Midway request (${startCity} → ${endCity}) sent to organizer. Adjusted price: ₹${calculateMidwayPrice(trip)}.`
                  : 'Join request sent to the group organizer.'}
              </Text>
            </View>
          ) : (
            <>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTripName} numberOfLines={2}>
                    {tripName}
                  </Text>
                  <Text style={styles.modalOrganizerText}>
                    Organized by {organizerName}
                  </Text>
                  
                  {/* Dynamic Route Map Link Option */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={styles.viewOnMapHeaderBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        onClose();
                        router.push({ pathname: '/map', params: { tripId: trip.id } });
                      }}
                    >
                      <Navigation size={12} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.viewOnMapHeaderBtnText}>View Route on Map</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => { onClose(); setMidwayJoin(false); }}
                  style={styles.closeBtn}
                >
                  <X size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
                {/* Organizer Profile Card */}
                <View style={styles.modalOrganizerCard}>
                  <View style={styles.organizerAvatarWrap}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.accent }}>
                      {organizerName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalOrganizerName}>{organizerName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <Shield size={11} color={C.accent} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 10, color: C.textSecondary }}>Background-Verified Organizer</Text>
                    </View>
                  </View>
                </View>

                {/* Schedule / Dates Details */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>SCHEDULE & DURATION</Text>
                <View style={styles.detailRowCard}>
                  <View style={styles.detailCardHalf}>
                    <Calendar size={14} color={C.accent} />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '700' }}>START DATE</Text>
                      <Text style={styles.detailCardVal}>{trip.startDate}</Text>
                    </View>
                  </View>
                  <View style={styles.detailCardDivider} />
                  <View style={styles.detailCardHalf}>
                    <Calendar size={14} color={C.accent} />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '700' }}>END DATE</Text>
                      <Text style={styles.detailCardVal}>{trip.endDate || trip.startDate}</Text>
                    </View>
                  </View>
                </View>

                {/* Itinerary */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>ITINERARY PATH</Text>
                <View style={styles.modalItineraryRow}>
                  {trip.cities && trip.cities.map((city: string, i: number) => (
                    <View key={city} style={styles.itineraryCityCard}>
                      <Text style={styles.itineraryCityText}>{city}</Text>
                      <Text style={{ fontSize: 9, color: C.textSecondary }}>City #{i + 1}</Text>
                    </View>
                  ))}
                </View>

                {/* Assembly / Meeting Point Details */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>MEETING & ASSEMBLY POINT</Text>
                <View style={styles.meetingPointInfoCard}>
                  <MapPin size={15} color={C.accent} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.meetingPointValText}>
                      {trip.meetingPoint || 'Central Assembly Point'}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: C.textSecondary, marginTop: 2 }}>
                      Please arrive at the assembly point 30 minutes before time.
                    </Text>
                  </View>
                </View>

                {/* Service Inclusions */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>SERVICE INCLUSIONS</Text>
                <View style={styles.inclusionsGrid}>
                  <View style={styles.inclusionCell}>
                    <UserCheck size={12} color={trip.guideIncluded ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>Local Guide: {trip.guideIncluded ? 'YES' : 'NO'}</Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Hotel size={12} color={trip.hotelIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>Hotel Stay: {trip.hotelIncluded !== false ? 'YES' : 'NO'}</Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Utensils size={12} color={trip.foodIncluded ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>Meals/Food: {trip.foodIncluded ? 'YES' : 'NO'}</Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    {tripName.toLowerCase().includes('bike') ? (
                      <Bike size={12} color={trip.cabIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    ) : (
                      <Bus size={12} color={trip.cabIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    )}
                    <Text style={styles.inclusionText}>
                      {tripName.toLowerCase().includes('bike') ? 'Fuel/Bike: ' : 'AC Cab: '}
                      {trip.cabIncluded !== false ? 'YES' : 'NO'}
                    </Text>
                  </View>
                </View>

                {/* Midway Toggle */}
                <View style={[styles.toggleRow, { marginTop: 14 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Family Connect Midway Join</Text>
                    <Text style={{ fontSize: 10, color: C.textSecondary }}>
                      Already at a midway stop? Join from there and pay only for remaining cities!
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (!midwayJoin) handleMidwayJoinSelect(trip);
                      else setMidwayJoin(false);
                    }}
                    style={[
                      styles.toggleSwitch,
                      midwayJoin ? styles.toggleSwitchOn : styles.toggleSwitchOff,
                    ]}
                  >
                    <View style={[styles.toggleCircle, midwayJoin ? styles.circleOn : styles.circleOff]} />
                  </TouchableOpacity>
                </View>

                {/* Midway Selectors */}
                {midwayJoin && (
                  <View style={styles.midwaySection}>
                    <Text style={styles.midwaySectionTitle}>SELECT SEGMENT</Text>
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.fieldLabel, { color: C.textSecondary, marginBottom: 6 }]}>Start Joining From</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.citySelectScroll}>
                        {trip.cities.slice(0, trip.cities.length - 1).map((city: string) => {
                          const isSelected = startCity === city;
                          return (
                            <TouchableOpacity
                              key={city}
                              style={[
                                styles.citySelectChip,
                                isSelected && styles.citySelectChipActive,
                                { borderColor: isSelected ? C.accent : C.cardBorder }
                              ]}
                              onPress={() => {
                                setStartCity(city);
                                const startIdx = trip.cities.indexOf(city);
                                const endIdx = trip.cities.indexOf(endCity);
                                if (endIdx <= startIdx) {
                                  setEndCity(trip.cities[startIdx + 1] || '');
                                }
                              }}
                            >
                              <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>{city}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <View style={styles.priceCalcRow}>
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>Automatic Price Adjustment</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#2ECC71' }}>
                        ₹{calculateMidwayPrice(trip)}{' '}
                        <Text style={{ fontSize: 11, color: C.textSecondary }}>(vs ₹{price})</Text>
                      </Text>
                    </View>
                  </View>
                )}

                {/* Cost & Vacancy Bar */}
                <View style={styles.pricingBar}>
                  <View style={styles.pricingBarLeft}>
                    <Text style={styles.pricingBarLabel}>Per Person</Text>
                    <View style={styles.pricingBarAmountRow}>
                      <Text style={[styles.pricingBarCurrency, { color: C.accent }]}>₹</Text>
                      <Text style={styles.pricingBarAmount}>
                        {(midwayJoin && startCity && endCity
                          ? calculateMidwayPrice(trip)
                          : price
                        ).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pricingBarDivider} />
                  <View style={styles.pricingBarRight}>
                    <Text style={styles.pricingBarLabel}>Availability</Text>
                    <View style={styles.pricingBarSeatsRow}>
                      <Users size={12} color={trip.availableSeats > 0 ? '#10B981' : '#EF4444'} />
                      <Text style={[styles.pricingBarSeats, { color: trip.availableSeats > 0 ? '#10B981' : '#EF4444' }]}>
                        {trip.availableSeats} of {trip.totalSeats} open
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Area */}
                {isMyTrip ? null : requestedTrips.has(trip.id) ? (
                  <View style={styles.requestedActionArea}>
                    <View style={styles.requestedStatusRow}>
                      <View style={styles.requestedStatusIcon}>
                        <CheckCircle size={18} color='#10B981' />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.requestedStatusTitle}>Request Submitted</Text>
                        <Text style={[styles.requestedStatusSub, { color: C.textSecondary }]}>
                          Awaiting organizer confirmation
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.cancelRequestBtn}
                      onPress={handleCancelRequest}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelRequestBtnText}>Withdraw Request</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleRequestJoin} activeOpacity={0.88}>
                    <Text style={styles.modalSubmitBtnText}>
                      {midwayJoin ? 'Request Segment Join' : 'Request to Join'}
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    flex: 0.9,
    backgroundColor: '#111322',
    borderColor: '#1E2340',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 16,
  },
  successSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTripName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modalOrganizerText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  viewOnMapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  viewOnMapHeaderBtnText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  modalForm: {
    flex: 1,
  },
  modalOrganizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1D30',
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  organizerAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOrganizerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  formSectionTitle: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
  },
  detailRowCard: {
    flexDirection: 'row',
    backgroundColor: '#1B1E30',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  detailCardHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailCardVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  detailCardDivider: {
    width: 1,
    backgroundColor: '#1E2340',
    marginHorizontal: 12,
  },
  modalItineraryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  itineraryCityCard: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  itineraryCityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  meetingPointInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,102,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
  },
  meetingPointValText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  inclusionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  inclusionCell: {
    width: (SCREEN_WIDTH - 48) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1B1E30',
    padding: 10,
    borderRadius: 10,
  },
  inclusionText: {
    fontSize: 10.5,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#1E2340',
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  toggleSwitch: {
    width: 48,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchOn: {
    backgroundColor: '#2ECC71',
  },
  toggleSwitchOff: {
    backgroundColor: '#555',
  },
  toggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  circleOn: {
    alignSelf: 'flex-end',
  },
  circleOff: {
    alignSelf: 'flex-start',
  },
  midwaySection: {
    backgroundColor: 'rgba(0,102,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E2340',
  },
  midwaySectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 1,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
  },
  citySelectScroll: {
    gap: 6,
  },
  citySelectChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#111322',
  },
  citySelectChipActive: {
    backgroundColor: '#3B82F6',
  },
  citySelectChipText: {
    fontSize: 11,
  },
  priceCalcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderColor: '#1E2340',
    paddingTop: 10,
  },
  pricingBar: {
    flexDirection: 'row',
    backgroundColor: '#161929',
    borderColor: '#1E2340',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  pricingBarLeft: {
    flex: 1,
  },
  pricingBarLabel: {
    fontSize: 10,
    color: '#94A3B8',
  },
  pricingBarAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  pricingBarCurrency: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 2,
  },
  pricingBarAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  pricingBarDivider: {
    width: 1,
    backgroundColor: '#1E2340',
    marginHorizontal: 16,
  },
  pricingBarRight: {
    flex: 1,
  },
  pricingBarSeatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  pricingBarSeats: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    backgroundColor: '#0066FF',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalSubmitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  requestedActionArea: {
    gap: 12,
  },
  requestedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderColor: '#1E2A22',
    backgroundColor: 'rgba(16,185,129,0.07)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  requestedStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestedStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  requestedStatusSub: {
    fontSize: 10,
    marginTop: 2,
  },
  cancelRequestBtn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelRequestBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
