CREATE TABLE "LegacyChatMediaErasure" (
  "key" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PrivacyMaintenanceState" (
  "id" TEXT PRIMARY KEY,
  "readyAfter" TIMESTAMP(3) NOT NULL,
  "inventoriedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "phase" TEXT NOT NULL DEFAULT 'COPYING'
);
INSERT INTO "PrivacyMaintenanceState" ("id", "readyAfter")
VALUES ('private-chat-v1', COALESCE(
  (SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = '20261106170000_privacy_boundaries' LIMIT 1),
  CURRENT_TIMESTAMP
) + INTERVAL '10 minutes');
