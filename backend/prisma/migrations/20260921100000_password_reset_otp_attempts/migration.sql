-- Wrong-code attempts against a password-reset code, so a 6-digit code
-- is invalidated after a few misses instead of staying guessable.
ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
