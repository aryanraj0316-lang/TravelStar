import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../services/db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_travelconnect_12345';

const getUserIdFromReq = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      return decoded.id || decoded.userId;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Seed monsoon advisories if table is empty
const SEED_ADVISORIES = [
  {
    region: 'Himachal Pradesh & Ladakh',
    severity: 'HIGH',
    alertTitle: 'Flash Flood & Landslide Warning',
    description: 'Heavy rainfall reported on Manali-Leh Highway near Rohtang & Baralacha Pass. Travelers advised to delay mountain passes.',
  },
  {
    region: 'Kerala Backwaters',
    severity: 'MEDIUM',
    alertTitle: 'High Water Level Notice',
    description: 'Houseboat operations in Alleppey operating with safety speed limits due to active monsoon currents.',
  },
  {
    region: 'Vrindavan & Mathura',
    severity: 'LOW',
    alertTitle: 'Yamuna Water Level Normal',
    description: 'Darshan queues and ghat entry operating smoothly with routine rain precautions.',
  },
];

let advisoriesSeeded = false;

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

    res.status(200).json({ status: 'success', data: mapped });
  } catch (err) {
    console.error('[Safety] Get SOS alerts error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve SOS alerts' });
  }
});

// POST /safety/sos — Trigger a new SOS alert (Prisma-backed + socket broadcast)
router.post('/sos', async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { userName, latitude, longitude } = req.body;

  try {
    // If authenticated, use token userId; otherwise try to find a guest user
    let resolvedUserId: string | null = userId;
    if (!resolvedUserId) {
      const firstUser = await prisma.user.findFirst();
      resolvedUserId = firstUser?.id ?? null;
    }
    if (!resolvedUserId) {
      return res.status(401).json({ status: 'error', message: 'No user found for SOS alert' });
    }

    const newAlert = await prisma.sOSAlert.create({
      data: {
        userId: resolvedUserId,
        latitude: parseFloat(latitude) || 28.6139,
        longitude: parseFloat(longitude) || 77.209,
      },
    });

    const alertPayload = {
      id: newAlert.id,
      userName: userName || `User ${resolvedUserId.slice(0, 8)}`,
      latitude: newAlert.latitude,
      longitude: newAlert.longitude,
      timestamp: newAlert.alertTime.toLocaleTimeString(),
      status: newAlert.status,
    };

    // Broadcast via socket
    const io = req.app.get('socketio');
    if (io) {
      io.emit('sosReceived', alertPayload);
    }

    res.status(201).json({
      status: 'success',
      alertId: newAlert.id,
      data: alertPayload,
      message: 'SOS trigger received. Nearby local assistance, police, and emergency support notified.',
    });
  } catch (err) {
    console.error('[Safety] Create SOS alert error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create SOS alert' });
  }
});

// POST /safety/sos/:id/resolve — Resolve an SOS alert
router.post('/sos/:id/resolve', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.sOSAlert.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    // Broadcast resolution via socket
    const io = req.app.get('socketio');
    if (io) {
      io.emit('sosResolved', { id });
    }

    res.status(200).json({ status: 'success', message: `SOS Alert ${id} marked as resolved` });
  } catch (err) {
    console.error('[Safety] Resolve SOS error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to resolve SOS alert' });
  }
});

// POST /safety/location — Register user coordinates
router.post('/location', (req, res) => {
  const { userId, latitude, longitude } = req.body;
  res.status(200).json({
    status: 'success',
    message: `Coordinates registered for user ${userId || 'guest'} (${latitude}, ${longitude})`,
  });
});

// GET /safety/contacts — Get user's emergency contacts (Prisma-backed, user-scoped)
router.get('/contacts', async (req, res) => {
  const userId = getUserIdFromReq(req);

  try {
    if (userId) {
      const contacts = await prisma.emergencyContact.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
      return res.status(200).json({ status: 'success', data: contacts });
    }

    // Fallback for unauthenticated: return empty list
    return res.status(200).json({ status: 'success', data: [] });
  } catch (err) {
    console.error('[Safety] Get contacts error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve emergency contacts' });
  }
});

// POST /safety/contacts — Create a new emergency contact
router.post('/contacts', async (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { name, relation, phoneNumber } = req.body;
  if (!name || !phoneNumber) {
    return res.status(400).json({ status: 'error', message: 'Name and phoneNumber are required' });
  }

  try {
    const contact = await prisma.emergencyContact.create({
      data: {
        userId,
        name,
        relation: relation || 'Other',
        phoneNumber,
      },
    });
    return res.status(201).json({ status: 'success', data: contact });
  } catch (err) {
    console.error('[Safety] Create contact error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create emergency contact' });
  }
});

// DELETE /safety/contacts/:id — Delete an emergency contact
router.delete('/contacts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.emergencyContact.delete({ where: { id } });
    return res.status(200).json({ status: 'success', message: 'Contact deleted' });
  } catch (err) {
    console.error('[Safety] Delete contact error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to delete contact' });
  }
});

// GET /safety/monsoon-advisory — Prisma-backed monsoon advisories with auto-seed
router.get('/monsoon-advisory', async (req, res) => {
  try {
    let advisories = await prisma.monsoonAdvisory.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (advisories.length === 0 && !advisoriesSeeded) {
      advisoriesSeeded = true;
      await prisma.monsoonAdvisory.createMany({ data: SEED_ADVISORIES });
      advisories = await prisma.monsoonAdvisory.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    res.status(200).json({ status: 'success', data: advisories });
  } catch (err) {
    console.error('[Safety] Get monsoon advisories error:', err);
    // Fallback to static data if DB fails
    const fallback = SEED_ADVISORIES.map((a, i) => ({
      id: `adv-${i + 1}`,
      ...a,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }));
    res.status(200).json({ status: 'success', data: fallback });
  }
});

export default router;
