// Response shapes for the endpoints apiService calls.
//
// These existed only as `any` before (70 of them in services/api.ts alone),
// which meant every screen consuming a response was unchecked: a renamed
// server field, a Decimal that arrives as a string rather than a number, or
// a null the client did not expect all typechecked fine and failed at
// runtime instead.
//
// This is the client half of §6.4's "one source for types across the
// boundary". It is hand-mirrored from the routes rather than generated,
// which is the same arrangement src/types/api-error-codes.ts already uses;
// generating both from the backend's zod schemas is the follow-up, and needs
// the monorepo tooling §6.4 flagged as absent.
//
// Money is a string everywhere it appears (docs/CONVENTIONS.md §3) because
// Postgres Decimal is serialised as one — format it with formatINR, never
// with arithmetic on a parsed float.
import type { Money } from '@/lib/money';

/** ISO 8601 UTC, per §0.2.3. Parse only through src/lib/datetime.ts. */
export type IsoDateTime = string;

// ── Auth ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: 'TOURIST' | 'GUIDE' | 'ORGANIZER' | 'ADMIN';
  name?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

// ── Notifications ─────────────────────────────────────────────────────

export type NotificationCategory =
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'CHAT_ADDED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_SUCCESS'
  | 'HAZARD'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  /** null for a system-wide broadcast; unread is then computed per user. */
  userId: string | null;
  type: string;
  title: string;
  content: string;
  time: string;
  unread: boolean;
  chatRoomId?: string | null;
  tripId?: string | null;
  category?: NotificationCategory | null;
  createdAt: IsoDateTime;
}

export interface NotificationPreferences {
  pushNotifications: boolean;
  pushTripUpdates: boolean;
  pushHazardAlerts: boolean;
  pushSeasonal: boolean;
}

// ── Hazard alerts ─────────────────────────────────────────────────────

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'ADVISORY';
export type AlertCategory =
  | 'FLOOD_RAIN'
  | 'LANDSLIDE'
  | 'CLOUDBURST'
  | 'TRAFFIC_RUSH'
  | 'CYCLONE'
  | 'EARTHQUAKE'
  | 'WILDFIRE';

export interface HazardAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  category: AlertCategory;
  location: string;
  time: string;
  desc: string;
  affectedRoute: string;
  precautions: string[];
  image: string;
  active: boolean;
  createdAt: IsoDateTime;
}

/** A hazard found near a specific trip's own route — GET /map/trips/:id/hazards. */
export interface TripRouteHazard {
  id: string;
  title: string;
  severity: AlertSeverity;
  category: AlertCategory;
  location: string;
  affectedRoute: string;
  desc: string;
  precautions: string[];
  distanceFromRouteKm: number;
}

/** One guide whose declared service zones cover part of a trip's route. */
export interface MatchedRouteGuide {
  guideProfileId: string;
  name: string;
  avatar: string | null;
  verifiedStatus: string;
  rating: number | null;
  reviewCount: number;
  languages: string[];
  dailyRate: Money;
  /** Timeline stop ids this guide's zones cover. */
  coveredStopIds: string[];
  coveredOrders: number[];
  coversEntireRoute: boolean;
  matchedZones: { zoneId: string; label: string; radiusKm: number; distanceKm: number }[];
}

/** GET /trips/:id/matching-guides — guides who actually work this route. */
export interface TripGuideMatches {
  waypoints: { stopId: string | null; order: number; city: string; latitude: number; longitude: number }[];
  /** Route cities that could not be placed, so the UI can say so rather
   *  than implying no guide covers them. */
  unplacedCities: string[];
  guides: MatchedRouteGuide[];
}

/** One published review of a guide. */
export interface GuideReview {
  id: string;
  rating: number;
  comment: string;
  reviewerName: string;
  reviewerAvatar: string | null;
  /** The trip this review is about, when it came from one. */
  tripName: string | null;
  createdAt: IsoDateTime;
}

/**
 * Something the caller could review this guide for. The client asks before
 * offering a review action, so nobody composes one only to be refused.
 */
export interface ReviewableEngagement {
  kind: 'BOOKING' | 'TRIP';
  id: string;
  label: string;
  concludedOn: IsoDateTime;
  alreadyReviewed: boolean;
}

/** A guide's declared operating area. */
export interface GuideServiceZone {
  id: string;
  guideProfileId: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/** "All Clear" → Trip-wise Analysis, for one trip. */
export interface TripHazardReport {
  tripId: string;
  tripName: string;
  clear: boolean;
  routeResolved: boolean;
  proximityThresholdKm: number;
  hazards: TripRouteHazard[];
}

// ── Destinations and weather ──────────────────────────────────────────

export interface Destination {
  id: string;
  name: string;
  tags: string;
  rating: number;
  image: string;
  rank: number;
  featured: boolean;
}

// Matches backend/prisma/schema.prisma's WeatherLocation model exactly —
// this used to describe a `city`/`temperature: number` shape that GET
// /weather (backend/src/api/routes/weather.ts) never actually returns.
export interface WeatherLocation {
  id: string;
  name: string;
  place: string;
  temp: string;
  condition: string;
  aqi: string;
  humidity: string;
  image: string;
}

// ── Stories and feed ──────────────────────────────────────────────────

export interface StoryViewerItem {
  userId: string;
  name: string;
  avatar: string | null;
  hasLiked: boolean;
  viewedAt: IsoDateTime;
}

export interface StoryInteractionsResponse {
  totalViews: number;
  totalLikes: number;
  /** The caller's own like state — resolved by user id server-side, which
   *  is what the heart on their screen reflects. */
  viewerHasLiked: boolean;
  /** Author-only. Empty for everyone else: a viewer list is the author's. */
  viewers: StoryViewerItem[];
}

export interface StoryPayload {
  title: string;
  content?: string;
  coverImg?: string;
  /** The uploaded asset from POST /stories/media-upload-url. For a video
   *  story this is the video and `coverImg` is the poster frame. */
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
  location?: string;
  hasReel?: boolean;
}

// ── Trips: members, expenses, join requests ───────────────────────────

export interface TripMemberRow {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  isCreator?: boolean;
  /** null for the organizer, who has no TripMember row. */
  checkedIn: boolean | null;
  roomAllocated: string | null;
  seatAllocated: string | null;
}

export interface TripExpenseItem {
  id: string;
  description: string;
  amount: Money;
  category?: string | null;
  createdAt: IsoDateTime;
  paidById: string;
  paidByName: string;
  /** True for the payer and the organizer — the server decides, not the UI. */
  canDelete: boolean;
}

export interface TripExpenseBalance {
  userId: string;
  name: string;
  avatar: string;
  isOrganizer: boolean;
  paid: Money;
  share: Money;
  /** Positive means this member is owed; negative means they owe. */
  net: Money;
}

export interface TripExpenses {
  tripId: string;
  headCount: number;
  total: Money;
  yourShare: Money;
  yourNet: Money;
  /** The server names this `expenses`, not `items`. */
  expenses: TripExpenseItem[];
  balances: TripExpenseBalance[];
}

export type JoinRequestStatus = 'PENDING' | 'AWAITING_PAYMENT' | 'APPROVED' | 'REJECTED';

export interface JoinRequestSummary {
  id: string;
  tripId: string;
  status: JoinRequestStatus;
  fromCity: string | null;
  toCity: string | null;
  adjustedPrice: Money | null;
  /** Family Connect Midway / day-range join — see docs/plan "Nearby, Family
   *  Connect, Guide-per-checkpoint, Chat & Seat fixes". */
  familyMemberCount: number;
  partySize: number;
  joiningDate: IsoDateTime | null;
  fromStopId: string | null;
  toStopId: string | null;
}

/** Flattened by GET /interactions/incoming-requests — not the raw row. */
export interface IncomingJoinRequest {
  id: string;
  tripId: string;
  tripName: string;
  userId: string;
  applicantName: string;
  applicantAvatar: string;
  status: JoinRequestStatus;
  fromCity: string | null;
  toCity: string | null;
  adjustedPrice: Money | null;
  createdAt: IsoDateTime;
  familyMemberCount: number;
  partySize: number;
  joiningDate: IsoDateTime | null;
  fromStopId: string | null;
  toStopId: string | null;
}

export interface TripItineraryDay {
  id: string;
  day: number;
  title: string;
  details: string;
}

// ── Chat ──────────────────────────────────────────────────────────────

export interface ChatRoomSummary {
  id: string;
  name: string;
  tripId: string | null;
  avatar: string;
  type: string;
  latestMessage: string;
  latestTime: string;
  unread: boolean;
  unreadCount: number;
  badge: string;
  lastMessageAt: IsoDateTime;
  /** This user's own per-room notification mute — see POST /chats/:id/mute. */
  muted: boolean;
  /** Set on a pre-join enquiry thread, so the inbox can label which trip
   *  it is about instead of showing a bare DM. */
  inquiryTripId?: string | null;
  inquiryTripName?: string | null;
}

/** One pre-join enquiry thread, as the trip organizer sees it. */
export interface TripInquiryThread {
  chatRoomId: string;
  user: { id: string | null; name: string; avatar: string | null };
  lastMessage: string | null;
  lastMessageAt: IsoDateTime;
  unreadCount: number;
  /** Whether this person has also requested a seat, and where that stands. */
  hasJoinRequest: boolean;
  joinRequestStatus: JoinRequestStatus | null;
}

/** WhatsApp-style per-message state, from the sender's point of view. */
export type MessageStatus = 'SENT' | 'DELIVERED' | 'SEEN';

/** Who has received and who has read one message (sender-only). */
export interface MessageAudienceEntry {
  userId: string;
  name: string;
  avatar: string | null;
  deliveredAt: IsoDateTime | null;
  readAt: IsoDateTime | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar?: string | null;
  avatar?: string | null;
  content: string;
  timestamp: string;
  mediaType: 'NONE' | 'IMAGE' | 'VOICE' | 'LOCATION';
  mediaUrl?: string | null;
  /** Set only on the caller's own messages — ticks are the sender's view. */
  status?: MessageStatus | null;
  /** Set only when mediaType is 'LOCATION' — a shared pin's coordinates. */
  latitude?: number | null;
  longitude?: number | null;
  createdAt: IsoDateTime;
}

// GET /trips/nearby (docs/REMEDIATION.md §8.13) — a real Trip row plus the
// straight-line distance annotation the route adds. Kept as its own shape
// rather than `Trip & {...}`: AppContext's `Trip.budget` is typed `number`,
// but every Trip row's money crosses the wire as a string (see mapTrip in
// backend/src/api/routes/trips.ts) — this route's own field is typed
// correctly as `string` and left that way rather than propagating the
// `Trip` interface's pre-existing mismatch here too.
export interface NearbyTrip {
  id: string;
  name: string;
  creator: string;
  creatorId: string;
  cities: string[];
  startDate: string;
  endDate: string;
  budget: string;
  availableSeats: number;
  totalSeats: number;
  membersCount: number;
  meetingPoint: string;
  coverImage: string;
  category: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  hotelIncluded: boolean;
  cabIncluded: boolean;
  distanceKm: number | null;
  distanceIsApproximate: boolean;
  nearestCity: string | null;
}

// ── Uploads ───────────────────────────────────────────────────────────

export interface UploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
}

/** The image content types every upload endpoint accepts. */
export type UploadImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

// ── Guides ────────────────────────────────────────────────────────────

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface GuideProfile {
  id: string;
  userId: string;
  licenseNumber: string;
  licensePhotoUrl: string | null;
  experienceYears: number;
  expertisePlaces: string[];
  languagesSpoken: string[];
  hourlyRate: Money;
  dailyRate: Money;
  /** Only an admin action can set VERIFIED (§2.6). */
  verifiedStatus: VerificationStatus;
  /** Null until a real review exists — it used to default to 5.0. */
  rating: number | null;
  createdAt: IsoDateTime;
}

export interface GuideEarnings {
  range: 'week' | 'month' | 'year';
  walletBalance: Money;
  totalEarnings: Money;
  completedTripsCount: number;
  /** Scoped to this guide — it used to be a global count (§5.7). */
  activeLeadsCount: number;
  /**
   * Pre-formatted server-side, same convention as WeatherLocation/
   * LiveWeather — `amtText` and `height` (0-110, a bar-chart percentage)
   * are ready to render as-is. This used to be typed `{label, value}[]`,
   * which don't exist on the real objects (`day`/`amt`/`height`/`amtText`)
   * — travel-guide.tsx's weekly chart read `c.value` as `undefined`
   * everywhere, so every bar's height/max computation went NaN.
   */
  chartData: { day: string; amt: number; height: number; amtText: string }[];
  hasActivity: boolean;
}

export interface GuidePackage {
  id: string;
  guideProfileId: string;
  title: string;
  description: string;
  price: Money;
  durationDays: number;
  citiesIncluded: string[];
  createdAt: IsoDateTime;
}

export type GuidePackageInput = Omit<GuidePackage, 'id' | 'guideProfileId' | 'createdAt'>;

export interface GuideReel {
  id: string;
  guideProfileId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  viewsCount: number;
  likesCount: number;
  createdAt: IsoDateTime;
}

export interface GuideReelInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
}

export interface GuideQuoteOnLead {
  id: string;
  amount: Money;
  status: QuoteStatus;
  message: string | null;
}

/**
 * A lead is a public trip going somewhere this guide lists as expertise —
 * a demand signal, not a person. It used to be built from JoinRequest rows
 * and carried the full name and photo of every traveller who had asked to
 * join a matching trip, none of whom had any relationship with the guide.
 */
export interface GuideLead {
  id: string;
  tripId: string;
  tripName: string;
  destination: string;
  cities: string[];
  groupSize: number;
  seatsFilled: number;
  interestedCount: number;
  durationDays: number;
  budget: Money;
  startDate: string;
  description: string | null;
  /** This guide's own standing bid, so the button reflects server truth. */
  quote: GuideQuoteOnLead | null;
}

export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface GuideQuoteInput {
  tripId: string;
  amount: number;
  message?: string;
}

/** A quote as the guide who sent it sees it. */
export interface SentGuideQuote {
  id: string;
  tripId: string;
  tripName: string;
  destination: string;
  startDate: string;
  amount: Money;
  message: string | null;
  status: QuoteStatus;
}

/** A quote as the trip organizer who received it sees it. */
export interface ReceivedGuideQuote {
  id: string;
  guideProfileId: string;
  guideName: string | null;
  guideAvatar: string | null;
  guideVerifiedStatus: VerificationStatus;
  guideRating: number | null;
  guideReviewCount: number;
  guideExperienceYears: number;
  guideLanguages: string[];
  amount: Money;
  message: string | null;
  status: QuoteStatus;
  createdAt: IsoDateTime;
}

/**
 * A guide as a traveller browsing for one sees them. Every field is real or
 * explicitly absent: this row used to name any guide without a filled-in
 * profile "Verified Guide", score every unrated guide 5.0, and invent
 * languages and expertise the guide had never claimed.
 */
export interface PublicGuide {
  id: string;
  name: string | null;
  avatar: string | null;
  verifiedStatus: VerificationStatus;
  rating: number | null;
  reviewCount: number;
  languages: string[];
  dailyRate: Money;
  hourlyRate: Money;
  expertise: string[];
  experienceYears: number;
}

// ── Guide bookings ─────────────────────────────────────────────────
// v1 has no payment provider, so a booking is a request the guide accepts
// or declines. paymentStatus stays PENDING throughout; nothing claims money
// moved.

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface GuideBooking {
  id: string;
  userId: string;
  guideProfileId: string | null;
  travelDate: string;
  bookingDate: IsoDateTime;
  amount: Money;
  status: BookingStatus;
  paymentStatus: string;
}

export interface MyGuideBooking extends GuideBooking {
  guideName: string;
}

export interface IncomingGuideBooking extends GuideBooking {
  travellerName: string;
  travellerAvatar: string | null;
}

export interface CreateBookingInput {
  packageId: string;
  travelDate: string;
}

export interface LiveLocation {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: IsoDateTime;
}

export interface ActiveGuidingBooking {
  bookingId: string;
  targetId: string;
  amount: Money;
}

/** GET /guides/:id/live-status — NOT a LiveLocation itself; POST to the same
 * path returns the bare LiveLocation row (see updateGuideLiveStatus). */
export interface GuideLiveStatus {
  location: LiveLocation | null;
  activeGuiding: ActiveGuidingBooking | null;
}

// ── Safety ────────────────────────────────────────────────────────────

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  relation: string;
  phoneNumber: string;
}

// ── Feed ──────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  sourceType: 'STORY' | 'REEL';
  userId?: string | null;
  /** A reel with no caption has no title. */
  title: string | null;
  content: string;
  coverImg?: string | null;
  /** Set on REEL items — the reel's video asset. */
  videoUrl?: string | null;
  /** Set on STORY items — the uploaded asset, which may itself be a video
   *  (mediaType 'VIDEO', with coverImg as the poster frame). */
  mediaUrl?: string | null;
  mediaType?: 'IMAGE' | 'VIDEO';
  /** Null when the author has not filled in a profile name. */
  authorName: string | null;
  authorAvatar?: string | null;
  location?: string | null;
  likesCount: number;
  createdAt: IsoDateTime;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

// ── Weather (live lookup) ─────────────────────────────────────────────

// GET /weather/live (backend/src/api/routes/weather.ts) — every field below
// is already display-formatted server-side (`temp: "24°C"`, `humidity:
// "60%"`, `windSpeed: "12 km/h"`), matching WeatherLocation's convention.
// This used to be typed as raw numbers under different field names
// (`temperature`, no string units), which meant the one consumer
// (travel-guide.tsx's live-weather tab) always fell back to its "—"
// placeholder for temperature and appended a second " km/h" onto the
// wind speed string it did read correctly by accident.
export interface LiveWeather {
  latitude: number;
  longitude: number;
  temp: string;
  condition: string;
  humidity: string;
  windSpeed: string;
  fetchedAt: IsoDateTime;
}

// GET /weather/trending — live weather + air quality for this app's
// curated Destination catalogue (the same rows the Trending Destinations
// carousel reads, ordered the same way). There is no reliable free API for
// "trending this season", so this reuses that one real, non-fabricated
// definition of "trending places" rather than a second, invented one. A
// destination the server could not get a live reading for is left out of
// the array entirely — never sent with a placeholder value — so `aqi` is
// the only field that can legitimately be null (air quality is a second,
// independent upstream call and can fail on its own without failing the
// whole entry).
export interface TrendingWeatherDestination {
  id: string;
  name: string;
  tags: string;
  image: string;
  temp: string;
  condition: string;
  humidity: string;
  windSpeed: string;
  aqi: string | null;
}

/** Endpoints whose only job is to succeed; the body carries a message. */
export interface MessageResponse {
  message: string;
}

// ── Trip Payments ─────────────────────────────────────────────────────────

export type TripPaymentOrderStatus = 'CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

export interface TripPaymentOrder {
  id: string;
  joinRequestId: string;
  userId: string;
  amount: Money;
  status: TripPaymentOrderStatus;
  gateway: string;
  razorpayOrderId: string | null;
  walletDebit: Money | null;
  gatewayDebit: Money | null;
  tripName?: string;
  joinRequestStatus?: JoinRequestStatus;
  walletBalance?: Money;
}

export interface InitiatePaymentResult {
  orderId: string;
  amount: Money;
  currency: string;
  keyId?: string;
}

export interface VerifyPaymentResult {
  joinRequestId: string;
  chatRoomId: string | null;
}
