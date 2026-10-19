import prisma from '../services/db';
import { env } from '../config/env';
import { logger } from './logger';
import { pruneReadChatNotifications, pruneReadEnquiryNotifications } from '../services/enquiry-notification-hygiene';
import { HIDDEN_FROM_LIST } from './notification-visibility';

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
      select: { token: true, platform: true, userId: true },
    });
    if (devices.length === 0) return { sent: 0, skipped };

    // Every push carries its recipient's own unread count — the app-icon
    // badge. It used to be one number per call, passed by only some callers,
    // so a push to several people (an announcement, a hazard alert) left
    // everyone's badge stale. Callers create the notification row first, so
    // the count already includes it. iOS reads `badge`; Android has no badge
    // field, so the app's push handler reads `unreadCount` from the data
    // (patches/expo-notifications+*.patch).
    const recipients = [...new Set(devices.map((d) => d.userId))];
    const unread = new Map(
      await Promise.all(recipients.map(async (uid) => [uid, await unreadCountFor(uid)] as const)),
    );
    // The notification row each recipient got for this push (callers create
    // it just before, with the same title), so tapping the push marks exactly
    // that notification read in the app. A push with no row (an SOS) has none.
    const since = new Date(Date.now() - 5 * 60 * 1000);
    const rowIds = new Map(
      await Promise.all(
        recipients.map(async (uid) => {
          const row = await prisma.notification.findFirst({
            where: { title: message.title, createdAt: { gte: since }, OR: [{ userId: uid }, { userId: null }] },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          return [uid, row?.id] as const;
        }),
      ),
    );

    let sent = 0;
    for (const batch of chunk(devices, MAX_MESSAGES_PER_REQUEST)) {
      const payload = batch.map((d) => ({
        to: d.token,
        title: message.title,
        body: message.body,
        data: {
          ...(message.data ?? {}),
          unreadCount: String(unread.get(d.userId) ?? 0),
          ...(rowIds.get(d.userId) ? { notificationId: rowIds.get(d.userId) as string } : {}),
        },
        sound: 'default' as const,
        badge: unread.get(d.userId) ?? 0,
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
 * The recipient's current unread count, for the app-icon badge and the bell
 * dot. Mirrors exactly what GET /notifications reports as unread: personal
 * rows with `unread`, plus broadcasts sent since they signed up with no
 * NotificationRead row for them (§5.8), leaving out the same rows the list
 * leaves out (lib/notification-visibility.ts).
 */
export async function unreadCountFor(userId: string): Promise<number> {
  // Same rule the notifications list applies, so the header dot and the
  // app-icon badge can never disagree with it: an enquiry alert for a
  // thread this user has already read does not count.
  await pruneReadEnquiryNotifications(userId);
  await pruneReadChatNotifications(userId);

  const sinceJoined = await broadcastsSinceJoined(userId);

  const [personal, broadcastTotal, broadcastRead] = await Promise.all([
    prisma.notification.count({
      where: {
        userId,
        unread: true,
        NOT: HIDDEN_FROM_LIST,
      },
    }),
    prisma.notification.count({ where: sinceJoined }),
    prisma.notificationRead.count({ where: { userId, notification: sinceJoined } }),
  ]);
  return personal + Math.max(0, broadcastTotal - broadcastRead);
}

/** Broadcasts that can count as unread for this user: sent since they joined, and shown in the list. */
async function broadcastsSinceJoined(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  return { userId: null, createdAt: { gte: me?.createdAt ?? new Date(0) }, NOT: HIDDEN_FROM_LIST };
}

/**
 * What is unread for this user, by id and by title, for the app to take
 * already-read notifications out of the phone's tray — which is what
 * launchers that badge from the tray count. A tray entry carries its row's
 * id (sendPushToUsers); title is the fallback, since a push and its row
 * share one. Call after unreadCountFor, which settles stale rows first.
 */
export async function unreadSummaryFor(userId: string): Promise<{ ids: string[]; titles: string[] }> {
  const sinceJoined = await broadcastsSinceJoined(userId);
  const [personal, broadcasts] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, unread: true, NOT: HIDDEN_FROM_LIST },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.notification.findMany({
      where: { ...sinceJoined, reads: { none: { userId } } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  const rows = [...personal, ...broadcasts];
  return { ids: rows.map((n) => n.id), titles: [...new Set(rows.map((n) => n.title))] };
}
