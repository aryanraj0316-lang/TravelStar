import { DESTINATIONS_DATABASE } from '@/constants/destinations';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Award,
  ChevronRight,
  Coffee,
  Compass,
  Globe,
  Heart,
  Home,
  Pause,
  Play,
  Sparkles,
  Star,
  Sun,
  Volume2,
  VolumeX,
  X
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const C = {
  bg: '#060814',
  card: '#111322',
  cardAlt: '#181C2E',
  border: '#1A1D30',
  white: '#FFFFFF',
  textSec: '#7E8494',
  textMuted: '#64748B',
  blue: '#0066FF',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',
  cyan: '#06B6D4',
  star: '#FBBF24',
};

export default function DestinationDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const destId = Number(params.id ?? '1');

  // Find destination from database
  const destination = DESTINATIONS_DATABASE.find((d) => d.id === destId) ?? DESTINATIONS_DATABASE[0];

  // UI States
  const [isLiked, setIsLiked] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  // Video Player States
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState(0);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Video Player Simulation ──────────────────────────────────────
  const openVideoPlayer = () => {
    setIsVideoPlaying(true);
    setVideoLoading(true);
    setVideoProgress(0);
    setSimulatedTime(0);

    // Simulate loading for 1.2 seconds
    setTimeout(() => {
      setVideoLoading(false);
      startVideoProgress();
    }, 1200);
  };

  const startVideoProgress = () => {
    if (videoTimerRef.current) clearInterval(videoTimerRef.current);

    videoTimerRef.current = setInterval(() => {
      setVideoProgress((prev) => {
        if (prev >= 1) {
          // Loop video progress
          setSimulatedTime(0);
          return 0;
        }
        setSimulatedTime((time) => Math.min(time + 1, 30));
        return prev + 1 / 30; // 30 seconds total simulated video
      });
    }, 1000);
  };

  const pauseVideoProgress = () => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  };

  const togglePlayPause = () => {
    if (videoTimerRef.current) {
      pauseVideoProgress();
    } else {
      startVideoProgress();
    }
  };

  const closeVideoPlayer = () => {
    pauseVideoProgress();
    setIsVideoPlaying(false);
    setVideoProgress(0);
    setSimulatedTime(0);
  };

  useEffect(() => {
    return () => {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    };
  }, []);

  const formatVideoTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ─── Floating Top Transparent Header ───────────────────────────── */}
      <View style={styles.floatingHeader}>
        <TouchableOpacity
          style={styles.circleHeaderBtn}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitleText} numberOfLines={1}>
          {destination.name}
        </Text>

        <TouchableOpacity
          style={styles.circleHeaderBtn}
          activeOpacity={0.8}
          onPress={() => setIsLiked(!isLiked)}
        >
          <Heart size={18} color={isLiked ? C.red : C.white} fill={isLiked ? C.red : 'transparent'} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ─── Top Hero Cover Photo ───────────────────────────────────────── */}
        <View style={styles.heroWrapper}>
          <Image source={{ uri: destination.image }} style={styles.heroImage} />
          <LinearGradient
            colors={['rgba(6,8,20,0.2)', 'rgba(6,8,20,0.5)', C.bg]}
            style={StyleSheet.absoluteFill}
          />
          {/* Cover Info Overlay */}
          <View style={styles.heroMetaOverlay}>
            <View style={styles.ratingBadgeWrap}>
              <Star size={12} color={C.star} fill={C.star} />
              <Text style={styles.ratingBadgeText}>{destination.rating} Rating</Text>
            </View>
            <Text style={styles.heroTitle}>{destination.name}</Text>
            <Text style={styles.heroTags}>{destination.tags}</Text>
          </View>
        </View>

        {/* ─── Main Details Section ───────────────────────────────────────── */}
        <View style={styles.contentBody}>

          {/* Detailed Overview Paragraph */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.overviewDesc}>{destination.description}</Text>
          </View>

          {/* Specialties section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Special Attractions & Specialties</Text>
            <View style={styles.specialtiesGrid}>
              {destination.specialties.map((spec, i) => (
                <View key={i} style={styles.specialtyCard}>
                  <View style={styles.specialtyIconBox}>
                    {getSpecialtyIcon(spec.icon)}
                  </View>
                  <View style={styles.specialtyInfo}>
                    <Text style={styles.specialtyTitle}>{spec.title}</Text>
                    <Text style={styles.specialtyDesc}>{spec.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* HD Photo Gallery Slider */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>HD Photo Gallery</Text>
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
                    <Text style={styles.hdIndicatorText}>HD VIEW</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* HD Video experience card */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Video Experiences & Reels</Text>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.videoReelCard}
              onPress={openVideoPlayer}
            >
              <Image source={{ uri: destination.videoThumb }} style={styles.videoThumb} />
              <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)']}
                style={StyleSheet.absoluteFill}
              />
              {/* Play overlays */}
              <View style={styles.playBtnOverlay}>
                <View style={styles.playPulseGlow} />
                <View style={styles.playIconCircle}>
                  <Play size={22} color={C.white} fill={C.white} style={{ marginLeft: 3 }} />
                </View>
              </View>
              <View style={styles.videoMetaWrap}>
                <Text style={styles.videoTitle}>Watch {destination.name} Cinematic HD Reel</Text>
                <Text style={styles.videoDuration}>0:30 • Ultra HD 4K</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* User Reviews Section */}
          <View style={styles.sectionBlock}>
            <View style={styles.reviewsTitleRow}>
              <Text style={styles.sectionTitle}>Traveler Experiences</Text>
              <Text style={styles.reviewsCountText}>{destination.reviews.length} reviews</Text>
            </View>
            <View style={styles.reviewsFeed}>
              {destination.reviews.map((rev) => (
                <View key={rev.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Image source={{ uri: rev.avatar }} style={styles.reviewAvatar} />
                    <View style={styles.reviewUserMeta}>
                      <Text style={styles.reviewUserName}>{rev.user}</Text>
                      <Text style={styles.reviewDate}>{rev.date}</Text>
                    </View>
                    <View style={styles.reviewStars}>
                      {Array.from({ length: 5 }).map((_, starIdx) => (
                        <Star
                          key={starIdx}
                          size={10}
                          color={starIdx < Math.floor(rev.rating) ? C.star : C.textMuted}
                          fill={starIdx < Math.floor(rev.rating) ? C.star : 'transparent'}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewText}>{rev.text}</Text>
                </View>
              ))}
            </View>
          </View>

        </View>
      </ScrollView>

      {/* ─── Bottom Floating Sticky CTA Button ──────────────────────────── */}
      <View style={styles.stickyCtaWrap}>
        <LinearGradient
          colors={['#0C1020', C.bg]}
          style={styles.ctaBackgroundGlow}
        />
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={() => {
            router.push('/create');
          }}
        >
          <LinearGradient
            colors={['#0044CC', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaBtnText}>Customize Itinerary & Book Now</Text>
            <ChevronRight size={16} color={C.white} strokeWidth={2.5} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ─── Modal 1: HD Image Zoom Viewer ────────────────────────────── */}
      <Modal
        visible={activeImageIndex !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveImageIndex(null)}
      >
        <View style={styles.zoomModalContainer}>
          <TouchableOpacity
            style={styles.closeZoomBtn}
            onPress={() => setActiveImageIndex(null)}
          >
            <X size={22} color={C.white} />
          </TouchableOpacity>

          {activeImageIndex !== null && (
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

      {/* ─── Modal 2: Simulated HD Video Player ────────────────────────── */}
      <Modal
        visible={isVideoPlaying}
        transparent={true}
        animationType="slide"
        onRequestClose={closeVideoPlayer}
      >
        <SafeAreaView style={styles.videoPlayerModalContainer}>
          {/* Top Video Header */}
          <View style={styles.videoPlayerHeader}>
            <TouchableOpacity style={styles.videoBackBtn} onPress={closeVideoPlayer}>
              <X size={20} color={C.white} />
            </TouchableOpacity>
            <Text style={styles.videoPlayerTitle} numberOfLines={1}>
              {destination.name} Cinematic Experience
            </Text>
            <TouchableOpacity style={styles.muteBtn} onPress={() => setIsMuted(!isMuted)}>
              {isMuted ? <VolumeX size={20} color={C.white} /> : <Volume2 size={20} color={C.white} />}
            </TouchableOpacity>
          </View>

          {/* Video Playback Display (Simulated with cover and loading spinner) */}
          <View style={styles.videoDisplayArea}>
            <Image source={{ uri: destination.gallery[1] }} style={StyleSheet.absoluteFill} resizeMode="contain" />

            {videoLoading ? (
              <View style={styles.videoLoadingWrap}>
                <ActivityIndicator size="large" color={C.blue} />
                <Text style={styles.videoLoadingText}>Buffering HD Stream...</Text>
              </View>
            ) : (
              // Subtitle Simulation
              <View style={styles.subtitleContainer}>
                <Text style={styles.subtitleText}>
                  {simulatedTime < 10
                    ? `Welcome to the magical landscapes of ${destination.name}...`
                    : simulatedTime < 20
                      ? `Explore the unique culture, heritage, and serene locales...`
                      : `Plan your adventure to ${destination.name} today.`}
                </Text>
              </View>
            )}
          </View>

          {/* Video Control Bar */}
          <View style={styles.videoPlayerControls}>

            {/* Custom Simulated Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${videoProgress * 100}%` }]} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatVideoTime(simulatedTime)}</Text>
                <Text style={styles.timeText}>0:30</Text>
              </View>
            </View>

            {/* Play/Pause controls */}
            <View style={styles.playerButtonsRow}>
              <TouchableOpacity
                style={styles.playerMainBtn}
                onPress={() => {
                  togglePlayPause();
                  // Trigger direct play pause toggles
                }}
              >
                {videoTimerRef.current ? (
                  <Pause size={24} color={C.white} fill={C.white} />
                ) : (
                  <Play size={24} color={C.white} fill={C.white} style={{ marginLeft: 3 }} />
                )}
              </TouchableOpacity>
              <Text style={styles.streamingQualityText}>AUTO • 1080p HD</Text>
            </View>
          </View>
        </SafeAreaView>
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
    paddingBottom: 120, // leave space for sticky CTA footer
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
    fontSize: 10,
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
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: C.border,
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
    fontSize: 11,
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
    fontSize: 7.5,
    color: C.white,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  videoReelCard: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  playBtnOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPulseGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 102, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 102, 255, 0.4)',
  },
  playIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  videoMetaWrap: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    right: 15,
  },
  videoTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.white,
  },
  videoDuration: {
    fontSize: 10,
    color: C.textSec,
    fontWeight: '600',
    marginTop: 2,
  },
  reviewsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  reviewsCountText: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  reviewsFeed: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  reviewUserMeta: {
    flex: 1,
  },
  reviewUserName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
  },
  reviewDate: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 1,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 16.5,
    fontWeight: '500',
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
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  ctaBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.2,
  },
  // Modal Styles (Zoom modal)
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
  // Video Player Modal Styles
  videoPlayerModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    zIndex: 10,
  },
  videoBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayerTitle: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  muteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDisplayArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#050505',
  },
  videoLoadingWrap: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    borderRadius: 16,
  },
  videoLoadingText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  subtitleText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  videoPlayerControls: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 30,
    gap: 15,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  progressContainer: {
    gap: 6,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: C.blue,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: C.textSec,
    fontSize: 10,
    fontWeight: '700',
  },
  playerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerMainBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  streamingQualityText: {
    color: C.textSec,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
