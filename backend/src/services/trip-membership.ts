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
async function ensureChatRoomMembership(
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
  if (seatCheck.availableSeats <= 0) {
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

      // Conditional decrement. The WHERE clause is what makes this safe:
      // only a row that still has a seat is matched, so two concurrent
      // callers cannot both succeed. An empty result means either the trip
      // is full or it does not exist — distinguished below.
      const claimed = await tx.$queryRaw<{ id: string; name: string; creatorId: string }[]>`
        UPDATE "Trip"
           SET "availableSeats" = "availableSeats" - 1
         WHERE "id" = ${tripId}
           AND "availableSeats" > 0
        RETURNING "id", "name", "creatorId"
      `;

      const trip = claimed[0];
      if (!trip) {
        const exists = await tx.trip.findUnique({ where: { id: tripId }, select: { id: true } });
        if (!exists) return { kind: 'TRIP_NOT_FOUND' as const };
        throw new SeatUnavailableError();
      }

      const tripMember = await tx.tripMember.create({
        data: { tripId, userId, role: 'MEMBER' },
        select: { id: true },
      });

      const joinRequest = opts.existingJoinRequestId
        ? await tx.joinRequest.update({
            where: { id: opts.existingJoinRequestId },
            data: { status: 'APPROVED' },
            select: { id: true },
          })
        : await tx.joinRequest.upsert({
            where: { tripId_userId: { tripId, userId } },
            create: {
              tripId,
              userId,
              status: 'APPROVED',
              fromCity: opts.fromCity ?? null,
              toCity: opts.toCity ?? null,
              adjustedPrice: opts.adjustedPrice ?? null,
            },
            update: { status: 'APPROVED' },
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

export type ReleaseSeatResult =
  | { ok: true; released: boolean }
  | { ok: false; reason: 'JOIN_REQUEST_NOT_FOUND' };

/**
 * Undoes a previously-claimed seat: restores availableSeats, removes the
 * TripMember row and their chat-room membership. Used when an approved
 * request is rejected after the fact, or withdrawn by the member. Idempotent
 * — calling this on a request that was never approved (still PENDING, no
 * seat was ever consumed) just updates the status with no seat/member
 * changes, since there is nothing to release.
 */
export async function releaseSeatAndLeave(
  joinRequestId: string,
  targetStatus: 'REJECTED' | null
): Promise<ReleaseSeatResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.joinRequest.findUnique({ where: { id: joinRequestId } });
    if (!request) {
      return { ok: false as const, reason: 'JOIN_REQUEST_NOT_FOUND' as const };
    }

    const wasApproved = request.status === 'APPROVED';

    if (targetStatus) {
      await tx.joinRequest.update({ where: { id: joinRequestId }, data: { status: targetStatus } });
    } else {
      await tx.joinRequest.delete({ where: { id: joinRequestId } });
    }

    if (!wasApproved) {
      // Never consumed a seat (still PENDING) — nothing to release.
      return { ok: true as const, released: false };
    }

    const member = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId: request.tripId, userId: request.userId } },
    });
    if (member) {
      await tx.tripMember.delete({ where: { id: member.id } });
    }

    const chatRoom = await tx.chatRoom.findUnique({ where: { tripId: request.tripId } });
    if (chatRoom) {
      await tx.chatRoomMember.deleteMany({
        where: { chatRoomId: chatRoom.id, userId: request.userId },
      });
    }

    // Seat count only ever increases back toward totalSeats here, and only
    // for a trip that unambiguously had this member counted against it, so
    // this cannot push availableSeats past totalSeats in normal operation.
    await tx.trip.update({
      where: { id: request.tripId },
      data: { availableSeats: { increment: 1 } },
    });

    logger.log(`[trip-membership] Released seat for user ${request.userId} on trip ${request.tripId}`);
    return { ok: true as const, released: true };
  });
}
