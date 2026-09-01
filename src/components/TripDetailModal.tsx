import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
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
  Navigation,
  CheckCircle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type Trip } from '@/store/AppContext';
import { eventBus } from '@/services/event-bus';
import { useRouter } from 'expo-router';
import { toast } from '@/lib/feedback';
import { formatDate } from '@/lib/datetime';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { BudgetTrip } from '@/app/budget-trips';
import type { NearbyTrip } from '@/types/api';

type TripLike = Trip | BudgetTrip | NearbyTrip;

export interface TripDetailModalProps {
  visible: boolean;
  trip: TripLike | null;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');


export default function TripDetailModal({
  visible,
  trip,
  onClose,
}: TripDetailModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { joinTrip, cancelJoinRequest, profile, isLoggedIn, requestedTrips } = useApp();

  const [midwayJoin, setMidwayJoin] = useState(false);
  const [startCity, setStartCity] = useState('');
  const [endCity, setEndCity] = useState('');
  const [joinedMsg, setJoinedMsg] = useState(false);

  if (!trip) return null;

  const tripName = trip.name;
  const organizerName = trip.creator;
  const price = trip.budget;
  const isMyTrip = isLoggedIn && !!(profile && profile.id && trip.creatorId && trip.creatorId === profile.id);

  const handleMidwayJoinSelect = () => {
    if (trip.cities && trip.cities.length > 2) {
      setStartCity(trip.cities[1]);
      setEndCity(trip.cities[trip.cities.length - 1]);
      setMidwayJoin(true);
    } else {
      toast(t('tripDetailModal.midwayOnlyFor3Plus'), 'info');
    }
  };

  const calculateMidwayPrice = () => {
    const defaultPrice = Number(trip.budget);
    if (!trip.cities || trip.cities.length <= 1) return defaultPrice;
    const startIdx = trip.cities.indexOf(startCity);
    const endIdx = trip.cities.indexOf(endCity);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return defaultPrice;

    const segmentCount = trip.cities.length - 1;
    const travelledSegments = endIdx - startIdx;
    const ratio = travelledSegments / segmentCount;
    return Math.round(defaultPrice * ratio * 0.9);
  };

  const handleRequestJoin = () => {
    // adjustedPrice is deliberately not sent — the server computes and owns
    // it from the trip's route (docs/REMEDIATION.md §8.6). The preview
    // shown on the success screen below uses the identical formula
    // (calculateMidwayPrice above), so it always matches what gets stored.
    joinTrip(trip.id, midwayJoin ? { midway: true, fromCity: startCity, toCity: endCity } : undefined);

    setJoinedMsg(true);
    setTimeout(() => {
      setJoinedMsg(false);
      onClose();
      setMidwayJoin(false);
    }, 2200);
  };

  const handleCancelRequest = () => {
    cancelJoinRequest(trip.id);
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
              <Text style={styles.successTitle}>{t('tripDetailModal.requestSubmitted')}</Text>
              <Text style={styles.successSub}>
                {midwayJoin
                  ? t('tripDetailModal.midwayRequestSent', {
                      startCity,
                      endCity,
                      price: calculateMidwayPrice(),
                    })
                  : t('tripDetailModal.joinRequestSent')}
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
                    {t('tripDetailModal.organizedBy', { name: organizerName })}
                  </Text>

                  {/* Dynamic Route Map Link Option */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={styles.viewOnMapHeaderBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        onClose();
                        router.navigate('/map');
                        setTimeout(() => {
                          eventBus.emit('focusTripOnMap', trip.id);
                        }, 100);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('tripDetailModal.viewRouteOnMap')}
                    >
                      <Navigation size={12} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.viewOnMapHeaderBtnText}>{t('tripDetailModal.viewRouteOnMap')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => { onClose(); setMidwayJoin(false); }}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('tripDetailModal.close')}
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
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.backgroundVerifiedOrganizer')}</Text>
                    </View>
                  </View>
                </View>

                {/* Schedule / Dates Details */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.scheduleDuration')}</Text>
                <View style={styles.detailRowCard}>
                  <View style={styles.detailCardHalf}>
                    <Calendar size={14} color={C.accent} />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '700' }}>{t('tripDetailModal.startDate')}</Text>
                      <Text style={styles.detailCardVal}>{formatDate(trip.startDate)}</Text>
                    </View>
                  </View>
                  <View style={styles.detailCardDivider} />
                  <View style={styles.detailCardHalf}>
                    <Calendar size={14} color={C.accent} />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '700' }}>{t('tripDetailModal.endDate')}</Text>
                      <Text style={styles.detailCardVal}>{formatDate(trip.endDate || trip.startDate)}</Text>
                    </View>
                  </View>
                </View>

                {/* Itinerary */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.itineraryPath')}</Text>
                <View style={styles.modalItineraryRow}>
                  {trip.cities && trip.cities.map((city: string, i: number) => (
                    <View key={city} style={styles.itineraryCityCard}>
                      <Text style={styles.itineraryCityText}>{city}</Text>
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.cityNumber', { number: i + 1 })}</Text>
                    </View>
                  ))}
                </View>

                {/* Assembly / Meeting Point Details */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.meetingAssemblyPoint')}</Text>
                <View style={styles.meetingPointInfoCard}>
                  <MapPin size={15} color={C.accent} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.meetingPointValText}>
                      {trip.meetingPoint || t('tripDetailModal.centralAssemblyPoint')}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                      {t('tripDetailModal.arriveEarlyNote')}
                    </Text>
                  </View>
                </View>

                {/* Service Inclusions */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.serviceInclusions')}</Text>
                <View style={styles.inclusionsGrid}>
                  <View style={styles.inclusionCell}>
                    <UserCheck size={12} color={trip.guideIncluded ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.localGuide', { value: trip.guideIncluded ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Hotel size={12} color={trip.hotelIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.hotelStay', { value: trip.hotelIncluded !== false ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Utensils size={12} color={trip.foodIncluded ? '#2ECC71' : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.mealsFood', { value: trip.foodIncluded ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    {tripName.toLowerCase().includes('bike') ? (
                      <Bike size={12} color={trip.cabIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    ) : (
                      <Bus size={12} color={trip.cabIncluded !== false ? '#2ECC71' : C.textSecondary} />
                    )}
                    <Text style={styles.inclusionText}>
                      {tripName.toLowerCase().includes('bike')
                        ? t('tripDetailModal.fuelBike', { value: trip.cabIncluded !== false ? t('tripDetailModal.yes') : t('tripDetailModal.no') })
                        : t('tripDetailModal.acCab', { value: trip.cabIncluded !== false ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                </View>

                {/* Midway Toggle */}
                <View style={[styles.toggleRow, { marginTop: 14 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>{t('tripDetailModal.familyConnectMidwayJoin')}</Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary }}>
                      {t('tripDetailModal.midwayJoinDesc')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (!midwayJoin) handleMidwayJoinSelect();
                      else setMidwayJoin(false);
                    }}
                    style={[
                      styles.toggleSwitch,
                      midwayJoin ? styles.toggleSwitchOn : styles.toggleSwitchOff,
                    ]}
                    hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
                    accessibilityRole="switch"
                    accessibilityLabel={t('tripDetailModal.midwayToggleLabel')}
                    accessibilityState={{ checked: midwayJoin }}
                  >
                    <View style={[styles.toggleCircle, midwayJoin ? styles.circleOn : styles.circleOff]} />
                  </TouchableOpacity>
                </View>

                {/* Midway Selectors */}
                {midwayJoin && (
                  <View style={styles.midwaySection}>
                    <Text style={styles.midwaySectionTitle}>{t('tripDetailModal.selectSegment')}</Text>
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.fieldLabel, { color: C.textSecondary, marginBottom: 6 }]}>{t('tripDetailModal.startJoiningFrom')}</Text>
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
                              accessibilityRole="button"
                              accessibilityLabel={city}
                              accessibilityState={{ selected: isSelected }}
                            >
                              <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>{city}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      {/* REMEDIATION.md §8.6 point 1: this selector never
                          existed before — endCity could only ever hold
                          whatever the Start picker's onPress silently
                          defaulted it to (the very next city), so the user
                          could never actually choose where they get off. */}
                      <Text style={[styles.fieldLabel, { color: C.textSecondary, marginBottom: 6 }]}>{t('tripDetailModal.travellingUntil')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.citySelectScroll}>
                        {trip.cities
                          .filter((city: string) => trip.cities.indexOf(city) > trip.cities.indexOf(startCity))
                          .map((city: string) => {
                            const isSelected = endCity === city;
                            return (
                              <TouchableOpacity
                                key={city}
                                style={[
                                  styles.citySelectChip,
                                  isSelected && styles.citySelectChipActive,
                                  { borderColor: isSelected ? C.accent : C.cardBorder }
                                ]}
                                onPress={() => setEndCity(city)}
                                accessibilityRole="button"
                                accessibilityLabel={city}
                                accessibilityState={{ selected: isSelected }}
                              >
                                <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>{city}</Text>
                              </TouchableOpacity>
                            );
                          })}
                      </ScrollView>
                    </View>
                    <View style={styles.priceCalcRow}>
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.automaticPriceAdjustment')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#2ECC71' }}>
                        ₹{calculateMidwayPrice()}{' '}
                        <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.vsPrice', { price })}</Text>
                      </Text>
                    </View>
                  </View>
                )}

                {/* Cost & Vacancy Bar */}
                <View style={styles.pricingBar}>
                  <View style={styles.pricingBarLeft}>
                    <Text style={styles.pricingBarLabel}>{t('tripDetailModal.perPerson')}</Text>
                    <View style={styles.pricingBarAmountRow}>
                      <Text style={[styles.pricingBarCurrency, { color: C.accent }]}>₹</Text>
                      <Text style={styles.pricingBarAmount}>
                        {(midwayJoin && startCity && endCity
                          ? calculateMidwayPrice()
                          : price
                        ).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pricingBarDivider} />
                  <View style={styles.pricingBarRight}>
                    <Text style={styles.pricingBarLabel}>{t('tripDetailModal.availability')}</Text>
                    <View style={styles.pricingBarSeatsRow}>
                      <Users size={12} color={trip.availableSeats > 0 ? '#10B981' : '#EF4444'} />
                      <Text style={[styles.pricingBarSeats, { color: trip.availableSeats > 0 ? '#10B981' : '#EF4444' }]}>
                        {t('tripDetailModal.seatsOpen', { available: trip.availableSeats, total: trip.totalSeats })}
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
                        <Text style={styles.requestedStatusTitle}>{t('tripDetailModal.requestSubmittedTitle')}</Text>
                        <Text style={[styles.requestedStatusSub, { color: C.textSecondary }]}>
                          {t('tripDetailModal.awaitingConfirmation')}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.cancelRequestBtn}
                      onPress={handleCancelRequest}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('tripDetailModal.withdrawRequest')}
                    >
                      <Text style={styles.cancelRequestBtnText}>{t('tripDetailModal.withdrawRequest')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.modalSubmitBtn}
                    onPress={handleRequestJoin}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={midwayJoin ? t('tripDetailModal.requestSegmentJoin') : t('tripDetailModal.requestToJoin')}
                  >
                    <Text style={styles.modalSubmitBtnText}>
                      {midwayJoin ? t('tripDetailModal.requestSegmentJoin') : t('tripDetailModal.requestToJoin')}
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
    backgroundColor: C.card,
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
    color: C.textSec,
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
    color: C.textSec,
    marginTop: 2,
  },
  viewOnMapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  viewOnMapHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
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
    backgroundColor: C.border,
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
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '700',
    color: C.textSec,
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
    letterSpacing: 1,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    color: C.textSec,
    marginBottom: 4,
  },
  citySelectScroll: {
    gap: 6,
  },
  citySelectChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: C.card,
  },
  citySelectChipActive: {
    backgroundColor: C.blueText,
  },
  citySelectChipText: {
    fontSize: 12,
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
    fontSize: 12,
    color: C.textSec,
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
    backgroundColor: C.blue,
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
    color: C.green,
  },
  requestedStatusSub: {
    fontSize: 12,
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
    color: C.red,
    fontSize: 13,
    fontWeight: '700',
  },
});
