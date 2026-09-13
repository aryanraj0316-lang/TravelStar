-- CreateTable
CREATE TABLE "MessageDeliveryReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageDeliveryReceipt_messageId_idx" ON "MessageDeliveryReceipt"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryReceipt_messageId_userId_key" ON "MessageDeliveryReceipt"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "MessageDeliveryReceipt" ADD CONSTRAINT "MessageDeliveryReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryReceipt" ADD CONSTRAINT "MessageDeliveryReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

