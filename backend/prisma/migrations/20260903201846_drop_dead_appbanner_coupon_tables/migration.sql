-- Both tables are dead schema, left over from before payments/wallet were
-- removed for v1 (docs/REMEDIATION.md §5.5/§5.6): confirmed zero references
-- anywhere in backend or frontend code, and both confirmed empty (0 rows) in
-- the live database before this migration. Coupon.discount was also a Float
-- that could hold a flat money amount ("Percent or Flat amount"), which
-- would have violated §0.2.2's money rule the moment anything wrote to it —
-- moot now that the table itself is gone. User-confirmed before dropping
-- (2026-09-03), per the doc's own "delete dead code as you find it" rule.

-- DropTable
DROP TABLE "AppBanner";

-- DropTable
DROP TABLE "Coupon";
