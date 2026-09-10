-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "GuideProfile" ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "rating" DROP DEFAULT;

-- CreateTable
CREATE TABLE "GuideQuote" (
    "id" TEXT NOT NULL,
    "guideProfileId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "message" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideQuote_tripId_idx" ON "GuideQuote"("tripId");

-- CreateIndex
CREATE INDEX "GuideQuote_guideProfileId_idx" ON "GuideQuote"("guideProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideQuote_guideProfileId_tripId_key" ON "GuideQuote"("guideProfileId", "tripId");

-- AddForeignKey
ALTER TABLE "GuideQuote" ADD CONSTRAINT "GuideQuote_guideProfileId_fkey" FOREIGN KEY ("guideProfileId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideQuote" ADD CONSTRAINT "GuideQuote_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing rating predates any review-writing surface, so each one is
-- the old 5.0 column default rather than something a traveller gave.
UPDATE "GuideProfile" g SET "rating" = NULL
WHERE NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."guideProfileId" = g."id");
