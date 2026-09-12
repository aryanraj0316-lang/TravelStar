import { Router } from 'express';
import { z } from 'zod';
import { remoteMediaUrl } from '../../lib/validators';
import { RecommendationService } from '../../services/recommendation';
import prisma from '../../services/db';
import { logger } from '../../lib/logger';
import { requireUserId } from '../../lib/auth-context';
import { claimSeatAndJoin } from '../../services/trip-membership';
import { calculateMidwayPrice } from '../../services/midway-pricing';
import { coordsForCity, haversineKm } from '../../lib/india-city-coords';
import { createTripCoverUploadUrl, ObjectStorageNotConfiguredError } from '../../lib/object-storage';
import { sendPushToUsers } from '../../lib/push';

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

// A trip whose organiser uploaded no cover photo has no cover photo. This
// used to match on the trip's *name* and hand back a stock Unsplash shot -
// so a trip called "Ladakh with friends" was presented with a photograph
// nobody on it had taken, of a place it might not even visit. The client
// renders a placeholder from the trip name instead.
function deriveCoverImage(_name: string, coverImage: string | null): string | null {
  return coverImage;
}

type TripWithCreator = {
  id: string;
  name: string;
  creatorId: string;
  creator: { role: string; profile: { firstName: string; lastName: string } | null } | null;
  chatRoom: { id: string } | null;
  cities: string[];
  durationDays: number;
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
    durationDays: t.durationDays,
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
// re-derive them from a possibly-truncated page. `search`'s city match is a
// $queryRaw substring scan (see below), not a real full-text index — fine
// at this table's size, worth revisiting if it grows.
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
      // doesn't quietly narrow what search can find. Prisma's `has` on a
      // Postgres text[] column is an exact-element match — "jai" would not
      // find a trip whose cities include "Jaipur" — which is worse parity
      // than the client-side filter it replaced (a real .includes()
      // substring check). $queryRaw is the only way to substring-match
      // inside an array column; `search` is passed as a bound parameter
      // (tagged template), not interpolated, so this isn't injectable.
      const cityMatches = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Trip" WHERE EXISTS (
          SELECT 1 FROM unnest(cities) AS city WHERE city ILIKE ${`%${search}%`}
        )
      `;
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { id: { in: cityMatches.map((t) => t.id) } },
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
    return res.status(400).json({
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
    // The route timeline and packing checklist ride along on the detail
    // response, not the list one: someone deciding whether to join needs
    // the full picture (how long at each stop, how they travel between
    // them, what to pack), and this endpoint is public precisely so they
    // can see it before committing. Loading them on the *list* endpoint
    // instead would multiply its payload for data no card renders.
    const t = await prisma.trip.findUnique({
      where: { id },
      include: {
        ...TRIP_INCLUDE,
        timeline: { orderBy: { order: 'asc' } },
        checklist: { orderBy: { order: 'asc' } },
      },
    });
    if (!t) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    return res.status(200).json({
      ok: true,
      data: {
        ...mapTrip(t, tokenUserId),
        description: t.description,
        timeline: t.timeline.map((s) => ({
          order: s.order,
          city: s.city,
          stayDays: s.stayDays,
          transitTimeMinutes: s.transitTimeMinutes,
          transitMode: s.transitMode,
          activities: s.activities,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
        checklist: t.checklist.map((c) => ({ id: c.id, order: c.order, label: c.label })),
      },
    });
  } catch (err) {
    logger.error('[Trips] Get by id error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to retrieve trip' } });
  }
});

// One stop on the trip's route, as built on the create screen's Timeline
// tab. `transitTimeMinutes`/`transitMode` describe the leg used to REACH
// this stop and are absent on the first one. Coordinates are optional
// because a city the client could not geocode must arrive without them
// rather than with invented ones (docs/REMEDIATION.md §0.2 rule 4).
const timelineStopSchema = z.object({
  city: z.string().trim().min(1).max(200),
  stayDays: z.number().int().min(0).max(365).default(1),
  transitTimeMinutes: z.number().int().min(0).max(60 * 24 * 30).nullish(),
  transitMode: z.enum(['CAB', 'TRAIN', 'FLIGHT', 'BUS']).nullish(),
  activities: z.string().trim().max(2000).default(''),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
});

const createTripSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
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
    coverImage: remoteMediaUrl.optional(),
    category: z.string().trim().max(100).optional(),
    // The Timeline tab's stops and the Checklist tab's items. Both were
    // previously collected in the create screen's local state and thrown
    // away on submit — no traveller ever saw either.
    timeline: z.array(timelineStopSchema).max(20).optional(),
    checklist: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
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
    return res.status(400).json({
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
          // No client-supplied id: ids are database-generated (CONVENTIONS
          // §5). The create screen used to send `trip-${Date.now()}`, which
          // this schema rejected as a non-UUID — every "Create Trip" tap
          // failed with a 400 until that was removed.
          creatorId: user.id,
          name: data.name,
          // The organizer's own words. This used to be a fixed sentence
          // ("Custom travel route created via TravelStar app.") written
          // onto every trip while the description the organizer actually
          // typed on the Plan tab was dropped on the floor.
          description: data.description ?? '',
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

      // The route timeline and packing checklist are written inside the
      // same transaction as the trip: a trip that exists with half its
      // itinerary missing would be worse than one that failed outright.
      if (data.timeline && data.timeline.length > 0) {
        await tx.tripTimelineStop.createMany({
          data: data.timeline.map((stop, index) => ({
            tripId: trip.id,
            order: index,
            city: stop.city,
            stayDays: stop.stayDays,
            // The first stop has no inbound leg, so it carries no transit
            // details no matter what the client sent.
            transitTimeMinutes: index === 0 ? null : (stop.transitTimeMinutes ?? null),
            transitMode: index === 0 ? null : (stop.transitMode ?? null),
            activities: stop.activities,
            latitude: stop.latitude ?? null,
            longitude: stop.longitude ?? null,
          })),
        });
      }

      if (data.checklist && data.checklist.length > 0) {
        await tx.tripChecklistItem.createMany({
          data: data.checklist.map((label, index) => ({ tripId: trip.id, order: index, label })),
        });
      }

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

// docs/REMEDIATION.md §8.4 — create.tsx's custom-cover-image picker set the
// picked asset's local file://(/blob:/data: on web) uri directly as
// coverImage: unreachable by anyone browsing the trip other than the
// organizer's own device (before its cache clears). Same fix as the
// avatar-upload route (§8.2): a short-lived presigned PUT URL the client
// uploads straight to the bucket, keyed by the *uploader's* id since the
// trip doesn't have an id yet at pick time — registered before the /:id
// routes below so it isn't swallowed as `id: 'cover-upload-url'`.
const coverUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

router.post('/cover-upload-url', async (req, res) => {
  const parsed = coverUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'contentType must be image/jpeg, image/png, or image/webp.' },
    });
  }

  try {
    const userId = requireUserId(req);
    const { uploadUrl, publicUrl } = await createTripCoverUploadUrl(userId, parsed.data.contentType);
    return res.status(200).json({ ok: true, data: { uploadUrl, publicUrl } });
  } catch (err) {
    if (err instanceof ObjectStorageNotConfiguredError) {
      return res.status(503).json({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo upload is not available right now.' },
      });
    }
    logger.error('[Trips] Cover upload URL failed:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not start the upload.' } });
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
      return res.status(400).json({
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
      if (result.reason === 'BUSY') {
        // The database was too contended to start the transaction; nothing
        // was written. This is explicitly NOT reported as TRIP_FULL — that
        // would tell a user a trip was sold out when it was not
        // (docs/REMEDIATION.md §5.4).
        res.setHeader('Retry-After', '2');
        return res.status(503).json({
          ok: false,
          error: { code: 'SERVICE_BUSY', message: 'Too many people are joining right now. Please try again.' },
        });
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

const updateTripSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  meetingPoint: z.string().trim().min(1).max(300).optional(),
  budget: z.coerce.number().positive().optional(),
});

// Update Trip (organizer only)
router.patch('/:id', async (req, res) => {
  const tripId = req.params.id;
  const userId = requireUserId(req);
  const parsed = updateTripSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid trip update parameters.' },
    });
  }

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_INCLUDE,
    });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the organizer can edit this trip.' } });
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.meetingPoint !== undefined ? { meetingPoint: parsed.data.meetingPoint } : {}),
        ...(parsed.data.budget !== undefined ? { budget: parsed.data.budget } : {}),
      },
      include: TRIP_INCLUDE,
    });

    return res.status(200).json({ ok: true, data: mapTrip(updated, userId) });
  } catch (err) {
    logger.error('[Trips] Update trip error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update trip.' } });
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
      return res.status(400).json({
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
    // Null, not a stock photograph of an unrelated person - the client's
    // <Avatar> falls back to initials.
    const creatorAvatar = trip.creator.profile?.avatarUrl ?? null;

    const creatorItem = {
      id: `creator-${trip.creatorId}`,
      userId: trip.creatorId,
      name: `${creatorName} (Creator)`,
      avatar: creatorAvatar,
      isCreator: true,
      // The organizer has no TripMember row (they're the trip itself, not a
      // joiner) — these roster tools don't apply to them.
      checkedIn: null,
      roomAllocated: null,
      seatAllocated: null,
    };

    const memberItems = trip.members.map((m) => {
      const name = m.user.profile
        ? `${m.user.profile.firstName} ${m.user.profile.lastName}`.trim()
        : m.user.email
          ? m.user.email.split('@')[0]
          : 'Traveler';
      const avatar = m.user.profile?.avatarUrl ?? null;

      return {
        id: m.id,
        userId: m.userId,
        name,
        avatar,
        isCreator: false,
        // docs/REMEDIATION.md §8.6 — real roster state, replacing what used
        // to be client-only useState reset on every refetch.
        checkedIn: m.checkedInAt !== null,
        roomAllocated: m.roomAllocated,
        seatAllocated: m.seatAllocated,
      };
    });

    const participants = [creatorItem, ...memberItems];
    return res.status(200).json({ ok: true, data: participants });
  } catch (err) {
    logger.error('[Trips] Get trip members error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to fetch trip members' } });
  }
});

// docs/REMEDIATION.md §8.6 — organizer roster tools (check-in, room/seat
// allocation) used to be pure client-side useState on group-organizer.tsx,
// silently discarded the next time the member list was refetched. This is
// the real, persisted version: organizer-only (the trip's creator), any
// subset of the three fields, applied to one member's TripMember row.
const updateRosterSchema = z
  .object({
    checkedIn: z.boolean().optional(),
    roomAllocated: z.string().trim().max(100).nullable().optional(),
    seatAllocated: z.string().trim().max(100).nullable().optional(),
  })
  .refine(
    (data) => data.checkedIn !== undefined || data.roomAllocated !== undefined || data.seatAllocated !== undefined,
    {
      message: 'At least one of checkedIn, roomAllocated, seatAllocated is required.',
    },
  );

router.patch('/:id/members/:userId', async (req, res) => {
  const { id: tripId, userId: memberUserId } = req.params;
  const parsed = updateRosterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid roster update.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  try {
    const callerId = requireUserId(req);
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== callerId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can edit the roster.' } });
    }

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: memberUserId! } },
    });
    if (!member) {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'NOT_FOUND', message: 'That user is not a member of this trip.' } });
    }

    const data: { checkedInAt?: Date | null; roomAllocated?: string | null; seatAllocated?: string | null } = {};
    if (parsed.data.checkedIn !== undefined) {
      data.checkedInAt = parsed.data.checkedIn ? new Date() : null;
    }
    if (parsed.data.roomAllocated !== undefined) {
      data.roomAllocated = parsed.data.roomAllocated;
    }
    if (parsed.data.seatAllocated !== undefined) {
      data.seatAllocated = parsed.data.seatAllocated;
    }

    const updated = await prisma.tripMember.update({ where: { id: member.id }, data });
    return res.status(200).json({
      ok: true,
      data: {
        userId: updated.userId,
        checkedIn: updated.checkedInAt !== null,
        roomAllocated: updated.roomAllocated,
        seatAllocated: updated.seatAllocated,
      },
    });
  } catch (err) {
    logger.error('[Trips] Update roster error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not update the roster.' } });
  }
});

// docs/REMEDIATION.md §8.6 — "Group Announcements" used to be pure
// client-side useState with a Alert.alert claiming "broadcasted to all
// participants via Push Notification" — nothing was sent to anyone.
// Organizer-only; fans a real Notification out to every TripMember (not
// the organizer, who wrote it). Real push delivery is still gated on
// §8.18 (no EAS project in this environment) — this lands the
// notification in each member's in-app feed, which is real today.
const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
});

router.post('/:id/announcements', async (req, res) => {
  const { id: tripId } = req.params;
  const parsed = createAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please provide a title and message.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  try {
    const callerId = requireUserId(req);
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { members: { select: { userId: true } } },
    });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== callerId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can post announcements.' } });
    }

    const recipientIds = trip.members.map((m) => m.userId).filter((uid) => uid !== callerId);
    if (recipientIds.length > 0) {
      await prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          type: 'TRIP' as const,
          title: parsed.data.title,
          content: parsed.data.content,
          time: 'Just now',
          tripId,
        })),
      });
    }

    // Real push on top of the feed rows (docs/REMEDIATION.md §8.18).
    // `pushed` is what actually reached a device — reported separately
    // from recipientCount rather than conflated with it, because a member
    // with no registered device or push switched off still gets the
    // in-app notification and is a genuine recipient.
    const { sent: pushed } = await sendPushToUsers(recipientIds, 'TRIP', {
      title: parsed.data.title,
      body: parsed.data.content,
      data: { screen: 'trip', tripId },
    });

    return res.status(201).json({
      ok: true,
      data: { message: 'Announcement sent to trip members.', recipientCount: recipientIds.length, pushed },
    });
  } catch (err) {
    logger.error('[Trips] Create announcement error:', err);
    return res
      .status(500)
      .json({ ok: false, error: { code: 'INTERNAL', message: 'Could not send the announcement.' } });
  }
});

// --- Guide quotes on this trip (the receiving end of POST /guides/:id/quotes) ---
// Only the organiser sees who bid what, and only they can accept or decline.

router.get('/:tripId/quotes', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId } = req.params;
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can see quotes.' } });
    }

    const quotes = await prisma.guideQuote.findMany({
      where: { tripId },
      orderBy: [{ status: 'asc' }, { amount: 'asc' }],
      include: {
        guide: {
          include: { user: { include: { profile: true } }, _count: { select: { reviews: true } } },
        },
      },
    });

    return res.status(200).json({
      ok: true,
      data: quotes.map((q) => ({
        id: q.id,
        guideProfileId: q.guideProfileId,
        guideName: q.guide.user?.profile?.firstName
          ? `${q.guide.user.profile.firstName} ${q.guide.user.profile.lastName || ''}`.trim()
          : null,
        guideAvatar: q.guide.user?.profile?.avatarUrl ?? null,
        guideVerifiedStatus: q.guide.verifiedStatus,
        guideRating: q.guide.rating,
        guideReviewCount: q.guide._count.reviews,
        guideExperienceYears: q.guide.experienceYears,
        guideLanguages: q.guide.languagesSpoken,
        amount: q.amount.toFixed(2),
        message: q.message,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error('[Trips] List quotes error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not load quotes.' } });
  }
});

const quoteDecisionSchema = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) });

router.post('/:tripId/quotes/:quoteId/status', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId, quoteId } = req.params;
  const parsed = quoteDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'status must be ACCEPTED or DECLINED.' } });
  }

  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true, name: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can answer a quote.' } });
    }

    const quote = await prisma.guideQuote.findUnique({
      where: { id: quoteId },
      include: { guide: { select: { userId: true } } },
    });
    if (!quote || quote.tripId !== tripId) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'That quote is gone.' } });
    }
    if (quote.status !== 'PENDING') {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: `This quote was already ${quote.status.toLowerCase()}.` },
      });
    }

    const updated = await prisma.guideQuote.update({ where: { id: quoteId }, data: { status: parsed.data.status } });

    const accepted = parsed.data.status === 'ACCEPTED';
    const title = accepted ? 'Your quote was accepted' : 'Your quote was declined';
    const content = accepted
      ? `The organizer accepted your quote for ${trip.name}.`
      : `The organizer declined your quote for ${trip.name}.`;
    await prisma.notification.create({
      data: { userId: quote.guide.userId, type: 'TRIP', title, content, time: 'Just now', tripId },
    });
    await sendPushToUsers([quote.guide.userId], 'TRIP', {
      title,
      body: content,
      data: { screen: 'trip', tripId },
    });

    return res.status(200).json({ ok: true, data: { id: updated.id, status: updated.status } });
  } catch (err) {
    logger.error('[Trips] Quote decision error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Could not update the quote.' } });
  }
});

// ─── Trip itinerary / day schedule (docs/REMEDIATION.md §8.6) ───
// group-organizer.tsx's "Day Schedule" tab rendered the same two hardcoded
// days ("Arrival & Welcoming Dinner", "Trekking & Sightseeing") for every
// trip, and "Insert Itinerary Day" only pushed onto local useState — the
// day was gone on unmount and no trip member ever saw it. Reading is open
// to every participant; writing is the organizer's alone. Day numbers are
// assigned server-side from the current maximum, never taken from the
// client, so two organizer devices cannot both claim "Day 3".

const createItineraryDaySchema = z.object({
  title: z.string().trim().min(1).max(200),
  plan: z.string().trim().min(1).max(2000),
});

router.get('/:tripId/itinerary', async (req, res) => {
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

    const days = await prisma.tripItineraryDay.findMany({ where: { tripId }, orderBy: { day: 'asc' } });
    const isOrganizer = participants.some((p) => p.userId === userId && p.isOrganizer);
    return res.status(200).json({
      ok: true,
      data: {
        tripId,
        canEdit: isOrganizer,
        days: days.map((d) => ({ id: d.id, day: d.day, title: d.title, plan: d.plan })),
      },
    });
  } catch (err) {
    logger.error('[Trips] List itinerary error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to load the itinerary' } });
  }
});

router.post('/:tripId/itinerary', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId } = req.params;
  const parsed = createItineraryDaySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please provide a day heading and plan.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can edit the itinerary.' } });
    }

    // Appending is a read-then-write on the day number, so two concurrent
    // adds could pick the same one — the (tripId, day) unique index turns
    // that into a P2002 the loser retries rather than a duplicate Day 3.
    let created: { id: string; day: number } | null = null;
    for (let attempt = 0; attempt < 3 && created === null; attempt += 1) {
      const last = await prisma.tripItineraryDay.findFirst({
        where: { tripId },
        orderBy: { day: 'desc' },
        select: { day: true },
      });
      try {
        created = await prisma.tripItineraryDay.create({
          data: { tripId, day: (last?.day ?? 0) + 1, title: parsed.data.title, plan: parsed.data.plan },
          select: { id: true, day: true },
        });
      } catch (e) {
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      }
    }
    if (created === null) {
      return res
        .status(409)
        .json({ ok: false, error: { code: 'CONFLICT', message: 'The itinerary changed — please try again.' } });
    }

    return res.status(201).json({ ok: true, data: { id: created.id, day: created.day } });
  } catch (err) {
    logger.error('[Trips] Create itinerary day error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to add the day' } });
  }
});

router.delete('/:tripId/itinerary/:dayId', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId, dayId } = req.params;
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can edit the itinerary.' } });
    }

    const day = await prisma.tripItineraryDay.findUnique({ where: { id: dayId } });
    if (!day || day.tripId !== tripId) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'That itinerary day is gone.' } });
    }

    // Deleting Day 2 of 4 must not leave 1, 3, 4 — the remaining days are
    // renumbered so "Day N" keeps meaning the Nth day of the trip. Done in
    // one transaction, descending, so the unique (tripId, day) index never
    // sees a collision mid-shift.
    const later = await prisma.tripItineraryDay.findMany({
      where: { tripId, day: { gt: day.day } },
      orderBy: { day: 'asc' },
      select: { id: true, day: true },
    });
    await prisma.$transaction([
      prisma.tripItineraryDay.delete({ where: { id: day.id } }),
      ...later.map((d) => prisma.tripItineraryDay.update({ where: { id: d.id }, data: { day: d.day - 1 } })),
    ]);

    return res.status(200).json({ ok: true, data: { id: day.id } });
  } catch (err) {
    logger.error('[Trips] Delete itinerary day error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to delete the day' } });
  }
});

router.patch('/:tripId/itinerary/:dayId', async (req, res) => {
  const userId = requireUserId(req);
  const { tripId, dayId } = req.params;
  const parsed = createItineraryDaySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Invalid itinerary update data.' },
    });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { creatorId: true } });
    if (!trip) {
      return res.status(404).json({ ok: false, error: { code: 'TRIP_NOT_FOUND', message: 'Trip not found' } });
    }
    if (trip.creatorId !== userId) {
      return res
        .status(403)
        .json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the trip organizer can edit the itinerary.' } });
    }

    const day = await prisma.tripItineraryDay.findUnique({ where: { id: dayId } });
    if (!day || day.tripId !== tripId) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'That itinerary day is gone.' } });
    }

    const updated = await prisma.tripItineraryDay.update({
      where: { id: dayId },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.plan !== undefined ? { plan: parsed.data.plan } : {}),
      },
      select: { id: true, day: true, title: true, plan: true },
    });

    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    logger.error('[Trips] Update itinerary day error:', err);
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Failed to update the day' } });
  }
});

// ─── Shared trip expenses / budget tracker (docs/REMEDIATION.md §8.12) ───
// Every route here requires the caller to be a participant of the trip
// (its creator or a confirmed TripMember). The equal split is computed
// from the current participant set at read time and never stored.

type TripParticipant = { userId: string; name: string; avatar: string | null; isOrganizer: boolean };

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
    u.profile?.avatarUrl ?? null;

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
    return res.status(400).json({
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
      return res.status(403).json({
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
