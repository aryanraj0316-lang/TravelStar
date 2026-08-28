import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { routeForNotificationData, syncBadgeCount } from '@/lib/push';
import { logger } from '@/lib/logger';

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

    const go = (response: Notifications.NotificationResponse | null) => {
      if (!response || cancelled) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const path = routeForNotificationData(data);
      try {
        router.push(path as never);
      } catch (error) {
        logger.warn('[Push] Could not open the notification target:', error);
      }
    };

    // Cold start: the tap that launched the app.
    void Notifications.getLastNotificationResponseAsync().then(go);

    const subscription = Notifications.addNotificationResponseReceivedListener(go);
    return () => {
      cancelled = true;
      subscription.remove();
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
