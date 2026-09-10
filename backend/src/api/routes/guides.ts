import { Router } from 'express';
import { z } from 'zod';
import { remoteMediaUrl } from '../../lib/validators';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId, isAdmin } from '../../lib/auth-context';
import { requireRole } from '../../middleware/auth';
import { createGuideMediaUploadUrl, ObjectStorageNotConfiguredError } from '../../lib/object-storage';
import { buildPage, cursorFilter, cursorPageQuerySchema, takeWithLookahead } from '../../lib/pagination';
import { sendPushToUsers } from '../../lib/push';

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
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsedQuery.data;

  try {
    const rows = await prisma.guideProfile.findMany({
      where: cursorFilter(cursor),
      // Strictly createdAt-desc: cursorFilter pages on `createdAt < cursor`,
      // so any other sort key silently skips rows across pages. Sorting
      // verified guides first would also need VerificationStatus's enum
      // order to put VERIFIED before PENDING, and it does not. The client
      // badges each row's verifiedStatus instead.
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
      include: {
        user: { include: { profile: true } },
        _count: { select: { reviews: true } },
      },
    });
    const { items: dbGuides, nextCursor } = buildPage(rows, limit);

    // Every field here is either real or explicitly absent. This mapper used
    // to name any guide without a filled-in profile "Verified Guide", give
    // every unrated guide 5.0, and invent Hindi/English and Jaipur/Vrindavan
    // for the two array columns - none of which the guide had said, on the
    // one screen where a traveller decides who to trust with a trip.
    const mapped = dbGuides.map((g) => ({
      id: g.id,
      name: g.user?.profile?.firstName
        ? `${g.user.profile.firstName} ${g.user.profile.lastName || ''}`.trim()
        : null,
      avatar: g.user?.profile?.avatarUrl ?? null,
      // PENDING until an admin verifies the licence (POST /:id/verify). The
      // client needs this to badge the row honestly.
      verifiedStatus: g.verifiedStatus,
      // Null means nobody has rated this guide yet, which is not the same
      // as a perfect score.
      rating: g.rating,
      reviewCount: g._count.reviews,
      languages: g.languagesSpoken,
      // Money crosses the wire as a string (docs/CONVENTIONS.md §3) so the
      // client never has to guess whether it got a Decimal-as-string or a
      // plain number.
      dailyRate: g.dailyRate.toString(),
      hourlyRate: g.hourlyRate.toString(),
      expertise: g.expertisePlaces,
      experienceYears: g.experienceYears,
    }));

    // An empty list is returned as empty. This used to fall back to a
    // fabricated "Rajesh Kumar" guide, which a user could try to view or
    // contact and which no other endpoint knew anything about.
    return res.status(200).json({ ok: true, data: mapped, meta: { cursor: nextCursor } });
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
  licensePhotoUrl: remoteMediaUrl.optional(),
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

/**
 * What counts as a "lead" for a guide: a public, active, not-yet-departed
 * trip going somewhere the guide lists as their expertise.
 *
 * This deliberately reads only trip fields. It used to be built from
 * JoinRequest rows, which meant every guide whose expertise city overlapped
 * a trip could see the full name and photo of every traveller who had asked
 * to join it - people who had never contacted that guide, had no
 * relationship with them, and never agreed to be shown to them. A guide
 * needs to know that demand exists and where it is going, not who is asking.
 */
function leadTripsWhere(expertisePlaces: string[]) {
  return {
    status: 'ACTIVE' as const,
    privacy: 'PUBLIC' as const,
    startDate: { gte: new Date() },
    cities: { hasSome: expertisePlaces ?? [] },
  };
}

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

    // Exactly the set GET /:id/leads returns, via one shared definition, so
    // the dashboard tile and the list underneath it can never disagree.
    const activeLeadsCount = await prisma.trip.count({
      where: leadTripsWhere(guideProfile.expertisePlaces),
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
        // A string like walletBalance beside it - this was the one money
        // field on the payload leaving as a float (docs/CONVENTIONS.md §3).
        totalEarnings: totalEarnings.toFixed(2),
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
  const parsedQuery = cursorPageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid limit or cursor.' } });
  }
  const { limit, cursor } = parsedQuery.data;

  try {
    const rows = await prisma.guideReel.findMany({
      where: { guideProfileId: id, ...cursorFilter(cursor) },
      orderBy: { createdAt: 'desc' },
      take: takeWithLookahead(limit),
    });
    const { items, nextCursor } = buildPage(rows, limit);
    return res.status(200).json({ ok: true, data: items, meta: { cursor: nextCursor } });
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
  videoUrl: remoteMediaUrl,
  thumbnailUrl: remoteMediaUrl.optional(),
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

// docs/REMEDIATION.md §5.1 — this route took `latitude`/`longitude` straight
// off req.body and ran them through parseFloat, so a missing or non-numeric
// value became NaN and was written to the guide's LiveLocation row, and a
// value outside the real coordinate range was accepted as-is. Both put a
// guide's pin somewhere that is not a place, on a map other users navigate
// by (§8.8).
const liveStatusSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

router.post('/:id/live-status', async (req, res) => {
  const { id } = req.params;
  const parsed = liveStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'latitude must be between -90 and 90, and longitude between -180 and 180.',
      },
    });
  }
  const { latitude, longitude } = parsed.data;
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
          latitude,
          longitude,
          updatedAt: new Date(),
        },
      });
    } else {
      updatedLoc = await prisma.liveLocation.create({
        data: {
          userId: guideProfile.userId,
          latitude,
          longitude,
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

// 6. Guide leads - public trips matching this guide's expertise, with the
// guide's own quote (if any) attached so the "Send Quote" button reflects
// server truth rather than component state that dies on unmount.
router.get('/:id/leads', async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guideProfile = await prisma.guideProfile.findUnique({ where: { id } });
    if (!guideProfile) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
    }

    const trips = await prisma.trip.findMany({
      where: leadTripsWhere(guideProfile.expertisePlaces),
      orderBy: { startDate: 'asc' },
      take: 20,
      include: {
        _count: { select: { requests: true } },
        quotes: { where: { guideProfileId: id! } },
      },
    });

    const leads = trips.map((t) => {
      const myQuote = t.quotes[0];
      return {
        id: t.id,
        tripId: t.id,
        tripName: t.name,
        destination: t.cities.join(' → '),
        cities: t.cities,
        groupSize: t.totalSeats,
        seatsFilled: t.totalSeats - t.availableSeats,
        interestedCount: t._count.requests,
        durationDays: t.durationDays,
        // Money as a string (docs/CONVENTIONS.md §3).
        budget: t.budget.toFixed(2),
        startDate: t.startDate.toISOString().split('T')[0],
        // The organiser's own words about their trip, or nothing. The old
        // version invented "Looking for a guide for this trip." and
        // attributed it to a traveller who never wrote it.
        description: t.description || null,
        quote: myQuote
          ? { id: myQuote.id, amount: myQuote.amount.toFixed(2), status: myQuote.status, message: myQuote.message }
          : null,
      };
    });

    return res.status(200).json({ ok: true, data: leads });
  } catch (err) {
    logger.error('[Guides] Get leads error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve leads' } });
  }
});

// 7. Quotes. travel-guide.tsx has always had a "Send Quote" button; until
// now it set a local Set<string> and toasted "your bid has been sent to the
// traveler. They will be notified immediately." Nothing was sent, nothing
// was stored, and no endpoint existed to receive it.
const createQuoteSchema = z.object({
  tripId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  message: z.string().trim().max(1000).optional(),
});

router.post('/:id/quotes', async (req, res) => {
  const { id } = req.params;
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please enter a quote amount in rupees.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const guide = await prisma.guideProfile.findUnique({
      where: { id },
      include: { user: { include: { profile: true } } },
    });
    if (!guide) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guide profile not found' } });
    }

    const { tripId, amount, message } = parsed.data;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
    }
    // Only quote on what the guide could actually see as a lead - not on a
    // private trip, a finished one, or their own.
    if (trip.creatorId === guide.userId) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'You cannot quote on your own trip.' } });
    }
    if (trip.privacy !== 'PUBLIC' || trip.status !== 'ACTIVE' || trip.startDate.getTime() < Date.now()) {
      return res
        .status(400)
        .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'This trip is no longer open to quotes.' } });
    }

    // Re-quoting replaces the guide's standing offer and puts it back to
    // PENDING, rather than stacking rows in the organiser's inbox.
    const quote = await prisma.guideQuote.upsert({
      where: { guideProfileId_tripId: { guideProfileId: id!, tripId } },
      create: { guideProfileId: id!, tripId, amount, message: message ?? null, status: 'PENDING' },
      update: { amount, message: message ?? null, status: 'PENDING' },
    });

    const guideName = guide.user?.profile?.firstName
      ? `${guide.user.profile.firstName} ${guide.user.profile.lastName || ''}`.trim()
      : 'A guide';
    const title = 'New guide quote';
    const content = `${guideName} quoted ₹${quote.amount.toFixed(2)} to guide ${trip.name}.`;
    await prisma.notification.create({
      data: { userId: trip.creatorId, type: 'TRIP', title, content, time: 'Just now', tripId },
    });
    await sendPushToUsers([trip.creatorId], 'TRIP', {
      title,
      body: content,
      data: { screen: 'trip', tripId },
    });

    return res.status(201).json({
      ok: true,
      data: {
        id: quote.id,
        tripId: quote.tripId,
        amount: quote.amount.toFixed(2),
        message: quote.message,
        status: quote.status,
      },
    });
  } catch (err) {
    logger.error('[Guides] Create quote error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not send your quote.' } });
  }
});

// The guide's own outbox, so they can see what an organiser did with a bid.
router.get('/:id/quotes', async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await assertOwnsGuideProfile(req, res, id!))) return;

    const quotes = await prisma.guideQuote.findMany({
      where: { guideProfileId: id },
      orderBy: { updatedAt: 'desc' },
      include: { trip: { select: { id: true, name: true, cities: true, startDate: true } } },
    });

    return res.status(200).json({
      ok: true,
      data: quotes.map((q) => ({
        id: q.id,
        tripId: q.tripId,
        tripName: q.trip.name,
        destination: q.trip.cities.join(' → '),
        startDate: q.trip.startDate.toISOString().split('T')[0],
        amount: q.amount.toFixed(2),
        message: q.message,
        status: q.status,
      })),
    });
  } catch (err) {
    logger.error('[Guides] List quotes error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load your quotes.' } });
  }
});

export default router;
