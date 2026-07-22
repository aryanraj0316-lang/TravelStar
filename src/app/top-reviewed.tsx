import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  CloudSun,
  Heart,
  MapPin,
  MessageCircle,
  Play,
  Share2,
  ShieldCheck,
  Star,
  ThumbsUp,
  Video
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

// 1. TOP RATED ROUTES & TRIPS DATA
const TOP_RATED_ROUTES = [
  {
    id: 'tr-1',
    title: 'Golden Triangle Royal Circuit (Delhi ➔ Agra ➔ Jaipur)',
    rating: 4.95,
    reviewsCount: 4820,
    guideName: 'Rajesh Kumar (Certified Master Guide)',
    cities: ['Delhi', 'Agra', 'Jaipur'],
    imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
    price: 11900,
    highlight: '#1 Top Rated Route in India',
  },
  {
    id: 'tr-2',
    title: 'Kashmir Valley & Gulmarg Gondola Snow Pass',
    rating: 4.92,
    reviewsCount: 3950,
    guideName: 'Lobsang & Srinagar Escapes',
    cities: ['Srinagar', 'Gulmarg', 'Pahalgam'],
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    price: 14500,
    highlight: '#1 Scenic Snow & Mountain Circuit',
  },
  {
    id: 'tr-3',
    title: 'Varanasi Ancient Temples & Ganga Aarti Sunset Boat',
    rating: 4.88,
    reviewsCount: 3120,
    guideName: 'Anjali Sharma (Spiritual Heritage)',
    cities: ['Varanasi', 'Sarnath'],
    imageUrl: 'https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800&q=80',
    price: 6500,
    highlight: '#1 Spiritual Heritage Experience',
  },
];

// 2. SEASONAL & WEATHER BASED TOP SUGGESTIONS (MONSOON / LATE SUMMER)
const SEASONAL_SUGGESTIONS = [
  {
    id: 'sea-1',
    name: 'Valley of Flowers & Hemkund Sahib, Uttarakhand',
    seasonTag: '🌸 PEAK MONSOON BLOOM (JULY - AUGUST)',
    tempText: '🌤️ 18°C • Pleasant mist & blooming rare flora',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
    rating: 4.94,
    reasonText: 'High altitude UNESCO flower valley blooming with 500+ alpine species right now.',
  },
  {
    id: 'sea-2',
    name: 'Munnar Tea Gardens & Anamudi Peak, Kerala',
    seasonTag: '🌿 LUSH GREEN RAIN SEASON (JULY - SEPTEMBER)',
    tempText: '🌧️ 21°C • Fresh tea estate aroma & roaring waterfalls',
    imageUrl: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=800&q=80',
    rating: 4.91,
    reasonText: 'Monsoon showers transform the rolling tea hills into an emerald green paradise.',
  },
  {
    id: 'sea-3',
    name: 'Udaipur City Palace & Lake Pichola Monsoon Magic',
    seasonTag: '👑 FULL LAKE WATERS (JULY - OCTOBER)',
    tempText: '⛅ 26°C • Cool breeze & romantic lake boat rides',
    imageUrl: 'https://images.unsplash.com/photo-1606298246186-08868ab77562?w=800&q=80',
    rating: 4.89,
    reasonText: 'Monsoon rains fill Lake Pichola & Fateh Sagar with breathtaking lake reflections.',
  },
];

// 3. STORIES & VIDEO REELS
const TRAVEL_REELS = [
  {
    id: 'reel-1',
    creator: 'Rohan (Travel Vlogger)',
    creatorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80',
    title: 'Sunrise Taj Mahal secret view point 🌅',
    views: '1.4M views',
    likes: '142k',
    thumbnail: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
  },
  {
    id: 'reel-2',
    creator: 'Priya (Backpacker)',
    creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
    title: 'Gondola Ride to Phase 2 Gulmarg Snow! ❄️',
    views: '980k views',
    likes: '96k',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
  },
  {
    id: 'reel-3',
    creator: 'Vikram (Motorcycle Rider)',
    creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    title: 'Riding through Pangong Lake water pass 🏍️',
    views: '1.8M views',
    likes: '210k',
    thumbnail: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
  },
];

const TAB_OPTIONS = [
  { key: 'ROUTES', label: 'Top rated routes', Icon: Star },
  { key: 'SEASONAL', label: 'Weather & Seasons', Icon: CloudSun },
  { key: 'REELS', label: 'Reels & Stories', Icon: Video },
  { key: 'REVIEWS', label: 'Reviews', Icon: MessageCircle },
];

const infiniteTabOptions = [...TAB_OPTIONS, ...TAB_OPTIONS, ...TAB_OPTIONS];

// 4. VERIFIED TOURIST REVIEWS & TESTIMONIALS
const USER_REVIEWS = [
  {
    id: 'rev-1',
    reviewerName: 'Siddharth Verma',
    reviewerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
    tripTitle: 'Golden Triangle Expedition',
    rating: 5.0,
    date: 'July 2026',
    verified: true,
    reviewText:
      'Unbelievable experience! Our guide Rajesh knew all secret photo spots at Amer Fort and Taj Mahal. Transportation was smooth, 4-star hotels were luxurious, and budget was super reasonable. 10/10 recommended!',
    likesCount: 184,
  },
  {
    id: 'rev-2',
    reviewerName: 'Meera Deshmukh',
    reviewerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
    tripTitle: 'Varanasi Ganga Aarti Tour',
    rating: 5.0,
    date: 'June 2026',
    verified: true,
    reviewText:
      'Watching the evening Ganga Aarti from our private boat was life-changing. Everything promised in the itinerary was delivered cleanly. The local street food tour in Varanasi was divine!',
    likesCount: 142,
  },
];

export default function TopReviewedScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'ROUTES' | 'SEASONAL' | 'REELS' | 'REVIEWS'>('ROUTES');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Continuous 60fps Right-to-Left Sliding Marquee for Tab Options
  const tabScrollRef = React.useRef<ScrollView>(null);
  const tabScrollXRef = React.useRef(0);

  React.useEffect(() => {
    let animFrameId: number;
    const singleSetWidth = 580;

    const animate = () => {
      tabScrollXRef.current += 0.6;
      if (tabScrollXRef.current >= singleSetWidth) {
        tabScrollXRef.current -= singleSetWidth;
      }
      tabScrollRef.current?.scrollTo({ x: tabScrollXRef.current, animated: false });
      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* TOP NAV BAR */}
        <View style={styles.topNavRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.topNavTitle}>Top Reviewed & Rated</Text>
          <View style={styles.scoreBadge}>
            <Star size={13} color={C.amber} fill={C.amber} />
            <Text style={styles.scoreBadgeText}>4.9 Avg (12k+ Reviews)</Text>
          </View>
        </View>

        {/* HERO BANNER WITH RATING HIGHLIGHT */}
        <View style={styles.heroCard}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient colors={['rgba(6,8,20,0.3)', 'rgba(6,8,20,0.92)']} style={StyleSheet.absoluteFill} />

          <View style={styles.heroHeaderRow}>
            <View style={styles.awardBadge}>
              <Award size={12} color={C.amber} />
              <Text style={styles.awardBadgeText}>VERIFIED HIGHLY RATED</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={() => showToast('🔗 Top Reviewed Link Copied!')}>
              <Share2 size={16} color={C.white} />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroTitle}>Top Rated Destinations & Routes</Text>
          <Text style={styles.heroSub}>
            Curated 4.9★+ tourist spots, seasonal weather recommendations, video reels, and verified reviews.
          </Text>
        </View>

        {/* CONTINUOUS 60FPS RIGHT-TO-LEFT SLIDING TAB SWITCHER */}
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {infiniteTabOptions.map((item, idx) => {
            const isFocused = activeTab === item.key;
            const Icon = item.Icon;
            return (
              <TouchableOpacity
                key={`${item.key}-${idx}`}
                activeOpacity={0.85}
                onPress={() => setActiveTab(item.key as any)}
              >
                <LinearGradient
                  colors={
                    isFocused
                      ? ['#00F2FE', '#06B6D4', '#0891B2', '#3B82F6']
                      : ['rgba(59, 130, 246, 0.45)', 'rgba(139, 92, 246, 0.35)', 'rgba(236, 72, 153, 0.35)']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientBorderWrap}
                >
                  <View style={[styles.tabItemInner, isFocused && styles.tabItemInnerActive]}>
                    <Icon size={13} color={isFocused ? C.white : C.textSec} />
                    <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{item.label}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ════════════════════════════════════════════════
            TAB 1: TOP RATED ROUTES & TRIPS
            ════════════════════════════════════════════════ */}
        {activeTab === 'ROUTES' && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Award size={16} color={C.amber} />
              <Text style={styles.sectionTitle}>Highest Rated Circuits & Routes</Text>
            </View>

            {TOP_RATED_ROUTES.map((routeItem) => (
              <TouchableOpacity
                key={routeItem.id}
                activeOpacity={0.9}
                style={styles.routeCard}
                onPress={() => router.push('/search')}
              >
                <View style={styles.routeImgWrap}>
                  <Image source={{ uri: routeItem.imageUrl }} style={styles.routeImg} />
                  <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(6,8,20,0.85)']} style={StyleSheet.absoluteFill} />

                  {/* Rating Badge */}
                  <View style={styles.routeRatingPill}>
                    <Star size={12} color={C.amber} fill={C.amber} />
                    <Text style={styles.routeRatingText}>{routeItem.rating}</Text>
                    <Text style={styles.routeRevCount}>({routeItem.reviewsCount} reviews)</Text>
                  </View>

                  <View style={styles.highlightBadge}>
                    <Text style={styles.highlightBadgeText}>{routeItem.highlight}</Text>
                  </View>
                </View>

                <View style={styles.routeCardBody}>
                  <Text style={styles.routeTitle}>{routeItem.title}</Text>

                  <View style={styles.routeFlowRow}>
                    <MapPin size={13} color={C.green} />
                    <Text style={styles.routeFlowText}>{routeItem.cities.join(' ➔ ')}</Text>
                  </View>

                  <View style={styles.routeGuideRow}>
                    <ShieldCheck size={14} color={C.blue} />
                    <Text style={styles.routeGuideText}>Organized by {routeItem.guideName}</Text>
                  </View>

                  <View style={styles.routeBottomRow}>
                    <Text style={styles.routePriceText}>₹{routeItem.price.toLocaleString('en-IN')} / head</Text>
                    <TouchableOpacity
                      style={styles.exploreRouteBtn}
                      onPress={() => router.push('/search')}
                    >
                      <Text style={styles.exploreRouteText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 2: WEATHER & SEASON BASED RECOMMENDATIONS
            ════════════════════════════════════════════════ */}
        {activeTab === 'SEASONAL' && (
          <View>
            <View style={styles.weatherBannerCard}>
              <CloudSun size={24} color={C.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.weatherTitle}>LIVE WEATHER & SEASON AI MATCH</Text>
                <Text style={styles.weatherSub}>
                  Monsoon & Early Autumn peak travel recommendations for India right now.
                </Text>
              </View>
            </View>

            {SEASONAL_SUGGESTIONS.map((item) => (
              <View key={item.id} style={styles.seasonalCard}>
                <Image source={{ uri: item.imageUrl }} style={styles.seasonalImg} />
                <LinearGradient colors={['rgba(6,8,20,0.3)', 'rgba(6,8,20,0.92)']} style={StyleSheet.absoluteFill} />

                <View style={styles.seasonBadgePill}>
                  <Text style={styles.seasonBadgeText}>{item.seasonTag}</Text>
                </View>

                <View style={styles.seasonalContent}>
                  <View style={styles.tempPill}>
                    <Text style={styles.tempPillText}>{item.tempText}</Text>
                  </View>

                  <Text style={styles.seasonalName}>{item.name}</Text>
                  <Text style={styles.seasonalReason}>{item.reasonText}</Text>

                  <View style={styles.seasonalRatingRow}>
                    <Star size={12} color={C.amber} fill={C.amber} />
                    <Text style={styles.seasonalRatingText}>{item.rating}★ Rated by Monsoon Travelers</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 3: STORIES & VIDEO REELS
            ════════════════════════════════════════════════ */}
        {activeTab === 'REELS' && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Video size={16} color={C.rose} />
              <Text style={styles.sectionTitle}>Traveler Video Reels & Stories</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reelsRow}>
              {TRAVEL_REELS.map((reel) => (
                <View key={reel.id} style={styles.reelCard}>
                  <Image source={{ uri: reel.thumbnail }} style={styles.reelImg} />
                  <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(6,8,20,0.95)']} style={StyleSheet.absoluteFill} />

                  <TouchableOpacity
                    style={styles.playBtnCircle}
                    onPress={() => router.push('/stories')}
                  >
                    <Play size={20} color={C.white} fill={C.white} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>

                  <View style={styles.reelOverlayContent}>
                    <View style={styles.creatorRow}>
                      <Image source={{ uri: reel.creatorAvatar }} style={styles.creatorAvatar} />
                      <Text style={styles.creatorName}>{reel.creator}</Text>
                    </View>

                    <Text style={styles.reelTitle} numberOfLines={2}>{reel.title}</Text>

                    <View style={styles.reelMetaRow}>
                      <Text style={styles.reelViews}>{reel.views}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Heart size={12} color={C.rose} fill={C.rose} />
                        <Text style={styles.reelLikes}>{reel.likes}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ════════════════════════════════════════════════
            TAB 4: VERIFIED TOURIST REVIEWS & TESTIMONIALS
            ════════════════════════════════════════════════ */}
        {activeTab === 'REVIEWS' && (
          <View>
            <View style={styles.sectionTitleRow}>
              <MessageCircle size={16} color={C.green} />
              <Text style={styles.sectionTitle}>Verified Tourist Reviews & Stories</Text>
            </View>

            {USER_REVIEWS.map((rev) => (
              <View key={rev.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Image source={{ uri: rev.reviewerAvatar }} style={styles.reviewerAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reviewerName}>{rev.reviewerName}</Text>
                      <View style={styles.verifiedTag}>
                        <CheckCircle2 size={11} color={C.green} />
                        <Text style={styles.verifiedTagText}>VERIFIED TOURIST</Text>
                      </View>
                    </View>
                    <Text style={styles.reviewTripTitle}>{rev.tripTitle} • {rev.date}</Text>
                  </View>

                  <View style={styles.starBox}>
                    <Star size={12} color={C.amber} fill={C.amber} />
                    <Text style={styles.starText}>{rev.rating.toFixed(1)}</Text>
                  </View>
                </View>

                <Text style={styles.reviewBodyText}>{rev.reviewText}</Text>

                <View style={styles.reviewFooterRow}>
                  <TouchableOpacity style={styles.likeReviewBtn} onPress={() => showToast('👍 Helpful mark recorded')}>
                    <ThumbsUp size={12} color={C.blue} />
                    <Text style={styles.likeReviewText}>{rev.likesCount} Helpful</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.shareReviewBtn} onPress={() => showToast('🔗 Review link shared')}>
                    <Share2 size={12} color={C.textSec} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* TOAST OVERLAY */}
      {toastMsg && (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMsg}</Text>
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
    paddingTop: 10,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  topNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.amber,
  },

  heroCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    height: 160,
    justifyContent: 'space-between',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  awardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  awardBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.amber,
  },
  shareBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
  },
  heroSub: {
    fontSize: 11.5,
    color: '#CBD5E1',
    lineHeight: 16,
  },

  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    paddingVertical: 4,
  },
  gradientBorderWrap: {
    padding: 1.5,
    borderRadius: 16,
  },
  tabItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14.5,
    backgroundColor: '#0E1120',
  },
  tabItemInnerActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.22)',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSec,
  },
  tabTextActive: {
    color: C.white,
    fontWeight: '800',
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.white,
  },

  routeCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  routeImgWrap: {
    height: 140,
    position: 'relative',
  },
  routeImg: {
    width: '100%',
    height: '100%',
  },
  routeRatingPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,8,20,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  routeRatingText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.amber,
  },
  routeRevCount: {
    fontSize: 9.5,
    color: C.textSec,
  },
  highlightBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  highlightBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.white,
  },

  routeCardBody: {
    padding: 14,
  },
  routeTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.white,
    marginBottom: 6,
  },
  routeFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  routeFlowText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.green,
  },
  routeGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  routeGuideText: {
    fontSize: 11,
    color: C.textSec,
  },
  routeBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  routePriceText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.amber,
  },
  exploreRouteBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  exploreRouteText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.white,
  },

  weatherBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  weatherTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: C.amber,
  },
  weatherSub: {
    fontSize: 11,
    color: C.textSec,
  },

  seasonalCard: {
    borderRadius: 22,
    height: 180,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    justifyContent: 'space-between',
  },
  seasonalImg: {
    ...StyleSheet.absoluteFill,
  },
  seasonBadgePill: {
    backgroundColor: 'rgba(16,185,129,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  seasonBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.white,
  },
  seasonalContent: {
    gap: 4,
  },
  tempPill: {
    backgroundColor: 'rgba(6,8,20,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tempPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.amber,
  },
  seasonalName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
  },
  seasonalReason: {
    fontSize: 11.5,
    color: '#E2E8F0',
    lineHeight: 16,
  },
  seasonalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  seasonalRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.amber,
  },

  reelsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  reelCard: {
    width: 170,
    height: 270,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    justifyContent: 'space-between',
  },
  reelImg: {
    ...StyleSheet.absoluteFill,
  },
  playBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59,130,246,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 80,
  },
  reelOverlayContent: {
    gap: 4,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  creatorName: {
    fontSize: 10,
    fontWeight: '700',
    color: C.white,
  },
  reelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
    lineHeight: 15,
  },
  reelMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  reelViews: {
    fontSize: 9.5,
    color: C.textSec,
  },
  reelLikes: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.rose,
  },

  reviewCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  reviewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.white,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedTagText: {
    fontSize: 8,
    fontWeight: '800',
    color: C.green,
  },
  reviewTripTitle: {
    fontSize: 10.5,
    color: C.textSec,
  },
  starBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  starText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.amber,
  },
  reviewBodyText: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 18,
    marginBottom: 12,
  },
  reviewFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  likeReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeReviewText: {
    fontSize: 11,
    color: C.blue,
    fontWeight: '600',
  },
  shareReviewBtn: {
    padding: 4,
  },

  toastBox: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,41,59,0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 999,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.white,
  },
});
