-- Phase F: branch-scoped inventory.
--
-- Adds InventoryItem.branchId (nullable — null = merchant-wide catalog item
-- visible from every branch; set = branch-specific item with its own stock).
-- The composite uniques widen from (merchantId, code/sku) to
-- (merchantId, branchId, code/sku) so the same code can exist at branch A and
-- branch B independently. Postgres treats NULL as distinct in unique indexes,
-- so two merchant-wide rows with the same code still collide — which is what
-- we want (a single catalog code per merchant when branchId is null).
--
-- Real-data-safe: ADD COLUMN is additive with a null default, the index swap
-- preserves all existing rows (they all get branchId=null and the new
-- composite is still unique within that), and FK is RESTRICT so nobody
-- accidentally orphans a branch's inventory by deleting the branch.

ALTER TABLE "inventory_items" ADD COLUMN "branchId" TEXT;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Swap the merchant-wide uniques for branch-scoped ones.
DROP INDEX "inventory_items_merchantId_code_key";
DROP INDEX "inventory_items_merchantId_sku_key";

CREATE UNIQUE INDEX "inventory_items_merchantId_branchId_code_key"
  ON "inventory_items"("merchantId", "branchId", "code");
CREATE UNIQUE INDEX "inventory_items_merchantId_branchId_sku_key"
  ON "inventory_items"("merchantId", "branchId", "sku");

-- Helper index for the common cashier read: "items in my branch OR
-- merchant-wide". Filter columns ordered most→least selective.
CREATE INDEX "inventory_items_merchantId_branchId_idx"
  ON "inventory_items"("merchantId", "branchId");
