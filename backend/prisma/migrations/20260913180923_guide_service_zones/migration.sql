-- CreateTable
CREATE TABLE "GuideServiceZone" (
    "id" TEXT NOT NULL,
    "guideProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusKm" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideServiceZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideServiceZone_guideProfileId_idx" ON "GuideServiceZone"("guideProfileId");

-- CreateIndex
CREATE INDEX "GuideServiceZone_latitude_longitude_idx" ON "GuideServiceZone"("latitude", "longitude");

-- AddForeignKey
ALTER TABLE "GuideServiceZone" ADD CONSTRAINT "GuideServiceZone_guideProfileId_fkey" FOREIGN KEY ("guideProfileId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

