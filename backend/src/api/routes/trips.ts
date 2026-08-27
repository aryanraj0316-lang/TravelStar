import { Router } from 'express';
import { z } from 'zod';
import { RecommendationService } from '../../services/recommendation';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { claimSeatAndJoin } from '../../services/trip-membership';
import { calculateMidwayPrice } from '../../services/midway-pricing';
import { coordsForCity, haversineKm } from '../../lib/india-city-coords';

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
// docs/REMEDIATION.md §8.3: search.tsx used to source its "browse all trips"
// list from this route's plain 20-row default and then filter/sort that
// fixed page entirely client-side — so anything past the most recent 20
// trips was invisible to search, category, and budget filters alike, no
// matter what the user typed. `cursor` (same createdAt-keyed pattern as
// feed.ts) makes the full result set reachable via infinite scroll, and
// `guideRequired`/`verifiedOnly` join the filters that were already
// server-side (category/search/maxBudget) so the client no longer needs to
// re-derive them from a possibly-truncated page. `search`/`cities` still
// need a real full-text index to substring-match a city name rather than
// `has`'s exact-element match — not addressed here.
const listTripsQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  maxBudget: z.coerce.number().positive().optional(),
  guideRequired: z.coerce.boolean().optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.coerce.date().optional(),
});

router.get('/', async (req, res) => {
  const parsed = listTripsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid trips query.' } });
  }
  const { category, search, maxBudget, guideRequired, verifiedOnly, cursor } = parsed.data;
  // Public browse route — anonymous callers get isMyTrip: false throughout.
  const tokenUserId = req.user?.id ?? null;

  const pageSize = Math.min(MAX_PAGE_SIZE, parsed.data.limit ?? DEFAULT_PAGE_SIZE);

  try {
    const where: Record<string, unknown> = {};
    if (category && category !== 'All') {
      where.category = { equals: category, mode: 'insensitive' };
    }
    if (maxBudget !== undefined) {
      where.budget = { lte: maxBudget };
    }
    if (search) {
      // Matches every field search.tsx's old client-side filter checked
      // (name, cities, creator, meetingPoint) so moving this server-side
      // doesn't quietly narrow what search can find.
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cities: { has: search } },
        { meetingPoint: { contains: search, mode: 'insensitive' } },
        { creator: { profile: { firstName: { contains: search, mode: 'insensitive' } } } },
        { creator: { profile: { lastName: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    if (guideRequired) {
      where.guideIncluded = true;
    }
    if (verifiedOnly) {
      // "Verified" here means the trip's creator is a Guide or Organizer
      // account, not a plain Tourist — the same distinction the client used
      // to make by string-matching mapTrip's *display* creator label
      // (`.includes('Organizer')`/`.includes('Guide')`), which broke the
      // moment that label's wording changed. Filtering the real role
      // column is both server-side and more correct.
      where.creator = { role: { in: ['GUIDE', 'ORGANIZER'] } };
    }
    if (cursor) {
      where.createdAt = { lt: cursor };
    }

    const dbTrips = await prisma.trip.findMany({
      where,
      include: TRIP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
    });

    const lastTrip = dbTrips[dbTrips.length - 1];
    const nextCursor = dbTrips.length === pageSize && lastTrip ? lastTrip.createdAt.toISOString() : undefined;

    return res
      .status(200)
      .json({ ok: true, data: dbTrips.map((t) => mapTrip(t, tokenUserId)), meta: { cursor: nextCursor } });
  } catch (err) {
    logger.error('[Trips] List error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve trips' } });
  }
});

// Nearby trips — docs/REMEDIATION.md §8.13. Previously returned a hardcoded
// list of Delhi-area places regardless of the caller, and the client
// fabricated a fake Trip object from each place and POSTed a join request
// for a nonexistent trip id. Now returns real public, active, upcoming
// trips. When the caller passes their device location (?lat=&lng=), each
// trip is annotated with an honest straight-line distance from that point
// to the first city on its route that we have reference coordinates for
// (see lib/india-city-coords.ts — no geocoding-service credentials in this
// project), and the list is sorted nearest-first. Trips with no
// recognisable city sort last with distanceKm: null. A real
// routing/geocoding integration would replace the straight-line math.
const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

router.get('/nearby', async (req, res) => {
  const parsed = nearbyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid location query.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
  }
  const { lat, lng, limit } = parsed.data;
  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  const tokenUserId = req.user?.id ?? null;

  try {
    const dbTrips = await prisma.trip.findMany({
      where: {
        privacy: 'PUBLIC',
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      include: TRIP_INCLUDE,
      orderBy: { startDate: 'asc' },
      take: limit ?? DEFAULT_PAGE_SIZE,
    });

    const annotated = dbTrips.map((t) => {
      const base = mapTrip(t, tokenUserId);
      let distanceKm: number | null = null;
      let nearestCity: string | null = null;
      if (origin) {
        for (const city of t.cities) {
          const c = coordsForCity(city);
          if (!c) continue;
          const d = haversineKm(origin, c);
          if (distanceKm === null || d < distanceKm) {
            distanceKm = d;
            nearestCity = city;
          }
        }
      }
      return {
        ...base,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm),
        distanceIsApproximate: distanceKm !== null,
        nearestCity,
      };
    });

    if (origin) {
      annotated.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return res.status(200).json({ ok: true, data: annotated });
  } catch (err) {
    logger.error('[Trips] Nearby error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve nearby trips' } });
  }
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
        memberRole: isOrganizer ? ('ORGANIZER' as const) : t.members[0]!.role,
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
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the trip details.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
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
      Math.round((data.endDate.getTime() - data.startDate.getTime()) / (24 * 60 * 60 * 1000)),
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
      creator: user.profile
        ? `${user.profile.firstName} ${user.profile.lastName} (Organizer)`
        : `${user.email} (Organizer)`,
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
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to create trip. Please try again.' } });
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
      return res
        .status(400)
        .json({
          ok: false,
          error: {
            code: 'APPROVAL_REQUIRED',
            message: "This trip requires the organiser's approval. Send a join request instead.",
          },
        });
    }

    const result = await claimSeatAndJoin(tripId, userId);

    if (!result.ok) {
      if (result.reason === 'TRIP_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found.' } });
      }
      return res
        .status(409)
        .json({ ok: false, error: { code: 'TRIP_FULL', message: 'No available seats on this trip.' } });
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
      return res
        .status(400)
        .json({
          ok: false,
          error: { code: 'VALIDATION_FAILED', message: 'Invalid midway segments selected for this trip route' },
        });
    }

    res.status(200).json({
      ok: true,
      data: {
        tripId: id,
        fromCity,
        toCity,
        fullPrice: fullPrice.toString(),
        adjustedPrice: result.adjustedPrice.toString(),
        segmentsTraversed: result.segmentsTraversed,
      },
    });
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
      : trip.creator.email
        ? trip.creator.email.split('@')[0]
        : 'Organizer';
    const creatorAvatar =
      trip.creator.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

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
        : m.user.email
          ? m.user.email.split('@')[0]
          : 'Traveler';
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

// ─── Shared trip expenses / budget tracker (docs/REMEDIATION.md §8.12) ───
// Every route here requires the caller to be a participant of the trip
// (its creator or a confirmed TripMember). The equal split is computed
// from the current participant set at read time and never stored.

type TripParticipant = { userId: string; name: string; avatar: string; isOrganizer: boolean };

async function loadTripParticipants(tripId: string): Promise<TripParticipant[] | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      creator: { include: { profile: true } },
      members: { include: { user: { include: { profile: true } } } },
    },
  });
  if (!trip) return null;

  const nameOf = (u: { email: string | null; profile: { firstName: string; lastName: string } | null }) =>
    u.profile ? `${u.profile.firstName} ${u.profile.lastName}`.trim() : (u.email?.split('@')[0] ?? 'Traveler');
  const avatarOf = (u: { profile: { avatarUrl: string | null } | null }) =>
    u.profile?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

  const list: TripParticipant[] = [
    { userId: trip.creatorId, name: nameOf(trip.creator), avatar: avatarOf(trip.creator), isOrganizer: true },
  ];
  for (const m of trip.members) {
    if (m.userId === trip.creatorId) continue;
    list.push({ userId: m.userId, name: nameOf(m.user), avatar: avatarOf(m.user), isOrganizer: false });
  }
  return list;
}

const EXPENSE_CATEGORIES = ['TRANSPORT', 'LODGING', 'FOOD', 'ACTIVITY', 'OTHER'] as const;

const createExpenseSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.coerce.number().positive().max(10_000_000),
  category: z.enum(EXPENSE_CATEGORIES).default('OTHER'),
});

// List a trip's shared expenses with the derived per-member split.
router.get('/:tripId/expenses', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId } = req.params;
  try {
    const participants = await loadTripParticipants(tripId);
    if (!participants) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (!participants.some((p) => p.userId === userId)) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not on this trip.' } });
    }

    const expenses = await prisma.tripExpense.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: { paidBy: { include: { profile: true } } },
    });

    const headCount = participants.length;
    const total = expenses.reduce((acc, e) => acc + Number(e.amount), 0);
    const equalShare = headCount > 0 ? total / headCount : 0;

    // Per-member: what they paid, what they owe (equal share), net balance.
    const paidByUser = new Map<string, number>();
    for (const e of expenses) {
      paidByUser.set(e.paidById, (paidByUser.get(e.paidById) ?? 0) + Number(e.amount));
    }
    const balances = participants.map((p) => {
      const paid = paidByUser.get(p.userId) ?? 0;
      return {
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        isOrganizer: p.isOrganizer,
        paid: paid.toFixed(2),
        share: equalShare.toFixed(2),
        net: (paid - equalShare).toFixed(2), // positive => is owed; negative => owes
      };
    });

    const items = expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount).toFixed(2),
      category: e.category,
      createdAt: e.createdAt.toISOString(),
      paidById: e.paidById,
      paidByName: e.paidBy.profile
        ? `${e.paidBy.profile.firstName} ${e.paidBy.profile.lastName}`.trim()
        : (e.paidBy.email?.split('@')[0] ?? 'Traveler'),
      canDelete: e.paidById === userId || participants.find((p) => p.userId === userId)?.isOrganizer === true,
    }));

    return res.status(200).json({
      ok: true,
      data: {
        tripId,
        headCount,
        total: total.toFixed(2),
        yourShare: equalShare.toFixed(2),
        yourNet: (() => {
          const me = balances.find((b) => b.userId === userId);
          return me ? me.net : '0.00';
        })(),
        expenses: items,
        balances,
      },
    });
  } catch (err) {
    logger.error('[Trips] List expenses error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load expenses' } });
  }
});

// Add a shared expense — paid by the caller, who must be on the trip.
router.post('/:tripId/expenses', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId } = req.params;
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Please check the expense details.',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
  }
  try {
    const participants = await loadTripParticipants(tripId);
    if (!participants) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (!participants.some((p) => p.userId === userId)) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not on this trip.' } });
    }

    const expense = await prisma.tripExpense.create({
      data: {
        tripId,
        description: parsed.data.description,
        amount: parsed.data.amount,
        category: parsed.data.category,
        paidById: userId,
      },
    });
    return res.status(201).json({ ok: true, data: { id: expense.id } });
  } catch (err) {
    logger.error('[Trips] Create expense error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to add expense' } });
  }
});

// Delete a shared expense — only the payer or the trip organizer.
router.delete('/:tripId/expenses/:expenseId', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId, expenseId } = req.params;
  try {
    const participants = await loadTripParticipants(tripId);
    if (!participants) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    const me = participants.find((p) => p.userId === userId);
    if (!me) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You are not on this trip.' } });
    }

    const expense = await prisma.tripExpense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.tripId !== tripId) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    }
    if (expense.paidById !== userId && !me.isOrganizer) {
      return res
        .status(403)
        .json({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Only the person who paid or the organizer can remove this.' },
        });
    }

    await prisma.tripExpense.delete({ where: { id: expenseId } });
    return res.status(200).json({ ok: true, data: { id: expenseId } });
  } catch (err) {
    logger.error('[Trips] Delete expense error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to remove expense' } });
  }
});

export default router;
