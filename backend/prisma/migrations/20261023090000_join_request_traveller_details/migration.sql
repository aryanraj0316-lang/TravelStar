-- The traveller details form filled in before payment (one entry per seat),
-- sent to the organizer with the payment instead of the booker's profile.
-- Additive only, and guarded so it is safe to re-run (applied on server boot).
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "travellerDetails" JSONB;
