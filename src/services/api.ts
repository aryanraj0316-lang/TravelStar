import { secureStorage } from './secureStorage';
import { eventBus } from './event-bus';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Guide, SOSAlert, Trip, UserProfile } from '../store/AppContext';

// Dynamically resolve server IP so it connects on Web, Android Emulator (10.0.2.2), and Physical Android/iOS devices over local Wi-Fi
export const getHostUrl = () => {
  if (Platform.OS === 'web') return 'http://localhost:5000';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:5000`;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
};

const getApiBaseUrl = () => `${getHostUrl()}/api/v1`;

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
      if (!json?.token || !json?.refreshToken) return null;

      await setTokens(json.token, json.refreshToken);
      return json.token as string;
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

async function request<T>(endpoint: string, options?: RequestInit, isRetry = false): Promise<T | null> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  try {
    const token = await secureStorage.getItem(ACCESS_TOKEN_KEY).catch(() => null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers as Record<string, string>),
      },
    });

    if (res.status === 401 && !isRetry) {
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
        return null;
      }

      const newToken = await refreshAccessToken();
      if (newToken) {
        return request<T>(endpoint, options, true);
      }
      // A real session existed and refresh failed — the session is gone. Let
      // AppContext react (clear state, show a "session expired" toast, route
      // to /auth) rather than every screen silently rendering empty forever.
      await clearTokens();
      eventBus.emit('sessionExpired', {});
      return null;
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // not JSON
    }

    if (!res.ok) {
      logger.warn(`[API] HTTP Error ${res.status} for ${endpoint}`);
      return null;
    }

    return json.data !== undefined ? json.data : json;
  } catch (err) {
    logger.warn(`[API] Request failed for ${endpoint} (${url}):`, err);
    throw err;
  }
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
    return request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string) {
    return request('/auth/reset-password', {
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

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    return request<UserProfile>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Trips
  async getTrips(): Promise<Trip[] | null> {
    return request<Trip[]>('/trips');
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

  async midwayJoin(tripId: string, fromCity: string, toCity: string) {
    return request(`/trips/${tripId}/midway-join`, {
      method: 'POST',
      body: JSON.stringify({ fromCity, toCity }),
    });
  },

  async getNearbyPlaces(): Promise<any[] | null> {
    return request<any[]>('/trips/nearby');
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

  // Wallet & Payments
  async getWalletTransactions(): Promise<any[] | null> {
    return request<any[]>('/payments/wallet/transactions');
  },

  async addWalletFunds(amount: number, remark?: string) {
    return request('/payments/wallet/add', {
      method: 'POST',
      body: JSON.stringify({ amount, remark }),
    });
  },

  async withdrawWalletFunds(amount: number, remark?: string) {
    return request('/payments/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, remark }),
    });
  },

  async createBooking(type: string, targetId: string, amount: number) {
    return request('/payments/book', {
      method: 'POST',
      body: JSON.stringify({ type, targetId, amount }),
    });
  },

  async verifyPayment(bookingId: string, paymentId: string, signature: string) {
    return request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ bookingId, paymentId, signature }),
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

  async createJoinRequest(tripId: string, opts?: { midway?: boolean; fromCity?: string; toCity?: string; adjustedPrice?: number }): Promise<any> {
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
