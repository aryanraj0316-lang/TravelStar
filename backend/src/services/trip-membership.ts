import type { JoinRequestStatus, Prisma } from '@prisma/client';
import prisma from './db';
import { logger } from '../lib/logger';

/**
 * The single, transactional core for "a user becomes a member of a trip,
 * consuming one seat." Every path that can turn a join request into a real
 * membership — the instant-join endpoint for PUBLIC trips, the creator's
 * manual approval of a PENDING request — goes through this, so there is
 * exactly one place the race condition (docs/REMEDIATION.md §5.4) can be
 * fixed, not two copies that can drift.
 *
 * Concurrency safety: the seat decrement is a single conditional UPDATE
 * (`availableSeats = availableSeats - 1 WHERE availableSeats > 0`), checked
 * via the row count Prisma returns from `updateMany`, all inside one
 * database transaction alongside the JoinRequest and TripMember writes.
 * Postgres takes a row lock on the Trip row for the duration of that
 * UPDATE, so concurrent callers serialize on it: the second transaction's
 * UPDATE does not even evaluate its WHERE clause until the first has
 * committed (releasing the lock) and decremented the count — there is no
 * window where two callers both read "1 seat left" and both proceed. This
 * needs no elevated isolation level; it relies on standard row locking,
 * which Postgres applies regardless of isolation level for the row being
 * written.
 */

export type ClaimSeatResult =
  | { ok: true; alreadyMember: false; tripMemberId: string; joinRequestId: string; chatRoomId: string }
  | { ok: true; alreadyMember: true; tripMemberId: string; joinRequestId: string; chatRoomId: string | null }
  | { ok: false; reason: 'TRIP_NOT_FOUND' }
  | { ok: false; reason: 'TRIP_FULL' }
  /** The database could not start the transaction in time; nothing was written. */
  | { ok: false; reason: 'BUSY' };

interface ClaimSeatOptions {
  /** Update this specific pending request instead of creating/finding one by (tripId, userId). */
  existingJoinRequestId?: string;
  fromCity?: string | null;
  toCity?: string | null;
  adjustedPrice?: number | null;
  /**
   * Seats to claim for this one join — the requester plus any family
   * members travelling under the same request (docs/plan "Nearby, Family
   * Connect, Guide-per-checkpoint, Chat & Seat fixes"). Defaults to 1 for
   * every caller that predates Family Connect party sizing.
   */
  partySize?: number;
}

class SeatUnavailableError extends Error {}

/**
 * Interactive-transaction settings for the seat claim.
 *
 * Prisma's defaults (maxWait 2s, timeout 5s) assume a local database and a
 * pool that is not contended. Neither holds here: the pool is deliberately
 * small (DATABASE_POOL_SIZE, sized against Neon's connection budget rather
 * than CPU count) and every statement is a network round-trip to a remote
 * Postgres. Concurrent joins on the same trip serialize on that trip's row
 * lock by design, so a burst queues — and with the defaults the queued
 * callers failed to *start* a transaction at all, surfacing as
 * `P2028: Unable to start a transaction in the given time` and a 500.
 *
 * That is the wrong answer to "50 people tried to join a 10-seat trip at
 * once": the ten who get a seat should get one and the other forty should be
 * told the trip is full. A 500 tells them neither, and on a retry they would
 * try again against the same contention.
 *
 * Caught by tests/seat-concurrency.test.ts, which is the §5.4 test — a
 * sequential test cannot see this at all.
 */
const SEAT_TX_OPTIONS = {
  /** How long a caller may queue for a free connection. */
  maxWait: 20_000,
  /** How long the transaction itself may hold one once started. */
  timeout: 20_000,
} as const;

/** Prisma codes meaning "could not start/finish in time", not "invalid". */
const TX_CONTENTION_CODES = new Set(['P2024', 'P2028']);

function isTransactionContention(e: unknown): boolean {
  const code = (e as { code?: string } | undefined)?.code;
  return typeof code === 'string' && TX_CONTENTION_CODES.has(code);
}

/**
 * Find-or-create the trip's chat room and make sure `userId` is in it.
 *
 * Deliberately outside the seat transaction (see claimSeatAndJoin): none of
 * this needs the Trip row lock, and holding that lock across these
 * statements is what made a contended trip time out. Every write is
 * idempotent, so running it twice, or after a partial failure, converges.
 *
 * `tripMeta` is passed by the caller that just claimed a seat (it already
 * has the trip's name and creator from the claim's RETURNING clause, so
 * there is no reason to re-read them); callers that did not claim pass null
 * and this only looks the room up.
 */
export async function ensureChatRoomMembership(
  tripId: string,
  userId: string,
  tripMeta: { name: string; creatorId: string } | null,
): Promise<string | null> {
  let chatRoom = await prisma.chatRoom.findUnique({ where: { tripId }, select: { id: true } });

  if (!chatRoom) {
    if (!tripMeta) return null;
    try {
      chatRoom = await prisma.chatRoom.create({
        data: { isGroup: true, name: tripMeta.name, tripId },
        select: { id: true },
      });
      await prisma.chatRoomMember.create({
        data: { chatRoomId: chatRoom.id, userId: tripMeta.creatorId },
      });
    } catch (e) {
      // Another concurrent joiner created the room first (tripId is unique
      // on ChatRoom). Take theirs rather than failing the join — the seat is
      // already committed and this is the recoverable half.
      chatRoom = await prisma.chatRoom.findUnique({ where: { tripId }, select: { id: true } });
      if (!chatRoom) {
        logger.error('[TripMembership] Could not create or find the chat room', { tripId, error: e });
        return null;
      }
    }
  }

  await prisma.chatRoomMember.upsert({
    where: { chatRoomId_userId: { chatRoomId: chatRoom.id, userId } },
    create: { chatRoomId: chatRoom.id, userId },
    update: {},
  });

  return chatRoom.id;
}

export async function claimSeatAndJoin(
  tripId: string,
  userId: string,
  opts: ClaimSeatOptions = {}
): Promise<ClaimSeatResult> {
  const partySize = opts.partySize && opts.partySize > 0 ? Math.floor(opts.partySize) : 1;

  // Fast path: a single cheap read, outside any transaction, to turn away
  // callers for a trip that is already full.
  //
  // This is an optimisation, never the decision — the authoritative claim is
  // still the conditional UPDATE inside the transaction below, so a trip
  // cannot be oversold by a caller that races past this check. What it buys
  // is that when fifty people hit a ten-seat trip, only the handful with a
  // plausible chance queue for one of the pool's connections; the rest get a
  // truthful "trip full" immediately instead of waiting for a transaction
  // slot in order to be told the same thing (and, before this, timing out
  // while waiting and getting a 500 — see tests/seat-concurrency.test.ts).
  //
  // The race is benign in both directions: a caller that reads a free seat
  // and finds none by the time it holds the lock gets TRIP_FULL from the
  // transaction, and a caller that reads zero while a seat is being released
  // is told to try again, which the next refresh corrects.
  const seatCheck = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { availableSeats: true },
  });
  if (!seatCheck) {
    return { ok: false, reason: 'TRIP_NOT_FOUND' };
  }
  if (seatCheck.availableSeats < partySize) {
    // An existing member must still fall through: re-joining is idempotent
    // and consumes no seat, so a full trip must not lock its own members out
    // of the path that returns their existing membership.
    const alreadyIn = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { id: true },
    });
    if (!alreadyIn) {
      return { ok: false, reason: 'TRIP_FULL' };
    }
  }

  try {
    // ── The critical section ──────────────────────────────────────────
    //
    // Everything inside this transaction runs while Postgres holds a write
    // lock on the Trip row, so concurrent joiners queue behind it. Every
    // statement here is a network round-trip to a remote Postgres, which
    // makes the *number* of statements, not just their cost, the thing that
    // decides how fast that queue drains.
    //
    // This originally ran six to eight statements under the lock, including
    // creating the chat room and its memberships. At Neon latency that held
    // the lock for roughly a second per joiner, so fifty simultaneous joins
    // needed ~50s to drain and most callers timed out waiting for a
    // transaction slot — surfacing as `P2028` and a 500 rather than either
    // a seat or an honest "trip full" (see tests/seat-concurrency.test.ts).
    //
    // Two changes fix that. The seat claim is now a single
    // `UPDATE ... RETURNING`, which does the lock, the decrement, and the
    // trip fetch in one round-trip instead of three. And the chat-room work
    // moved out of the lock, below — it is not seat-critical, it is
    // idempotent, and holding a seat lock while creating a chat room was
    // only ever incidental.
    const seatTx = await prisma.$transaction(async (tx) => {
      const existingMember = await tx.tripMember.findUnique({
        where: { tripId_userId: { tripId, userId } },
        select: { id: true },
      });

      if (existingMember) {
        // Idempotent: calling this twice (e.g. a retried request) must not
        // consume a second seat.
        const existingRequest = await tx.joinRequest.findUnique({
          where: { tripId_userId: { tripId, userId } },
          select: { id: true },
        });
        return {
          kind: 'ALREADY_MEMBER' as const,
          tripMemberId: existingMember.id,
          joinRequestId: existingRequest?.id ?? '',
        };
      }

      // Conditional decrement, by the full party size (requester + any
      // family members on the same request). The WHERE clause is what makes
      // this safe: only a row with enough seats left for the whole party is
      // matched, so two concurrent callers cannot both succeed, and a party
      // of 4 can never leave the count negative. An empty result means
      // either the trip lacks that many seats or it does not exist —
      // distinguished below.
      const claimed = await tx.$queryRaw<{ id: string; name: string; creatorId: string }[]>`
        UPDATE "Trip"
           SET "availableSeats" = "availableSeats" - ${partySize}
         WHERE "id" = ${tripId}
           AND "availableSeats" >= ${partySize}
        RETURNING "id", "name", "creatorId"
      `;

      const trip = claimed[0];
      if (!trip) {
        const exists = await tx.trip.findUnique({ where: { id: tripId }, select: { id: true } });
        if (!exists) return { kind: 'TRIP_NOT_FOUND' as const };
        throw new SeatUnavailableError();
      }

      const tripMember = await tx.tripMember.create({
        data: { tripId, userId, role: 'MEMBER', partySize },
        select: { id: true },
      });

      const joinRequest = opts.existingJoinRequestId
        ? await tx.joinRequest.update({
            where: { id: opts.existingJoinRequestId },
            data: { status: 'CONFIRMED' },
            select: { id: true },
          })
        : await tx.joinRequest.upsert({
            where: { tripId_userId: { tripId, userId } },
            create: {
              tripId,
              userId,
              status: 'CONFIRMED',
              fromCity: opts.fromCity ?? null,
              toCity: opts.toCity ?? null,
              adjustedPrice: opts.adjustedPrice ?? null,
              partySize,
            },
            update: { status: 'CONFIRMED', partySize },
            select: { id: true },
          });

      return {
        kind: 'CLAIMED' as const,
        tripMemberId: tripMember.id,
        joinRequestId: joinRequest.id,
        tripName: trip.name,
        creatorId: trip.creatorId,
      };
    }, SEAT_TX_OPTIONS);

    if (seatTx.kind === 'TRIP_NOT_FOUND') {
      return { ok: false, reason: 'TRIP_NOT_FOUND' };
    }

    // ── Outside the lock ──────────────────────────────────────────────
    //
    // The seat is already committed at this point. Chat-room membership is
    // idempotent (every write here is a find-or-create or an upsert), so a
    // crash between the two leaves a member who is on the trip but not yet
    // in its chat room — a state the next join, or a repair, resolves.
    // The alternative, holding the seat lock across these statements, is
    // what made a busy trip return 500s.
    const chatRoomId = await ensureChatRoomMembership(
      tripId,
      userId,
      seatTx.kind === 'CLAIMED' ? { name: seatTx.tripName, creatorId: seatTx.creatorId } : null,
    );

    if (seatTx.kind === 'ALREADY_MEMBER') {
      return {
        ok: true,
        alreadyMember: true,
        tripMemberId: seatTx.tripMemberId,
        joinRequestId: seatTx.joinRequestId,
        chatRoomId,
      };
    }

    return {
      ok: true,
      alreadyMember: false,
      tripMemberId: seatTx.tripMemberId,
      joinRequestId: seatTx.joinRequestId,
      chatRoomId: chatRoomId ?? '',
    };
  } catch (e) {
    if (e instanceof SeatUnavailableError) {
      return { ok: false, reason: 'TRIP_FULL' };
    }
    if (isTransactionContention(e)) {
      // The database was too busy to start this transaction. Nothing was
      // written, so this is safe to retry — and it is a distinct condition
      // from "the trip is full", which is why it gets its own reason rather
      // than being folded into TRIP_FULL (which would tell a user a trip was
      // sold out when it was not).
      logger.warn('[TripMembership] Seat claim contended', {
        code: (e as { code?: string }).code,
        tripId,
      });
      return { ok: false, reason: 'BUSY' };
    }
    throw e;
  }
}

// ── Paid-booking primitives ────────────────────────────────────────────────
//
// The paid flow splits "a seat is taken" from "a member is admitted":
//   1. Payment captured  → holdSeatsForRequest: seats leave availableSeats and
//      the request becomes PAYMENT_COMPLETED. Nobody can pay for a seat that
//      does not exist, but the traveller is NOT a member yet.
//   2. Organizer verifies the token and submits allocations →
//      admitAllocatedMember: TripMember + allocations + CONFIRMED, then the
//      group chat. No seat moves here — it was already held.
// Free trips do the same, with step 1 triggered by the organizer's approval
// (→ ALLOCATION_PENDING) instead of a payment.

/** Statuses in which a request's partySize is counted against availableSeats. */
export const SEAT_HOLDING_STATUSES: JoinRequestStatus[] = ['PAYMENT_COMPLETED', 'ALLOCATION_PENDING', 'CONFIRMED'];

export type HoldSeatsResult =
  | { ok: true }
  | { ok: false; reason: 'INVALID_STATUS' | 'TRIP_FULL' | 'BUSY' };

/**
 * Atomically moves a join request from one of `fromStatuses` to `toStatus`
 * and takes its partySize out of the trip's availableSeats — both or
 * neither. `extra` runs inside the same transaction (e.g. marking the
 * payment order captured and issuing its token), so a payment can never be
 * recorded against a seat that was not actually held.
 *
 * The status change is a conditional updateMany, so two concurrent captures
 * of the same payment (verify endpoint + webhook) cannot both hold seats:
 * the second matches zero rows and gets INVALID_STATUS.
 */
export async function holdSeatsForRequest(
  joinRequestId: string,
  opts: {
    fromStatuses: JoinRequestStatus[];
    toStatus: 'PAYMENT_COMPLETED' | 'ALLOCATION_PENDING';
    extra?: (tx: Prisma.TransactionClient) => Promise<void>;
  },
): Promise<HoldSeatsResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.joinRequest.findUnique({
        where: { id: joinRequestId },
        select: { tripId: true, partySize: true },
      });
      if (!request) return { ok: false as const, reason: 'INVALID_STATUS' as const };

      const moved = await tx.joinRequest.updateMany({
        where: { id: joinRequestId, status: { in: opts.fromStatuses } },
        data: { status: opts.toStatus },
      });
      if (moved.count === 0) return { ok: false as const, reason: 'INVALID_STATUS' as const };

      const partySize = Math.max(1, request.partySize);
      const claimed = await tx.$executeRaw`
        UPDATE "Trip"
           SET "availableSeats" = "availableSeats" - ${partySize}
         WHERE "id" = ${request.tripId}
           AND "availableSeats" >= ${partySize}
      `;
      // Throwing rolls back the status change above with it.
      if (claimed === 0) throw new SeatUnavailableError();

      if (opts.extra) await opts.extra(tx);
      return { ok: true as const };
    }, SEAT_TX_OPTIONS);
  } catch (e) {
    if (e instanceof SeatUnavailableError) return { ok: false, reason: 'TRIP_FULL' };
    if (isTransactionContention(e)) return { ok: false, reason: 'BUSY' };
    throw e;
  }
}

export type AllocationInput = {
  tripTimelineStopId?: string | null;
  dayNumber: number;
  checkpointName: string;
  hotelName?: string | null;
  roomNumber?: string | null;
  transitType?: string | null;
  vehicleNumber?: string | null;
  seatNumber?: string | null;
  assemblyTime?: string | null;
  notes?: string | null;
};

export type AdmitResult =
  | { ok: true; tripMemberId: string; chatRoomId: string | null }
  | { ok: false; reason: 'INVALID_STATUS' | 'ALREADY_MEMBER' };

/**
 * Turns a seat-holding, organizer-verified request into a confirmed member:
 * TripMember row (with the booking token), every per-stop allocation, the
 * request marked CONFIRMED and the payment order marked verified — in one
 * transaction. Group chat membership follows outside it (idempotent, and
 * not seat-critical — see claimSeatAndJoin).
 */
export async function admitAllocatedMember(opts: {
  joinRequestId: string;
  bookingReferenceToken: string | null;
  allocations: AllocationInput[];
}): Promise<AdmitResult> {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.joinRequest.findUnique({
      where: { id: opts.joinRequestId },
      select: { tripId: true, userId: true, partySize: true, trip: { select: { name: true, creatorId: true } } },
    });
    if (!request) return { ok: false as const, reason: 'INVALID_STATUS' as const };

    const existing = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId: request.tripId, userId: request.userId } },
      select: { id: true },
    });
    if (existing) return { ok: false as const, reason: 'ALREADY_MEMBER' as const };

    const moved = await tx.joinRequest.updateMany({
      where: { id: opts.joinRequestId, status: { in: ['PAYMENT_COMPLETED', 'ALLOCATION_PENDING'] } },
      data: { status: 'CONFIRMED' },
    });
    if (moved.count === 0) return { ok: false as const, reason: 'INVALID_STATUS' as const };

    // The roster's single room/seat columns predate per-stop allocations;
    // they get the first stop's values so the existing roster view keeps
    // showing something true.
    const first = opts.allocations[0];
    const member = await tx.tripMember.create({
      data: {
        tripId: request.tripId,
        userId: request.userId,
        role: 'MEMBER',
        partySize: Math.max(1, request.partySize),
        bookingReferenceToken: opts.bookingReferenceToken,
        roomAllocated: first?.roomNumber ?? null,
        seatAllocated: first?.seatNumber ?? null,
      },
      select: { id: true },
    });

    await tx.tripMemberAllocation.createMany({
      data: opts.allocations.map((a) => ({
        tripMemberId: member.id,
        tripTimelineStopId: a.tripTimelineStopId ?? null,
        dayNumber: a.dayNumber,
        checkpointName: a.checkpointName,
        hotelName: a.hotelName ?? null,
        roomNumber: a.roomNumber ?? null,
        transitType: a.transitType ?? null,
        vehicleNumber: a.vehicleNumber ?? null,
        seatNumber: a.seatNumber ?? null,
        assemblyTime: a.assemblyTime ?? null,
        notes: a.notes ?? null,
      })),
    });

    await tx.tripPaymentOrder.updateMany({
      where: { joinRequestId: opts.joinRequestId },
      data: { isVerifiedByOrganizer: true, verifiedAt: new Date() },
    });

    return {
      ok: true as const,
      tripMemberId: member.id,
      tripId: request.tripId,
      userId: request.userId,
      tripMeta: request.trip,
    };
  }, SEAT_TX_OPTIONS);

  if (!result.ok) return result;

  const chatRoomId = await ensureChatRoomMembership(result.tripId, result.userId, result.tripMeta);
  return { ok: true, tripMemberId: result.tripMemberId, chatRoomId };
}

export type ReleaseSeatResult =
  | { ok: true; released: boolean }
  | { ok: false; reason: 'JOIN_REQUEST_NOT_FOUND' };

/**
 * Undoes a request: sets `targetStatus` (or deletes the row when null) and,
 * if it was holding seats, returns them and removes the TripMember row (its
 * allocations cascade with it) and the group-chat membership.
 *
 * Race-safe: the status change is conditional on the status that was read,
 * so two concurrent releases of the same request cannot both return its
 * seats — the loser matches zero rows and does nothing.
 */
export async function releaseSeatAndLeave(
  joinRequestId: string,
  targetStatus: JoinRequestStatus | null,
): Promise<ReleaseSeatResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.joinRequest.findUnique({ where: { id: joinRequestId } });
    if (!request) {
      return { ok: false as const, reason: 'JOIN_REQUEST_NOT_FOUND' as const };
    }

    const wasHolding = SEAT_HOLDING_STATUSES.includes(request.status);

    const changed = targetStatus
      ? await tx.joinRequest.updateMany({
          where: { id: joinRequestId, status: request.status },
          data: { status: targetStatus },
        })
      : await tx.joinRequest.deleteMany({ where: { id: joinRequestId, status: request.status } });
    if (changed.count === 0) return { ok: true as const, released: false };

    if (!wasHolding) {
      // Never held a seat (PENDING / PAYMENT_PENDING) — nothing to release.
      return { ok: true as const, released: false };
    }

    const member = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId: request.tripId, userId: request.userId } },
    });
    if (member) {
      // TripMemberAllocation rows cascade with the member.
      await tx.tripMember.delete({ where: { id: member.id } });
    }

    const chatRoom = await tx.chatRoom.findUnique({ where: { tripId: request.tripId } });
    if (chatRoom) {
      await tx.chatRoomMember.deleteMany({
        where: { chatRoomId: chatRoom.id, userId: request.userId },
      });
    }

    // Returned by the request's own stored partySize — a family of 4 that
    // leaves returns all 4 seats.
    const releasedSeats = member?.partySize ?? request.partySize;
    await tx.trip.update({
      where: { id: request.tripId },
      data: { availableSeats: { increment: releasedSeats } },
    });

    logger.log(`[trip-membership] Released ${releasedSeats} seat(s) for user ${request.userId} on trip ${request.tripId}`);
    return { ok: true as const, released: true };
  });
}
