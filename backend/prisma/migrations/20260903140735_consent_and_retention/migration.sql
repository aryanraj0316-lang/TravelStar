-- Explicit, granular, timestamped consent capture (docs/REMEDIATION.md
-- §12.3). Append-only: a grant or revoke is a new row, never an update, so
-- the row history is itself the audit trail a DPDP/GDPR-style request
-- needs. No KYC category — identity verification was removed outright in
-- §12.1, so there is nothing to consent to there.

-- CreateEnum
CREATE TYPE "ConsentCategory" AS ENUM ('LOCATION', 'CAMERA', 'PHOTOS', 'NOTIFICATIONS');

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ConsentCategory" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_category_createdAt_idx" ON "ConsentRecord"("userId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
