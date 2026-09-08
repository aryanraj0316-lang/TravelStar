import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import type * as NotificationsType from 'expo-notifications';
import { useRouter } from 'expo-router';
import { routeForNotificationData, syncBadgeCount } from '@/lib/push';
import { logger } from '@/lib/logger';

// See src/lib/push.ts for why this can't be a static import: it throws at
// import time for remote push on Android inside Expo Go.
const isExpoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy: a static import of expo-notifications throws at import time in Expo Go on Android (see above)
const Notifications = isExpoGoAndroid ? null : (require('expo-notifications') as typeof NotificationsType);

/**
 * Deep links from a notification tap, plus app-icon badge upkeep
 * (docs/REMEDIATION.md §8.18). Mounted once at the root layout.
 *
 * Two entry points, both needed: `getLastNotificationResponseAsync` covers
 * a cold start (the app was killed and the tap launched it, so no listener
 * existed yet to hear it), and the listener covers a tap while the app is
 * already running.
 */
export function useNotificationRouter(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const go = (response: NotificationsType.NotificationResponse | null) => {
      if (!response || cancelled) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const path = routeForNotificationData(data);
      try {
        router.push(path as never);
      } catch (error) {
        logger.warn('[Push] Could not open the notification target:', error);
      }
    };

    if (!Notifications) {
      return () => {
        cancelled = true;
      };
    }

    try {
      // Cold start: the tap that launched the app.
      if (typeof Notifications.getLastNotificationResponseAsync === 'function') {
        Notifications.getLastNotificationResponseAsync()
          .then(go)
          .catch((error: unknown) => logger.warn('[Push] getLastNotificationResponseAsync failed:', error));
      }

      if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
        const subscription = Notifications.addNotificationResponseReceivedListener(go);
        return () => {
          cancelled = true;
          subscription.remove();
        };
      }
    } catch (error) {
      logger.warn('[Push] Notification listeners unsupported:', error);
    }
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The badge can drift while the app is closed (notifications read on
  // another device, or arriving with no push permission), so resync on
  // mount and every time the app comes back to the foreground.
  useEffect(() => {
    void syncBadgeCount();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncBadgeCount();
    });
    return () => subscription.remove();
  }, []);
}
