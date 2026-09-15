import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import X from 'lucide-react-native/icons/x';
import Calendar from 'lucide-react-native/icons/calendar';
import MapPin from 'lucide-react-native/icons/map-pin';
import Users from 'lucide-react-native/icons/users';
import UserCheck from 'lucide-react-native/icons/user-check';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Hotel from 'lucide-react-native/icons/hotel';
import Utensils from 'lucide-react-native/icons/utensils';
import Bike from 'lucide-react-native/icons/bike';
import Bus from 'lucide-react-native/icons/bus';
import Navigation from 'lucide-react-native/icons/navigation';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type Trip } from '@/store/AppContext';
import { eventBus } from '@/services/event-bus';
import { useRouter } from 'expo-router';
import { errorToastMessage, toast } from '@/lib/feedback';
import { formatDate, formatDateShort, toDate } from '@/lib/datetime';
import { formatTransitTime } from '@/lib/transit-time';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import { apiService } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { formatINR } from '@/lib/money';
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
  const { joinTrip, cancelJoinRequest, profile, isLoggedIn, requestedTrips, joinRequestStatuses } = useApp();

  const [midwayJoin, setMidwayJoin] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  React.useEffect(() => {
    setAvatarLoadFailed(false);
  }, [trip?.id]);
  const [startCity, setStartCity] = useState('');
  const [endCity, setEndCity] = useState('');
  const [joinedMsg, setJoinedMsg] = useState(false);
  // Family Connect Midway: how many family members join alongside the
  // requester, which checkpoint they join at, and which day. fromStopId/
  // toStopId are TripTimelineStop ids (the app's real "checkpoint" entity —
  // see docs/plan "Nearby, Family Connect, Guide-per-checkpoint, Chat &
  // Seat fixes"); they ride alongside startCity/endCity above rather than
  // replacing them, since the price-preview math still works off city names.
  const [familyMemberCount, setFamilyMemberCount] = useState(0);
  const [fromStopId, setFromStopId] = useState<string | null>(null);
  const [toStopId, setToStopId] = useState<string | null>(null);
  const [joiningDayIndex, setJoiningDayIndex] = useState<number | null>(null);
  const [openingInquiry, setOpeningInquiry] = useState(false);

  // The list payload this modal is opened with is deliberately lean — it
  // has no description, route timeline or packing checklist. Those live on
  // the public detail endpoint, and they are exactly what someone deciding
  // whether to join needs to read before committing, so they are fetched
  // as soon as the sheet opens.
  const detailQuery = useQuery({
    queryKey: queryKeys.trip(trip?.id ?? ''),
    queryFn: async () => apiService.getTripDetail(trip!.id),
    enabled: visible && !!trip?.id,
  });
  const detail = detailQuery.data ?? null;
  const detailState = sectionState(detailQuery, detail != null);

  if (!trip) return null;

  const tripName = trip.name;
  const organizerName = trip.creator;

  // Only the authoritative id checks — the previous version also matched
  // by substring on display name, including whenever the organizer's own
  // name happened to *contain* the word "you" (Yousuf, Younis, "Youth
  // Travels", …) or "organizer", which made every viewer of that trip see
  // themselves as its organizer: their own avatar and name shown in the
  // organizer's place, regardless of who actually created the trip.
  const isMeOrganizer = Boolean(
    isLoggedIn &&
      profile &&
      (("isMyTrip" in trip && (trip as any).isMyTrip) ||
        (trip.creatorId && profile.id && trip.creatorId === profile.id))
  );

  const organizerAvatarUri =
    (!avatarLoadFailed && (
      (isMeOrganizer && profile?.avatar ? profile.avatar : null) ||
      ('creatorAvatar' in trip && (trip as any).creatorAvatar ? (trip as any).creatorAvatar : null) ||
      (isMeOrganizer && (profile as any)?.avatarUrl ? (profile as any).avatarUrl : null)
    )) || null;
  const price = trip.budget;
  const isMyTrip = isLoggedIn && !!(profile && profile.id && trip.creatorId && trip.creatorId === profile.id);
  const joinCtaLabel = !isLoggedIn
    ? t('tripDetailModal.signInToJoin')
    : midwayJoin
      ? t('tripDetailModal.requestSegmentJoin')
      : t('tripDetailModal.requestToJoin');

  // TripTimelineStop rows are the app's real "checkpoint" entity (see the
  // plan doc) — organizer-authored, geolocated, and already returned by the
  // detail endpoint. A trip predating the Timeline tab has none, so the
  // segment picker falls back to the plain cities[] array in that case.
  const timelineStops = detail?.timeline ?? [];
  const hasCheckpoints = timelineStops.length > 1;

  const handleMidwayJoinSelect = () => {
    if (hasCheckpoints) {
      const first = timelineStops[1] ?? timelineStops[0];
      const last = timelineStops[timelineStops.length - 1];
      setStartCity(first.city);
      setEndCity(last.city);
      setFromStopId(first.id);
      setToStopId(last.id);
      setMidwayJoin(true);
    } else if (trip.cities && trip.cities.length > 2) {
      setStartCity(trip.cities[1]);
      setEndCity(trip.cities[trip.cities.length - 1]);
      setFromStopId(null);
      setToStopId(null);
      setMidwayJoin(true);
    } else {
      toast(t('tripDetailModal.midwayOnlyFor3Plus'), 'info');
    }
  };

  const tripStartDate = toDate(trip.startDate);
  const tripEndDate = toDate(trip.endDate);
  const tripDurationDays =
    tripStartDate && tripEndDate
      ? Math.max(1, Math.round((tripEndDate.getTime() - tripStartDate.getTime()) / 86400000) + 1)
      : 1;
  const joiningDayOptions = Array.from({ length: tripDurationDays }, (_, i) => i);
  const joiningDateIso = (() => {
    if (joiningDayIndex === null || !tripStartDate) return undefined;
    const d = new Date(tripStartDate.getTime());
    d.setDate(d.getDate() + joiningDayIndex);
    return d.toISOString();
  })();

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
    // Joining needs an account: POST /interactions/join-request is behind a
    // required token, so a guest tapping this used to get a 401 error toast
    // with no way forward. The app is browse-before-login by design, so the
    // boundary is the auth screen, not a failed request.
    if (!isLoggedIn) {
      onClose();
      router.push('/auth');
      return;
    }
    // adjustedPrice is deliberately not sent — the server computes and owns
    // it from the trip's route (docs/REMEDIATION.md §8.6). The preview
    // shown on the success screen below uses the identical formula
    // (calculateMidwayPrice above), so it always matches what gets stored.
    joinTrip(
      trip.id,
      midwayJoin
        ? {
            midway: true,
            fromCity: startCity,
            toCity: endCity,
            familyMemberCount: familyMemberCount || undefined,
            fromStopId: fromStopId ?? undefined,
            toStopId: toStopId ?? undefined,
            joiningDate: joiningDateIso,
          }
        : undefined,
    );

    setJoinedMsg(true);
    setTimeout(() => {
      setJoinedMsg(false);
      onClose();
      setMidwayJoin(false);
      setFamilyMemberCount(0);
      setFromStopId(null);
      setToStopId(null);
      setJoiningDayIndex(null);
    }, 2200);
  };

  const handleCancelRequest = () => {
    cancelJoinRequest(trip.id);
  };

  const handleAskOrganizer = async () => {
    if (!isLoggedIn) {
      onClose();
      router.push('/auth');
      return;
    }
    setOpeningInquiry(true);
    try {
      const thread = await apiService.openTripInquiry(trip.id);
      if (!thread) throw new Error('No thread returned');
      onClose();
      router.push({ pathname: '/(tabs)/chat', params: { roomId: thread.chatRoomId } });
    } catch (e) {
      toast(errorToastMessage(e, t('tripDetailModal.couldNotOpenChat')), 'error');
    } finally {
      setOpeningInquiry(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom }]}>
          {/* Drag Handle */}
          <View style={styles.sheetHandle} />

          {joinedMsg ? (
            <View style={styles.successContainer}>
              <CheckCircle size={54} color={C.green} />
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
                  {organizerAvatarUri ? (
                    <Image
                      source={{ uri: organizerAvatarUri }}
                      style={styles.organizerAvatarImg}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  ) : (
                    <View style={styles.organizerAvatarWrap}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: C.accent }}>
                        {organizerName ? organizerName.charAt(0).toUpperCase() : 'O'}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalOrganizerName}>{organizerName}</Text>
                    {/* No "Background-Verified Organizer" badge: this product
                        has no background-verification feature and the trip
                        payload carries no verification field, so the shield
                        rendered identically for every organizer on every trip
                        — a fabricated trust signal of exactly the kind
                        docs/REMEDIATION.md §2.6 removed for "Verified Guide".
                        The organizer's real name is the only claim the data
                        supports here. */}
                    <Text style={styles.modalOrganizerRole}>{t('tripDetailModal.organizerRole')}</Text>
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

                {/* The organizer's own summary of the trip. */}
                {detail?.description ? (
                  <>
                    <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.aboutThisTrip')}</Text>
                    <Text style={styles.tripDescriptionText}>{detail.description}</Text>
                  </>
                ) : null}

                {/* Itinerary — the organizer's real timeline when they built
                    one, with how long the group stays at each stop, how it
                    travels to reach it and what it does there. Falls back to
                    the plain city list for trips created before the Timeline
                    tab was wired to the backend, rather than inventing the
                    detail those trips never had. */}
                <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.itineraryPath')}</Text>

                {detailState.kind === 'loading' ? (
                  <View style={styles.timelineStateWrap}>
                    <ActivityIndicator size="small" color={C.accent} />
                  </View>
                ) : detailState.kind === 'error' ? (
                  <View style={styles.timelineStateWrap}>
                    <Text style={styles.timelineStateText}>{t('tripDetailModal.couldNotLoadItinerary')}</Text>
                    <TouchableOpacity
                      onPress={() => void detailQuery.refetch()}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.retry')}
                      style={styles.timelineRetryBtn}
                    >
                      <Text style={styles.timelineRetryText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : detail && detail.timeline.length > 0 ? (
                  <View style={styles.timelineList}>
                    {detail.timeline.map((stop, i) => {
                      const transit = formatTransitTime(stop.transitTimeMinutes);
                      const modeLabel = stop.transitMode
                        ? t(`tripDetailModal.mode${stop.transitMode}`)
                        : null;
                      return (
                        <View key={`${stop.city}-${stop.order}`}>
                          {/* The leg travelled to reach this stop. Absent on
                              the first — nothing precedes it. */}
                          {i > 0 && (transit || modeLabel) ? (
                            <View style={styles.timelineTransitRow}>
                              <View style={styles.timelineTransitLine} />
                              <Navigation size={11} color={C.textSecondary} />
                              <Text style={styles.timelineTransitText}>
                                {[modeLabel, transit].filter(Boolean).join(' · ')}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.timelineStopCard}>
                            <View style={styles.timelineStopHeader}>
                              <View style={styles.timelineStopIndex}>
                                <Text style={styles.timelineStopIndexText}>{stop.order + 1}</Text>
                              </View>
                              <Text style={styles.timelineStopCity}>{stop.city}</Text>
                              {stop.stayDays !== null && stop.stayDays > 0 ? (
                                <View style={styles.timelineStayPill}>
                                  <Text style={styles.timelineStayText}>
                                    {t('tripDetailModal.nightsCount', { count: stop.stayDays })}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            {stop.activities ? (
                              <Text style={styles.timelineStopActivities}>{stop.activities}</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.modalItineraryRow}>
                    {trip.cities && trip.cities.map((city: string, i: number) => (
                      <View key={city} style={styles.itineraryCityCard}>
                        <Text style={styles.itineraryCityText}>{city}</Text>
                        <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.cityNumber', { number: i + 1 })}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Per-checkpoint guide selection + scoped join request —
                    find-guides.tsx reads this trip's real timeline stops
                    and their assignedGuides when opened with ?tripId=. */}
                {hasCheckpoints && !isMyTrip ? (
                  <TouchableOpacity
                    style={styles.findGuideLink}
                    onPress={() => {
                      onClose();
                      router.push({ pathname: '/find-guides', params: { tripId: trip.id } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('tripDetailModal.findGuideForCheckpoint')}
                  >
                    <UserCheck size={14} color={C.blueText} />
                    <Text style={styles.findGuideLinkText}>{t('tripDetailModal.findGuideForCheckpoint')}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Questions are free: this is deliberately not gated on
                    seats or join state, because it exists to be used
                    *before* deciding to request one. */}
                {!isMyTrip ? (
                  <TouchableOpacity
                    style={styles.findGuideLink}
                    onPress={handleAskOrganizer}
                    disabled={openingInquiry}
                    accessibilityRole="button"
                    accessibilityLabel={t('tripDetailModal.askOrganizer')}
                  >
                    <MessageCircle size={14} color={C.blueText} />
                    <Text style={styles.findGuideLinkText}>
                      {openingInquiry ? t('tripDetailModal.openingChat') : t('tripDetailModal.askOrganizer')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* What the organizer expects travellers to bring. */}
                {detail && detail.checklist.length > 0 ? (
                  <>
                    <Text style={[styles.formSectionTitle, { marginTop: 14 }]}>{t('tripDetailModal.whatToPack')}</Text>
                    <View style={styles.packListWrap}>
                      {detail.checklist.map((item) => (
                        <View key={item.id} style={styles.packItemRow}>
                          <CheckCircle size={13} color={C.greenText} />
                          <Text style={styles.packItemText}>{item.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

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
                    <UserCheck size={12} color={trip.guideIncluded ? C.greenText : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.localGuide', { value: trip.guideIncluded ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Hotel size={12} color={trip.hotelIncluded !== false ? C.greenText : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.hotelStay', { value: trip.hotelIncluded !== false ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    <Utensils size={12} color={trip.foodIncluded ? C.greenText : C.textSecondary} />
                    <Text style={styles.inclusionText}>
                      {t('tripDetailModal.mealsFood', { value: trip.foodIncluded ? t('tripDetailModal.yes') : t('tripDetailModal.no') })}
                    </Text>
                  </View>
                  <View style={styles.inclusionCell}>
                    {tripName.toLowerCase().includes('bike') ? (
                      <Bike size={12} color={trip.cabIncluded !== false ? C.greenText : C.textSecondary} />
                    ) : (
                      <Bus size={12} color={trip.cabIncluded !== false ? C.greenText : C.textSecondary} />
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
                        {hasCheckpoints
                          ? timelineStops.slice(0, timelineStops.length - 1).map((stop) => {
                              const isSelected = fromStopId === stop.id;
                              return (
                                <TouchableOpacity
                                  key={stop.id}
                                  style={[
                                    styles.citySelectChip,
                                    isSelected && styles.citySelectChipActive,
                                    { borderColor: isSelected ? C.accent : C.cardBorder }
                                  ]}
                                  onPress={() => {
                                    setStartCity(stop.city);
                                    setFromStopId(stop.id);
                                    const toStop = timelineStops.find((s) => s.id === toStopId);
                                    if (!toStop || toStop.order <= stop.order) {
                                      const next = timelineStops.find((s) => s.order > stop.order);
                                      if (next) {
                                        setEndCity(next.city);
                                        setToStopId(next.id);
                                      }
                                    }
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={stop.city}
                                  accessibilityState={{ selected: isSelected }}
                                >
                                  <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>{stop.city}</Text>
                                </TouchableOpacity>
                              );
                            })
                          : trip.cities.slice(0, trip.cities.length - 1).map((city: string) => {
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
                        {hasCheckpoints
                          ? timelineStops
                              .filter((stop) => {
                                const startStop = timelineStops.find((s) => s.id === fromStopId);
                                return !startStop || stop.order > startStop.order;
                              })
                              .map((stop) => {
                                const isSelected = toStopId === stop.id;
                                return (
                                  <TouchableOpacity
                                    key={stop.id}
                                    style={[
                                      styles.citySelectChip,
                                      isSelected && styles.citySelectChipActive,
                                      { borderColor: isSelected ? C.accent : C.cardBorder }
                                    ]}
                                    onPress={() => {
                                      setEndCity(stop.city);
                                      setToStopId(stop.id);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={stop.city}
                                    accessibilityState={{ selected: isSelected }}
                                  >
                                    <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>{stop.city}</Text>
                                  </TouchableOpacity>
                                );
                              })
                          : trip.cities
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

                    {/* Family Connect: how many family members, and which day
                        they join. Backend validates familyMemberCount (0-8)
                        and computes partySize = 1 + familyMemberCount, which
                        is what actually gets claimed/released as seats. */}
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.fieldLabel, { color: C.textSecondary, marginBottom: 6 }]}>{t('tripDetailModal.familyMembersJoining')}</Text>
                      <View style={styles.familyStepperRow}>
                        <TouchableOpacity
                          style={styles.familyStepperBtn}
                          onPress={() => setFamilyMemberCount((c) => Math.max(0, c - 1))}
                          accessibilityRole="button"
                          accessibilityLabel={t('tripDetailModal.decreaseFamilyMembers')}
                        >
                          <Text style={styles.familyStepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.familyStepperCount}>{familyMemberCount}</Text>
                        <TouchableOpacity
                          style={styles.familyStepperBtn}
                          onPress={() => setFamilyMemberCount((c) => Math.min(8, c + 1))}
                          accessibilityRole="button"
                          accessibilityLabel={t('tripDetailModal.increaseFamilyMembers')}
                        >
                          <Text style={styles.familyStepperBtnText}>+</Text>
                        </TouchableOpacity>
                        <Text style={[styles.familyStepperHint, { color: C.textSecondary }]}>
                          {t('tripDetailModal.partySizeHint', { count: 1 + familyMemberCount })}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.fieldLabel, { color: C.textSecondary, marginBottom: 6 }]}>{t('tripDetailModal.whenJoining')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.citySelectScroll}>
                        {joiningDayOptions.map((dayIdx) => {
                          const isSelected = joiningDayIndex === dayIdx;
                          const dayDate = tripStartDate ? new Date(tripStartDate.getTime() + dayIdx * 86400000) : null;
                          return (
                            <TouchableOpacity
                              key={dayIdx}
                              style={[
                                styles.citySelectChip,
                                isSelected && styles.citySelectChipActive,
                                { borderColor: isSelected ? C.accent : C.cardBorder }
                              ]}
                              onPress={() => setJoiningDayIndex(dayIdx)}
                              accessibilityRole="button"
                              accessibilityLabel={t('tripDetailModal.dayN', { day: dayIdx + 1 })}
                              accessibilityState={{ selected: isSelected }}
                            >
                              <Text style={[styles.citySelectChipText, { color: isSelected ? '#FFF' : C.text }, isSelected && { fontWeight: '700' }]}>
                                {t('tripDetailModal.dayN', { day: dayIdx + 1 })}{dayDate ? ` · ${formatDateShort(dayDate)}` : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>

                    <View style={styles.priceCalcRow}>
                      <Text style={{ fontSize: 12, color: C.textSecondary }}>{t('tripDetailModal.automaticPriceAdjustment')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: C.greenText }}>
                        ₹{calculateMidwayPrice() * (1 + familyMemberCount)}{' '}
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
                      {/* formatINR, not an inline `₹` + toLocaleString: money
                          crosses the wire as a string (CONVENTIONS.md §3), and
                          String.prototype.toLocaleString is a no-op, so this
                          rendered a raw "28500.00" beside a lone rupee sign. */}
                      <Text style={styles.pricingBarAmount}>
                        {formatINR(midwayJoin && startCity && endCity ? calculateMidwayPrice() : price)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pricingBarDivider} />
                  <View style={styles.pricingBarRight}>
                    <Text style={styles.pricingBarLabel}>{t('tripDetailModal.availability')}</Text>
                    <View style={styles.pricingBarSeatsRow}>
                      <Users size={12} color={trip.availableSeats > 0 ? C.greenText : C.redText} />
                      <Text style={[styles.pricingBarSeats, { color: trip.availableSeats > 0 ? C.greenText : C.redText }]}>
                        {t('tripDetailModal.seatsOpen', { available: trip.availableSeats, total: trip.totalSeats })}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Area — branches on the join request's REAL status
                    (joinRequestStatuses), not just membership in
                    requestedTrips. Before this fix, requestedTrips folded
                    PENDING/APPROVED/AWAITING_PAYMENT into one Set and every
                    branch here rendered the same "awaiting confirmation"
                    text even after the organizer had already approved. */}
                {isMyTrip ? null : (() => {
                  const myRequest = joinRequestStatuses.get(trip.id);
                  const status = myRequest?.status;

                  // Reading joinRequestStatuses alone, not requestedTrips —
                  // requestedTrips deliberately excludes REJECTED (see its
                  // own doc comment), so gating on it here made the REJECTED
                  // branch below unreachable: a declined request always fell
                  // through to "not requested" and the user was never told
                  // why, only that the button had reset.
                  if (!status) {
                    return (
                      <TouchableOpacity
                        style={styles.modalSubmitBtn}
                        onPress={handleRequestJoin}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel={joinCtaLabel}
                      >
                        <Text style={styles.modalSubmitBtnText}>{joinCtaLabel}</Text>
                      </TouchableOpacity>
                    );
                  }

                  if (status === 'APPROVED') {
                    return (
                      <View style={styles.requestedActionArea}>
                        <View style={styles.requestedStatusRow}>
                          <View style={styles.requestedStatusIcon}>
                            <CheckCircle size={18} color={C.greenText} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.requestedStatusTitle}>{t('tripDetailModal.requestApprovedTitle')}</Text>
                            <Text style={[styles.requestedStatusSub, { color: C.textSecondary }]}>
                              {t('tripDetailModal.requestApprovedSub', { count: myRequest.partySize })}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  }

                  if (status === 'AWAITING_PAYMENT') {
                    return (
                      <View style={styles.requestedActionArea}>
                        <View style={styles.requestedStatusRow}>
                          <View style={styles.requestedStatusIcon}>
                            <CheckCircle size={18} color={C.blueText} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.requestedStatusTitle}>{t('tripDetailModal.paymentRequiredTitle')}</Text>
                            <Text style={[styles.requestedStatusSub, { color: C.textSecondary }]}>
                              {t('tripDetailModal.paymentRequiredSub')}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.modalSubmitBtn}
                          onPress={() => {
                            onClose();
                            router.push({ pathname: '/trip-payment', params: { joinRequestId: myRequest.id } });
                          }}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel={t('tripDetailModal.completePayment')}
                        >
                          <Text style={styles.modalSubmitBtnText}>{t('tripDetailModal.completePayment')}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  if (status === 'REJECTED') {
                    return (
                      <View style={styles.requestedActionArea}>
                        <View style={styles.requestedStatusRow}>
                          <View style={styles.requestedStatusIcon}>
                            <X size={18} color={C.redText} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.requestedStatusTitle}>{t('tripDetailModal.requestRejectedTitle')}</Text>
                            <Text style={[styles.requestedStatusSub, { color: C.textSecondary }]}>
                              {t('tripDetailModal.requestRejectedSub')}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.modalSubmitBtn}
                          onPress={handleRequestJoin}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel={t('tripDetailModal.requestAgain')}
                        >
                          <Text style={styles.modalSubmitBtnText}>{t('tripDetailModal.requestAgain')}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  // PENDING — the original "awaiting confirmation" state.
                  return (
                    <View style={styles.requestedActionArea}>
                      <View style={styles.requestedStatusRow}>
                        <View style={styles.requestedStatusIcon}>
                          <CheckCircle size={18} color={C.greenText} />
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
                  );
                })()}
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
    borderColor: C.border,
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
    backgroundColor: C.borderGlow,
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
    color: C.text,
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
    color: C.text,
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
    color: C.white,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.border,
  },
  modalOrganizerName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },
  modalOrganizerRole: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
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
    backgroundColor: C.cardAlt,
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
    color: C.text,
    marginTop: 2,
  },
  detailCardDivider: {
    width: 1,
    backgroundColor: C.cardAlt,
    marginHorizontal: 12,
  },
  modalItineraryRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  tripDescriptionText: {
    fontSize: 13,
    lineHeight: 19,
    color: C.textSec,
    marginTop: 6,
  },
  timelineStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
    marginBottom: 20,
  },
  timelineStateText: {
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
  },
  timelineRetryBtn: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  timelineRetryText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.blueText,
  },
  timelineList: {
    marginTop: 8,
    marginBottom: 20,
  },
  // The leg travelled to reach the stop below it.
  timelineTransitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 11,
    paddingVertical: 4,
  },
  timelineTransitLine: {
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: C.border,
    marginRight: 4,
  },
  timelineTransitText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  timelineStopCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  timelineStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineStopIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineStopIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  timelineStopCity: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  timelineStayPill: {
    backgroundColor: C.blueGlow,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  timelineStayText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blueText,
  },
  timelineStopActivities: {
    fontSize: 12.5,
    lineHeight: 18,
    color: C.textSec,
    marginTop: 6,
  },
  packListWrap: {
    marginTop: 8,
    marginBottom: 20,
    gap: 7,
  },
  packItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packItemText: {
    flex: 1,
    fontSize: 13,
    color: C.textSec,
  },
  itineraryCityCard: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: C.accentLight,
  },
  itineraryCityText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text,
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
    color: C.text,
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
    backgroundColor: C.cardAlt,
    padding: 10,
    borderRadius: 10,
  },
  inclusionText: {
    fontSize: 12,
    color: C.text,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: C.border,
    marginBottom: 20,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
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
    backgroundColor: C.green,
  },
  toggleSwitchOff: {
    backgroundColor: C.borderGlow,
  },
  toggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.white,
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
    borderColor: C.border,
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
    borderColor: C.border,
    paddingTop: 10,
  },
  familyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  familyStepperBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyStepperBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.blueText,
  },
  familyStepperCount: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    minWidth: 20,
    textAlign: 'center',
  },
  familyStepperHint: {
    fontSize: 12,
    marginLeft: 4,
  },
  findGuideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 4,
  },
  findGuideLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.blueText,
  },
  pricingBar: {
    flexDirection: 'row',
    backgroundColor: C.cardAlt,
    borderColor: C.border,
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
  pricingBarAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
  },
  pricingBarDivider: {
    width: 1,
    backgroundColor: C.cardAlt,
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
    color: C.white,
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
    borderColor: C.greenGlow,
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
