import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Clock from 'lucide-react-native/icons/clock';
import MapPin from 'lucide-react-native/icons/map-pin';
import Star from 'lucide-react-native/icons/star';
import { apiService } from '@/services/api';
import type { TripTimelineStop } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import { formatINR } from '@/lib/money';
import { formatDateShort } from '@/lib/datetime';
import { errorToastMessage, toast } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';
import { Avatar, Button, ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { GuidePackage, GuideReview, PublicGuide, ReviewableEngagement } from '@/types/api';

/**
 * Browsing and booking a guide.
 *
 * GET /guides, GET /guides/:id/packages and the whole /bookings API existed
 * on the server, but nothing in the app called any of them: a guide could
 * publish a profile, packages and reels that no user of the app could
 * reach, and because no client could create a Booking, every guide's
 * earnings screen was zero by construction rather than by accident.
 */

/** The next 30 days, as the set of travel dates a booking can start on. */
function upcomingDates(count = 30): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

function TrustRow({ guide }: { guide: PublicGuide }) {
  const { t } = useTranslation();
  const verified = guide.verifiedStatus === 'VERIFIED';

  return (
    <View style={styles.trustRow}>
      <View style={[styles.badge, verified ? styles.badgeVerified : styles.badgeUnverified]}>
        <BadgeCheck size={11} color={verified ? C.greenText : C.textMuted} />
        <Text style={[styles.badgeText, { color: verified ? C.greenText : C.textMuted }]}>
          {verified ? t('findGuides.verified') : t('findGuides.notVerified')}
        </Text>
      </View>

      {/* Null rating means nobody has rated this guide. It is not 5 stars. */}
      {guide.rating === null ? (
        <Text style={styles.newGuide}>{t('findGuides.newGuide')}</Text>
      ) : (
        <View style={styles.ratingRow}>
          <Star size={11} color={C.amberText} />
          <Text style={styles.ratingText}>
            {t('findGuides.ratingWithCount', {
              rating: guide.rating.toFixed(1),
              count: guide.reviewCount,
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

function GuideCard({ guide, onPress }: { guide: PublicGuide; onPress: (g: PublicGuide) => void }) {
  const { t } = useTranslation();
  const displayName = guide.name ?? t('findGuides.unnamedGuide');

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => onPress(guide)}
      accessibilityRole="button"
      accessibilityLabel={t('findGuides.viewGuideLabel', { name: displayName })}
    >
      <View style={styles.cardHeader}>
        <Avatar uri={guide.avatar} name={displayName} size={46} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardName} numberOfLines={1}>
            {displayName}
          </Text>
          <TrustRow guide={guide} />
        </View>
        <View style={styles.rateBox}>
          <Text style={styles.rateAmount}>{formatINR(guide.dailyRate)}</Text>
          <Text style={styles.rateLabel}>{t('findGuides.perDay')}</Text>
        </View>
      </View>

      {guide.expertise.length > 0 && (
        <View style={styles.metaRow}>
          <MapPin size={12} color={C.green} />
          <Text style={styles.metaText} numberOfLines={1}>
            {guide.expertise.join(' · ')}
          </Text>
        </View>
      )}

      <View style={styles.metaRow}>
        <Clock size={12} color={C.textMuted} />
        <Text style={styles.metaText} numberOfLines={1}>
          {t('findGuides.experienceYears', { count: guide.experienceYears })}
          {guide.languages.length > 0 ? ` · ${guide.languages.join(', ')}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function CheckpointRow({
  stop,
  position,
  onPress,
}: {
  stop: TripTimelineStop;
  position: number;
  onPress: (s: TripTimelineStop) => void;
}) {
  const { t } = useTranslation();
  const hasGuides = stop.assignedGuides.length > 0;

  return (
    <TouchableOpacity
      style={styles.checkpointRow}
      activeOpacity={hasGuides ? 0.85 : 1}
      disabled={!hasGuides}
      onPress={() => onPress(stop)}
      accessibilityRole={hasGuides ? 'button' : undefined}
      accessibilityLabel={stop.city}
    >
      <View style={styles.checkpointOrderBadge}>
        <Text style={styles.checkpointOrderText}>{position}</Text>
      </View>
      <View style={styles.checkpointBody}>
        <Text style={styles.checkpointCity}>{stop.city}</Text>
        {hasGuides ? (
          <View style={styles.guideChipRow}>
            {stop.assignedGuides.map((g) => (
              <View key={g.guideProfileId} style={styles.guideChip}>
                <Text style={styles.guideChipText} numberOfLines={1}>
                  {g.name}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noGuideText}>{t('findGuides.noGuideAssigned')}</Text>
        )}
      </View>
      {hasGuides && <ChevronRight size={16} color={C.textMuted} />}
    </TouchableOpacity>
  );
}

const keyExtractor = (g: PublicGuide) => g.id;
const listFooter = <View style={{ height: 90 }} />;

export default function FindGuidesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const { isLoggedIn, joinTrip, requestedTrips, joinRequestStatuses } = useApp();

  const [selected, setSelected] = useState<PublicGuide | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [travelDate, setTravelDate] = useState<Date | null>(null);
  const [checkpointsExpanded, setCheckpointsExpanded] = useState(true);
  const [joinStop, setJoinStop] = useState<TripTimelineStop | null>(null);
  const [joinFromStopId, setJoinFromStopId] = useState<string | null>(null);
  const [joinToStopId, setJoinToStopId] = useState<string | null>(null);

  const guidesQuery = useQuery({
    queryKey: queryKeys.guides(),
    queryFn: async (): Promise<PublicGuide[]> => (await apiService.getPublicGuides()) ?? [],
  });
  const guides = guidesQuery.data ?? [];
  const listState = sectionState(guidesQuery, guides.length > 0);

  const tripDetailQuery = useQuery({
    queryKey: queryKeys.trip(tripId ?? ''),
    queryFn: () => apiService.getTripDetail(tripId!),
    enabled: !!tripId,
  });
  const trip = tripDetailQuery.data ?? null;
  const timelineStops = [...(trip?.timeline ?? [])].sort((a, b) => a.order - b.order);

  const tripAlreadyRequested = tripId ? requestedTrips.has(tripId) : false;
  const tripRequestStatus = tripId ? joinRequestStatuses.get(tripId)?.status : undefined;

  const packagesQuery = useQuery({
    queryKey: queryKeys.guidePackages(selected?.id ?? ''),
    queryFn: async (): Promise<GuidePackage[]> => (await apiService.getGuidePackages(selected!.id)) ?? [],
    enabled: selected !== null,
  });
  const packages = packagesQuery.data ?? [];

  // Reviews are public, so they load for anyone reading a guide's card.
  const reviewsQuery = useQuery({
    queryKey: ['guide', selected?.id ?? '', 'reviews'],
    queryFn: async (): Promise<GuideReview[]> => (await apiService.getGuideReviews(selected!.id)) ?? [],
    enabled: selected !== null,
  });
  const reviews = reviewsQuery.data ?? [];

  // What this user may review the guide for. Empty means they have not
  // travelled with them, so no review action is offered at all.
  const eligibilityQuery = useQuery({
    queryKey: ['guide', selected?.id ?? '', 'review-eligibility'],
    queryFn: async (): Promise<ReviewableEngagement[]> =>
      (await apiService.getGuideReviewEligibility(selected!.id)) ?? [],
    enabled: selected !== null && isLoggedIn,
  });
  const reviewableEngagement = (eligibilityQuery.data ?? []).find((e) => !e.alreadyReviewed) ?? null;

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!selected || !reviewableEngagement) throw new Error('No engagement to review');
      return apiService.submitGuideReview(selected.id, {
        rating: reviewRating,
        comment: reviewComment.trim(),
        ...(reviewableEngagement.kind === 'TRIP'
          ? { tripId: reviewableEngagement.id }
          : { bookingId: reviewableEngagement.id }),
      });
    },
    onSuccess: async () => {
      toast(t('findGuides.reviewSubmitted'), 'success');
      setReviewComment('');
      setReviewRating(5);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['guide', selected?.id ?? '', 'reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['guide', selected?.id ?? '', 'review-eligibility'] }),
        // The guide's headline rating is recomputed server-side on submit.
        queryClient.invalidateQueries({ queryKey: queryKeys.guides() }),
      ]);
    },
    onError: (e) => toast(errorToastMessage(e, t('findGuides.reviewFailed')), 'error'),
  });

  const booking = useMutation({
    mutationFn: async (vars: { packageId: string; travelDate: string }) =>
      apiService.createGuideBooking({ packageId: vars.packageId, travelDate: vars.travelDate }),
    onSuccess: async () => {
      toast(t('findGuides.bookingRequested'), 'success');
      closeSheet();
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBookings() });
    },
    onError: (e) => toast(errorToastMessage(e, t('findGuides.bookingFailed')), 'error'),
  });

  const openGuide = (guide: PublicGuide) => {
    setSelected(guide);
    setSelectedPackageId(null);
    setTravelDate(null);
  };

  const closeSheet = () => {
    setSelected(null);
    setSelectedPackageId(null);
    setTravelDate(null);
  };

  const requestBooking = () => {
    if (!isLoggedIn) {
      closeSheet();
      router.push('/auth');
      return;
    }
    if (!selectedPackageId || !travelDate) return;
    // The server reads the price off the package; it is never sent from here.
    booking.mutate({ packageId: selectedPackageId, travelDate: travelDate.toISOString() });
  };

  const canBook = selectedPackageId !== null && travelDate !== null && !booking.isPending;

  const openJoinStop = (stop: TripTimelineStop) => {
    setJoinStop(stop);
    setJoinFromStopId(stop.id);
    setJoinToStopId(stop.id);
  };

  const closeJoinSheet = () => {
    setJoinStop(null);
    setJoinFromStopId(null);
    setJoinToStopId(null);
  };

  const confirmJoinCheckpoint = () => {
    if (!isLoggedIn) {
      closeJoinSheet();
      router.push('/auth');
      return;
    }
    if (!tripId || !joinFromStopId || !joinToStopId) return;
    const fromStop = timelineStops.find((s) => s.id === joinFromStopId);
    const toStop = timelineStops.find((s) => s.id === joinToStopId);
    if (!fromStop || !toStop) return;
    // The server owns price math from fromStopId/toStopId; fromCity/toCity
    // ride alongside only because its price-preview formula still keys off them.
    joinTrip(tripId, {
      midway: true,
      fromCity: fromStop.city,
      toCity: toStop.city,
      fromStopId: fromStop.id,
      toStopId: toStop.id,
    });
    closeJoinSheet();
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.topNavRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <ArrowLeft size={18} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>
          {trip ? t('findGuides.titleForTrip', { name: trip.name }) : t('findGuides.title')}
        </Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      {tripId && (
        <View style={styles.checkpointsSection}>
          <TouchableOpacity
            style={styles.checkpointsHeader}
            onPress={() => setCheckpointsExpanded((e) => !e)}
            accessibilityRole="button"
            accessibilityLabel={t('findGuides.checkpointsOnThisTrip')}
            accessibilityState={{ expanded: checkpointsExpanded }}
          >
            <Text style={styles.checkpointsTitle}>{t('findGuides.checkpointsOnThisTrip')}</Text>
            {checkpointsExpanded ? (
              <ChevronUp size={18} color={C.textMuted} />
            ) : (
              <ChevronDown size={18} color={C.textMuted} />
            )}
          </TouchableOpacity>

          {checkpointsExpanded && (
            <View style={styles.checkpointsList}>
              {tripDetailQuery.isPending ? (
                <Text style={styles.sheetMuted}>{t('findGuides.loadingCheckpoints')}</Text>
              ) : tripDetailQuery.isError ? (
                <Text style={styles.sheetMuted}>{t('findGuides.checkpointsLoadFailed')}</Text>
              ) : timelineStops.length === 0 ? (
                <Text style={styles.sheetMuted}>{t('findGuides.noCheckpoints')}</Text>
              ) : (
                timelineStops.map((stop, idx) => (
                  <CheckpointRow key={stop.id} stop={stop} position={idx + 1} onPress={openJoinStop} />
                ))
              )}
            </View>
          )}
        </View>
      )}

      {listState.kind === 'loading' ? (
        <ScreenLoading label={t('findGuides.loading')} />
      ) : listState.kind === 'error' ? (
        <ScreenError
          message={listState.offline ? t('common.offlineMessage') : t('findGuides.loadFailed')}
          onRetry={() => guidesQuery.refetch()}
        />
      ) : guides.length === 0 ? (
        <ScreenEmpty title={t('findGuides.emptyTitle')} message={t('findGuides.emptyMessage')} />
      ) : (
        <FlatList
          data={guides}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <GuideCard guide={item} onPress={openGuide} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={guidesQuery.isRefetching}
              onRefresh={() => guidesQuery.refetch()}
              tintColor={C.blue}
            />
          }
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ListFooterComponent={listFooter}
        />
      )}

      <Sheet
        visible={selected !== null}
        onClose={closeSheet}
        title={selected?.name ?? t('findGuides.unnamedGuide')}
      >
        {selected && (
          <View style={styles.sheetBody}>
            <TrustRow guide={selected} />

            {selected.verifiedStatus !== 'VERIFIED' && (
              <Text style={styles.unverifiedNotice}>{t('findGuides.unverifiedNotice')}</Text>
            )}

            <Text style={styles.sheetSectionTitle}>
              {t('findGuides.reviewsHeading', { count: reviews.length })}
            </Text>

            {reviewsQuery.isPending ? (
              <Text style={styles.sheetMuted}>{t('findGuides.loadingReviews')}</Text>
            ) : reviews.length === 0 ? (
              <Text style={styles.sheetMuted}>{t('findGuides.noReviewsYet')}</Text>
            ) : (
              reviews.slice(0, 3).map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeaderRow}>
                    <Text style={styles.reviewAuthor}>{review.reviewerName}</Text>
                    <View style={styles.ratingRow}>
                      <Star size={11} color={C.amberText} />
                      <Text style={styles.ratingText}>{review.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  {review.tripName ? <Text style={styles.reviewTripName}>{review.tripName}</Text> : null}
                  {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                </View>
              ))
            )}

            {/* Offered only when the server says this user actually has a
                concluded trip or booking with the guide to review. */}
            {reviewableEngagement ? (
              <View style={styles.reviewComposer}>
                <Text style={styles.sheetSectionTitle}>{t('findGuides.writeReview')}</Text>
                <Text style={styles.sheetMuted}>
                  {t('findGuides.reviewingEngagement', { label: reviewableEngagement.label })}
                </Text>
                <View style={styles.starPickerRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setReviewRating(star)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: reviewRating === star }}
                      accessibilityLabel={t('findGuides.starCount', { count: star })}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <Star
                        size={26}
                        color={star <= reviewRating ? C.amberText : C.textMuted}
                        fill={star <= reviewRating ? C.amberText : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  placeholder={t('findGuides.reviewPlaceholder')}
                  placeholderTextColor={C.textMuted}
                  multiline
                  maxLength={2000}
                />
                <Button
                  label={t('findGuides.submitReview')}
                  onPress={() => submitReview.mutate()}
                  loading={submitReview.isPending}
                />
              </View>
            ) : null}

            <Text style={styles.sheetSectionTitle}>{t('findGuides.packages')}</Text>

            {packagesQuery.isPending ? (
              <Text style={styles.sheetMuted}>{t('findGuides.loadingPackages')}</Text>
            ) : packagesQuery.isError ? (
              <Text style={styles.sheetMuted}>{t('findGuides.packagesFailed')}</Text>
            ) : packages.length === 0 ? (
              <Text style={styles.sheetMuted}>{t('findGuides.noPackages')}</Text>
            ) : (
              packages.map((pkg) => {
                const isSelected = pkg.id === selectedPackageId;
                return (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[styles.pkgCard, isSelected && styles.pkgCardSelected]}
                    onPress={() => setSelectedPackageId(pkg.id)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={pkg.title}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pkgTitle}>{pkg.title}</Text>
                      {pkg.description ? (
                        <Text style={styles.pkgDesc} numberOfLines={2}>
                          {pkg.description}
                        </Text>
                      ) : null}
                      <Text style={styles.pkgMeta}>
                        {t('findGuides.packageDays', { count: pkg.durationDays })}
                        {pkg.citiesIncluded.length > 0 ? ` · ${pkg.citiesIncluded.join(', ')}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.pkgPrice}>{formatINR(pkg.price)}</Text>
                  </TouchableOpacity>
                );
              })
            )}

            {selectedPackageId !== null && (
              <>
                <Text style={styles.sheetSectionTitle}>{t('findGuides.chooseDate')}</Text>
                <FlatList
                  horizontal
                  data={upcomingDates()}
                  keyExtractor={(d) => d.toISOString()}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dateStrip}
                  renderItem={({ item }) => {
                    const isSelected = travelDate?.toDateString() === item.toDateString();
                    return (
                      <TouchableOpacity
                        style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                        onPress={() => setTravelDate(item)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={formatDateShort(item.toISOString())}
                      >
                        <Text style={[styles.dateChipText, isSelected && styles.dateChipTextSelected]}>
                          {formatDateShort(item.toISOString())}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}

            {/* v1 has no payment provider, so this is a request the guide
                accepts or declines. Nothing here claims money moved. */}
            <Text style={styles.sheetMuted}>{t('findGuides.requestExplainer')}</Text>

            <Button
              label={isLoggedIn ? t('findGuides.requestBooking') : t('findGuides.signInToBook')}
              onPress={requestBooking}
              disabled={isLoggedIn && !canBook}
              loading={booking.isPending}
            />
          </View>
        )}
      </Sheet>

      <Sheet
        visible={joinStop !== null}
        onClose={closeJoinSheet}
        title={joinStop ? t('findGuides.requestJoinForCheckpoint', { city: joinStop.city }) : ''}
      >
        {joinStop && (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetSectionTitle}>{t('findGuides.assignedGuides')}</Text>
            <View style={styles.guideChipRow}>
              {joinStop.assignedGuides.map((g) => (
                <View key={g.guideProfileId} style={styles.guideChip}>
                  <Text style={styles.guideChipText}>{g.name}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sheetSectionTitle}>{t('findGuides.joinFromCheckpoint')}</Text>
            <FlatList
              horizontal
              data={timelineStops}
              keyExtractor={(s) => s.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStrip}
              renderItem={({ item }) => {
                const isSelected = joinFromStopId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                    onPress={() => {
                      setJoinFromStopId(item.id);
                      const currentTo = timelineStops.find((s) => s.id === joinToStopId);
                      if (!currentTo || currentTo.order < item.order) setJoinToStopId(item.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={item.city}
                  >
                    <Text style={[styles.dateChipText, isSelected && styles.dateChipTextSelected]}>{item.city}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <Text style={styles.sheetSectionTitle}>{t('findGuides.joinToCheckpoint')}</Text>
            <FlatList
              horizontal
              data={timelineStops.filter((s) => {
                const fromStop = timelineStops.find((f) => f.id === joinFromStopId);
                return !fromStop || s.order >= fromStop.order;
              })}
              keyExtractor={(s) => s.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStrip}
              renderItem={({ item }) => {
                const isSelected = joinToStopId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                    onPress={() => setJoinToStopId(item.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={item.city}
                  >
                    <Text style={[styles.dateChipText, isSelected && styles.dateChipTextSelected]}>{item.city}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <Text style={styles.sheetMuted}>{t('findGuides.checkpointRequestExplainer')}</Text>

            {tripAlreadyRequested ? (
              <Text style={styles.requestSentText}>
                {tripRequestStatus === 'APPROVED'
                  ? t('findGuides.requestApproved')
                  : tripRequestStatus === 'AWAITING_PAYMENT'
                    ? t('findGuides.requestAwaitingPayment')
                    : t('findGuides.requestSent')}
              </Text>
            ) : (
              <Button
                label={isLoggedIn ? t('findGuides.requestJoin') : t('findGuides.signInToJoin')}
                onPress={confirmJoinCheckpoint}
                disabled={isLoggedIn && (!joinFromStopId || !joinToStopId)}
              />
            )}
          </View>
        )}
      </Sheet>
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
  topNavTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeaderText: { flex: 1, gap: 5 },
  cardName: { fontSize: 14.5, fontWeight: '800', color: C.text },
  rateBox: { alignItems: 'flex-end' },
  rateAmount: { fontSize: 14, fontWeight: '800', color: C.amberText },
  rateLabel: { fontSize: 11, color: C.textMuted },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeVerified: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
  badgeUnverified: { backgroundColor: C.cardAlt, borderColor: C.border },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 11.5, color: C.textSec, fontWeight: '600' },
  newGuide: { fontSize: 11.5, color: C.textMuted, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: C.textSec, flex: 1 },
  sheetBody: { gap: 12, paddingBottom: 8 },
  sheetSectionTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 4 },
  sheetMuted: { fontSize: 12, color: C.textMuted, lineHeight: 17 },
  reviewCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    gap: 4,
  },
  reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewAuthor: { fontSize: 12.5, fontWeight: '700', color: C.text },
  reviewTripName: { fontSize: 11.5, color: C.textMuted },
  reviewComment: { fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  reviewComposer: { gap: 8, marginTop: 4 },
  starPickerRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  reviewInput: {
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    minHeight: 72,
    color: C.text,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  unverifiedNotice: { fontSize: 12, color: C.amberText, lineHeight: 17 },
  pkgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  pkgCardSelected: { borderColor: C.blue, backgroundColor: 'rgba(59,130,246,0.08)' },
  pkgTitle: { fontSize: 13.5, fontWeight: '700', color: C.text },
  pkgDesc: { fontSize: 12, color: C.textSec, marginTop: 2 },
  pkgMeta: { fontSize: 11.5, color: C.textMuted, marginTop: 4 },
  pkgPrice: { fontSize: 14, fontWeight: '800', color: C.amberText },
  dateStrip: { gap: 8, paddingVertical: 2 },
  dateChip: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 12,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  dateChipSelected: { borderColor: C.blue, backgroundColor: 'rgba(59,130,246,0.12)' },
  dateChipText: { fontSize: 12, fontWeight: '600', color: C.textSec },
  dateChipTextSelected: { color: C.blue, fontWeight: '800' },
  checkpointsSection: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  checkpointsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    minHeight: MIN_TOUCH_TARGET,
  },
  checkpointsTitle: { fontSize: 13.5, fontWeight: '800', color: C.text },
  checkpointsList: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  checkpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  checkpointOrderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointOrderText: { fontSize: 11, fontWeight: '800', color: C.textSec },
  checkpointBody: { flex: 1, gap: 4 },
  checkpointCity: { fontSize: 13.5, fontWeight: '700', color: C.text },
  guideChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  guideChip: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  guideChipText: { fontSize: 11, fontWeight: '700', color: C.greenText },
  noGuideText: { fontSize: 11.5, color: C.textMuted, fontStyle: 'italic' },
  requestSentText: { fontSize: 12.5, fontWeight: '700', color: C.greenText, textAlign: 'center' },
});
