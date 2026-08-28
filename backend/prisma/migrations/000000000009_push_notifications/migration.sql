-- Real push notifications (docs/REMEDIATION.md §8.18). The
-- `pushNotifications` profile toggle used to do nothing at all: no device
-- token was ever registered anywhere, front or back end, so no push could
-- ever be delivered no matter how the switch was set.

-- Per-category opt-outs alongside the existing master switch. They mirror
-- NotificationType; a push is sent only when the master switch and the
-- matching category are both on. Defaulting to true keeps existing users'
-- behaviour unchanged — the master switch is the one they have set.
ALTER TABLE "Profile" ADD COLUMN     "pushTripUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushHazardAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushSeasonal" BOOLEAN NOT NULL DEFAULT true;

-- One row per device, keyed by the token itself so re-registering the same
-- device upserts rather than duplicating. Rows are deleted on logout and
-- when the Expo push service reports DeviceNotRegistered.
-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
