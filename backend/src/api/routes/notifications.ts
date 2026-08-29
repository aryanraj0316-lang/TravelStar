import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorPageQuerySchema, takeWithLookahead } from '../../lib/pagination';
import { requireUserId } from '../../lib/auth-context';
import { unreadCountFor } from '../../lib/push';

const router = Router();

const idParamSchema = z.object({ id: z.string().uuid() });

// Retries only make sense for a transient connection failure (e.g. a Neon
// cold start) — a bad query fails the same way every time, so retrying it
// just makes the caller wait ~10s longer for the same error. Prisma tags
// connection-level failures with these error codes.
const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return typeof code === 'string' && RETRYABLE_PRISMA_CODES.has(code);
}

async function queryWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isRetryable(err)) {
      logger.warn(`[Prisma DB Retry] Connection error. Retrying in ${delay}ms... (${retries} left).`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return queryWithRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// Get all notifications — personal ones plus every broadcast, with the
// broadcast's `unread` flag computed per-caller from NotificationRead
// instead of the shared row (docs/REMEDIATION.md §5.8).
router.get('/', async (req, res) => {
  const tokenUserId = requireUserId(req);
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsedQuery.data;
  const pageFilter = cursorFilter(cursor);

  try {
    // Both streams are filtered by the same `createdAt < cursor` and each
    // over-fetches limit+1, so the newest `limit` of the union is correct:
    // anything dropped from a stream's top limit+1 is older than that
    // stream's (limit+1)-th row, which is in turn older than the merged
    // page's last row. This is the same merged-keyset shape feed.ts uses,
    // and it is why the previous unbounded `findMany` could not simply have
    // a `take` bolted on — the two streams advance independently
    // (docs/REMEDIATION.md §5.9).
    const [personal, broadcasts, reads] = await queryWithRetry(() =>
      Promise.all([
        prisma.notification.findMany({
          where: { userId: tokenUserId, ...pageFilter },
          orderBy: { createdAt: 'desc' },
          take: takeWithLookahead(limit),
        }),
        prisma.notification.findMany({
          where: { userId: null, ...pageFilter },
          orderBy: { createdAt: 'desc' },
          take: takeWithLookahead(limit),
        }),
        prisma.notificationRead.findMany({ where: { userId: tokenUserId }, select: { notificationId: true } }),
      ])
    );

    const readIds = new Set(reads.map((r) => r.notificationId));
    const mappedBroadcasts = broadcasts.map((n) => ({ ...n, unread: !readIds.has(n.id) }));

    const merged = [...personal, ...mappedBroadcasts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const hasMore = merged.length > limit;
    const list = merged.slice(0, limit);
    const last = list[list.length - 1];

    res.status(200).json({
      ok: true,
      data: list,
      meta: { cursor: hasMore && last ? last.createdAt.toISOString() : null },
    });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Get notifications failed:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve notifications' } });
  }
});

// ─── Push device registration and preferences (docs/REMEDIATION.md §8.18) ───
// The `pushNotifications` profile toggle used to do nothing at all: no
// device token was ever registered anywhere, so no push could ever be
// delivered no matter how the switch was set. These are the missing half.

// Expo push tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] (or
// the older ExpoPushToken[...] form). Validating the shape here stops a
// junk value from sitting in the table forever, being retried on every
// notification and always failing.
const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

const deviceTokenSchema = z.object({
  token: z.string().trim().regex(EXPO_PUSH_TOKEN_RE, 'Not a valid Expo push token.'),
  platform: z.enum(['ios', 'android', 'web']),
});

// Register (or refresh) this device's push token. Keyed on the token
// itself: the same device re-registering is an upsert, and a token that
// moves to a different account is reassigned rather than duplicated, so a
// shared device never keeps pushing the previous user's notifications.
router.post('/device-token', async (req, res) => {
  const userId = requireUserId(req);
  const parsed = deviceTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid device token.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  try {
    const { token, platform } = parsed.data;
    await prisma.deviceToken.upsert({
      where: { token },
      create: { token, platform, userId },
      update: { userId, platform, lastSeenAt: new Date() },
    });
    return res.status(200).json({ ok: true, data: { registered: true } });
  } catch (err) {
    logger.warn('[Notifications] Device token registration failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to register this device.' } });
  }
});

// Unregister on logout / when the user switches the master toggle off, so
// a signed-out device stops receiving the account's notifications.
router.delete('/device-token', async (req, res) => {
  const userId = requireUserId(req);
  const parsed = z.object({ token: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'A token is required.' } });
  }
  try {
    // Scoped to the caller: one account cannot unregister another's device.
    await prisma.deviceToken.deleteMany({ where: { token: parsed.data.token, userId } });
    return res.status(200).json({ ok: true, data: { registered: false } });
  } catch (err) {
    logger.warn('[Notifications] Device token removal failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to unregister this device.' } });
  }
});

const preferencesSchema = z
  .object({
    pushNotifications: z.boolean().optional(),
    pushTripUpdates: z.boolean().optional(),
    pushHazardAlerts: z.boolean().optional(),
    pushSeasonal: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one preference is required.' });

// The master switch plus the per-category opt-outs, in one place. The
// master switch also lives on PUT /profile (it predates this); both write
// the same column.
router.get('/preferences', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { pushNotifications: true, pushTripUpdates: true, pushHazardAlerts: true, pushSeasonal: true },
    });
    // No Profile row means the user has never opened settings — report the
    // schema defaults rather than 404ing on a preferences read.
    return res.status(200).json({
      ok: true,
      data: profile ?? {
        pushNotifications: true,
        pushTripUpdates: true,
        pushHazardAlerts: true,
        pushSeasonal: true,
      },
    });
  } catch (err) {
    logger.warn('[Notifications] Get preferences failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load notification settings.' } });
  }
});

router.put('/preferences', async (req, res) => {
  const userId = requireUserId(req);
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid notification settings.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  try {
    // Built key-by-key: under exactOptionalPropertyTypes an explicit
    // `undefined` is not the same as an absent key to Prisma's update input.
    const data: {
      pushNotifications?: boolean;
      pushTripUpdates?: boolean;
      pushHazardAlerts?: boolean;
      pushSeasonal?: boolean;
    } = {};
    if (parsed.data.pushNotifications !== undefined) data.pushNotifications = parsed.data.pushNotifications;
    if (parsed.data.pushTripUpdates !== undefined) data.pushTripUpdates = parsed.data.pushTripUpdates;
    if (parsed.data.pushHazardAlerts !== undefined) data.pushHazardAlerts = parsed.data.pushHazardAlerts;
    if (parsed.data.pushSeasonal !== undefined) data.pushSeasonal = parsed.data.pushSeasonal;

    const updated = await prisma.profile.update({
      where: { userId },
      data,
      select: { pushNotifications: true, pushTripUpdates: true, pushHazardAlerts: true, pushSeasonal: true },
    });
    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'NOT_FOUND', message: 'Complete your profile first.' } });
    }
    logger.warn('[Notifications] Update preferences failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to save notification settings.' } });
  }
});

// The app-icon badge count, so a cold start can resync a badge that drifted
// while the app was closed (§8.18).
router.get('/unread-count', async (req, res) => {
  const userId = requireUserId(req);
  try {
    return res.status(200).json({ ok: true, data: { count: await unreadCountFor(userId) } });
  } catch (err) {
    logger.warn('[Notifications] Unread count failed:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load the unread count.' } });
  }
});

// Mark all as read: personal notifications flip their own `unread` column;
// broadcasts get a NotificationRead row per broadcast for this caller only,
// so it never affects what any other user sees.
router.post('/read-all', async (req, res) => {
  try {
    const tokenUserId = requireUserId(req);

    const broadcasts = await prisma.notification.findMany({
      where: { userId: null },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.notification.updateMany({
        where: { unread: true, userId: tokenUserId },
        data: { unread: false },
      }),
      prisma.notificationRead.createMany({
        data: broadcasts.map((b) => ({ notificationId: b.id, userId: tokenUserId })),
        skipDuplicates: true,
      }),
    ]);

    res.status(200).json({ ok: true, data: { message: 'All notifications marked as read' } });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Read-all notifications failed:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to mark notifications read' } });
  }
});

// Mark single notification as read — the caller's own personal notification,
// or a per-caller read receipt on a broadcast.
router.post('/:id/read', async (req, res) => {
  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid notification id.' } });
  }
  const { id } = parsedParams.data;
  const userId = requireUserId(req);
  try {
    const notification = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!notification) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Notification not found.' } });
    }

    if (notification.userId === null) {
      await prisma.notificationRead.upsert({
        where: { notificationId_userId: { notificationId: id, userId } },
        create: { notificationId: id, userId },
        update: {},
      });
      return res.status(200).json({ ok: true, data: { message: 'Notification marked as read' } });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Not your notification.' } });
    }

    await prisma.notification.update({ where: { id }, data: { unread: false } });
    res.status(200).json({ ok: true, data: { message: 'Notification marked as read' } });
  } catch (err) {
    logger.warn('[Postgres DB Warn] Mark notification read failed:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to mark notification read' } });
  }
});

export default router;
