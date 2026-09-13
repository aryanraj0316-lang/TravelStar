-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "inquiryTripId" TEXT,
ADD COLUMN     "inquiryUserId" TEXT;

-- CreateIndex
CREATE INDEX "ChatRoom_inquiryTripId_idx" ON "ChatRoom"("inquiryTripId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_inquiryTripId_inquiryUserId_key" ON "ChatRoom"("inquiryTripId", "inquiryUserId");

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_inquiryTripId_fkey" FOREIGN KEY ("inquiryTripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_inquiryUserId_fkey" FOREIGN KEY ("inquiryUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

