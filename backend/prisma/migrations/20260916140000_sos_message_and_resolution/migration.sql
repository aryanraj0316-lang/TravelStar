-- What the person in distress said was wrong, and what they said when
-- standing the alert down. Both were accepted by the API but had nowhere
-- to live, so neither survived past the live socket broadcast.
ALTER TABLE "SOSAlert" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "SOSAlert" ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT;
ALTER TABLE "SOSAlert" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
