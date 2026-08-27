import { secureStorage } from './secureStorage';
import { eventBus } from './event-bus';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { DestinationDetail, Guide, MyTripBooking, SOSAlert, Trip, UserProfile } from '../store/AppContext';
import { ApiErrorCode } from '@/types/api-error-codes';

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
): Promise<{ data: T; meta?: { cursor?: string; total?: number } }> {
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
      eventBus.emit('sessionExpired', {});
      throw new ApiError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401, undefined, requestId);
    }

    if (res.status >= 500 && !options?.noRetry && RETRYABLE_METHODS.has(method) && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      return requestEnvelope<T>(endpoint, options, isAuthRetry, attempt + 1);
    }

    let json: any = null;
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
): Promise<{ data: T; meta?: { cursor?: string; total?: number } }> {
  return requestEnvelope<T>(endpoint, options);
}

export const apiService = {
  // Auth & Account
  async login(email: string, password?: string) {
    return request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(userData: { name: string; email: string; phoneNumber?: string; password?: string; role?: string }) {
    return request<any>('/auth/register', {
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
    return request<any>('/auth/verify-otp', {
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
  async getAvatarUploadUrl(contentType: 'image/jpeg' | 'image/png' | 'image/webp') {
    return request<{ uploadUrl: string; publicUrl: string }>('/auth/avatar-upload-url', {
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
    return { trips: data, nextCursor: meta?.cursor };
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

  async getTripMembers(tripId: string): Promise<any[] | null> {
    return request<any[]>(`/trips/${tripId}/members`);
  },

  // Shared trip expenses / budget tracker (docs/REMEDIATION.md §8.12).
  async getTripExpenses(tripId: string): Promise<any | null> {
    return request<any>(`/trips/${tripId}/expenses`);
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
  async getNearbyTrips(query = ''): Promise<any[] | null> {
    return request<any[]>(`/trips/nearby${query}`);
  },

  // Guides
  async getGuides(): Promise<Guide[] | null> {
    return request<Guide[]>('/guides');
  },

  // Stories & Blogs
  async getStories(): Promise<any[] | null> {
    return request<any[]>('/stories');
  },

  async createStory(storyData: any) {
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

  async getNotifications(): Promise<any[] | null> {
    return request<any[]>('/notifications');
  },

  async markNotificationsRead(): Promise<any> {
    return request('/notifications/read-all', {
      method: 'POST',
    });
  },

  async markNotificationRead(id: string): Promise<any> {
    return request(`/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  // Homepage — Destinations
  async getDestinations(): Promise<any[] | null> {
    return request<any[]>('/destinations');
  },

  async getDestination(id: string): Promise<DestinationDetail | null> {
    return request<DestinationDetail>(`/destinations/${id}`);
  },

  async createDestination(data: any): Promise<any> {
    return request('/destinations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Homepage — Weather
  async getWeatherLocations(): Promise<any[] | null> {
    return request<any[]>('/weather');
  },

  // Homepage — Alerts
  async getAlerts(): Promise<any[] | null> {
    return request<any[]>('/alerts');
  },

  async createAlert(data: any): Promise<any> {
    return request('/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ── Interactions (Likes, Join Requests, Unread Count) ──────

  async toggleLikeTrip(tripId: string, userId?: string): Promise<any> {
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
  ): Promise<any> {
    return request('/interactions/join-request', {
      method: 'POST',
      body: JSON.stringify({ tripId, ...opts }),
    });
  },

  async getJoinRequests(): Promise<any[] | null> {
    return request<any[]>('/interactions/join-requests');
  },

  async cancelJoinRequest(tripId: string): Promise<any> {
    return request(`/interactions/join-request/${tripId}`, {
      method: 'DELETE',
    });
  },

  async getIncomingRequests(): Promise<any[] | null> {
    return request<any[]>('/interactions/incoming-requests');
  },

  async updateJoinRequestStatus(requestId: string, status: 'APPROVED' | 'REJECTED'): Promise<any> {
    return request(`/interactions/join-request/${requestId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async getUnreadNotificationCount(): Promise<{ count: number } | null> {
    return request<{ count: number }>('/interactions/unread-count');
  },

  async getMyGuideProfile(): Promise<any | null> {
    return request<any>('/guides/profile');
  },

  async getEarnings(guideId: string): Promise<any | null> {
    return request<any>(`/guides/${guideId}/earnings`);
  },

  async getGuidePackages(guideId: string): Promise<any[] | null> {
    return request<any[]>(`/guides/${guideId}/packages`);
  },

  async createGuidePackage(guideId: string, data: any): Promise<any> {
    return request(`/guides/${guideId}/packages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateGuidePackage(guideId: string, pkgId: string, data: any): Promise<any> {
    return request(`/guides/${guideId}/packages/${pkgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGuidePackage(guideId: string, pkgId: string): Promise<any> {
    return request(`/guides/${guideId}/packages/${pkgId}`, {
      method: 'DELETE',
    });
  },

  async getGuideReels(guideId: string): Promise<any[] | null> {
    return request<any[]>(`/guides/${guideId}/reels`);
  },

  async uploadGuideReel(guideId: string, data: any): Promise<any> {
    return request(`/guides/${guideId}/reels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getGuideLiveStatus(guideId: string): Promise<any | null> {
    return request<any>(`/guides/${guideId}/live-status`);
  },

  async updateGuideLiveStatus(guideId: string, coords: { latitude: number; longitude: number }): Promise<any> {
    return request(`/guides/${guideId}/live-status`, {
      method: 'POST',
      body: JSON.stringify(coords),
    });
  },

  // Chats
  async getChats(): Promise<any[] | null> {
    return request<any[]>('/chats');
  },

  async getChatDetails(id: string): Promise<any | null> {
    return request<any>(`/chats/${id}`);
  },

  async getChatMessages(id: string): Promise<any[] | null> {
    return request<any[]>(`/chats/${id}/messages`);
  },

  async markChatRead(id: string): Promise<any> {
    return request(`/chats/${id}/read`, {
      method: 'POST',
    });
  },

  // ── Unified Feed (Stories + Guide Reels merged) ──────
  async getFeed(limit: number = 20, cursor?: string): Promise<any> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<any>(`/feed?${params.toString()}`);
  },

  // ── Guide Leads (pending JoinRequests as leads) ──────
  async getGuideLeads(guideId: string): Promise<any[] | null> {
    return request<any[]>(`/guides/${guideId}/leads`);
  },

  // ── Live Weather (at specific coordinates) ──────
  async getLiveWeather(lat: number, lon: number): Promise<any | null> {
    return request<any>(`/weather/live?lat=${lat}&lon=${lon}`);
  },

  // ── Emergency Contacts CRUD ──────
  async getMyEmergencyContacts(): Promise<any[] | null> {
    return request<any[]>('/safety/contacts');
  },

  async createEmergencyContact(data: { name: string; relation: string; phoneNumber: string }): Promise<any> {
    return request('/safety/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteEmergencyContact(id: string): Promise<any> {
    return request(`/safety/contacts/${id}`, {
      method: 'DELETE',
    });
  },
};
