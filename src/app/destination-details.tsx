import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Award from 'lucide-react-native/icons/award';
import Coffee from 'lucide-react-native/icons/coffee';
import Compass from 'lucide-react-native/icons/compass';
import Globe from 'lucide-react-native/icons/globe';
import Heart from 'lucide-react-native/icons/heart';
import Home from 'lucide-react-native/icons/house';
import MapPinned from 'lucide-react-native/icons/map-pinned';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import Sun from 'lucide-react-native/icons/sun';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/lib/query-keys';
import { apiService, type SavedDestination } from '@/services/api';
import { useApp } from '@/store/AppContext';
import { errorToastMessage, toast } from '@/lib/feedback';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Button, Card, ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');


// This screen used to render a hardcoded client-side DESTINATIONS_DATABASE
// constant keyed by a fabricated numeric id, plus a fake "simulated video
// player" that streamed nothing (docs/REMEDIATION.md §8.19). It now loads
// the real row from GET /destinations/:id. There is no reviews section and
// no video player: no review-authoring feature exists yet (§8.14, not
// built) and there is no real video content — fabricating either would be
// exactly the mock data §0.2 bans.
export default function DestinationDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const destId = typeof params.id === 'string' ? params.id : '';

  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const { isLoggedIn } = useApp();
  const queryClient = useQueryClient();

  // Whether this destination is bookmarked. This used to be a local
  // `useState(false)` that the heart button toggled: it persisted nowhere,
  // reset the moment the screen unmounted, and the profile screen's "Saved
  // Destinations" list had no way to ever receive it. It is now the real
  // server-side bookmark (PUT/DELETE /destinations/:id/saved).
  const { data: savedDestinations } = useQuery({
    queryKey: queryKeys.savedDestinations(),
    queryFn: async () => (await apiService.getSavedDestinations()) ?? [],
    enabled: isLoggedIn,
  });
  const isSaved = !!savedDestinations?.some((d) => d.id === destId);

  const toggleSaved = useMutation({
    mutationFn: async (nextSaved: boolean) =>
      nextSaved ? apiService.saveDestination(destId) : apiService.unsaveDestination(destId),
    // Optimistic: the heart fills the instant it is tapped, and rolls back
    // to the server's truth if the write fails.
    onMutate: async (nextSaved: boolean) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.savedDestinations() });
      const previous = queryClient.getQueryData<SavedDestination[]>(queryKeys.savedDestinations());
      if (destination) {
        queryClient.setQueryData<SavedDestination[]>(queryKeys.savedDestinations(), (current = []) =>
          nextSaved
            ? [
                {
                  id: destination.id,
                  name: destination.name,
                  tags: destination.tags,
                  rating: destination.rating,
                  image: destination.image,
                  savedAt: new Date().toISOString(),
                },
                ...current.filter((d) => d.id !== destination.id),
              ]
            : current.filter((d) => d.id !== destination.id),
        );
      }
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.savedDestinations(), context.previous);
      }
      toast(errorToastMessage(err, t('destinationDetails.couldNotSave')), 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedDestinations() });
    },
  });

  const handleToggleSaved = () => {
    // Bookmarking is per-account, so it needs one. Sending a guest to the
    // auth screen is the boundary everywhere else in this app uses, rather
    // than firing a request that would 401.
    if (!isLoggedIn) {
      router.push('/auth');
      return;
    }
    toggleSaved.mutate(!isSaved);
  };

  const {
    data: destination,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.destination(destId),
    queryFn: () => apiService.getDestination(destId),
    enabled: destId.length > 0,
  });

  const getSpecialtyIcon = (iconName: string) => {
    switch (iconName) {
      case 'adventure':
        return <Compass size={18} color={C.blue} />;
      case 'cuisine':
        return <Coffee size={18} color={C.orange} />;
      case 'heritage':
        return <Award size={18} color={C.green} />;
      case 'nature':
        return <Sun size={18} color={C.cyan} />;
      case 'culture':
        return <Globe size={18} color={C.orange} />;
      default:
        return <Home size={18} color={C.blue} />;
    }
  };

    const insets = useSafeAreaInsets();
  const renderHeader = (title: string) => (
    <View style={[styles.floatingHeader, { top: Math.max(insets.top + 8, 16) }]}>
      <TouchableOpacity
        style={styles.circleHeaderBtn}
        activeOpacity={0.8}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('destinationDetails.goBack')}
      >
        <ArrowLeft size={20} color="#0F172A" strokeWidth={2.4} />
      </TouchableOpacity>
      <Text style={styles.headerTitleText} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity
        style={styles.circleHeaderBtn}
        activeOpacity={0.8}
        onPress={handleToggleSaved}
        disabled={!destination || toggleSaved.isPending}
        accessibilityRole="button"
        accessibilityLabel={
          isSaved ? t('destinationDetails.removeFromFavourites') : t('destinationDetails.addToFavourites')
        }
        accessibilityState={{ selected: isSaved, disabled: !destination || toggleSaved.isPending }}
      >
        <Heart size={20} color={isSaved ? '#EF4444' : '#0F172A'} fill={isSaved ? '#EF4444' : 'transparent'} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading || (destId.length > 0 && !destination && !isError)) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        {renderHeader(t('destinationDetails.headerFallback'))}
        <ScreenLoading label={t('destinationDetails.loadingDestination')} />
      </SafeAreaView>
    );
  }

  // ── Error / not found / no id ──────────────────────────────────────
  if (isError || !destination || destId.length === 0) {
    const notFound =
      destId.length === 0 ||
      (error as { code?: string } | null)?.code === 'DESTINATION_NOT_FOUND' ||
      (error as { statusCode?: number } | null)?.statusCode === 404;
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        {renderHeader(t('destinationDetails.headerFallback'))}
        {notFound ? (
          <ScreenEmpty title={t('destinationDetails.notFoundTitle')} message={t('destinationDetails.notFoundMessage')} />
        ) : (
          <ScreenError
            message={error instanceof Error ? error.message : t('destinationDetails.couldNotLoad')}
            onRetry={() => refetch()}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Content ────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {renderHeader(destination.name)}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero cover photo */}
        <View style={styles.heroWrapper}>
          <Image
            source={{ uri: destination.image }}
            style={styles.heroImage}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(15,23,42,0.85)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroMetaOverlay}>
            <View style={styles.ratingBadgeWrap}>
              <Star size={12} color={C.star} fill={C.star} />
              <Text style={styles.ratingBadgeText}>{t('destinationDetails.ratingSuffix', { rating: destination.rating })}</Text>
            </View>
            <Text style={styles.heroTitle}>{destination.name}</Text>
            <Text style={styles.heroTags}>{destination.tags}</Text>
          </View>
        </View>

        <View style={styles.contentBody}>
          {/* Overview */}
          {destination.description.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{t('destinationDetails.overview')}</Text>
              <View style={styles.overviewCard}>
                <Text style={styles.overviewDesc}>{destination.description}</Text>
              </View>
            </View>
          )}

          {/* Specialties */}
          {destination.specialties.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{t('destinationDetails.specialAttractions')}</Text>
              <View style={styles.specialtiesGrid}>
                {destination.specialties.map((spec, i) => (
                  <Card key={i} style={styles.specialtyCard}>
                    <View style={styles.specialtyIconBox}>{getSpecialtyIcon(spec.icon)}</View>
                    <View style={styles.specialtyInfo}>
                      <Text style={styles.specialtyTitle}>{spec.title}</Text>
                      <Text style={styles.specialtyDesc}>{spec.desc}</Text>
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          )}

          {/* Photo gallery */}
          {destination.gallery.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{t('destinationDetails.photoGallery')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {destination.gallery.map((imgUri, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.9}
                    style={styles.galleryCard}
                    onPress={() => setActiveImageIndex(index)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('destinationDetails.photoGalleryTitle', { name: destination.name })}
                  >
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.galleryImage}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(6,8,20,0.4)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.hdIndicator}>
                      <Sparkles size={8} color={C.white} />
                      <Text style={styles.hdIndicatorText}>{t('destinationDetails.view')}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.stickyCtaWrap}>
        
        <Button
          label={t('destinationDetails.planTripHere')}
          onPress={() => router.navigate('/create')}
          icon={<MapPinned size={15} color={C.white} strokeWidth={2.4} />}
          fullWidth
          style={styles.ctaButton}
        />
      </View>

      {/* Image zoom viewer */}
      <Modal
        visible={activeImageIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveImageIndex(null)}
      >
        <View style={styles.zoomModalContainer}>
          <TouchableOpacity
            style={styles.closeZoomBtn}
            onPress={() => setActiveImageIndex(null)}
            accessibilityRole="button"
            accessibilityLabel={t('destinationDetails.closeGallery')}
          >
            <X size={22} color={C.white} />
          </TouchableOpacity>

          {activeImageIndex !== null && destination.gallery[activeImageIndex] && (
            <Image
              source={{ uri: destination.gallery[activeImageIndex] }}
              style={styles.zoomedImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          )}

          <View style={styles.zoomFooter}>
            <Text style={styles.zoomTitle}>{t('destinationDetails.photoGalleryTitle', { name: destination.name })}</Text>
            <Text style={styles.zoomCounter}>
              {t('destinationDetails.photoCounter', {
                current: (activeImageIndex ?? 0) + 1,
                total: destination.gallery.length,
              })}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  floatingHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  circleHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  heroWrapper: {
    height: SCREEN_HEIGHT * 0.44,
    position: 'relative',
    width: '100%',
    backgroundColor: '#0F172A',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroMetaOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  ratingBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    marginBottom: 8,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F59E0B',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroTags: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  contentBody: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 26,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  overviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  overviewDesc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    fontWeight: '500',
  },
  specialtiesGrid: {
    gap: 12,
  },
  specialtyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  specialtyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  specialtyInfo: {
    flex: 1,
  },
  specialtyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  specialtyDesc: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 18,
  },
  galleryScroll: {
    gap: 12,
  },
  galleryCard: {
    width: 140,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  hdIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  hdIndicatorText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stickyCtaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  ctaBackgroundGlow: {
    ...StyleSheet.absoluteFill,
    opacity: 0.95,
  },
  ctaButton: {
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  zoomModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeZoomBtn: {
    position: 'absolute',
    top: 50,
    right: 25,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  zoomedImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  zoomFooter: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    gap: 6,
  },
  zoomTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  zoomCounter: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
});