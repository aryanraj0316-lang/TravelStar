-- StoryView and StoryLike were originally created directly against the
-- dev database (prisma db push) rather than through a migration, so no
-- migration file ever captured their existence. That was invisible as
-- long as every environment shared that one already-patched database —
-- it broke the moment a database only had the tracked migration history
-- to build from. IF NOT EXISTS makes this safe to apply both there
-- (where the tables are already present) and on a database seeing them
-- for the first time.

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userAvatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoryLike" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userAvatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoryView_storyId_idx" ON "StoryView"("storyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoryView_userId_idx" ON "StoryView"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoryLike_storyId_idx" ON "StoryLike"("storyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoryLike_userId_idx" ON "StoryLike"("userId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "TravelStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "TravelStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
