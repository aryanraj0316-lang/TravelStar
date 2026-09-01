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
export type AlertCategory = 'FLOOD_RAIN' | 'LANDSLIDE' | 'CLOUDBURST' | 'TRAFFIC_RUSH';

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

export interface StoryPayload {
  title: string;
  content?: string;
  coverImg?: string;
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

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface JoinRequestSummary {
  tripId: string;
  status: JoinRequestStatus;
  fromCity: string | null;
  toCity: string | null;
  adjustedPrice: Money | null;
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
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  timestamp: string;
  mediaType: 'NONE' | 'IMAGE' | 'VOICE';
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
  rating: number;
  createdAt: IsoDateTime;
}

export interface GuideEarnings {
  range: 'week' | 'month' | 'year';
  walletBalance: Money;
  totalEarnings: number;
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

export interface GuideLead {
  id: string;
  tripId: string;
  tripName: string;
  applicantName: string;
  status: JoinRequestStatus;
  createdAt: IsoDateTime;
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
  title: string;
  content: string;
  coverImg?: string | null;
  videoUrl?: string | null;
  authorName: string;
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

/** Endpoints whose only job is to succeed; the body carries a message. */
export interface MessageResponse {
  message: string;
}
