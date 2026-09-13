-- CreateEnum
CREATE TYPE "BookingScope" AS ENUM ('WHOLE_TRIP', 'CHECKPOINT', 'CUSTOM_DATES');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "scope" "BookingScope",
ADD COLUMN     "tripTimelineStopId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tripTimelineStopId_fkey" FOREIGN KEY ("tripTimelineStopId") REFERENCES "TripTimelineStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

