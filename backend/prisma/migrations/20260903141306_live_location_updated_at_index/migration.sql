-- Missing from Phase 4's original indexing sweep. Both the live map's
-- freshness filter (routes/map.ts, "updatedAt >= freshAfter") and the new
-- retention purge job (lib/data-retention.ts, "updatedAt < cutoff",
-- docs/REMEDIATION.md §12.5) filter and order on this column.

-- CreateIndex
CREATE INDEX "LiveLocation_updatedAt_idx" ON "LiveLocation"("updatedAt");
