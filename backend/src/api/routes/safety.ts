import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { getSosAudienceUserIds } from '../../services/sos-audience';

const router = Router();

function validationError(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the submitted data.', details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
}

// GET /safety/sos — List all active SOS alerts (Prisma-backed, persists across restarts)
router.get('/sos', async (req, res) => {
  try {
    const alerts = await prisma.sOSAlert.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { alertTime: 'desc' },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    const mapped = alerts.map((a) => ({
      id: a.id,
      userName: a.user?.profile
        ? `${a.user.profile.firstName} ${a.user.profile.lastName || ''}`.trim()
        : `User ${a.userId.slice(0, 8)}`,
      latitude: a.latitude,
      longitude: a.longitude,
      timestamp: a.alertTime.toLocaleTimeString(),
      status: a.status,
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
});

// POST /safety/sos — Trigger a new SOS alert (Prisma-backed + socket broadcast)
router.post('/sos', async (req, res) => {
  const userId = requireUserId(req);
  const parsed = sosSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues);
  const { userName, latitude, longitude } = parsed.data;

  try {
    const newAlert = await prisma.sOSAlert.create({
      data: {
        userId,
        latitude,
        longitude,
      },
    });

    const alertPayload = {
      id: newAlert.id,
      userName: userName || `User ${userId.slice(0, 8)}`,
      latitude: newAlert.latitude,
      longitude: newAlert.longitude,
      timestamp: newAlert.alertTime.toLocaleTimeString(),
      status: newAlert.status,
    };

    // Notify only the scoped audience (emergency contacts who are app users,
    // fellow trip members, admins) — never every connected client.
    const io = req.app.get('socketio');
    if (io) {
      const audience = await getSosAudienceUserIds(userId);
      audience.forEach((uid: string) => io.to(uid).emit('sosReceived', alertPayload));
    }

    res.status(201).json({
      ok: true,
      data: {
        ...alertPayload,
        alertId: newAlert.id,
        // docs/REMEDIATION.md §8.8/§8.9: this used to claim "police, and
        // emergency support notified". No police force is integrated with
        // this app and none is contacted — the real audience is exactly
        // getSosAudienceUserIds: emergency contacts who are app users,
        // fellow trip members, and admins. Telling someone in danger that
        // police are coming when they are not is the worst kind of fake
        // message this codebase can carry.
        message: 'SOS sent to your emergency contacts on TravelStar, your trip members, and our safety team. For police, fire, or ambulance, call 112.',
      },
    });
  } catch (err) {
    logger.error('[Safety] Create SOS alert error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create SOS alert' } });
  }
});

// POST /safety/sos/:id/resolve — Resolve an SOS alert
router.post('/sos/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const userId = requireUserId(req);
  try {
    const alert = await prisma.sOSAlert.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!alert) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'SOS alert not found.' } });
    }

    // Only the person in distress or an admin/responder may stand down an
    // alert. Anyone else silently resolving it could leave someone stranded.
    if (alert.userId !== userId && !isAdmin(req)) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not authorised to resolve this alert.' } });
    }

    await prisma.sOSAlert.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    // Notify the same scoped audience that received the original alert.
    const io = req.app.get('socketio');
    if (io) {
      const audience = await getSosAudienceUserIds(alert.userId);
      audience.forEach((uid: string) => io.to(uid).emit('sosResolved', { id }));
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
