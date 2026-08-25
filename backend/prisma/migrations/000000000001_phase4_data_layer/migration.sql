-- Phase 4: money -> Decimal, free-form strings -> enums, missing indexes,
-- referential integrity, and misc schema fixes. See docs/REMEDIATION.md §4.
--
-- Unlike the raw output of `prisma migrate diff`, every enum conversion
-- below uses `ALTER COLUMN ... TYPE ... USING (col::text::"Enum")` instead
-- of DROP+ADD COLUMN, and every new NOT NULL `updatedAt` column gets an
-- explicit DEFAULT — the raw diff did neither, which would have silently
-- discarded existing Alert/MonsoonAdvisory data and failed outright against
-- the non-empty Destination/GuidePackage/GuideProfile tables.

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('NONE', 'IMAGE', 'VOICE');
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING', 'ADVISORY');
CREATE TYPE "AlertCategory" AS ENUM ('FLOOD & RAIN', 'LANDSLIDE', 'CLOUDBURST', 'TRAFFIC RUSH');
CREATE TYPE "MonsoonSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "NotificationType" AS ENUM ('TRIP', 'HAZARD', 'SEASONAL');
CREATE TYPE "NotificationCategory" AS ENUM ('JOIN_ACCEPTED', 'CHAT_ADDED');
CREATE TYPE "MapPinType" AS ENUM ('GUIDE', 'GROUP', 'TOURIST', 'ATTRACTION');
CREATE TYPE "SOSAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');
CREATE TYPE "TripMemberRole" AS ENUM ('MEMBER', 'ORGANIZER', 'CO_LEAD');
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');

-- Alert: convert in place, preserving the 6 existing rows.
ALTER TABLE "Alert" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Alert" ALTER COLUMN "severity" TYPE "AlertSeverity" USING ("severity"::text::"AlertSeverity");
ALTER TABLE "Alert" ALTER COLUMN "category" TYPE "AlertCategory" USING ("category"::text::"AlertCategory");

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "Blog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "targetId" DROP NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Group" ALTER COLUMN "joiningFee" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "GroupComment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GroupPost" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GuidePackage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "hourlyRate" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "dailyRate" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "JoinRequest" ALTER COLUMN "adjustedPrice" SET DATA TYPE DECIMAL(12,2);

-- MapPin: no existing rows, but converted via USING for consistency/safety.
ALTER TABLE "MapPin" ALTER COLUMN "type" TYPE "MapPinType" USING ("type"::text::"MapPinType");

-- Message: nullable, no existing rows.
ALTER TABLE "Message" ALTER COLUMN "mediaType" TYPE "MediaType" USING ("mediaType"::text::"MediaType");

-- MonsoonAdvisory: preserves the existing HIGH/MEDIUM rows.
ALTER TABLE "MonsoonAdvisory" ALTER COLUMN "severity" TYPE "MonsoonSeverity" USING ("severity"::text::"MonsoonSeverity");

-- Notification: no existing rows.
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
ALTER TABLE "Notification" ALTER COLUMN "category" TYPE "NotificationCategory" USING ("category"::text::"NotificationCategory");

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- SOSAlert: rebuild the default through the type change so future inserts
-- still default to ACTIVE.
ALTER TABLE "SOSAlert" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SOSAlert" ALTER COLUMN "status" TYPE "SOSAlertStatus" USING ("status"::text::"SOSAlertStatus");
ALTER TABLE "SOSAlert" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "budget" SET DATA TYPE DECIMAL(12,2);

-- TripMember: same default-preserving dance as SOSAlert.status.
ALTER TABLE "TripMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TripMember" ALTER COLUMN "role" TYPE "TripMemberRole" USING ("role"::text::"TripMemberRole");
ALTER TABLE "TripMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "Alert_active_idx" ON "Alert"("active");
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_guideProfileId_idx" ON "Booking"("guideProfileId");
CREATE INDEX "Booking_bookingDate_idx" ON "Booking"("bookingDate");
CREATE INDEX "ChatRoomMember_userId_idx" ON "ChatRoomMember"("userId");
CREATE INDEX "Comment_blogId_idx" ON "Comment"("blogId");
CREATE INDEX "Destination_rank_idx" ON "Destination"("rank");
CREATE INDEX "EmergencyContact_userId_idx" ON "EmergencyContact"("userId");
CREATE INDEX "Expense_groupId_idx" ON "Expense"("groupId");
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");
CREATE INDEX "GroupComment_postId_idx" ON "GroupComment"("postId");
CREATE INDEX "GroupPost_groupId_idx" ON "GroupPost"("groupId");
CREATE INDEX "GuidePackage_guideProfileId_idx" ON "GuidePackage"("guideProfileId");
CREATE INDEX "GuideReel_guideProfileId_idx" ON "GuideReel"("guideProfileId");
CREATE INDEX "JoinRequest_tripId_idx" ON "JoinRequest"("tripId");
CREATE INDEX "JoinRequest_status_idx" ON "JoinRequest"("status");
CREATE INDEX "LiveLocation_userId_idx" ON "LiveLocation"("userId");
CREATE INDEX "Message_chatRoomId_createdAt_idx" ON "Message"("chatRoomId", "createdAt");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_unread_idx" ON "Notification"("unread");
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");
CREATE INDEX "Review_guideProfileId_idx" ON "Review"("guideProfileId");
CREATE INDEX "SOSAlert_userId_idx" ON "SOSAlert"("userId");
CREATE INDEX "SOSAlert_status_idx" ON "SOSAlert"("status");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Trip_creatorId_idx" ON "Trip"("creatorId");
CREATE INDEX "Trip_createdAt_idx" ON "Trip"("createdAt");
CREATE INDEX "TripLike_tripId_idx" ON "TripLike"("tripId");
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripLike" ADD CONSTRAINT "TripLike_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripLike" ADD CONSTRAINT "TripLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data-layer safety net for the seat-race bug (docs/REMEDIATION.md §4.7 /
-- §5.4): the full transactional fix with TripMember creation and a
-- concurrency test is Phase 5's job, but this constraint means the worst
-- case — oversold seats going negative — is impossible at the DB level
-- regardless of what the application code does in the meantime.
ALTER TABLE "Trip" ADD CONSTRAINT "trip_available_seats_non_negative" CHECK ("availableSeats" >= 0);
