import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';

// expo-notifications throws at *import* time (not just when a function is
// called) for remote push on Android inside Expo Go — SDK 53+ removed that
// capability entirely (docs/versions/v57.0.0/sdk/notifications). This
// module is pulled in from AppContext.tsx before any screen renders, so a
// static import here crashed every screen in Expo Go on Android. Loading it
// conditionally keeps a real dev-client/standalone build unaffected and
// makes Expo Go on Android behave the same as "push not configured" instead
// of a hard crash.
const isExpoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy: a static import of expo-notifications throws at import time in Expo Go on Android (see above)
const Notifications = isExpoGoAndroid ? null : (require('expo-notifications') as typeof import('expo-notifications'));

/**
 * Real push-notification registration (docs/REMEDIATION.md §8.18).
 *
 * Before this, the `pushNotifications` toggle on profile.tsx did nothing
 * at all: `expo-notifications` was not even a dependency, no device token
 * was ever minted or sent anywhere, and the backend had no table to store
 * one in. The switch wrote a boolean nobody read.
 *
 * Per the 2026-08-27 decision on credential-dependent features, this codes
 * the real path and reads its configuration from the app config — it does
 * not fake a token or silently no-op. This project has no EAS project
 * provisioned, so `getEasProjectId()` returns null and registration
 * reports `not-configured`, which the caller surfaces honestly instead of
 * leaving the user believing push is on.
 */

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'not-configured' }
  | { status: 'failed'; error: unknown };

/** The Android channel every push from this app is delivered on. */
const ANDROID_CHANNEL_ID = 'default';

/**
 * The EAS project ID tokens are minted against. `getExpoPushTokenAsync`
 * defaults to this same path, but reading it ourselves lets us tell the
 * user "push isn't configured on this build" rather than surfacing a raw
 * SDK error.
 */
function getEasProjectId(): string | null {
  const fromConfig =
    Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return typeof fromConfig === 'string' && fromConfig.length > 0 ? fromConfig : null;
}

/**
 * How a notification behaves while the app is in the foreground. Set once
 * at module scope so it is in place before any notification can arrive.
 */
if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    logger.warn('[Push] setNotificationHandler failed:', e);
  }
}

/**
 * Ask for permission, mint an Expo push token, and register it with the
 * backend. Safe to call repeatedly — registration is an upsert keyed on
 * the token, so re-registering the same device refreshes it rather than
 * duplicating it.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Notifications) return { status: 'unsupported' };
  // A simulator has no push entitlement and cannot receive a real token.
  if (!Device.isDevice) return { status: 'unsupported' };

  const projectId = getEasProjectId();
  if (!projectId) return { status: 'not-configured' };

  try {
    // Android 8+ drops notifications on an unknown channel, and on
    // Android 13+ creating the channel is what makes the permission
    // prompt meaningful — so this must come before requesting.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Trip and safety alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return { status: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiService.registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return { status: 'registered', token };
  } catch (error) {
    logger.warn('[Push] Registration failed:', error);
    return { status: 'failed', error };
  }
}

/**
 * Drop this device's token — on logout, or when the user switches push
 * off. Without this a signed-out phone keeps receiving the previous
 * account's notifications until the token happens to be reassigned.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!Notifications) return;
  const projectId = getEasProjectId();
  if (!projectId || !Device.isDevice) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiService.unregisterDeviceToken(token);
  } catch (error) {
    // Best effort: a logout must not be blocked by an unreachable server.
    logger.warn('[Push] Unregister failed:', error);
  }
}

/**
 * The route a notification's `data` payload points at. The backend sets
 * these in lib/push.ts; anything unrecognised falls back to the
 * notifications list rather than crashing on an unknown route.
 */
export function routeForNotificationData(data: Record<string, unknown> | undefined): string {
  const screen = typeof data?.screen === 'string' ? data.screen : '';
  const tripId = typeof data?.tripId === 'string' ? data.tripId : '';
  // Only routes that actually exist. There is no standalone trip screen —
  // /map is the one that takes a tripId and focuses that trip — so a trip
  // notification lands there, and anything without one falls back to the
  // notifications list rather than a dead route.
  switch (screen) {
    case 'trip':
      return tripId ? `/map?tripId=${encodeURIComponent(tripId)}` : '/search';
    case 'alerts':
      return '/monsoon-advisory';
    case 'chat':
      return '/chat';
    default:
      return '/notifications';
  }
}

/** Sync the app-icon badge to the server's unread count. */
export async function syncBadgeCount(): Promise<void> {
  if (!Notifications) return;
  try {
    const { count } = await apiService.getUnreadNotificationCount();
    if (typeof Notifications.setBadgeCountAsync === 'function') {
      await Notifications.setBadgeCountAsync(count);
    }
  } catch (error) {
    logger.warn('[Push] Badge sync failed:', error);
  }
}
