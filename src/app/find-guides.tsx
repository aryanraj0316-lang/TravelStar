import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Clock from 'lucide-react-native/icons/clock';
import MapPin from 'lucide-react-native/icons/map-pin';
import Star from 'lucide-react-native/icons/star';
import { apiService } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import { formatINR } from '@/lib/money';
import { formatDateShort } from '@/lib/datetime';
import { errorToastMessage, toast } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';
import { Avatar, Button, ScreenEmpty, ScreenError, ScreenLoading, Sheet } from '@/components/ui';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { GuidePackage, PublicGuide } from '@/types/api';

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

const keyExtractor = (g: PublicGuide) => g.id;
const listFooter = <View style={{ height: 90 }} />;

export default function FindGuidesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn } = useApp();

  const [selected, setSelected] = useState<PublicGuide | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [travelDate, setTravelDate] = useState<Date | null>(null);

  const guidesQuery = useQuery({
    queryKey: queryKeys.guides(),
    queryFn: async (): Promise<PublicGuide[]> => (await apiService.getPublicGuides()) ?? [],
  });
  const guides = guidesQuery.data ?? [];
  const listState = sectionState(guidesQuery, guides.length > 0);

  const packagesQuery = useQuery({
    queryKey: queryKeys.guidePackages(selected?.id ?? ''),
    queryFn: async (): Promise<GuidePackage[]> => (await apiService.getGuidePackages(selected!.id)) ?? [],
    enabled: selected !== null,
  });
  const packages = packagesQuery.data ?? [];

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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.topNavRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>{t('findGuides.title')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

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
});
