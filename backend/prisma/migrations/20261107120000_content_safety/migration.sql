-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAcceptance" (
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAcceptance_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserSafetyStatus" (
    "userId" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSafetyStatus_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SafetyReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenContent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeratorInvite" (
    "tokenHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedBy" TEXT,

    CONSTRAINT "ModeratorInvite_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "SafetyReport_status_createdAt_idx" ON "SafetyReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyReport_reporterId_kind_targetId_idx" ON "SafetyReport"("reporterId", "kind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenContent_kind_targetId_key" ON "HiddenContent"("kind", "targetId");

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAcceptance" ADD CONSTRAINT "ContentAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSafetyStatus" ADD CONSTRAINT "UserSafetyStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO "ModeratorInvite" ("tokenHash") VALUES ('ef22068ea905dfe8ef3561b098ac1ddaaa541d4a59e467c49c6132111e5048a4');

INSERT INTO "ModeratorInvite" ("tokenHash") VALUES ('8be328b4f4f3b3f3b2ef6cf691fb5033fe54c27964fb7540ebd39a0246a75bfc');
