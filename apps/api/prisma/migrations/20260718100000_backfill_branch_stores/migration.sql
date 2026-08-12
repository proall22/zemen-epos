-- Every branch needs at least one store: StoreResolverService throws
-- "no active stores" otherwise, which fails sales, purchases, transfers and
-- stock adjustments.
--
-- 20260711120000_inventory_expansion seeded a Main store for the branches that
-- existed at that time, but neither branch creation nor merchant signup created
-- one afterwards (both fixed in code alongside this migration). This backfills
-- the branches created in between.
--
-- Real-data-safe: inserts only for branches that have no store at all; existing
-- stores and their stock are untouched.
INSERT INTO "stores" (
  "id", "merchantId", "branchId", "name", "code",
  "isDefault", "isSalesFloor", "active", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, b."merchantId", b."id", 'Main', 'MAIN',
  true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" b
WHERE NOT EXISTS (
  SELECT 1 FROM "stores" s WHERE s."branchId" = b."id"
);
