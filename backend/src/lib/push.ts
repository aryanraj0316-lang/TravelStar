import prisma from '../services/db';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Real push delivery through the Expo push service
 * (docs/REMEDIATION.md §8.18).
 *
 * Before this, the `pushNotifications` profile toggle did nothing at all:
 * no device token was ever registered anywhere, front or back end, so no
 * push could ever be delivered no matter how the switch was set. Every
 * "notification" the app produced was an in-app feed row only.
 *
 * Per the 2026-08-27 decision on credential-dependent features, this codes
 * the real path and reads its configuration from env rather than faking
 * delivery. Note the Expo push service needs no server credential by
 * default — EXPO_ACCESS_TOKEN is only required once a project turns on
 * push security in its Expo dashboard, so this works as soon as a real
 * device registers a token. What is *not* available in this environment is
 * an EAS project ID for the client to mint tokens against, so in practice
 * no token will be registered until an operator sets one; the code below
 * then simply has nothing to send to, which it reports honestly rather
 * than pretending.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// The Expo push API accepts at most 100 messages per request.
const MAX_MESSAGES_PER_REQUEST = 100;

export type PushCategory = 'TRIP' | 'HAZARD' | 'SEASONAL';

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app on tap — drives the deep link (§8.18). */
  data?: Record<string, string>;
  /** iOS app-icon badge. Pass the recipient's real unread count. */
  badge?: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** The Profile column that gates each notification category. */
const CATEGORY_COLUMN: Record<PushCategory, 'pushTripUpdates' | 'pushHazardAlerts' | 'pushSeasonal'> = {
  TRIP: 'pushTripUpdates',
  HAZARD: 'pushHazardAlerts',
  SEASONAL: 'pushSeasonal',
};

/**
 * The users among `userIds` who have both the master push switch and the
 * given category switched on. A user with no Profile row has never seen
 * the settings screen, so they keep the schema defaults (all on).
 */
async function filterOptedIn(userIds: string[], category: PushCategory): Promise<string[]> {
  if (userIds.length === 0) return [];
  const column = CATEGORY_COLUMN[category];
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      pushNotifications: true,
      pushTripUpdates: true,
      pushHazardAlerts: true,
      pushSeasonal: true,
    },
  });
  const optedOut = new Set(
    profiles.filter((p) => !p.pushNotifications || p[column] === false).map((p) => p.userId)
  );
  return userIds.filter((id) => !optedOut.has(id));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Send one message to every device belonging to every opted-in user in
 * `userIds`. Returns how many devices were actually written to, so callers
 * can report a real number instead of assuming delivery.
 *
 * Never throws: a push failure must not fail the request that triggered it
 * (the in-app notification row is the durable record — the push is the
 * best-effort nudge on top of it).
 */
export async function sendPushToUsers(
  userIds: string[],
  category: PushCategory,
  message: PushMessage
): Promise<{ sent: number; skipped: number }> {
  try {
    const unique = [...new Set(userIds)];
    const optedIn = await filterOptedIn(unique, category);
    const skipped = unique.length - optedIn.length;
    if (optedIn.length === 0) return { sent: 0, skipped };

    const devices = await prisma.deviceToken.findMany({
      where: { userId: { in: optedIn } },
      select: { token: true, platform: true },
    });
    if (devices.length === 0) return { sent: 0, skipped };

    let sent = 0;
    for (const batch of chunk(devices, MAX_MESSAGES_PER_REQUEST)) {
      const payload = batch.map((d) => ({
        to: d.token,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default' as const,
        badge: message.badge,
        // Matches the channel the client creates in src/lib/push.ts.
        // Android 8+ drops a notification with an unknown channel.
        channelId: 'default',
        priority: category === 'HAZARD' ? ('high' as const) : ('default' as const),
      }));

      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        logger.warn('[Push] Expo push service rejected a batch', { status: res.status });
        continue;
      }

      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];

      // A ticket is positional: tickets[i] answers payload[i].
      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          sent += 1;
          return;
        }
        // "Stop sending to this token immediately" — the device uninstalled
        // the app or revoked permission. Prune it rather than retrying it
        // on every future notification forever.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[i]?.token;
          if (token) dead.push(token);
        } else {
          logger.warn('[Push] Expo push ticket error', { error: ticket.details?.error, message: ticket.message });
        }
      });

      if (dead.length > 0) {
        await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
        logger.info('[Push] Pruned unregistered device tokens', { count: dead.length });
      }
    }

    return { sent, skipped };
  } catch (err) {
    logger.warn('[Push] Failed to deliver push notifications:', err);
    return { sent: 0, skipped: 0 };
  }
}

/**
 * The recipient's current unread count, for the app-icon badge. Mirrors
 * what GET /notifications reports as unread: personal rows with
 * `unread`, plus every broadcast with no NotificationRead row for them
 * (§5.8).
 */
export async function unreadCountFor(userId: string): Promise<number> {
  const [personal, broadcastTotal, broadcastRead] = await Promise.all([
    prisma.notification.count({ where: { userId, unread: true } }),
    prisma.notification.count({ where: { userId: null } }),
    prisma.notificationRead.count({ where: { userId, notification: { userId: null } } }),
  ]);
  return personal + Math.max(0, broadcastTotal - broadcastRead);
}
