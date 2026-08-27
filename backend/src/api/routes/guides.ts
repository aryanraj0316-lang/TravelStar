import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { requireRole } from '../../middleware/auth';
import { createGuideMediaUploadUrl, ObjectStorageNotConfiguredError } from '../../lib/object-storage';

const router = Router();

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Start of the current week/month/year as a real UTC instant, boundaries
 * computed in Asia/Kolkata local time (docs/CONVENTIONS.md §4 — this app's
 * timezone) rather than the server's own timezone. Shifts "now" into a
 * virtual UTC clock offset by +5:30, does the calendar math with UTC
 * getters/setters (so it can't be perturbed by the host's DST rules), then
 * shifts back to get the real UTC instant of that Kolkata-local midnight.
 * Week starts Monday.
 */
function startOfPeriodIST(range: 'week' | 'month' | 'year'): Date {
  const nowShifted = new Date(Date.now() + IST_OFFSET_MS);
  let startShifted: Date;
  if (range === 'week') {
    const day = nowShifted.getUTCDay(); // 0 Sun .. 6 Sat
    const daysSinceMonday = (day + 6) % 7;
    startShifted = new Date(
      Date.UTC(nowShifted.getUTCFullYear(), nowShifted.getUTCMonth(), nowShifted.getUTCDate() - daysSinceMonday),
    );
  } else if (range === 'month') {
    startShifted = new Date(Date.UTC(nowShifted.getUTCFullYear(), nowShifted.getUTCMonth(), 1));
  } else {
    startShifted = new Date(Date.UTC(nowShifted.getUTCFullYear(), 0, 1));
  }
  return new Date(startShifted.getTime() - IST_OFFSET_MS);
}

// Day-of-week bucket a booking date falls into, Monday-first (index 0 = Mon
// ... 6 = Sun). `Date.getDay()` is Sunday-first (0 = Sun), hence the map.
const MONDAY_FIRST_INDEX = [6, 0, 1, 2, 3, 4, 5] as const;
export function dayOfWeekBucket(date: Date): number {
  return MONDAY_FIRST_INDEX[date.getDay()] ?? 0;
}

/**
 * Asserts the caller owns the guide profile named by :id (admins bypass).
 * Returns the guide profile id on success, or null after having already sent
 * the 403/404 response.
 */
async function assertOwnsGuideProfile(
  req: Parameters<typeof requireUserId>[0],
  res: { status: (c: number) => { json: (b: unknown) => unknown } },
  guideProfileId: string,
): Promise<boolean> {
  const guide = await prisma.guideProfile.findUnique({
    where: { id: guideProfileId },
    select: { userId: true },
  });

  if (!guide) {
    res
      .status(404)
      .json({ ok: false, error: { code: 'GUIDE_PROFILE_NOT_FOUND', message: 'Guide profile not found.' } });
    return false;
  }

  if (guide.userId !== requireUserId(req) && !isAdmin(req)) {
    res
      .status(403)
      .json({ ok: false, error: { code: 'FORBIDDEN', message: 'You do not have access to this guide profile.' } });
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
          include: { profile: true },
        },
      },
    });

    // Money crosses the wire as a string (docs/CONVENTIONS.md §3) so the
    // client never has to guess whether it got a Decimal-as-string or a
    // plain number.
    const mapped = dbGuides.map((g) => ({
      id: g.id,
      name: g.user?.profile?.firstName
        ? `${g.user.profile.firstName} ${g.user.profile.lastName || ''}`.trim()
        : 'Verified Guide',
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

    return res.status(200).json({ ok: true, data: mapped });
  } catch (err) {
    logger.error('[Guides] Get guides list error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve guides' } });
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
      return res
        .status(404)
        .json({
          ok: false,
          error: { code: 'GUIDE_PROFILE_NOT_FOUND', message: 'No guide profile yet. Apply to become a guide first.' },
        });
    }

    return res.status(200).json({ ok: true, data: guide });
  } catch (err) {
    logger.error('[Guides] Get profile error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Internal server error' } });
  }
});

// 1b. Apply to become a guide. Always starts PENDING — only an admin can
// move a profile to VERIFIED (see POST /:id/verify).
const createGuideProfileSchema = z.object({
  licenseNumber: z.string().trim().min(4).max(64),
  // Optional: v1 does not store identity/credential documents
  // (docs/REMEDIATION.md §12.1). An admin verifies the licence number
  // out-of-band before moving the profile to VERIFIED.
  licensePhotoUrl: z.string().url().max(2000).optional(),
  experienceYears: z.number().int().min(0).max(80),
  expertisePlaces: z.array(z.string().trim().min(1)).min(1).max(50),
  languagesSpoken: z.array(z.string().trim().min(1)).min(1).max(20),
  hourlyRate: z.number().nonnegative(),
  dailyRate: z.number().nonnegative(),
});

router.post('/profile', async (req, res) => {
  const parsed = createGuideProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please provide your licence details to apply.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
  }

  const userId = requireUserId(req);

  try {
    const existing = await prisma.guideProfile.findUnique({ where: { userId } });
    if (existing) {
      return res
        .status(409)
        .json({
          ok: false,
          error: { code: 'GUIDE_PROFILE_EXISTS', message: 'You have already applied to become a guide.' },
        });
    }

    const { licensePhotoUrl, ...rest } = parsed.data;
    const guide = await prisma.guideProfile.create({
      data: {
        userId,
        ...rest,
        licensePhotoUrl: licensePhotoUrl ?? null,
        availability: {},
        verifiedStatus: 'PENDING',
      },
      include: { packages: true },
    });

    return res.status(201).json({ ok: true, data: guide });
  } catch (err) {
    logger.error('[Guides] Create profile error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not submit your application.' } });
  }
});

// docs/REMEDIATION.md §8.17 — a presigned upload URL for a story cover
// photo, a reel video, or a reel thumbnail (the client says which via
// contentType; image/* vs video/mp4|quicktime is what object-storage.ts
// actually enforces). Registered before the /:id routes below so it isn't
// swallowed as `id: 'media-upload-url'`.
const guideMediaUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']),
});

router.post('/media-upload-url', async (req, res) => {
  const parsed = guideMediaUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'contentType must be an image/jpeg|png|webp or video/mp4|quicktime.',
      },
    });
  }

  try {
    const userId = requireUserId(req);
    const { uploadUrl, publicUrl } = await createGuideMediaUploadUrl(userId, parsed.data.contentType);
    return res.status(200).json({ ok: true, data: { uploadUrl, publicUrl } });
  } catch (err) {
    if (err instanceof ObjectStorageNotConfiguredError) {
      return res
        .status(503)
        .json({
          ok: false,
          error: { code: 'STORAGE_UNAVAILABLE', message: 'Media upload is not available right now.' },
        });
    }
    logger.error('[Guides] Media upload URL failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not start the upload.' } });
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
    return res.status(200).json({ ok: true, data: pending });
  } catch (err) {
    logger.error('[Guides] List pending error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load the review queue.' } });
  }
});

const verifySchema = z.object({ decision: z.enum(['VERIFIED', 'REJECTED']) });

router.post('/:id/verify', requireRole(['ADMIN']), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'decision must be VERIFIED or REJECTED.' } });
  }

  const id = req.params.id!;
  const adminId = requireUserId(req);

  try {
    const guide = await prisma.guideProfile.findUnique({ where: { id } });
    if (!guide) {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'GUIDE_PROFILE_NOT_FOUND', message: 'Guide profile not found.' } });
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

    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[Guides] Verify error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not record the decision.' } });
  }
});

const earningsQuerySchema = z.object({
  range: z.enum(['week', 'month', 'year']).default('week'),
});

// 2. GET Hub & Earnings details
router.get('/:id/earnings', async (req, res) => {
  const { id } = req.params;
  const parsedQuery = earningsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid range parameter.' } });
  }
  const { range } = parsedQuery.data;

  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guideProfile = await prisma.guideProfile.findUnique({
      where: { id },
      include: {
        user: {
          include: { wallet: true },
        },
      },
    });

    if (!guideProfile) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
    }

    const walletBalance = (guideProfile.user?.wallet?.balance ?? 0).toString();
    const periodStart = startOfPeriodIST(range);

    // Fetch confirmed bookings for this guide within the selected period —
    // previously this bucketed every booking ever made into 7 weekday
    // slots regardless of age (docs/REMEDIATION.md §5.7).
    const bookings = await prisma.booking.findMany({
      where: {
        guideProfileId: id,
        status: 'CONFIRMED',
        bookingDate: { gte: periodStart },
      },
      include: {
        payments: true,
      },
    });

    // Chart/display aggregation only — precision loss here doesn't affect
    // anything stored (bookings.amount stays Decimal in the database).
    const totalEarnings = bookings.reduce((sum, b) => sum + Number(b.amount), 0);

    const completedTripsCount = await prisma.booking.count({
      where: {
        guideProfileId: id,
        status: 'COMPLETED',
        bookingDate: { gte: periodStart },
      },
    });

    // Scoped to this guide's own leads (pending requests on trips matching
    // their expertise cities), same definition /leads uses below — the
    // previous version counted every PENDING join request in the database
    // as "this guide's" leads (docs/REMEDIATION.md §5.7).
    const activeLeadsCount = await prisma.joinRequest.count({
      where: {
        status: 'PENDING',
        trip: { cities: { hasSome: guideProfile.expertisePlaces || [] } },
      },
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
      const target = chartData[dayOfWeekBucket(new Date(b.bookingDate))];
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
      ok: true,
      data: {
        range,
        walletBalance,
        totalEarnings,
        completedTripsCount,
        activeLeadsCount,
        chartData,
        hasActivity: bookings.length > 0 || completedTripsCount > 0,
      },
    });
  } catch (err) {
    logger.error('[Guides] Get earnings error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve earnings stats' } });
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
    return res.status(200).json({ ok: true, data: packages });
  } catch (err) {
    logger.error('[Guides] Get packages error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve packages' } });
  }
});

const packageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  price: z.number().positive(),
  durationDays: z.number().int().min(1),
  citiesIncluded: z.array(z.string().trim().min(1)).default([]),
});
const packageUpdateSchema = packageSchema.partial();

/**
 * A package's :id path segment only proves the caller owns *a* guide
 * profile — without also checking the package itself belongs to that same
 * profile, an owner of guide profile A could update or delete guide profile
 * B's package just by supplying A's id and B's packageId.
 */
async function assertPackageBelongsToGuide(
  res: { status: (c: number) => { json: (b: unknown) => unknown } },
  packageId: string,
  guideProfileId: string,
): Promise<boolean> {
  const pkg = await prisma.guidePackage.findUnique({ where: { id: packageId }, select: { guideProfileId: true } });
  if (!pkg || pkg.guideProfileId !== guideProfileId) {
    res.status(404).json({ ok: false, error: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found.' } });
    return false;
  }
  return true;
}

router.post('/:id/packages', async (req, res) => {
  const { id } = req.params;
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the package details.' } });
  }
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const newPackage = await prisma.guidePackage.create({
      data: {
        guideProfileId: id!,
        ...parsed.data,
      },
    });
    return res.status(201).json({ ok: true, data: newPackage });
  } catch (err) {
    logger.error('[Guides] Create package error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create package' } });
  }
});

router.put('/:id/packages/:packageId', async (req, res) => {
  const { id, packageId } = req.params;
  const parsed = packageUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the package details.' } });
  }
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;
    if (!(await assertPackageBelongsToGuide(res, packageId!, id!))) return;

    // Strip undefined keys — zod's .partial() types them as `T | undefined`,
    // which exactOptionalPropertyTypes treats as distinct from "absent" and
    // Prisma's *UpdateInput types reject outright.
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

    const updated = await prisma.guidePackage.update({
      where: { id: packageId },
      data,
    });
    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[Guides] Update package error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update package' } });
  }
});

router.delete('/:id/packages/:packageId', async (req, res) => {
  const { id, packageId } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;
    if (!(await assertPackageBelongsToGuide(res, packageId!, id!))) return;

    await prisma.guidePackage.delete({
      where: { id: packageId },
    });
    return res.status(200).json({ ok: true, data: { message: 'Package deleted successfully' } });
  } catch (err) {
    logger.error('[Guides] Delete package error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to delete package' } });
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
    return res.status(200).json({ ok: true, data: reels });
  } catch (err) {
    logger.error('[Guides] Get reels error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve reels' } });
  }
});

// docs/REMEDIATION.md §5.1: this route had zero input validation
// (destructured straight off req.body, unbounded strings, no URL check) —
// found in passing while wiring the real upload flow that produces these
// URLs (§8.17).
const createReelSchema = z.object({
  videoUrl: z.string().url().max(2000),
  thumbnailUrl: z.string().url().max(2000).optional(),
  caption: z.string().trim().max(500).optional(),
});

router.post('/:id/reels', async (req, res) => {
  const { id } = req.params;
  const parsed = createReelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please check the reel details.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const newReel = await prisma.guideReel.create({
      data: {
        guideProfileId: id,
        videoUrl: parsed.data.videoUrl,
        thumbnailUrl: parsed.data.thumbnailUrl ?? null,
        caption: parsed.data.caption ?? '',
      },
    });
    return res.status(201).json({ ok: true, data: newReel });
  } catch (err) {
    logger.error('[Guides] Create reel error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to publish reel' } });
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
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
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
      ok: true,
      data: {
        location: latestLoc,
        activeGuiding: activeBooking
          ? {
              bookingId: activeBooking.id,
              targetId: activeBooking.targetId,
              amount: activeBooking.amount,
            }
          : null,
      },
    });
  } catch (err) {
    logger.error('[Guides] Get live status error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve live status' } });
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
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
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
        },
      });
    } else {
      updatedLoc = await prisma.liveLocation.create({
        data: {
          userId: guideProfile.userId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      });
    }

    return res.status(200).json({ ok: true, data: updatedLoc });
  } catch (err) {
    logger.error('[Guides] Post live status error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update live location status' } });
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
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
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
        name: profile
          ? `${profile.firstName} ${profile.lastName || ''}`.trim()
          : jr.user?.email?.split('@')[0] || 'Traveler',
        avatar:
          profile?.avatarUrl ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
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

    return res.status(200).json({ ok: true, data: leads });
  } catch (err) {
    logger.error('[Guides] Get leads error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve leads' } });
  }
});

export default router;
