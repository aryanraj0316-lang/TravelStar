import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { getSosAudienceUserIds, resolveSosAudience } from '../../services/sos-audience';
import { sendPushToUsers } from '../../lib/push';

const router = Router();

const sosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many SOS alerts raised. Please wait a few minutes before raising another alert.',
    },
  },
});

function validationError(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the submitted data.', details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
}

// GET /safety/sos — List all active SOS alerts (Prisma-backed, persists across restarts)
router.get('/sos', async (req, res) => {
  // Bounded like every other list (docs/REMEDIATION.md §5.9). Keyed on
  // alertTime rather than createdAt because that is this model's ordering
  // column; active alerts are few by nature, but "few by nature" is not a
  // bound.
  const parsedQuery = z
    .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
    .safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit.' } });
  }

  try {
    const alerts = await prisma.sOSAlert.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { alertTime: 'desc' },
      take: parsedQuery.data.limit,
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    const mapped = alerts.map((a) => ({
      id: a.id,
      // Needed so a client can tell whether this is its own alert — only
      // the person who raised it gets the stand-down control.
      userId: a.userId,
      userName: a.user?.profile
        ? `${a.user.profile.firstName} ${a.user.profile.lastName || ''}`.trim()
        : `User ${a.userId.slice(0, 8)}`,
      latitude: a.latitude,
      longitude: a.longitude,
      timestamp: a.alertTime.toLocaleTimeString(),
      status: a.status,
      // What they said was wrong, so a banner raised ten minutes ago still
      // explains itself.
      message: a.message,
    }));

    res.status(200).json({ ok: true, data: mapped });
  } catch (err) {
    logger.error('[Safety] Get SOS alerts error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve SOS alerts' } });
  }
});

const sosSchema = z.object({
  userName: z.string().trim().max(100).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  message: z.string().trim().max(500).optional(),
  // Provenance of the fix, carried so the alert can say how much to trust
  // the position rather than presenting a ten-minute-old point as current.
  // The client sends a last-known position labelled stale when it cannot
  // get a fresh one; it never invents coordinates.
  accuracyMeters: z.number().nonnegative().max(100000).optional(),
  capturedAt: z.coerce.date().optional(),
  isStale: z.boolean().default(false),
});

// POST /safety/sos — Trigger a new SOS alert (Prisma-backed + socket broadcast)
router.post('/sos', sosLimiter, async (req, res) => {
  const userId = requireUserId(req);
  const parsed = sosSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { userName, latitude, longitude, message, accuracyMeters, capturedAt, isStale } = parsed.data;

  try {
    const existingAlert = await prisma.sOSAlert.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        alertTime: { gte: new Date(Date.now() - 15000) },
      },
    });

    const newAlert =
      existingAlert ??
      (await prisma.sOSAlert.create({
        // The reason is stored, not just broadcast, so it is still there for
        // anyone who opens the app after the alert fired.
        data: { userId, latitude, longitude, message: message ?? null },
      }));

    const alerting = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const displayName =
      userName ||
      (alerting?.profile
        ? `${alerting.profile.firstName} ${alerting.profile.lastName || ''}`.trim()
        : (alerting?.email?.split('@')[0] ?? 'A traveller'));

    const audience = await resolveSosAudience(userId, { lat: latitude, lng: longitude });
    const recipients = audience.userIds.filter((uid) => uid !== userId);

    const alertPayload = {
      id: newAlert.id,
      alertId: newAlert.id,
      userId,
      userName: displayName,
      latitude: newAlert.latitude,
      longitude: newAlert.longitude,
      accuracyMeters: accuracyMeters ?? null,
      capturedAt: (capturedAt ?? newAlert.alertTime).toISOString(),
      isStale,
      createdAt: newAlert.alertTime.toISOString(),
      timestamp: newAlert.alertTime.toISOString(),
      status: newAlert.status,
      message: message ?? null,
      chatRoomId: audience.chatRooms[0]?.chatRoomId ?? null,
      tripId: audience.tripIds[0] ?? null,
    };

    // The alert is written into each trip's group chat as a real LOCATION
    // message, not only pushed over the socket. Someone who opens the app
    // ten minutes later must still find it — a socket-only alert is gone
    // for anyone who was offline when it fired.
    for (const room of audience.chatRooms) {
      const body = isStale
        ? `Emergency alert — ${displayName} has requested assistance. Showing their Last known location, which may not be current.`
        : `Emergency alert — ${displayName} has requested assistance.`;
      const saved = await prisma.message.create({
        data: {
          chatRoomId: room.chatRoomId,
          senderId: userId,
          content: message ? `${body} ${message}` : body,
          mediaType: 'LOCATION',
          latitude,
          longitude,
          isSystem: true,
        },
      });

      const io = req.app.get('socketio');
      io?.to(room.chatRoomId).emit('messageReceived', {
        roomId: room.chatRoomId,
        message: {
          id: saved.id,
          senderId: userId,
          senderName: 'System',
          senderRole: 'SYSTEM',
          isSystem: true,
          senderAvatar: null,
          avatar: null,
          content: saved.content || '',
          mediaUrl: null,
          mediaType: 'LOCATION',
          latitude: saved.latitude,
          longitude: saved.longitude,
          timestamp: saved.createdAt.toISOString(),
          createdAt: saved.createdAt.toISOString(),
        },
      });
      io?.to(room.chatRoomId).emit('sosReceived', { ...alertPayload, tripId: room.tripId });
    }

    const io = req.app.get('socketio');
    if (io) {
      audience.userIds.forEach((uid: string) => io.to(uid).emit('sosReceived', alertPayload));
      // Broadcast to all connected clients so the alert ticker appears on Home and Chat tabs on all devices immediately
      io.emit('sosReceived', alertPayload);
    }

    if (recipients.length > 0) {
      const title = `Emergency alert — ${displayName}`;
      const content = audience.chatRooms.length > 0
        ? `Emergency alert from ${displayName} on ${audience.chatRooms[0]!.tripName}.`
        : `Emergency alert from ${displayName}.`;

      await sendPushToUsers(recipients, 'HAZARD', {
        title,
        body: content,
        data: {
          screen: 'map',
          alertId: newAlert.id,
          focusLat: String(latitude),
          focusLng: String(longitude),
        },
      });
    }

    // docs/REMEDIATION.md §8.8/§8.9: this used to claim "police, and
    // emergency support notified". No police force is integrated with
    // this app and none is contacted — the real audience is exactly
    // what resolveSosAudience returns. Telling someone in danger that
    // police are coming when they are not is the worst kind of fake
    // message this codebase can carry. For the same reason the reach is
    // described from what actually resolved, not from the setting alone:
    // "nearby travellers" is only claimed when someone was really found.
    const reachedNearby = audience.reach.mode === 'NEARBY' && audience.reach.nearbyCount > 0;
    const whoWasTold = reachedNearby
      ? `your trip group, ${audience.reach.nearbyCount} traveller${audience.reach.nearbyCount === 1 ? '' : 's'} within ${audience.reach.radiusKm} km`
      : 'your trip group';

    res.status(201).json({
      ok: true,
      data: {
        ...alertPayload,
        notifiedCount: recipients.length,
        reach: audience.reach,
        message: `SOS sent to ${whoWasTold}, your emergency contacts on TravelStar, and our safety team. For police, fire, or ambulance, call 112.`,
      },
    });
  } catch (err) {
    logger.error('[Safety] Create SOS alert error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create SOS alert' } });
  }
});

router.post('/sos/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const userId = requireUserId(req);
  try {
    const alert = await prisma.sOSAlert.findUnique({
      where: { id },
      // Coordinates included so the stand-down can reach the same nearby
      // audience the alert itself did.
      select: {
        userId: true,
        latitude: true,
        longitude: true,
        user: {
          include: { profile: true },
        },
      },
    });

    if (!alert) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'SOS alert not found.' } });
    }

    // The person in distress, an admin, or someone responsible for them on
    // the trip they are on: the organizer, or a guide assigned to one of
    // its checkpoints. Anyone else silently resolving it could leave
    // someone stranded.
    let canResolve = alert.userId === userId || isAdmin(req);
    if (!canResolve) {
      const audience = await resolveSosAudience(alert.userId);
      if (audience.tripIds.length > 0) {
        const [organizes, guidesAtCheckpoint] = await Promise.all([
          prisma.trip.count({ where: { id: { in: audience.tripIds }, creatorId: userId } }),
          prisma.tripTimelineStopGuide.count({
            where: {
              tripTimelineStop: { tripId: { in: audience.tripIds } },
              guideProfile: { userId },
            },
          }),
        ]);
        canResolve = organizes > 0 || guidesAtCheckpoint > 0;
      }
    }
    if (!canResolve) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not authorised to resolve this alert.' } });
    }

    // What the person says when standing down ("found my group", "all
    // fine now") is the whole point of the all-clear for everyone who was
    // woken by the alert, so it is stored and broadcast with it.
    const resolutionNote =
      typeof req.body?.resolutionNote === 'string' && req.body.resolutionNote.trim()
        ? req.body.resolutionNote.trim().slice(0, 300)
        : null;

    // Resolve all active alerts for this user to ensure no orphaned active records remain
    await prisma.sOSAlert.updateMany({
      where: { userId: alert.userId, status: 'ACTIVE' },
      data: { status: 'RESOLVED', resolutionNote, resolvedAt: new Date() },
    });

    const resolver = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const resolverName = resolver?.profile
      ? `${resolver.profile.firstName} ${resolver.profile.lastName || ''}`.trim()
      : (resolver?.email?.split('@')[0] ?? 'Someone');

    const victimName = alert.user?.profile
      ? `${alert.user.profile.firstName} ${alert.user.profile.lastName || ''}`.trim()
      : (alert.user?.email?.split('@')[0] ?? 'User');

    // Broadcast once globally to all connected clients so every device dismisses the alert without duplicate messages
    const io = req.app.get('socketio');
    io?.emit('sosResolved', {
      id,
      userId: alert.userId,
      userName: victimName,
      resolverName,
      resolutionNote,
    });

    const audience = await resolveSosAudience(alert.userId, {
      lat: alert.latitude,
      lng: alert.longitude,
    });

    for (const room of audience.chatRooms) {
      const saved = await prisma.message.create({
        data: {
          chatRoomId: room.chatRoomId,
          senderId: userId,
          content: resolutionNote
            ? `Emergency resolved — Marked safe by ${resolverName}. ${resolutionNote}`
            : `Emergency resolved — Marked safe by ${resolverName}.`,
          mediaType: 'NONE',
          isSystem: true,
        },
      });
      io?.to(room.chatRoomId).emit('messageReceived', {
        roomId: room.chatRoomId,
        message: {
          id: saved.id,
          senderId: userId,
          senderName: 'System',
          senderRole: 'SYSTEM',
          isSystem: true,
          senderAvatar: null,
          avatar: null,
          content: saved.content || '',
          mediaUrl: null,
          mediaType: 'NONE',
          timestamp: saved.createdAt.toISOString(),
          createdAt: saved.createdAt.toISOString(),
        },
      });
    }

    res.status(200).json({ ok: true, data: { message: `SOS Alert ${id} marked as resolved` } });
  } catch (err) {
    logger.error('[Safety] Resolve SOS error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to resolve SOS alert' } });
  }
});

// GET /safety/contacts — Get user's emergency contacts (Prisma-backed, user-scoped)
router.get('/contacts', async (req, res) => {
  const userId = requireUserId(req);

  try {
    const contacts = await prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ ok: true, data: contacts });
  } catch (err) {
    logger.error('[Safety] Get contacts error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve emergency contacts' } });
  }
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relation: z.string().trim().min(1).max(50).default('Other'),
  phoneNumber: z.string().trim().regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number'),
});

// POST /safety/contacts — Create a new emergency contact
router.post('/contacts', async (req, res) => {
  const userId = requireUserId(req);

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { name, relation, phoneNumber } = parsed.data;

  try {
    const contact = await prisma.emergencyContact.create({
      data: {
        userId,
        name,
        relation,
        phoneNumber,
      },
    });
    return res.status(201).json({ ok: true, data: contact });
  } catch (err) {
    logger.error('[Safety] Create contact error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create emergency contact' } });
  }
});

// DELETE /safety/contacts/:id — Delete an emergency contact
router.delete('/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const userId = requireUserId(req);
  try {
    // Scoped by userId so one user cannot delete another's contacts.
    const result = await prisma.emergencyContact.deleteMany({ where: { id, userId } });
    if (result.count === 0) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Contact not found.' } });
    }
    return res.status(200).json({ ok: true, data: { message: 'Contact deleted' } });
  } catch (err) {
    logger.error('[Safety] Delete contact error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to delete contact' } });
  }
});

// GET /safety/monsoon-advisory — reference data seeded once via
// `npm run seed:reference`, not implicitly on read (docs/REMEDIATION.md §4.9).
// Note: no client screen currently reads this endpoint — travel-guide.tsx
// fetches it but discards the result, and the screen actually named
// "monsoon-advisory" renders Alert-shaped data instead (see §4.10 fix in
// src/app/monsoon-advisory.tsx). Left in place rather than deleted since
// removing a whole model/endpoint is a bigger call than this cleanup pass.
router.get('/monsoon-advisory', async (req, res) => {
  try {
    const advisories = await prisma.monsoonAdvisory.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ ok: true, data: advisories });
  } catch (err) {
    logger.error('[Safety] Get monsoon advisories error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve monsoon advisories' } });
  }
});

export default router;
