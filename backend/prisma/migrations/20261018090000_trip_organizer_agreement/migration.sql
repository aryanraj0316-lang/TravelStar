-- Organizer code-of-conduct agreement, one per trip. Additive only, and
-- guarded so it is safe to re-run (applied automatically on server boot).
CREATE TABLE IF NOT EXISTS "TripOrganizerAgreement" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsSnapshot" JSONB NOT NULL,
    "acceptedLanguage" TEXT,
    "organizerDrives" BOOLEAN NOT NULL DEFAULT false,
    "drivingLicenceNumber" TEXT,
    "vehicleRegistrationNumber" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripOrganizerAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TripOrganizerAgreement_tripId_key" ON "TripOrganizerAgreement"("tripId");
CREATE INDEX IF NOT EXISTS "TripOrganizerAgreement_organizerId_idx" ON "TripOrganizerAgreement"("organizerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TripOrganizerAgreement_tripId_fkey') THEN
    ALTER TABLE "TripOrganizerAgreement" ADD CONSTRAINT "TripOrganizerAgreement_tripId_fkey"
      FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TripOrganizerAgreement_organizerId_fkey') THEN
    ALTER TABLE "TripOrganizerAgreement" ADD CONSTRAINT "TripOrganizerAgreement_organizerId_fkey"
      FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
