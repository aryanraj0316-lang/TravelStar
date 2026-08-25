import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { requireRole } from '../../middleware/auth';

const router = Router();

/**
 * Asserts the caller owns the guide profile named by :id (admins bypass).
 * Returns the guide profile id on success, or null after having already sent
 * the 403/404 response.
 */
async function assertOwnsGuideProfile(
  req: Parameters<typeof requireUserId>[0],
  res: { status: (c: number) => { json: (b: unknown) => unknown } },
  guideProfileId: string
): Promise<boolean> {
  const guide = await prisma.guideProfile.findUnique({
    where: { id: guideProfileId },
    select: { userId: true },
  });

  if (!guide) {
    res.status(404).json({ status: 'error', code: 'GUIDE_PROFILE_NOT_FOUND', message: 'Guide profile not found.' });
    return false;
  }

  if (guide.userId !== requireUserId(req) && !isAdmin(req)) {
    res.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'You do not have access to this guide profile.' });
    return false;
  }

  return true;
}

// 0. Get list of all guides for homepage
router.get('/', async (req, res) => {
  try {
    const dbGuides = await prisma.guideProfile.findMany({
      include: {
        user: {
          include: { profile: true }
        }
      }
    });

    // Money crosses the wire as a string (docs/CONVENTIONS.md §3) so the
    // client never has to guess whether it got a Decimal-as-string or a
    // plain number.
    const mapped = dbGuides.map(g => ({
      id: g.id,
      name: g.user?.profile?.firstName ? `${g.user.profile.firstName} ${g.user.profile.lastName || ''}`.trim() : 'Verified Guide',
      rating: g.rating || 5.0,
      languages: g.languagesSpoken || ['Hindi', 'English'],
      dailyRate: g.dailyRate.toString(),
      expertise: g.expertisePlaces || ['Jaipur', 'Vrindavan'],
    }));

    if (mapped.length === 0) {
      mapped.push({
        id: 'guide-1',
        name: 'Rajesh Kumar',
        rating: 4.9,
        languages: ['Hindi', 'English'],
        dailyRate: '2200',
        expertise: ['Vrindavan', 'Agra'],
      });
    }

    return res.status(200).json({ status: 'success', data: mapped });
  } catch (err) {
    logger.error('[Guides] Get guides list error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve guides' });
  }
});

// 1. Get Guide Profile. A GET never creates rows — this used to mint a
// fully VERIFIED guide identity on first read, which is the trust signal
// users pay on.
router.get('/profile', async (req, res) => {
  const userId = requireUserId(req);

  try {
    const guide = await prisma.guideProfile.findUnique({
      where: { userId },
      include: { packages: true },
    });

    if (!guide) {
      return res.status(404).json({
        status: 'error',
        code: 'GUIDE_PROFILE_NOT_FOUND',
        message: 'No guide profile yet. Apply to become a guide first.',
      });
    }

    return res.status(200).json({ status: 'success', data: guide });
  } catch (err) {
    logger.error('[Guides] Get profile error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// 1b. Apply to become a guide. Always starts PENDING — only an admin can
// move a profile to VERIFIED (see POST /:id/verify).
const createGuideProfileSchema = z.object({
  licenseNumber: z.string().trim().min(4).max(64),
  licensePhotoUrl: z.string().url().max(2000),
  experienceYears: z.number().int().min(0).max(80),
  expertisePlaces: z.array(z.string().trim().min(1)).min(1).max(50),
  languagesSpoken: z.array(z.string().trim().min(1)).min(1).max(20),
  hourlyRate: z.number().nonnegative(),
  dailyRate: z.number().nonnegative(),
});

router.post('/profile', async (req, res) => {
  const parsed = createGuideProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: 'Please provide your licence details to apply.',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const userId = requireUserId(req);

  try {
    const existing = await prisma.guideProfile.findUnique({ where: { userId } });
    if (existing) {
      return res.status(409).json({
        status: 'error',
        code: 'GUIDE_PROFILE_EXISTS',
        message: 'You have already applied to become a guide.',
      });
    }

    const guide = await prisma.guideProfile.create({
      data: {
        userId,
        ...parsed.data,
        availability: {},
        verifiedStatus: 'PENDING',
      },
      include: { packages: true },
    });

    return res.status(201).json({ status: 'success', data: guide });
  } catch (err) {
    logger.error('[Guides] Create profile error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not submit your application.' });
  }
});

// 1c. Admin review queue + verification decision, recorded in AdminLog.
router.get('/pending', requireRole(['ADMIN']), async (req, res) => {
  try {
    const pending = await prisma.guideProfile.findMany({
      where: { verifiedStatus: 'PENDING' },
      include: { user: { include: { profile: true } } },
      orderBy: { id: 'asc' },
    });
    return res.status(200).json({ status: 'success', data: pending });
  } catch (err) {
    logger.error('[Guides] List pending error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not load the review queue.' });
  }
});

const verifySchema = z.object({ decision: z.enum(['VERIFIED', 'REJECTED']) });

router.post('/:id/verify', requireRole(['ADMIN']), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_FAILED',
      message: 'decision must be VERIFIED or REJECTED.',
    });
  }

  const id = req.params.id!;
  const adminId = requireUserId(req);

  try {
    const guide = await prisma.guideProfile.findUnique({ where: { id } });
    if (!guide) {
      return res.status(404).json({ status: 'error', code: 'GUIDE_PROFILE_NOT_FOUND', message: 'Guide profile not found.' });
    }

    const [updated] = await prisma.$transaction([
      prisma.guideProfile.update({
        where: { id },
        data: { verifiedStatus: parsed.data.decision },
      }),
      prisma.adminLog.create({
        data: {
          adminId,
          action: `GUIDE_${parsed.data.decision}:${id}`,
          ipAddress: req.ip ?? null,
        },
      }),
    ]);

    return res.status(200).json({ status: 'success', data: updated });
  } catch (err) {
    logger.error('[Guides] Verify error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not record the decision.' });
  }
});

// 2. GET Hub & Earnings details
router.get('/:id/earnings', async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
      include: {
        user: {
          include: { wallet: true }
        }
      }
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const walletBalance = (guideProfile.user?.wallet?.balance ?? 0).toString();

    // Fetch confirmed bookings for this guide
    const bookings = await prisma.booking.findMany({
      where: {
        guideProfileId: id,
        status: 'CONFIRMED',
      },
      include: {
        payments: true,
      }
    });

    // Chart/display aggregation only — precision loss here doesn't affect
    // anything stored (bookings.amount stays Decimal in the database).
    const totalEarnings = bookings.reduce((sum, b) => sum + Number(b.amount), 0);

    const completedTripsCount = await prisma.booking.count({
      where: {
        guideProfileId: id,
        status: 'COMPLETED'
      }
    });

    const activeLeadsCount = await prisma.joinRequest.count({
      where: { status: 'PENDING' }
    });

    // Populate daily chart heights based on day of week of booking date
    const chartData = [
      { day: 'Mon', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Tue', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Wed', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Thu', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Fri', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Sat', amt: 0, height: 5, amtText: '₹0' },
      { day: 'Sun', amt: 0, height: 5, amtText: '₹0' },
    ];

    bookings.forEach((b) => {
      const dayIndex = new Date(b.bookingDate).getDay(); // 0 Sunday, 1 Monday...
      const indexMap = [6, 0, 1, 2, 3, 4, 5];
      const targetIndex = indexMap[dayIndex];
      const target = targetIndex !== undefined ? chartData[targetIndex] : undefined;
      if (target) {
        target.amt += Number(b.amount);
      }
    });

    const maxAmt = Math.max(...chartData.map((c) => c.amt), 1);
    chartData.forEach((c) => {
      c.height = Math.round((c.amt / maxAmt) * 100) || 5;
      c.amtText = c.amt > 0 ? `₹${Math.round(c.amt / 100) / 10}k` : '₹0';
    });

    return res.status(200).json({
      status: 'success',
      data: {
        walletBalance,
        totalEarnings,
        completedTripsCount,
        activeLeadsCount,
        chartData,
        hasActivity: bookings.length > 0 || completedTripsCount > 0,
      }
    });
  } catch (err) {
    logger.error('[Guides] Get earnings error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve earnings stats' });
  }
});

// 3. Packages CRUD
router.get('/:id/packages', async (req, res) => {
  const { id } = req.params;
  try {
    const packages = await prisma.guidePackage.findMany({
      where: { guideProfileId: id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ status: 'success', data: packages });
  } catch (err) {
    logger.error('[Guides] Get packages error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve packages' });
  }
});

router.post('/:id/packages', async (req, res) => {
  const { id } = req.params;
  const { title, description, price, durationDays, citiesIncluded } = req.body;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const newPackage = await prisma.guidePackage.create({
      data: {
        guideProfileId: id,
        title,
        description: description || '',
        price: parseFloat(price) || 1000,
        durationDays: parseInt(durationDays) || 1,
        citiesIncluded: citiesIncluded || [],
      } as any
    });
    return res.status(201).json({ status: 'success', data: newPackage });
  } catch (err) {
    logger.error('[Guides] Create package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create package' });
  }
});

router.put('/:id/packages/:packageId', async (req, res) => {
  const { id, packageId } = req.params;
  const { title, description, price, durationDays, citiesIncluded } = req.body;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const data: Record<string, unknown> = { title, description, citiesIncluded };
    if (price) data.price = parseFloat(price);
    if (durationDays) data.durationDays = parseInt(durationDays);

    const updated = await prisma.guidePackage.update({
      where: { id: packageId },
      data,
    });
    return res.status(200).json({ status: 'success', data: updated });
  } catch (err) {
    logger.error('[Guides] Update package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update package' });
  }
});

router.delete('/:id/packages/:packageId', async (req, res) => {
  const { id, packageId } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    await prisma.guidePackage.delete({
      where: { id: packageId },
    });
    return res.status(200).json({ status: 'success', message: 'Package deleted successfully' });
  } catch (err) {
    logger.error('[Guides] Delete package error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to delete package' });
  }
});

// 4. Reels CRUD
router.get('/:id/reels', async (req, res) => {
  const { id } = req.params;
  try {
    const reels = await prisma.guideReel.findMany({
      where: { guideProfileId: id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ status: 'success', data: reels });
  } catch (err) {
    logger.error('[Guides] Get reels error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve reels' });
  }
});

router.post('/:id/reels', async (req, res) => {
  const { id } = req.params;
  const { videoUrl, thumbnailUrl, caption } = req.body;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const newReel = await prisma.guideReel.create({
      data: {
        guideProfileId: id,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        caption: caption || '',
      }
    });
    return res.status(201).json({ status: 'success', data: newReel });
  } catch (err) {
    logger.error('[Guides] Create reel error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to publish reel' });
  }
});

// 5. Live Status (Coordinates & Booking link)
router.get('/:id/live-status', async (req, res) => {
  const { id } = req.params;
  try {
    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const latestLoc = await prisma.liveLocation.findFirst({
      where: { userId: guideProfile.userId },
      orderBy: { updatedAt: 'desc' },
    });

    // Check if there is an active guiding booking right now
    const activeBooking = await prisma.booking.findFirst({
      where: {
        guideProfileId: id,
        status: 'CONFIRMED',
      },
      orderBy: { bookingDate: 'desc' },
    });

    return res.status(200).json({
      status: 'success',
      data: {
        location: latestLoc,
        activeGuiding: activeBooking ? {
          bookingId: activeBooking.id,
          targetId: activeBooking.targetId,
          amount: activeBooking.amount,
        } : null,
      }
    });
  } catch (err) {
    logger.error('[Guides] Get live status error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve live status' });
  }
});

router.post('/:id/live-status', async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;
  try {
    // Without this, anyone could spoof any guide's GPS position.
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const existingLoc = await prisma.liveLocation.findFirst({
      where: { userId: guideProfile.userId },
    });

    let updatedLoc;
    if (existingLoc) {
      updatedLoc = await prisma.liveLocation.update({
        where: { id: existingLoc.id },
        data: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          updatedAt: new Date(),
        }
      });
    } else {
      updatedLoc = await prisma.liveLocation.create({
        data: {
          userId: guideProfile.userId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        }
      });
    }

    return res.status(200).json({ status: 'success', data: updatedLoc });
  } catch (err) {
    logger.error('[Guides] Post live status error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to update live location status' });
  }
});

// 6. Guide Leads — pending JoinRequests from trips matching guide expertise
router.get('/:id/leads', async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
    });

    if (!guideProfile) {
      return res.status(404).json({ status: 'error', message: 'Guide profile not found' });
    }

    const expertiseCities = guideProfile.expertisePlaces || [];

    // Find pending join requests for trips that match guide's expertise cities
    const joinRequests = await prisma.joinRequest.findMany({
      where: {
        status: 'PENDING',
        trip: {
          cities: {
            hasSome: expertiseCities,
          },
        },
      },
      include: {
        user: {
          include: { profile: true },
        },
        trip: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const leads = joinRequests.map((jr) => {
      const profile = jr.user?.profile;
      return {
        id: jr.id,
        name: profile ? `${profile.firstName} ${profile.lastName || ''}`.trim() : (jr.user?.email?.split('@')[0] || 'Traveler'),
        avatar: profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
        destination: jr.trip?.cities?.join(' & ') || jr.trip?.name || 'Unknown',
        groupSize: jr.trip?.totalSeats || 1,
        durationDays: jr.trip?.durationDays || 1,
        budget: jr.trip?.budget || 0,
        startDate: jr.trip?.startDate ? new Date(jr.trip.startDate).toISOString().split('T')[0] : 'TBD',
        description: jr.message || jr.trip?.description || 'Looking for a guide for this trip.',
        status: 'PENDING' as const,
        tripId: jr.tripId,
      };
    });

    return res.status(200).json({ status: 'success', data: leads });
  } catch (err) {
    logger.error('[Guides] Get leads error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve leads' });
  }
});

export default router;

