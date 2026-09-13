-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'CUSTOM');

-- AlterTable
ALTER TABLE "TripExpense" ADD COLUMN     "splitMode" "SplitMode" NOT NULL DEFAULT 'EQUAL';

-- CreateTable
CREATE TABLE "TripExpenseShare" (
    "id" TEXT NOT NULL,
    "tripExpenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripExpenseShare_tripExpenseId_idx" ON "TripExpenseShare"("tripExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "TripExpenseShare_tripExpenseId_userId_key" ON "TripExpenseShare"("tripExpenseId", "userId");

-- AddForeignKey
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_tripExpenseId_fkey" FOREIGN KEY ("tripExpenseId") REFERENCES "TripExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

