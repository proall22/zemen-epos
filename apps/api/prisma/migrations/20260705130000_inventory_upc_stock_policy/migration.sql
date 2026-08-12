-- BranchStockPolicy: per-branch enforcement for out-of-stock sales.
-- ALLOW_NEGATIVE preserves the pre-policy behaviour (default so existing
-- branches don't change behaviour); BLOCK_ON_EMPTY refuses sales that would
-- drive a tracked item's on-hand below zero.
CREATE TYPE "BranchStockPolicy" AS ENUM ('ALLOW_NEGATIVE', 'BLOCK_ON_EMPTY');

ALTER TABLE "branches"
  ADD COLUMN "stockPolicy" "BranchStockPolicy" NOT NULL DEFAULT 'ALLOW_NEGATIVE';

-- UPC / EAN barcode column on inventory. Nullable — merchants that never
-- scan can leave it empty. Unique within (merchantId, branchId) so a scan
-- always resolves to one item within a shop.
ALTER TABLE "inventory_items"
  ADD COLUMN "upc" TEXT;

CREATE UNIQUE INDEX "inventory_items_merchantId_branchId_upc_key"
  ON "inventory_items"("merchantId", "branchId", "upc");

-- pg_trgm powers the ILIKE '%q%' searches on the inventory page + POS
-- search box. Cheaper than tsvector for our short strings, and it handles
-- typos gracefully (trigram similarity).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes on the searchable columns. gin_trgm_ops supports both LIKE
-- and % (similarity) operators. Kept per-column so the planner can OR
-- them together when the query hits multiple fields.
CREATE INDEX "inventory_items_code_trgm_idx"
  ON "inventory_items" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "inventory_items_sku_trgm_idx"
  ON "inventory_items" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX "inventory_items_upc_trgm_idx"
  ON "inventory_items" USING GIN ("upc" gin_trgm_ops);
CREATE INDEX "inventory_items_description_trgm_idx"
  ON "inventory_items" USING GIN ("description" gin_trgm_ops);
