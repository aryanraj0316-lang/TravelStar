-- A booking can now have more than one payment over its life (cancel, then
-- book the same trip again). Earlier payments stay as history; the booking
-- points at its current one. Guarded so it is safe to re-run (applied on
-- server boot).
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "currentPaymentOrderId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "JoinRequest_currentPaymentOrderId_key" ON "JoinRequest"("currentPaymentOrderId");

-- Every existing booking points at the one payment it already has.
UPDATE "JoinRequest" jr
   SET "currentPaymentOrderId" = o."id"
  FROM "TripPaymentOrder" o
 WHERE o."joinRequestId" = jr."id"
   AND jr."currentPaymentOrderId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_currentPaymentOrderId_fkey') THEN
    ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_currentPaymentOrderId_fkey"
      FOREIGN KEY ("currentPaymentOrderId") REFERENCES "TripPaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One booking may now have several payment rows.
DROP INDEX IF EXISTS "TripPaymentOrder_joinRequestId_key";
CREATE INDEX IF NOT EXISTS "TripPaymentOrder_joinRequestId_idx" ON "TripPaymentOrder"("joinRequestId");
