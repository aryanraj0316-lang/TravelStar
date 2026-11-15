-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "reviewOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReviewAccess" (
    "userId" TEXT NOT NULL,
    "travellerTripId" TEXT NOT NULL,
    "organizerTripId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAccess_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAction_reportId_createdAt_idx" ON "ModerationAction"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReviewAccess" ADD CONSTRAINT "ReviewAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
