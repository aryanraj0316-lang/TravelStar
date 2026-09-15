-- Everything in this file was already live against the shared dev database
-- (created via `prisma db push` at various points this project's history,
-- rather than `prisma migrate dev`) but never captured as a migration —
-- so it silently worked everywhere that reused that one database and
-- broke outright the first time a different database tried to build
-- itself from the tracked migration history alone. Every statement here
-- is guarded to be safe to run against a database that already has some
-- or all of it (the original dev database) as well as one seeing it for
-- the first time.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TripPaymentOrderStatus" AS ENUM ('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "JoinRequestStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REQUIRED';
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_SUCCESS';

-- AlterTable
ALTER TABLE "TravelStory" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TripPaymentOrder" (
    "id" TEXT NOT NULL,
    "joinRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "gateway" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "status" "TripPaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "walletDebit" DECIMAL(12,2),
    "gatewayDebit" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TripPaymentOrder_joinRequestId_key" ON "TripPaymentOrder"("joinRequestId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TripPaymentOrder_razorpayOrderId_key" ON "TripPaymentOrder"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TripPaymentOrder_idempotencyKey_key" ON "TripPaymentOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TripPaymentOrder_userId_idx" ON "TripPaymentOrder"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TripPaymentOrder_status_idx" ON "TripPaymentOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TripPaymentOrder" ADD CONSTRAINT "TripPaymentOrder_joinRequestId_fkey" FOREIGN KEY ("joinRequestId") REFERENCES "JoinRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "TripPaymentOrder" ADD CONSTRAINT "TripPaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
