-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Trip_latitude_longitude_idx" ON "Trip"("latitude", "longitude");

