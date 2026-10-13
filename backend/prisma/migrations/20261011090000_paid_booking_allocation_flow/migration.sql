-- Paid booking flow: pay -> verification token -> organizer allocation ->
-- confirmed member + group chat; tiered cancellation refunds.
--
-- JoinRequestStatus is changed IN PLACE (hand-edited from the generated
-- drop-and-recreate, which would fail casting existing rows):
--   AWAITING_PAYMENT -> PAYMENT_PENDING   (approved, unpaid requests keep their place)
--   APPROVED         -> CONFIRMED         (existing members stay members)
-- Existing CAPTURED orders keep null platformFee/organizerAmount: the 4.5%
-- split did not exist when they were paid and is not applied retroactively.
--
-- Every statement is guarded so this migration is safe to run against a
-- database in ANY state — untouched, partially applied by an earlier
-- interrupted attempt, or drifted by a past `db push`. That matters because
-- it is applied automatically when the server boots (src/lib/auto-migrate.ts)
-- and must never wedge production by failing half-way.

-- ── JoinRequestStatus ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'JoinRequestStatus' AND e.enumlabel = 'AWAITING_PAYMENT')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'JoinRequestStatus' AND e.enumlabel = 'PAYMENT_PENDING') THEN
    ALTER TYPE "JoinRequestStatus" RENAME VALUE 'AWAITING_PAYMENT' TO 'PAYMENT_PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'JoinRequestStatus' AND e.enumlabel = 'APPROVED')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'JoinRequestStatus' AND e.enumlabel = 'CONFIRMED') THEN
    ALTER TYPE "JoinRequestStatus" RENAME VALUE 'APPROVED' TO 'CONFIRMED';
  END IF;
END $$;

ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_COMPLETED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'ALLOCATION_PENDING';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- ── TripPaymentOrderStatus ───────────────────────────────────────────────
ALTER TYPE "TripPaymentOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- ── Columns ──────────────────────────────────────────────────────────────
ALTER TABLE "TripMember" ADD COLUMN IF NOT EXISTS "bookingReferenceToken" TEXT;

ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);

ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "isVerifiedByOrganizer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "organizerAmount" DECIMAL(12,2);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "platformFee" DECIMAL(12,2);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "razorpayRefundId" TEXT;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "verificationToken" TEXT;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- ── TripMemberAllocation ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TripMemberAllocation" (
    "id" TEXT NOT NULL,
    "tripMemberId" TEXT NOT NULL,
    "tripTimelineStopId" TEXT,
    "dayNumber" INTEGER NOT NULL,
    "checkpointName" TEXT NOT NULL,
    "hotelName" TEXT,
    "roomNumber" TEXT,
    "transitType" TEXT,
    "vehicleNumber" TEXT,
    "seatNumber" TEXT,
    "assemblyTime" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripMemberAllocation_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "TripMemberAllocation_tripMemberId_idx" ON "TripMemberAllocation"("tripMemberId");
CREATE INDEX IF NOT EXISTS "TripMemberAllocation_tripTimelineStopId_idx" ON "TripMemberAllocation"("tripTimelineStopId");
CREATE UNIQUE INDEX IF NOT EXISTS "TripMember_bookingReferenceToken_key" ON "TripMember"("bookingReferenceToken");
CREATE UNIQUE INDEX IF NOT EXISTS "TripPaymentOrder_verificationToken_key" ON "TripPaymentOrder"("verificationToken");

-- ── Foreign keys ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TripMemberAllocation_tripMemberId_fkey') THEN
    ALTER TABLE "TripMemberAllocation" ADD CONSTRAINT "TripMemberAllocation_tripMemberId_fkey"
      FOREIGN KEY ("tripMemberId") REFERENCES "TripMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TripMemberAllocation_tripTimelineStopId_fkey') THEN
    ALTER TABLE "TripMemberAllocation" ADD CONSTRAINT "TripMemberAllocation_tripTimelineStopId_fkey"
      FOREIGN KEY ("tripTimelineStopId") REFERENCES "TripTimelineStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
