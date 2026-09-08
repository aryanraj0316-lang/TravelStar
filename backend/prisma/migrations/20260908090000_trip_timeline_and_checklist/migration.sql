-- CreateEnum
CREATE TYPE "TransitMode" AS ENUM ('CAB', 'TRAIN', 'FLIGHT', 'BUS');

-- CreateTable
CREATE TABLE "TripTimelineStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "stayDays" INTEGER NOT NULL DEFAULT 1,
    "transitTimeMinutes" INTEGER,
    "transitMode" "TransitMode",
    "activities" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripTimelineStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripChecklistItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripTimelineStop_tripId_idx" ON "TripTimelineStop"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripTimelineStop_tripId_order_key" ON "TripTimelineStop"("tripId", "order");

-- CreateIndex
CREATE INDEX "TripChecklistItem_tripId_idx" ON "TripChecklistItem"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripChecklistItem_tripId_order_key" ON "TripChecklistItem"("tripId", "order");

-- AddForeignKey
ALTER TABLE "TripTimelineStop" ADD CONSTRAINT "TripTimelineStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripChecklistItem" ADD CONSTRAINT "TripChecklistItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
