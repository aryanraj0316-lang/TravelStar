import { Router } from 'express';
import { z } from 'zod';
import { RecommendationService } from '../../services/recommendation';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { claimSeatAndJoin } from '../../services/trip-membership';
import { calculateMidwayPrice } from '../../services/midway-pricing';

const router = Router();

/** Same heuristic used everywhere a Trip needs a display category/travelStyle
 * derived from its name — there is no dedicated column for this, so this is
 * the one place that decides it. */
function deriveCategory(name: string): { travelStyle: string; category: string } {
  const n = name.toLowerCase();
  if (n.includes('spiritual') || n.includes('vrindavan') || n.includes('varanasi')) {
    return { travelStyle: 'RELIGIOUS', category: 'Religious' };
  }
  if (n.includes('kerala') || n.includes('backwaters') || n.includes('nature')) {
    return { travelStyle: 'NATURE', category: 'Nature' };
  }
  if (n.includes('heritage') || n.includes('taj mahal')) {
    return { travelStyle: 'HERITAGE', category: 'Heritage' };
  }
  return { travelStyle: 'ADVENTURE', category: 'Adventure' };
}

function deriveCoverImage(name: string, coverImage: string | null): string {
  if (coverImage) return coverImage;
  const n = name.toLowerCase();
  if (n.includes('vrindavan')) return 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80';
  if (n.includes('ladakh')) return 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80';
  if (n.includes('kerala')) return 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80';
  if (n.includes('taj mahal')) return 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80';
  if (n.includes('golden triangle')) return 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80';
  return 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80';
}

type TripWithCreator = {
  id: string;
  name: string;
  creatorId: string;
  creator: { role: string; profile: { firstName: string; lastName: string } | null } | null;
  chatRoom: { id: string } | null;
  cities: string[];
  startDate: Date;
  endDate: Date;
  budget: { toString(): string };
  availableSeats: number;
  totalSeats: number;
  meetingPoint: string;
  guideIncluded: boolean;
  foodIncluded: boolean;
  hotelIncluded: boolean;
  cabIncluded: boolean;
  privacy: string;
  coverImage: string | null;
  category: string | null;
  languages: string[];
};

function mapTrip(t: TripWithCreator, tokenUserId: string | null) {
  const creatorName = t.creator?.profile
    ? `${t.creator.profile.firstName} ${t.creator.profile.lastName} (${t.creator.role === 'GUIDE' ? 'Guide' : 'Organizer'})`
    : 'Unknown Organizer';
  const { travelStyle, category } = deriveCategory(t.name);

  return {
    id: t.id,
    name: t.name,
    creator: creatorName,
    creatorId: t.creatorId,
    isMyTrip: tokenUserId ? t.creatorId === tokenUserId : false,
    chatRoomId: t.chatRoom?.id || null,
    cities: t.cities,
    startDate: t.startDate.toISOString().split('T')[0],
    endDate: t.endDate.toISOString().split('T')[0],
    budget: t.budget.toString(), // money crosses the wire as a string — docs/CONVENTIONS.md §3
    availableSeats: t.availableSeats,
    totalSeats: t.totalSeats,
    meetingPoint: t.meetingPoint,
    guideIncluded: t.guideIncluded,
    foodIncluded: t.foodIncluded,
    hotelIncluded: t.hotelIncluded,
    cabIncluded: t.cabIncluded,
    privacy: t.privacy,
    membersCount: t.totalSeats - t.availableSeats,
    coverImage: deriveCoverImage(t.name, t.coverImage),
    category: t.category || category,
    languages: t.languages,
    travelStyle,
  };
}

const TRIP_INCLUDE = {
  creator: { include: { profile: true } },
  chatRoom: true,
} as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// List Trips (with optional query filters), pushed into SQL rather than
// loading everything and filtering in JS — docs/REMEDIATION.md §5.9.
router.get('/', async (req, res) => {
  const { category, search, maxBudget } = req.query;
  // Public browse route — anonymous callers get isMyTrip: false throughout.
  const tokenUserId = req.user?.id ?? null;

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE)
  );

  try {
    const where: Record<string, unknown> = {};
    if (category && typeof category === 'string' && category !== 'All') {
      where.category = { equals: category, mode: 'insensitive' };
    }
    if (maxBudget) {
      const limit = parseFloat(maxBudget as string);
      if (!isNaN(limit)) {
        where.budget = { lte: limit };
      }
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cities: { has: search } },
      ];
    }

    const dbTrips = await prisma.trip.findMany({
      where,
      include: TRIP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
    });

    return res.status(200).json({ ok: true, data: dbTrips.map((t) => mapTrip(t, tokenUserId)) });
  } catch (err) {
    logger.error('[Trips] List error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve trips' } });
  }
});

// Get Nearby Places — see docs/REMEDIATION.md §8.13 (Phase 8): this is
// entirely hardcoded pending real geospatial search. Left as-is; it is not a
// backend-correctness bug the way the rest of this file was, it is an
// unbuilt feature, and building real geospatial search here would be
// guessing at Phase 8 scope rather than fixing Phase 5 issues.
router.get('/nearby', (req, res) => {
  const nearbyPlaces = [
    {
      id: 'place-1',
      name: 'Sultanpur Bird Sanctuary & Lake',
      category: 'Nature & Wildlife',
      distanceKm: 42,
      driveTime: '1 hr 05 mins',
      pricePerHead: 1800,
      priceDiffText: '✨ SASTA TRIP (Minimal Expense - Save ₹3,100)',
      isCheapest: true,
      rating: 4.6,
      reviewsCount: 1240,
      imageUrl: 'https://images.unsplash.com/photo-1511497584788-876761c119ef?w=800&q=80',
      shortDesc: 'Serene wetland lake sanctuary with migratory birds & peaceful walking trails.',
      transportCost: 600,
      stayMealCost: 1000,
      entryCost: 200,
    },
    {
      id: 'place-2',
      name: 'Surajkund Heritage Lake & Asola Reserve',
      category: 'Heritage & Nature',
      distanceKm: 24,
      driveTime: '35 mins',
      pricePerHead: 2200,
      priceDiffText: '📍 NEAREST LOCATION (Only 24 km away)',
      isNearest: true,
      rating: 4.5,
      reviewsCount: 890,
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
      shortDesc: 'Ancient 10th-century amphitheater reservoir surrounded by lush green hills.',
      transportCost: 500,
      stayMealCost: 1500,
      entryCost: 200,
    },
    {
      id: 'place-3',
      name: 'Agra Taj Mahal & Agra Fort',
      category: 'World Wonder Heritage',
      distanceKm: 210,
      driveTime: '3 hrs 15 mins (Expressway)',
      pricePerHead: 4900,
      priceDiffText: '👑 BEST RATED #1 DESTINATION (4.9★)',
      isBestRated: true,
      rating: 4.9,
      reviewsCount: 4820,
      imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80',
      shortDesc: 'Iconic marble monument of eternal love & Mughal grand citadel fort.',
      transportCost: 1800,
      stayMealCost: 2500,
      entryCost: 600,
    },
    {
      id: 'place-4',
      name: 'Neemrana Fort Palace & Zipline',
      category: 'Royal Heritage & Adventure',
      distanceKm: 122,
      driveTime: '2 hrs 10 mins',
      pricePerHead: 3800,
      priceDiffText: '+₹2,000 vs Sasta Trip',
      rating: 4.7,
      reviewsCount: 2150,
      imageUrl: 'https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&q=80',
      shortDesc: '15th-century cliffside palace with flying-fox zipline over Rajasthan hills.',
      transportCost: 1200,
      stayMealCost: 2100,
      entryCost: 500,
    },
    {
      id: 'place-5',
      name: 'Rishikesh Ganga Ghats & Rafting',
      category: 'Adventure & Yoga Capital',
      distanceKm: 240,
      driveTime: '4 hrs 20 mins',
      pricePerHead: 3400,
      priceDiffText: '+₹1,600 vs Sasta Trip',
      rating: 4.8,
      reviewsCount: 3910,
      imageUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
      shortDesc: 'White-water river rafting on River Ganges & evening divine Ganga Aarti.',
      transportCost: 1400,
      stayMealCost: 1600,
      entryCost: 400,
    },
  ];
  res.status(200).json({ ok: true, data: nearbyPlaces });
});

// Get the authenticated user's confirmed trips — the real, payment-free v1
// stand-in for a "booking" (docs/REMEDIATION.md §8.11). Payments/wallet
// were removed for v1 (§5.5/§5.6), so there is no Payment/Booking row to
// read here. "Confirmed" means either: the user organizes the trip
// (Trip.creatorId), or the user has a TripMember row (joined and got a
// seat) — creating a trip does NOT also insert a TripMember row for its
// creator (see services/trip-membership.ts), so both sources are required
// or an organizer's own trips would be invisible on this screen. Status is
// derived from the trip's own dates rather than stored, so it can never
// drift out of sync.
router.get('/mine', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const trips = await prisma.trip.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [{ creatorId: userId }, { members: { some: { userId } } }],
      },
      include: { ...TRIP_INCLUDE, members: { where: { userId } } },
      orderBy: { startDate: 'desc' },
    });

    const now = Date.now();
    const data = trips.map((t) => {
      const mapped = mapTrip(t, userId);
      const startMs = t.startDate.getTime();
      // A trip "ends" at the close of its end date, not midnight at the
      // start of it — otherwise the last day of a trip reads as COMPLETED.
      const endMs = t.endDate.getTime() + 24 * 60 * 60 * 1000 - 1;
      const status: 'ONGOING' | 'UPCOMING' | 'COMPLETED' =
        now < startMs ? 'UPCOMING' : now > endMs ? 'COMPLETED' : 'ONGOING';
      const isOrganizer = t.creatorId === userId;
      return {
        ...mapped,
        status,
        joinedAt: (isOrganizer ? t.createdAt : t.members[0]!.joinedAt).toISOString(),
        memberRole: isOrganizer ? 'ORGANIZER' as const : t.members[0]!.role,
      };
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    logger.error('[Trips] Get my trips error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve your trips.' } });
  }
});

// Get Trip by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  // Public browse route — anonymous callers get isMyTrip: false.
  const tokenUserId = req.user?.id ?? null;
  try {
    const t = await prisma.trip.findUnique({ where: { id }, include: TRIP_INCLUDE });
    if (!t) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    return res.status(200).json({ ok: true, data: mapTrip(t, tokenUserId) });
  } catch (err) {
    logger.error('[Trips] Get by id error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve trip' } });
  }
});

const createTripSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    cities: z.array(z.string().trim().min(1)).min(1).max(20),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    budget: z.number().positive(),
    totalSeats: z.number().int().min(1).max(500),
    meetingPoint: z.string().trim().min(1).max(300),
    guideIncluded: z.boolean().default(false),
    foodIncluded: z.boolean().default(false),
    hotelIncluded: z.boolean().default(false),
    cabIncluded: z.boolean().default(false),
    privacy: z.enum(['PUBLIC', 'PRIVATE', 'INVITE_ONLY']).default('PUBLIC'),
    coverImage: z.string().url().max(2000).optional(),
    category: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.endDate.getTime() > data.startDate.getTime(), {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  })
  .refine((data) => data.startDate.getTime() > Date.now(), {
    message: 'startDate must be in the future',
    path: ['startDate'],
  });

// Create Trip
router.post('/', async (req, res) => {
  const parsed = createTripSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Please check the trip details.', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }
  const data = parsed.data;

  try {
    // The creator is always the authenticated caller — a client cannot
    // create a trip on someone else's behalf.
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) {
      return res.status(404).json({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'Account not found.' } });
    }

    const durationDays = Math.max(
      1,
      Math.round((data.endDate.getTime() - data.startDate.getTime()) / (24 * 60 * 60 * 1000))
    );

    const { newTrip, chatRoom } = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          ...(data.id !== undefined ? { id: data.id } : {}),
          creatorId: user.id,
          name: data.name,
          description: 'Custom travel route created via TravelStar app.',
          cities: data.cities,
          startDate: data.startDate,
          endDate: data.endDate,
          durationDays,
          budget: data.budget,
          availableSeats: data.totalSeats,
          totalSeats: data.totalSeats,
          meetingPoint: data.meetingPoint,
          guideIncluded: data.guideIncluded,
          foodIncluded: data.foodIncluded,
          hotelIncluded: data.hotelIncluded,
          cabIncluded: data.cabIncluded,
          privacy: data.privacy,
          languages: ['Hindi', 'English'],
          coverImage: data.coverImage ?? null,
          category: data.category ?? null,
        },
      });

      const room = await tx.chatRoom.create({
        data: { isGroup: true, name: data.name, tripId: trip.id },
      });
      await tx.chatRoomMember.create({ data: { chatRoomId: room.id, userId: user.id } });

      return { newTrip: trip, chatRoom: room };
    });

    const { travelStyle, category } = deriveCategory(newTrip.name);
    const mappedTrip = {
      id: newTrip.id,
      name: newTrip.name,
      creator: user.profile ? `${user.profile.firstName} ${user.profile.lastName} (Organizer)` : `${user.email} (Organizer)`,
      creatorId: user.id,
      chatRoomId: chatRoom.id,
      cities: newTrip.cities,
      startDate: newTrip.startDate.toISOString().split('T')[0],
      endDate: newTrip.endDate.toISOString().split('T')[0],
      budget: newTrip.budget.toString(),
      availableSeats: newTrip.availableSeats,
      totalSeats: newTrip.totalSeats,
      meetingPoint: newTrip.meetingPoint,
      guideIncluded: newTrip.guideIncluded,
      foodIncluded: newTrip.foodIncluded,
      hotelIncluded: newTrip.hotelIncluded,
      cabIncluded: newTrip.cabIncluded,
      privacy: newTrip.privacy,
      membersCount: 1,
      coverImage: deriveCoverImage(newTrip.name, newTrip.coverImage),
      category: newTrip.category || category,
      languages: newTrip.languages,
      travelStyle,
    };

    return res.status(201).json({ ok: true, data: mappedTrip });
  } catch (err) {
    logger.error('[Trips] Create error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create trip. Please try again.' } });
  }
});

// Instant join — PUBLIC trips only. PRIVATE/INVITE_ONLY trips require the
// creator's approval via POST /interactions/join-request, which shares the
// same seat-claiming logic (services/trip-membership.ts) so both paths are
// race-safe the same way — see docs/REMEDIATION.md §5.4.
router.post('/:id/join', async (req, res) => {
  const tripId = req.params.id;
  const userId = requireUserId(req);

  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { privacy: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
    }
    if (trip.privacy !== 'PUBLIC') {
      return res.status(400).json({ ok: false, error: { code: 'APPROVAL_REQUIRED', message: 'This trip requires the organiser\'s approval. Send a join request instead.' } });
    }

    const result = await claimSeatAndJoin(tripId, userId);

    if (!result.ok) {
      if (result.reason === 'TRIP_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
      }
      return res.status(409).json({ ok: false, error: { code: 'TRIP_FULL', message: 'No available seats on this trip.' } });
    }

    const updated = await prisma.trip.findUnique({ where: { id: tripId }, include: TRIP_INCLUDE });
    return res.status(200).json({
      ok: true,
      data: {
        trip: updated ? mapTrip(updated, userId) : null,
        message: result.alreadyMember ? 'You are already a member of this trip.' : 'Successfully joined trip.',
      },
    });
  } catch (err) {
    logger.error('[Trips] Join error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to join trip.' } });
  }
});

// AI Recommendation generator — now scored against real trips instead of the
// permanently-empty in-memory array (docs/REMEDIATION.md §5.3).
const recommendationSchema = z.object({
  currentLocation: z.string().trim().min(1).max(100).default('Delhi'),
  interests: z.array(z.string()).default([]),
  budgetLimit: z.number().positive().default(30000),
  languages: z.array(z.string()).default(['Hindi']),
  travelStyle: z.string().default('RELIGIOUS'),
});

router.post('/recommendations', async (req, res) => {
  const parsed = recommendationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid preferences.' } });
  }

  try {
    const dbTrips = await prisma.trip.findMany({
      where: { availableSeats: { gt: 0 } },
      take: 100,
    });
    const groups = dbTrips.map((t) => ({
      id: t.id,
      name: t.name,
      cities: t.cities,
      budget: Number(t.budget),
      languages: t.languages,
      travelStyle: deriveCategory(t.name).travelStyle,
    }));

    const results = RecommendationService.getRecommendations(parsed.data, groups);
    res.status(200).json({ ok: true, data: results });
  } catch (err) {
    logger.error('[Trips] Recommendations error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to generate recommendations.' } });
  }
});

// Midway Join (Family Connect segment price preview) — now reads the real
// trip instead of the permanently-empty in-memory array
// (docs/REMEDIATION.md §5.3), and shares its pricing math with
// POST /interactions/join-request via calculateMidwayPrice (§8.6) instead
// of each computing its own slightly different formula.
router.post('/:id/midway-join', async (req, res) => {
  const { id } = req.params;
  const { fromCity, toCity } = req.body;

  try {
    const trip = await prisma.trip.findUnique({ where: { id } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }

    const fullPrice = Number(trip.budget);
    const result = calculateMidwayPrice(trip.cities, fullPrice, fromCity, toCity);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid midway segments selected for this trip route' } });
    }

    res.status(200).json({ ok: true, data: {
        tripId: id,
        fromCity,
        toCity,
        fullPrice: fullPrice.toString(),
        adjustedPrice: result.adjustedPrice.toString(),
        segmentsTraversed: result.segmentsTraversed,
      } });
  } catch (err) {
    logger.error('[Trips] Midway-join error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to calculate midway price.' } });
  }
});

// Get trip members by trip ID
router.get('/:id/members', async (req, res) => {
  const { id } = req.params;
  try {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        creator: { include: { profile: true } },
        members: { include: { user: { include: { profile: true } } } },
      },
    });

    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }

    const creatorName = trip.creator.profile
      ? `${trip.creator.profile.firstName} ${trip.creator.profile.lastName}`.trim()
      : (trip.creator.email ? trip.creator.email.split('@')[0] : 'Organizer');
    const creatorAvatar = trip.creator.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

    const creatorItem = {
      id: `creator-${trip.creatorId}`,
      userId: trip.creatorId,
      name: `${creatorName} (Creator)`,
      avatar: creatorAvatar,
      isCreator: true,
    };

    const memberItems = trip.members.map((m) => {
      const name = m.user.profile
        ? `${m.user.profile.firstName} ${m.user.profile.lastName}`.trim()
        : (m.user.email ? m.user.email.split('@')[0] : 'Traveler');
      const avatar = m.user.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

      return {
        id: m.id,
        userId: m.userId,
        name,
        avatar,
        isCreator: false,
      };
    });

    const participants = [creatorItem, ...memberItems];
    return res.status(200).json({ ok: true, data: participants });
  } catch (err) {
    logger.error('[Trips] Get trip members error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to fetch trip members' } });
  }
});

export default router;
