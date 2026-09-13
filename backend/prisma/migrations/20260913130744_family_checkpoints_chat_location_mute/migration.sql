-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'LOCATION';

-- AlterTable
ALTER TABLE "ChatRoomMember" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "JoinRequest" ADD COLUMN     "familyMemberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fromStopId" TEXT,
ADD COLUMN     "joiningDate" TIMESTAMP(3),
ADD COLUMN     "partySize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "toStopId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "partySize" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TripTimelineStopGuide" (
    "id" TEXT NOT NULL,
    "tripTimelineStopId" TEXT NOT NULL,
    "guideProfileId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripTimelineStopGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripTimelineStopGuide_guideProfileId_idx" ON "TripTimelineStopGuide"("guideProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TripTimelineStopGuide_tripTimelineStopId_guideProfileId_key" ON "TripTimelineStopGuide"("tripTimelineStopId", "guideProfileId");

-- CreateIndex
CREATE INDEX "JoinRequest_fromStopId_idx" ON "JoinRequest"("fromStopId");

-- CreateIndex
CREATE INDEX "JoinRequest_toStopId_idx" ON "JoinRequest"("toStopId");

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_fromStopId_fkey" FOREIGN KEY ("fromStopId") REFERENCES "TripTimelineStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_toStopId_fkey" FOREIGN KEY ("toStopId") REFERENCES "TripTimelineStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripTimelineStopGuide" ADD CONSTRAINT "TripTimelineStopGuide_tripTimelineStopId_fkey" FOREIGN KEY ("tripTimelineStopId") REFERENCES "TripTimelineStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripTimelineStopGuide" ADD CONSTRAINT "TripTimelineStopGuide_guideProfileId_fkey" FOREIGN KEY ("guideProfileId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

