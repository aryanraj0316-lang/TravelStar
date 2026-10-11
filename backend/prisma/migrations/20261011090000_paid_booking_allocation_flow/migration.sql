-- Paid booking flow: pay -> verification token -> organizer allocation ->
-- confirmed member + group chat; tiered cancellation refunds.
--
-- JoinRequestStatus is changed IN PLACE (hand-edited from the generated
-- drop-and-recreate, which would fail casting existing rows):
--   AWAITING_PAYMENT -> PAYMENT_PENDING   (approved, unpaid requests keep their place)
--   APPROVED         -> CONFIRMED         (existing members stay members)
-- Existing CAPTURED orders keep null platformFee/organizerAmount: the 4.5%
-- split did not exist when they were paid and is not applied retroactively.
ALTER TYPE "JoinRequestStatus" RENAME VALUE 'AWAITING_PAYMENT' TO 'PAYMENT_PENDING';
ALTER TYPE "JoinRequestStatus" RENAME VALUE 'APPROVED' TO 'CONFIRMED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_COMPLETED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'ALLOCATION_PENDING';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterEnum
ALTER TYPE "TripPaymentOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "bookingReferenceToken" TEXT;

-- AlterTable
ALTER TABLE "JoinRequest" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TripPaymentOrder" ADD COLUMN     "isVerifiedByOrganizer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizerAmount" DECIMAL(12,2),
ADD COLUMN     "platformFee" DECIMAL(12,2),
ADD COLUMN     "razorpayRefundId" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(12,2),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "verificationToken" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TripMemberAllocation" (
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

-- CreateIndex
CREATE INDEX "TripMemberAllocation_tripMemberId_idx" ON "TripMemberAllocation"("tripMemberId");

-- CreateIndex
CREATE INDEX "TripMemberAllocation_tripTimelineStopId_idx" ON "TripMemberAllocation"("tripTimelineStopId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_bookingReferenceToken_key" ON "TripMember"("bookingReferenceToken");

-- CreateIndex
CREATE UNIQUE INDEX "TripPaymentOrder_verificationToken_key" ON "TripPaymentOrder"("verificationToken");

-- AddForeignKey
ALTER TABLE "TripMemberAllocation" ADD CONSTRAINT "TripMemberAllocation_tripMemberId_fkey" FOREIGN KEY ("tripMemberId") REFERENCES "TripMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMemberAllocation" ADD CONSTRAINT "TripMemberAllocation_tripTimelineStopId_fkey" FOREIGN KEY ("tripTimelineStopId") REFERENCES "TripTimelineStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

