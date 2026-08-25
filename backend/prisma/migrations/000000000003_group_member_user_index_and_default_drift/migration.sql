-- Adds the missing GroupMember.userId index (docs/REMEDIATION.md §4.3 — the
-- composite @@unique([groupId, userId]) does not cover userId-only lookups
-- since groupId is its leftmost column). The DROP DEFAULT statements below
-- are unrelated schema drift Prisma detected against an earlier `db push`
-- state: these updatedAt columns had a DB-level CURRENT_TIMESTAMP default
-- that @updatedAt does not need (Prisma sets the value from the client on
-- every write) — safe to drop, no data is affected.

-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Blog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Destination" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GroupComment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GroupPost" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GuidePackage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GuideProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");
