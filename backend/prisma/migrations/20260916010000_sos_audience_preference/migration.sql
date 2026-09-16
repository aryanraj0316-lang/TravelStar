-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SosAudienceMode" AS ENUM ('TRIP_GROUP', 'NEARBY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "sosAudienceMode" "SosAudienceMode" NOT NULL DEFAULT 'TRIP_GROUP';
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "sosRadiusKm" INTEGER NOT NULL DEFAULT 5;
