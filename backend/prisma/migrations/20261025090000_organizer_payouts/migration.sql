-- Organizer payouts via Razorpay Route, refund status tracking.
-- Additive only, and guarded so it is safe to re-run (applied on server boot).
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "refundStatus" TEXT;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "payoutStatus" TEXT;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "payoutAmount" DECIMAL(12,2);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "razorpayTransferId" TEXT;
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "payoutHoldUntil" TIMESTAMP(3);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "payoutReversedAmount" DECIMAL(12,2);
ALTER TABLE "TripPaymentOrder" ADD COLUMN IF NOT EXISTS "payoutError" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TripPaymentOrder_razorpayTransferId_key" ON "TripPaymentOrder"("razorpayTransferId");
CREATE INDEX IF NOT EXISTS "TripPaymentOrder_payoutStatus_idx" ON "TripPaymentOrder"("payoutStatus");

CREATE TABLE IF NOT EXISTS "OrganizerPayoutAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "razorpayAccountId" TEXT NOT NULL,
    "razorpayProductId" TEXT,
    "legalName" TEXT NOT NULL,
    "panMasked" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "bankAccountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "activationStatus" TEXT NOT NULL DEFAULT 'created',
    "bankVerification" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerPayoutAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerPayoutAccount_userId_key" ON "OrganizerPayoutAccount"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerPayoutAccount_razorpayAccountId_key" ON "OrganizerPayoutAccount"("razorpayAccountId");
DO $$ BEGIN
  ALTER TABLE "OrganizerPayoutAccount" ADD CONSTRAINT "OrganizerPayoutAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
