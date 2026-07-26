import { safeStorage } from './storage';
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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  try {
    const token = await safeStorage.getItem('userToken');

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

    let json: any = null;
    try {
      json = await res.json();
    } catch (e) {
      // not JSON
    }

    if (!res.ok) {
      console.warn(`[API] HTTP Error ${res.status} for ${endpoint}`);
      throw new Error(json?.message || `Request failed with status ${res.status}`);
    }

    return json.data !== undefined ? json.data : json;
  } catch (err) {
    console.warn(`[API] Request failed for ${endpoint} (${url}):`, err);
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

  async getUnreadNotificationCount(): Promise<{ count: number } | null> {
    return request<{ count: number }>('/interactions/unread-count');
  },
};
