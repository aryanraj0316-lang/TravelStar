-- Shared trip expenses for the budget tracker (docs/REMEDIATION.md §8.12).
-- budget-tracker.tsx was pure local useState with a hardcoded ₹15,000
-- budget and five hardcoded expense rows that reset on unmount. This table
-- backs a real, trip-scoped, per-member split. Kept separate from the
-- existing Group-scoped "Expense" model — the budget tracker is tied to
-- trips, not groups, and the two features do not overlap. The equal split
-- across trip members is derived at read time, never stored, so it cannot
-- drift when membership changes.

-- CreateTable
CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "paidById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripExpense_tripId_idx" ON "TripExpense"("tripId");

-- CreateIndex
CREATE INDEX "TripExpense_paidById_idx" ON "TripExpense"("paidById");

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
