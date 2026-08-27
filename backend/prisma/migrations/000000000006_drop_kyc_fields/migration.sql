-- Remove all identity/KYC document storage (docs/REMEDIATION.md §12.1).
-- v1 does not do identity verification: storing raw Aadhaar numbers or
-- ID/face images is not permitted for a private entity without a licensed
-- KYC provider and field-level encryption. If verification is added later
-- it must use a provider that returns only pass/fail + a reference.
-- GuideProfile.licensePhotoUrl becomes optional for the same reason — an
-- admin verifies the licence number out-of-band.

ALTER TABLE "Profile"
  DROP COLUMN IF EXISTS "aadhaarNumber",
  DROP COLUMN IF EXISTS "aadhaarPhotoUrl",
  DROP COLUMN IF EXISTS "govIdType",
  DROP COLUMN IF EXISTS "govIdPhotoUrl",
  DROP COLUMN IF EXISTS "faceVerificationImg",
  DROP COLUMN IF EXISTS "selfieVerification";

ALTER TABLE "GuideProfile" ALTER COLUMN "licensePhotoUrl" DROP NOT NULL;
