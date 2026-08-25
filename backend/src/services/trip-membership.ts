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
  | { ok: false; reason: 'TRIP_FULL' };

interface ClaimSeatOptions {
  /** Update this specific pending request instead of creating/finding one by (tripId, userId). */
  existingJoinRequestId?: string;
  fromCity?: string | null;
  toCity?: string | null;
  adjustedPrice?: number | null;
}

class SeatUnavailableError extends Error {}

export async function claimSeatAndJoin(
  tripId: string,
  userId: string,
  opts: ClaimSeatOptions = {}
): Promise<ClaimSeatResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { id: true, name: true, creatorId: true } });
      if (!trip) {
        return { ok: false as const, reason: 'TRIP_NOT_FOUND' as const };
      }

      const existingMember = await tx.tripMember.findUnique({
        where: { tripId_userId: { tripId, userId } },
      });

      if (existingMember) {
        // Idempotent: calling this twice (e.g. a retried request) must not
        // consume a second seat.
        const existingRequest = await tx.joinRequest.findUnique({
          where: { tripId_userId: { tripId, userId } },
        });
        const chatRoom = await tx.chatRoom.findUnique({ where: { tripId }, select: { id: true } });
        return {
          ok: true as const,
          alreadyMember: true as const,
          tripMemberId: existingMember.id,
          joinRequestId: existingRequest?.id ?? '',
          chatRoomId: chatRoom?.id ?? null,
        };
      }

      // Conditional decrement: only matches (and only decrements) a row that
      // currently has a seat free. `count === 0` means either the trip has no
      // seats left right now, or another concurrent transaction is holding
      // the row lock and will resolve first — either way, this transaction
      // has nothing to do but report the trip full.
      const decremented = await tx.trip.updateMany({
        where: { id: tripId, availableSeats: { gt: 0 } },
        data: { availableSeats: { decrement: 1 } },
      });
      if (decremented.count === 0) {
        throw new SeatUnavailableError();
      }

      const tripMember = await tx.tripMember.create({
        data: { tripId, userId, role: 'MEMBER' },
      });

      const joinRequest = opts.existingJoinRequestId
        ? await tx.joinRequest.update({
            where: { id: opts.existingJoinRequestId },
            data: { status: 'APPROVED' },
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
          });

      let chatRoom = await tx.chatRoom.findUnique({ where: { tripId } });
      if (!chatRoom) {
        chatRoom = await tx.chatRoom.create({
          data: { isGroup: true, name: trip.name, tripId },
        });
        await tx.chatRoomMember.create({
          data: { chatRoomId: chatRoom.id, userId: trip.creatorId },
        });
      }
      await tx.chatRoomMember.upsert({
        where: { chatRoomId_userId: { chatRoomId: chatRoom.id, userId } },
        create: { chatRoomId: chatRoom.id, userId },
        update: {},
      });

      return {
        ok: true as const,
        alreadyMember: false as const,
        tripMemberId: tripMember.id,
        joinRequestId: joinRequest.id,
        chatRoomId: chatRoom.id,
      };
    });

    return result;
  } catch (e) {
    if (e instanceof SeatUnavailableError) {
      return { ok: false, reason: 'TRIP_FULL' };
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
