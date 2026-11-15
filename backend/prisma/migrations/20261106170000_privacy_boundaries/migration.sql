ALTER TABLE "Profile" ADD COLUMN "guideLocationActive" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ChatAttachment" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "chatRoomId" TEXT NOT NULL REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "contentType" TEXT NOT NULL, "bytes" BYTEA NOT NULL, "legacyKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatAttachment_ownerId_idx" ON "ChatAttachment"("ownerId");
CREATE INDEX "ChatAttachment_chatRoomId_idx" ON "ChatAttachment"("chatRoomId");
CREATE TABLE "MediaErasureJob" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL UNIQUE, "localFiles" TEXT[] NOT NULL,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishAfter" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve attribution for erasure of stories whose accounts were already removed.
INSERT INTO "MediaErasureJob" ("id", "ownerId", "localFiles", "finishAfter")
SELECT 'legacy-erasure-' || md5("userId"), "userId",
  ARRAY(SELECT DISTINCT substring(url from '/uploads/(story-[A-Za-z0-9.-]+)$')
    FROM "TravelStory" s2, LATERAL unnest(ARRAY[s2."mediaUrl", s2."coverImg"]) AS url
    WHERE s2."userId" = s."userId" AND url ~ '/uploads/story-[A-Za-z0-9.-]+$'),
  CURRENT_TIMESTAMP + INTERVAL '10 minutes'
FROM "TravelStory" s WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = s."userId")
GROUP BY "userId";
-- Enforce ownership even for writes racing with deletion; remove old orphaned identifiers.
DELETE FROM "TravelStory" WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "TravelStory"."userId");
DELETE FROM "StoryView" WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "StoryView"."userId");
DELETE FROM "StoryLike" WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "StoryLike"."userId");
ALTER TABLE "TravelStory" ADD CONSTRAINT "TravelStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD COLUMN "subjectUserId" TEXT REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD COLUMN "subjectUserId" TEXT REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
