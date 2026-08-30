import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Award,
  Coffee,
  Compass,
  Globe,
  Heart,
  Home,
  MapPinned,
  Sparkles,
  Star,
  Sun,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, Image, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryKeys } from '@/lib/query-keys';
import { apiService } from '@/services/api';
import { C } from '@/theme/tokens';
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
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const destId = typeof params.id === 'string' ? params.id : '';

  const [isLiked, setIsLiked] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

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

  const renderHeader = (title: string) => (
    <View style={styles.floatingHeader}>
      <TouchableOpacity style={styles.circleHeaderBtn} activeOpacity={0.8} onPress={() => router.back()}>
        <ArrowLeft size={18} color={C.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitleText} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity
        style={styles.circleHeaderBtn}
        activeOpacity={0.8}
        onPress={() => setIsLiked((v) => !v)}
        disabled={!destination}
      >
        <Heart size={18} color={isLiked ? C.red : C.white} fill={isLiked ? C.red : 'transparent'} />
      </TouchableOpacity>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading || (destId.length > 0 && !destination && !isError)) {
    return (
      <SafeAreaView edges={['left', 'right']} style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        {renderHeader('Destination')}
        <ScreenLoading label="Loading destination…" />
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
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        {renderHeader('Destination')}
        {notFound ? (
          <ScreenEmpty title="Destination not found" message="We couldn't find that destination." />
        ) : (
          <ScreenError
            message={error instanceof Error ? error.message : 'Could not load this destination.'}
            onRetry={() => refetch()}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Content ────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderHeader(destination.name)}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero cover photo */}
        <View style={styles.heroWrapper}>
          <Image source={{ uri: destination.image }} style={styles.heroImage} />
          <LinearGradient
            colors={['rgba(6,8,20,0.2)', 'rgba(6,8,20,0.5)', C.bg]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroMetaOverlay}>
            <View style={styles.ratingBadgeWrap}>
              <Star size={12} color={C.star} fill={C.star} />
              <Text style={styles.ratingBadgeText}>{destination.rating} Rating</Text>
            </View>
            <Text style={styles.heroTitle}>{destination.name}</Text>
            <Text style={styles.heroTags}>{destination.tags}</Text>
          </View>
        </View>

        <View style={styles.contentBody}>
          {/* Overview */}
          {destination.description.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.overviewDesc}>{destination.description}</Text>
            </View>
          )}

          {/* Specialties */}
          {destination.specialties.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Special Attractions & Specialties</Text>
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
              <Text style={styles.sectionTitle}>Photo Gallery</Text>
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
                  >
                    <Image source={{ uri: imgUri }} style={styles.galleryImage} />
                    <LinearGradient
                      colors={['transparent', 'rgba(6,8,20,0.4)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.hdIndicator}>
                      <Sparkles size={8} color={C.white} />
                      <Text style={styles.hdIndicatorText}>VIEW</Text>
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
        <LinearGradient colors={['#0C1020', C.bg]} style={styles.ctaBackgroundGlow} />
        <Button
          label="Plan a Trip Here"
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
          <TouchableOpacity style={styles.closeZoomBtn} onPress={() => setActiveImageIndex(null)}>
            <X size={22} color={C.white} />
          </TouchableOpacity>

          {activeImageIndex !== null && destination.gallery[activeImageIndex] && (
            <Image
              source={{ uri: destination.gallery[activeImageIndex] }}
              style={styles.zoomedImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.zoomFooter}>
            <Text style={styles.zoomTitle}>{destination.name} Photo Gallery</Text>
            <Text style={styles.zoomCounter}>
              {(activeImageIndex ?? 0) + 1} / {destination.gallery.length}
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
    backgroundColor: C.bg,
  },
  floatingHeader: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(6, 8, 20, 0.4)',
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  circleHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 19, 34, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  heroWrapper: {
    height: SCREEN_HEIGHT * 0.44,
    position: 'relative',
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroMetaOverlay: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
  },
  ratingBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    marginBottom: 10,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.orange,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.5,
  },
  heroTags: {
    fontSize: 13,
    color: C.textSec,
    fontWeight: '600',
    marginTop: 4,
  },
  contentBody: {
    paddingHorizontal: 20,
    gap: 28,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  overviewDesc: {
    fontSize: 13,
    color: C.textSec,
    lineHeight: 20,
    fontWeight: '500',
  },
  specialtiesGrid: {
    gap: 12,
  },
  specialtyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  specialtyIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.15)',
  },
  specialtyInfo: {
    flex: 1,
  },
  specialtyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.white,
  },
  specialtyDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    lineHeight: 14.5,
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
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  hdIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(6, 8, 20, 0.65)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  hdIndicatorText: {
    fontSize: 12,
    color: C.white,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stickyCtaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 25,
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
    color: C.white,
  },
  zoomCounter: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
});
