import { secureStorage } from './secureStorage';
import { eventBus } from './event-bus';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { DestinationDetail, Guide, MyTripBooking, SOSAlert, Trip, UserProfile } from '../store/AppContext';
import { ApiErrorCode } from '@/types/api-error-codes';
import type { Story } from '../store/AppContext';
import type {
  EmergencyContact,
  FeedPage,
  GuideEarnings,
  GuideLead,
  GuidePackage,
  GuidePackageInput,
  GuideProfile,
  GuideReel,
  GuideReelInput,
  LiveLocation,
  LiveWeather,
  MessageResponse,
  NearbyTrip,
  GuideLiveStatus,
  AppNotification,
  AuthResponse,
  ChatMessage,
  ChatRoomSummary,
  Destination,
  HazardAlert,
  IncomingJoinRequest,
  JoinRequestSummary,
  StoryPayload,
  TripExpenses,
  TripMemberRow,
  UploadImageContentType,
  UploadUrlResponse,
  WeatherLocation,
} from '@/types/api';

// Request-ID / idempotency-key generation only needs uniqueness, not
// cryptographic randomness, so this avoids pulling in expo-crypto for one
// call site. `crypto.randomUUID` is available in Hermes (RN 0.74+) and every
// modern browser; the fallback covers any environment where it isn't.
function generateRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// EXPO_PUBLIC_API_URL is baked in at build time per EAS build profile (see
// eas.json — development/preview/production each point at a different
// backend). This is required for any standalone/TestFlight/Play build:
// `Constants.expoConfig?.hostUri` only exists under the Expo dev server, so a
// release build that relied on it (as this app previously did) sent every
// request to the Android emulator loopback address for every real user
// (docs/REMEDIATION.md §6.1). The dev-server host-sniffing fallback below is
// kept ONLY behind __DEV__, as a convenience for local development.
function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;

  if (__DEV__) {
    if (Platform.OS === 'web') return 'http://localhost:5000';
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:5000`;
    }
    return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
  }

  // No EXPO_PUBLIC_API_URL baked into a non-dev build is a packaging bug, not
  // a runtime condition to silently paper over — every request would
  // otherwise go to whatever the dev fallback resolves to.
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. This build was not configured with an API endpoint — see eas.json build profiles.',
  );
}

export const getHostUrl = resolveApiBaseUrl;
const getApiBaseUrl = () => `${resolveApiBaseUrl()}/api/v1`;

/**
 * Thrown by every failed request(). Never returns null to signal failure —
 * see docs/REMEDIATION.md §0.2.1 / §6.2. Carries the server's error code
 * when the server responded (even with a non-2xx status); falls back to a
 * client-side code (NETWORK_ERROR, TIMEOUT) when the request never
 * completed at all.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number | null;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(code: ApiErrorCode, message: string, statusCode: number | null, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
  }
}

const DEFAULT_TIMEOUT_MS = 10000;
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

/** Single place every screen/context goes through to persist or clear tokens. */
export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await secureStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  await secureStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await secureStorage.removeItem(ACCESS_TOKEN_KEY);
  await secureStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return secureStorage.getItem(REFRESH_TOKEN_KEY);
}

// Concurrent 401s must share one refresh attempt: the refresh token rotates
// on use, so two independent refresh calls racing each other would have the
// second one present an already-dead token and trip reuse detection,
// revoking the whole session over what was really just a timing accident.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await secureStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const json = await res.json();
      const token = json?.data?.token;
      const nextRefreshToken = json?.data?.refreshToken;
      if (!token || !nextRefreshToken) return null;

      await setTokens(token, nextRefreshToken);
      return token as string;
    } catch (e) {
      logger.warn('[API] Token refresh failed:', e);
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// Real map data (docs/REMEDIATION.md §8.8).
export interface MapPin {
  id: string;
  type: 'GUIDE' | 'GROUP' | 'TOURIST' | 'ATTRACTION';
  name: string;
  latitude: number;
  longitude: number;
  detail: string;
  tripId?: string;
}

export interface MapHazard {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'ADVISORY';
  category: string;
  location: string;
  affectedRoute: string;
  /** Null when the alert's free-text location could not be placed. */
  latitude: number | null;
  longitude: number | null;
}

export interface TripRoute {
  tripId: string;
  name: string;
  meetingPoint: string;
  /** Straight lines between city centres — never a real road route. */
  approximate: boolean;
  /** Cities the server could not place, so the UI can say so. */
  unplacedCities: number;
  points: { name: string; latitude: number; longitude: number }[];
}

// Per-category push opt-outs plus the master switch
// (docs/REMEDIATION.md §8.18). The categories mirror the backend's
// NotificationType.
export interface NotificationPreferences {
  pushNotifications: boolean;
  pushTripUpdates: boolean;
  pushHazardAlerts: boolean;
  pushSeasonal: boolean;
}

/** The §0.2.1 API response envelope, as parsed straight off the wire — every
 * field is optional/loosely typed here because this is what a non-2xx or
 * malformed response looks like before it's been checked; `data`'s real
 * shape is asserted by each caller via requestEnvelope<T>'s generic. */
interface ApiEnvelope {
  ok?: boolean;
  data?: unknown;
  meta?: { cursor?: string | null; total?: number };
  error?: { code?: ApiErrorCode; message?: string; details?: unknown };
}

interface RequestOptions extends RequestInit {
  /** Override the default 10s timeout for a slow endpoint (e.g. an upload). */
  timeoutMs?: number;
  /** Skip the automatic retry-on-5xx/network-error for non-idempotent calls
   * that already have their own retry semantics, or where a duplicate side
   * effect would be worse than a visible failure. */
  noRetry?: boolean;
}

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(err: unknown): boolean {
  // AbortError (our own timeout) and TypeError (fetch's generic "Network
  // request failed") are the two shapes a dropped connection takes here —
  // anything else (a thrown ApiError from a non-2xx response we've already
  // decided isn't retryable, a programming error) should not be retried.
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true;
  return false;
}

/**
 * The single HTTP entry point for the whole app. Always throws a typed
 * ApiError on failure — never returns null to signal one (docs/REMEDIATION.md
 * §0.2.1, §6.2). A network-level failure (timeout, offline, DNS) gets a
 * client-side code; a server response with `ok: false` gets the server's own
 * code, message, and details verbatim so the UI can react to specific cases
 * (e.g. ACCOUNT_LOCKED) without string-matching a message.
 */
async function requestEnvelope<T>(
  endpoint: string,
  options?: RequestOptions,
  isAuthRetry = false,
  attempt = 0,
): Promise<{ data: T; meta?: { cursor?: string | null; total?: number } }> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  const method = (options?.method ?? 'GET').toUpperCase();
  const requestId = generateRequestId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const token = await secureStorage.getItem(ACCESS_TOKEN_KEY).catch(() => null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { ...headers, ...(options?.headers as Record<string, string>) },
      });
    } catch (err) {
      if (isRetryableNetworkError(err) && !options?.noRetry && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        return requestEnvelope<T>(endpoint, options, isAuthRetry, attempt + 1);
      }
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      logger.warn(
        `[API] ${timedOut ? 'Timed out' : 'Network error'} for ${method} ${endpoint} (request ${requestId}):`,
        err,
      );
      throw new ApiError(
        timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        timedOut
          ? 'The request took too long. Please check your connection and try again.'
          : 'Could not reach the server. Please check your connection.',
        null,
        undefined,
        requestId,
      );
    }

    if (res.status === 401 && !isAuthRetry) {
      const refreshToken = await secureStorage.getItem(REFRESH_TOKEN_KEY).catch(() => null);

      // A 401 with no access token and no refresh token means there was
      // never a session to begin with (an anonymous caller hitting a
      // protected endpoint, or the initial hydration probe before any
      // login). That's an expected, quiet case — not a session dying, so
      // there is nothing to refresh and nothing to announce. Without this
      // check, apiService.logout() calling POST /auth/logout while already
      // logged out would itself 401, emit sessionExpired, re-trigger
      // logout(), and loop forever.
      if (!token && !refreshToken) {
        throw new ApiError('UNAUTHORIZED', 'Not signed in.', 401, undefined, requestId);
      }

      const newToken = await refreshAccessToken();
      if (newToken) {
        return requestEnvelope<T>(endpoint, options, true, attempt);
      }
      // A real session existed and refresh failed — the session is gone. Let
      // AppContext react (clear state, show a "session expired" toast, route
      // to /auth) rather than every screen silently rendering empty forever.
      await clearTokens();
      eventBus.emit('sessionExpired', undefined);
      throw new ApiError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401, undefined, requestId);
    }

    if (res.status >= 500 && !options?.noRetry && RETRYABLE_METHODS.has(method) && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      return requestEnvelope<T>(endpoint, options, isAuthRetry, attempt + 1);
    }

    let json: ApiEnvelope | null = null;
    try {
      json = await res.json();
    } catch {
      // Not JSON (e.g. a proxy error page) — fall through to the generic error below.
    }

    if (!res.ok || json?.ok === false) {
      const code: ApiErrorCode = json?.error?.code ?? 'UNKNOWN';
      const message: string = json?.error?.message ?? `Request failed (${res.status}).`;
      logger.warn(`[API] ${method} ${endpoint} -> ${res.status} ${code} (request ${requestId})`);
      throw new ApiError(code, message, res.status, json?.error?.details, requestId);
    }

    return { data: (json?.data !== undefined ? json.data : json) as T, meta: json?.meta };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Thin wrapper over requestEnvelope for the overwhelming majority of call
 * sites, which only ever want the unwrapped `data`. Kept as the default so
 * every existing `apiService` method stays untouched by the pagination work
 * below — only paginated endpoints need requestWithMeta.
 */
async function request<T>(endpoint: string, options?: RequestOptions, isAuthRetry = false, attempt = 0): Promise<T> {
  return (await requestEnvelope<T>(endpoint, options, isAuthRetry, attempt)).data;
}

/**
 * Same contract as `request()`, but also returns the envelope's `meta`
 * (currently just `cursor`, docs/REMEDIATION.md §0.2.1) — every paginated
 * endpoint (feed, trips search) needs this to reach its next page; plain
 * `request()` silently drops `meta`, which is why feed pagination has never
 * been reachable from the client (§8.16) despite the backend supporting it.
 */
async function requestWithMeta<T>(
  endpoint: string,
  options?: RequestOptions,
): Promise<{ data: T; meta?: { cursor?: string | null; total?: number } }> {
  return requestEnvelope<T>(endpoint, options);
}

export const apiService = {
  // Auth & Account
  async login(email: string, password?: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(userData: { name: string; email: string; phoneNumber?: string; password?: string; role?: string }) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async logout(): Promise<void> {
    const refreshToken = await getRefreshToken();
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }).catch((e) => logger.warn('[API] Logout request failed (clearing session locally anyway):', e));
  },

  async forgotPassword(email: string) {
    // The server always replies with the same generic message regardless of
    // whether the email is registered — revealing that would be an account-
    // enumeration leak (backend/src/api/routes/auth.ts). Render its message
    // verbatim rather than writing a second copy of it here.
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string) {
    return request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  async verifyOtp(phoneNumber: string, otpCode: string) {
    return request<AuthResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, otpCode }),
    });
  },

  async getProfile(): Promise<UserProfile | null> {
    return request<UserProfile>('/auth/profile');
  },

  // Right to access — everything the service holds about the caller
  // (docs/REMEDIATION.md §12.4).
  async exportMyData(): Promise<unknown> {
    return request<unknown>('/auth/export');
  },

  // Right to erasure — requires the current password (docs/REMEDIATION.md
  // §12.4). Revokes all sessions and hard-deletes the account server-side.
  async deleteAccount(password: string): Promise<{ deleted: boolean } | null> {
    return request<{ deleted: boolean }>('/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    return request<UserProfile>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // docs/REMEDIATION.md §8.2 — a presigned URL to PUT an avatar image
  // directly to object storage (never through this server). Throws
  // ApiError('STORAGE_UNAVAILABLE') when the backend has no bucket
  // configured — see src/lib/upload.ts, which is what actually calls this
  // and uploads the file.
  async getAvatarUploadUrl(contentType: UploadImageContentType) {
    return request<UploadUrlResponse>('/auth/avatar-upload-url', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  },

  // Same as getAvatarUploadUrl, for create.tsx's custom trip-cover picker
  // (docs/REMEDIATION.md §8.4).
  async getTripCoverUploadUrl(contentType: UploadImageContentType) {
    return request<UploadUrlResponse>('/trips/cover-upload-url', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  },

  // Same as getAvatarUploadUrl, for chat.tsx's photo attachment
  // (docs/REMEDIATION.md §8.7). Chat photos used to be sent as the
  // sender's own device-local file:// URI, which no other member could
  // load.
  async getChatMediaUploadUrl(contentType: UploadImageContentType) {
    return request<UploadUrlResponse>('/chats/media-upload-url', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  },

  // Trips
  // `query` is an optional pre-built query string, e.g.
  // "?maxBudget=15000&limit=50" or "?category=Nature&search=kerala".
  async getTrips(query = ''): Promise<Trip[] | null> {
    return request<Trip[]>(`/trips${query}`);
  },

  // Paginated variant for search.tsx's browse list (docs/REMEDIATION.md
  // §8.3). `getTrips` above still exists for the several other screens/
  // AppContext that just want "the first page" — this is additive, not a
  // replacement. `cursor` comes from a previous call's own return value;
  // omit it for the first page.
  async getTripsPage(params: {
    search?: string;
    category?: string;
    maxBudget?: number;
    guideRequired?: boolean;
    verifiedOnly?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<{ trips: Trip[]; nextCursor?: string }> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'All') qs.set('category', params.category);
    if (params.maxBudget !== undefined) qs.set('maxBudget', String(params.maxBudget));
    if (params.guideRequired) qs.set('guideRequired', 'true');
    if (params.verifiedOnly) qs.set('verifiedOnly', 'true');
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit) qs.set('limit', String(params.limit));

    const { data, meta } = await requestWithMeta<Trip[]>(`/trips?${qs.toString()}`);
    return { trips: data, nextCursor: meta?.cursor ?? undefined };
  },

  // Trips the current user is a confirmed member of — real data backing
  // the "My Bookings" screen now that payments/wallet are removed for v1
  // (docs/REMEDIATION.md §8.11).
  async getMyTrips(): Promise<MyTripBooking[] | null> {
    return request<MyTripBooking[]>('/trips/mine');
  },

  async createTrip(tripData: Partial<Trip>): Promise<Trip | null> {
    return request<Trip>('/trips', {
      method: 'POST',
      body: JSON.stringify(tripData),
    });
  },

  async joinTrip(tripId: string): Promise<Trip | null> {
    return request<Trip>(`/trips/${tripId}/join`, {
      method: 'POST',
    });
  },

  async getTripMembers(tripId: string): Promise<TripMemberRow[] | null> {
    return request<TripMemberRow[]>(`/trips/${tripId}/members`);
  },

  // docs/REMEDIATION.md §8.6 — organizer roster tools (check-in, room/seat
  // allocation). Organizer-only server-side; any subset of the three
  // fields.
  async updateTripRoster(
    tripId: string,
    userId: string,
    updates: { checkedIn?: boolean; roomAllocated?: string | null; seatAllocated?: string | null }
  ): Promise<{ userId: string; checkedIn: boolean; roomAllocated: string | null; seatAllocated: string | null }> {
    return request(`/trips/${tripId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // docs/REMEDIATION.md §8.6 — real announcement fan-out to trip members
  // (was a local-only Alert.alert claiming a push notification had been
  // sent).
  async postTripAnnouncement(
    tripId: string,
    announcement: { title: string; content: string }
  ): Promise<{ message: string; recipientCount: number }> {
    return request(`/trips/${tripId}/announcements`, {
      method: 'POST',
      body: JSON.stringify(announcement),
    });
  },

  // Trip itinerary / day schedule (docs/REMEDIATION.md §8.6). Readable by
  // any trip participant; only the organizer can add or delete a day.
  async getTripItinerary(
    tripId: string
  ): Promise<{ tripId: string; canEdit: boolean; days: { id: string; day: number; title: string; plan: string }[] }> {
    return request(`/trips/${tripId}/itinerary`);
  },

  async addTripItineraryDay(
    tripId: string,
    day: { title: string; plan: string }
  ): Promise<{ id: string; day: number }> {
    return request(`/trips/${tripId}/itinerary`, {
      method: 'POST',
      body: JSON.stringify(day),
    });
  },

  async deleteTripItineraryDay(tripId: string, dayId: string): Promise<{ id: string }> {
    return request(`/trips/${tripId}/itinerary/${dayId}`, { method: 'DELETE' });
  },

  // Shared trip expenses / budget tracker (docs/REMEDIATION.md §8.12).
  async getTripExpenses(tripId: string): Promise<TripExpenses | null> {
    return request<TripExpenses>(`/trips/${tripId}/expenses`);
  },

  async addTripExpense(
    tripId: string,
    data: { description: string; amount: number; category: string },
  ): Promise<{ id: string } | null> {
    return request<{ id: string }>(`/trips/${tripId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteTripExpense(tripId: string, expenseId: string): Promise<{ id: string } | null> {
    return request<{ id: string }>(`/trips/${tripId}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  },

  async midwayJoin(tripId: string, fromCity: string, toCity: string) {
    return request(`/trips/${tripId}/midway-join`, {
      method: 'POST',
      body: JSON.stringify({ fromCity, toCity }),
    });
  },

  // Real upcoming public trips, optionally sorted by straight-line distance
  // from the caller's device location (docs/REMEDIATION.md §8.13). `query`
  // is a pre-built query string like "?lat=28.6&lng=77.2" or "".
  async getNearbyTrips(query = ''): Promise<NearbyTrip[] | null> {
    return request<NearbyTrip[]>(`/trips/nearby${query}`);
  },

  // Guides
  async getGuides(): Promise<Guide[] | null> {
    return request<Guide[]>('/guides');
  },

  // Stories & Blogs
  async getStories(): Promise<Story[] | null> {
    return request<Story[]>('/stories');
  },

  async createStory(storyData: StoryPayload) {
    return request('/stories', {
      method: 'POST',
      body: JSON.stringify(storyData),
    });
  },

  async likeStory(storyId: string) {
    return request(`/stories/${storyId}/like`, {
      method: 'POST',
    });
  },

  // Safety
  async getSOSAlerts(): Promise<SOSAlert[] | null> {
    return request<SOSAlert[]>('/safety/sos');
  },

  async triggerSOS(userName: string, latitude: number, longitude: number) {
    return request('/safety/sos', {
      method: 'POST',
      body: JSON.stringify({ userName, latitude, longitude }),
    });
  },

  async resolveSOS(id: string) {
    return request(`/safety/sos/${id}/resolve`, {
      method: 'POST',
    });
  },

  async getEmergencyContacts(city: string) {
    return request(`/safety/contacts?city=${encodeURIComponent(city)}`);
  },

  async getMonsoonAdvisories() {
    return request('/safety/monsoon-advisory');
  },

  async getNotifications(): Promise<AppNotification[] | null> {
    return request<AppNotification[]>('/notifications');
  },

  async markNotificationsRead(): Promise<MessageResponse | null> {
    return request('/notifications/read-all', {
      method: 'POST',
    });
  },

  async markNotificationRead(id: string): Promise<MessageResponse | null> {
    return request(`/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  // Map data (docs/REMEDIATION.md §8.8). map.tsx / map.web.tsx used to
  // render four hardcoded pins and a hardcoded Ranchi→Vrindavan route for
  // every user; these are the real rows behind them.
  async getMapPins(): Promise<MapPin[]> {
    return request('/map/pins');
  },

  async getMapHazards(): Promise<MapHazard[]> {
    return request('/map/hazards');
  },

  async getTripRoute(tripId: string): Promise<TripRoute> {
    return request(`/map/trips/${tripId}/route`);
  },

  // Push notifications (docs/REMEDIATION.md §8.18). Before this the
  // `pushNotifications` profile toggle wrote a boolean nobody read —
  // there was no device-token endpoint to call at all.
  async registerDeviceToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<{ registered: boolean }> {
    return request('/notifications/device-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  },

  async unregisterDeviceToken(token: string): Promise<{ registered: boolean }> {
    return request('/notifications/device-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  },

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return request('/notifications/preferences');
  },

  async updateNotificationPreferences(
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async getUnreadNotificationCount(): Promise<{ count: number }> {
    return request('/notifications/unread-count');
  },

  // Homepage — Destinations
  async getDestinations(): Promise<Destination[] | null> {
    return request<Destination[]>('/destinations');
  },

  async getDestination(id: string): Promise<DestinationDetail | null> {
    return request<DestinationDetail>(`/destinations/${id}`);
  },

  async createDestination(data: Omit<Destination, 'id'>): Promise<Destination | null> {
    return request('/destinations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Homepage — Weather
  async getWeatherLocations(): Promise<WeatherLocation[] | null> {
    return request<WeatherLocation[]>('/weather');
  },

  // Homepage — Alerts
  async getAlerts(): Promise<HazardAlert[] | null> {
    return request<HazardAlert[]>('/alerts');
  },

  async createAlert(data: Omit<HazardAlert, 'id' | 'active' | 'createdAt'>): Promise<HazardAlert | null> {
    return request('/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ── Interactions (Likes, Join Requests, Unread Count) ──────

  async toggleLikeTrip(tripId: string, userId?: string): Promise<{ liked: boolean; likesCount: number } | null> {
    return request('/interactions/like', {
      method: 'POST',
      body: JSON.stringify({ tripId, userId }),
    });
  },

  async getLikedTrips(userId?: string): Promise<string[] | null> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request<string[]>(`/interactions/likes${qs}`);
  },

  // adjustedPrice is never a param here — the server computes it
  // authoritatively from the trip's route (docs/REMEDIATION.md §8.6).
  async createJoinRequest(
    tripId: string,
    opts?: { midway?: boolean; fromCity?: string; toCity?: string },
  ): Promise<JoinRequestSummary> {
    return request<JoinRequestSummary>('/interactions/join-request', {
      method: 'POST',
      body: JSON.stringify({ tripId, ...opts }),
    });
  },

  async getJoinRequests(): Promise<JoinRequestSummary[] | null> {
    return request<JoinRequestSummary[]>('/interactions/join-requests');
  },

  async cancelJoinRequest(tripId: string): Promise<MessageResponse | null> {
    return request(`/interactions/join-request/${tripId}`, {
      method: 'DELETE',
    });
  },

  async getIncomingRequests(): Promise<IncomingJoinRequest[] | null> {
    return request<IncomingJoinRequest[]>('/interactions/incoming-requests');
  },

  async updateJoinRequestStatus(requestId: string, status: 'APPROVED' | 'REJECTED'): Promise<MessageResponse | null> {
    return request(`/interactions/join-request/${requestId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async getMyGuideProfile(): Promise<GuideProfile | null> {
    return request<GuideProfile>('/guides/profile');
  },

  async getEarnings(guideId: string): Promise<GuideEarnings | null> {
    return request<GuideEarnings>(`/guides/${guideId}/earnings`);
  },

  async getGuidePackages(guideId: string): Promise<GuidePackage[] | null> {
    return request<GuidePackage[]>(`/guides/${guideId}/packages`);
  },

  async createGuidePackage(guideId: string, data: GuidePackageInput): Promise<GuidePackage | null> {
    return request(`/guides/${guideId}/packages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateGuidePackage(guideId: string, pkgId: string, data: Partial<GuidePackageInput>): Promise<GuidePackage | null> {
    return request(`/guides/${guideId}/packages/${pkgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGuidePackage(guideId: string, pkgId: string): Promise<MessageResponse | null> {
    return request(`/guides/${guideId}/packages/${pkgId}`, {
      method: 'DELETE',
    });
  },

  async getGuideReels(guideId: string): Promise<GuideReel[] | null> {
    return request<GuideReel[]>(`/guides/${guideId}/reels`);
  },

  async uploadGuideReel(guideId: string, data: GuideReelInput): Promise<GuideReel | null> {
    return request(`/guides/${guideId}/reels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // A story cover photo, reel video, or reel thumbnail (docs/REMEDIATION.md
  // §8.17) — same pattern as getAvatarUploadUrl/getTripCoverUploadUrl.
  async getGuideMediaUploadUrl(
    contentType: UploadImageContentType | 'video/mp4' | 'video/quicktime',
  ) {
    return request<UploadUrlResponse>('/guides/media-upload-url', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    });
  },

  async getGuideLiveStatus(guideId: string): Promise<GuideLiveStatus | null> {
    return request<GuideLiveStatus>(`/guides/${guideId}/live-status`);
  },

  async updateGuideLiveStatus(guideId: string, coords: { latitude: number; longitude: number }): Promise<LiveLocation | null> {
    return request(`/guides/${guideId}/live-status`, {
      method: 'POST',
      body: JSON.stringify(coords),
    });
  },

  // Chats
  async getChats(): Promise<ChatRoomSummary[] | null> {
    return request<ChatRoomSummary[]>('/chats');
  },

  async getChatDetails(id: string): Promise<ChatRoomSummary | null> {
    return request<ChatRoomSummary>(`/chats/${id}`);
  },

  async getChatMessages(id: string): Promise<ChatMessage[] | null> {
    return request<ChatMessage[]>(`/chats/${id}/messages`);
  },

  async markChatRead(id: string): Promise<MessageResponse | null> {
    return request(`/chats/${id}/read`, {
      method: 'POST',
    });
  },

  // docs/REMEDIATION.md §8.7 — real leave-group, replacing chat.tsx's
  // client-side-only list filter.
  async leaveChatRoom(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/chats/${id}/members/me`, {
      method: 'DELETE',
    });
  },

  // ── Unified Feed (Stories + Guide Reels merged) ──────
  async getFeed(limit: number = 20, cursor?: string): Promise<FeedPage | null> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<FeedPage>(`/feed?${params.toString()}`);
  },

  // ── Guide Leads (pending JoinRequests as leads) ──────
  async getGuideLeads(guideId: string): Promise<GuideLead[] | null> {
    return request<GuideLead[]>(`/guides/${guideId}/leads`);
  },

  // ── Live Weather (at specific coordinates) ──────
  async getLiveWeather(lat: number, lon: number): Promise<LiveWeather | null> {
    return request<LiveWeather>(`/weather/live?lat=${lat}&lon=${lon}`);
  },

  // ── Emergency Contacts CRUD ──────
  async getMyEmergencyContacts(): Promise<EmergencyContact[] | null> {
    return request<EmergencyContact[]>('/safety/contacts');
  },

  async createEmergencyContact(data: { name: string; relation: string; phoneNumber: string }): Promise<EmergencyContact | null> {
    return request('/safety/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteEmergencyContact(id: string): Promise<MessageResponse | null> {
    return request(`/safety/contacts/${id}`, {
      method: 'DELETE',
    });
  },
};
