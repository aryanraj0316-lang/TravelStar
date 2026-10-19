-- Who each SOS was sent to, saved when it is raised, so the Home/Chat
-- banner and the all-clear reach only that audience. Additive only, and
-- guarded so it is safe to re-run (applied automatically on server boot).
ALTER TABLE "SOSAlert" ADD COLUMN IF NOT EXISTS "audienceUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
