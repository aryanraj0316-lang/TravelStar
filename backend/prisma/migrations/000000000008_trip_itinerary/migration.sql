-- Day-by-day trip plan (docs/REMEDIATION.md §8.6 — group-organizer.tsx's
-- "Day Schedule" tab). That tab rendered the same two hardcoded days for
-- every trip, and "Insert Itinerary Day" only pushed onto local useState,
-- so the day was gone on unmount and no trip member ever saw it. This
-- table backs the real, organiser-authored version.
-- The (tripId, day) unique constraint keeps day numbers from colliding;
-- day numbers are assigned server-side, never taken from the client.

-- CreateTable
CREATE TABLE "TripItineraryDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripItineraryDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripItineraryDay_tripId_idx" ON "TripItineraryDay"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripItineraryDay_tripId_day_key" ON "TripItineraryDay"("tripId", "day");

-- AddForeignKey
ALTER TABLE "TripItineraryDay" ADD CONSTRAINT "TripItineraryDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
