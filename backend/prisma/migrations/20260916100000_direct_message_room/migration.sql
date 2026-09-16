-- Generic member-to-member direct message rooms, independent of any trip
-- or enquiry. dmUserAId/dmUserBId always store the pair sorted so the
-- unique index catches the thread regardless of who opens it first.
ALTER TABLE "ChatRoom" ADD COLUMN "dmUserAId" TEXT;
ALTER TABLE "ChatRoom" ADD COLUMN "dmUserBId" TEXT;

CREATE UNIQUE INDEX "ChatRoom_dmUserAId_dmUserBId_key" ON "ChatRoom"("dmUserAId", "dmUserBId");

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_dmUserAId_fkey" FOREIGN KEY ("dmUserAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_dmUserBId_fkey" FOREIGN KEY ("dmUserBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
