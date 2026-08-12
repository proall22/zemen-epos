-- Shared merchant-wide catalogue with per-branch stock.
--
-- Before: inventory_items was keyed (merchantId, branchId, code) and on-hand
-- lived in two places — the denormalised inventory_items.stockQuantity and the
-- per-store inventory_stocks rows — maintained by non-equivalent rules.
-- After: one item definition per (merchantId, code); on-hand only in
-- inventory_stocks; price divergence via branch_item_prices.
--
-- Ordering matters: stock is materialised into stores BEFORE the merge, so a
-- quantity that lived only in the summary column lands in its own branch's
-- store rather than being lost when branchId is nulled.

CREATE TABLE "branch_item_prices" (
  "id"              TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "branchId"        TEXT NOT NULL,
  "unitPrice"       DOUBLE PRECISION NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branch_item_prices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_item_prices_inventoryItemId_branchId_key"
  ON "branch_item_prices"("inventoryItemId","branchId");
CREATE INDEX "branch_item_prices_branchId_idx" ON "branch_item_prices"("branchId");
ALTER TABLE "branch_item_prices"
  ADD CONSTRAINT "branch_item_prices_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_item_prices"
  ADD CONSTRAINT "branch_item_prices_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Every branch needs a store for step 2 to have a target.
INSERT INTO "stores" (
  "id","merchantId","branchId","name","code",
  "isDefault","isSalesFloor","active","createdAt","updatedAt"
)
SELECT gen_random_uuid()::text, b."merchantId", b."id", 'Main', 'MAIN',
       true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" b
WHERE NOT EXISTS (SELECT 1 FROM "stores" s WHERE s."branchId" = b."id");

-- 2a. Branch-scoped items whose stock exists only in the summary column: seed
-- it into that branch's sales floor. Items that already have per-store rows are
-- left alone — those are authoritative and the summary may have drifted.
INSERT INTO "inventory_stocks" ("id","inventoryItemId","storeId","quantity","updatedAt")
SELECT gen_random_uuid()::text, i."id", s."id", i."stockQuantity", CURRENT_TIMESTAMP
FROM "inventory_items" i
JOIN LATERAL (
  SELECT st."id" FROM "stores" st
  WHERE st."branchId" = i."branchId" AND st."active"
  ORDER BY st."isSalesFloor" DESC, st."isDefault" DESC, st."createdAt" ASC
  LIMIT 1
) s ON TRUE
WHERE i."branchId" IS NOT NULL
  AND i."trackStock"
  AND COALESCE(i."stockQuantity",0) <> 0
  AND NOT EXISTS (SELECT 1 FROM "inventory_stocks" x WHERE x."inventoryItemId" = i."id");

-- 2b. Merchant-wide items (branchId IS NULL) never had a store. Their stock is
-- placed in the merchant's oldest branch's sales floor — arbitrary, but the
-- alternative is discarding a real quantity.
INSERT INTO "inventory_stocks" ("id","inventoryItemId","storeId","quantity","updatedAt")
SELECT gen_random_uuid()::text, i."id", s."id", i."stockQuantity", CURRENT_TIMESTAMP
FROM "inventory_items" i
JOIN LATERAL (
  SELECT st."id" FROM "stores" st
  JOIN "branches" b ON b."id" = st."branchId"
  WHERE b."merchantId" = i."merchantId" AND st."active"
  ORDER BY b."createdAt" ASC, st."isSalesFloor" DESC, st."isDefault" DESC, st."createdAt" ASC
  LIMIT 1
) s ON TRUE
WHERE i."branchId" IS NULL
  AND i."trackStock"
  AND COALESCE(i."stockQuantity",0) <> 0
  AND NOT EXISTS (SELECT 1 FROM "inventory_stocks" x WHERE x."inventoryItemId" = i."id");

-- 3. Survivor per (merchantId, code): earliest created, id as tiebreak.
CREATE TEMP TABLE _item_merge_map ON COMMIT DROP AS
SELECT i."id" AS old_id,
       (SELECT k."id" FROM "inventory_items" k
        WHERE k."merchantId" = i."merchantId" AND k."code" = i."code"
        ORDER BY k."createdAt" ASC, k."id" ASC LIMIT 1) AS new_id
FROM "inventory_items" i;

-- 4. Price divergence becomes a per-branch override, before the losers go.
INSERT INTO "branch_item_prices" ("id","inventoryItemId","branchId","unitPrice","createdAt","updatedAt")
SELECT DISTINCT ON (m.new_id, loser."branchId")
       gen_random_uuid()::text, m.new_id, loser."branchId", loser."unitPrice",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "inventory_items" loser
JOIN _item_merge_map m ON m.old_id = loser."id"
JOIN "inventory_items" surv ON surv."id" = m.new_id
WHERE m.old_id <> m.new_id
  AND loser."branchId" IS NOT NULL
  AND loser."unitPrice" IS DISTINCT FROM surv."unitPrice";

-- 5. Repoint every FK to the survivor. inventory_stocks sums on collision;
-- because each loser's stock sits in its own branch's stores, the (item,store)
-- keys don't collide across branches and quantities stay where the goods are.
UPDATE "inventory_stocks" s
SET "inventoryItemId" = m.new_id
FROM _item_merge_map m
WHERE s."inventoryItemId" = m.old_id AND m.old_id <> m.new_id
  AND NOT EXISTS (
    SELECT 1 FROM "inventory_stocks" t
    WHERE t."inventoryItemId" = m.new_id AND t."storeId" = s."storeId"
  );

UPDATE "inventory_stocks" t
SET "quantity" = t."quantity" + agg.qty
FROM (
  SELECT m.new_id, s."storeId", SUM(s."quantity") AS qty
  FROM "inventory_stocks" s
  JOIN _item_merge_map m ON m.old_id = s."inventoryItemId"
  WHERE m.old_id <> m.new_id
  GROUP BY m.new_id, s."storeId"
) agg
WHERE t."inventoryItemId" = agg.new_id AND t."storeId" = agg."storeId";

DELETE FROM "inventory_stocks" s
USING _item_merge_map m
WHERE s."inventoryItemId" = m.old_id AND m.old_id <> m.new_id;

UPDATE "stock_movements" x SET "inventoryItemId" = m.new_id
FROM _item_merge_map m WHERE x."inventoryItemId" = m.old_id AND m.old_id <> m.new_id;

UPDATE "stock_purchase_items" x SET "inventoryItemId" = m.new_id
FROM _item_merge_map m WHERE x."inventoryItemId" = m.old_id AND m.old_id <> m.new_id;

UPDATE "stock_reservations" x SET "inventoryItemId" = m.new_id
FROM _item_merge_map m WHERE x."inventoryItemId" = m.old_id AND m.old_id <> m.new_id;

UPDATE "invoice_items" x SET "inventoryItemId" = m.new_id
FROM _item_merge_map m WHERE x."inventoryItemId" = m.old_id AND m.old_id <> m.new_id;

UPDATE "inventory_items" x SET "predecessorId" = m.new_id
FROM _item_merge_map m WHERE x."predecessorId" = m.old_id AND m.old_id <> m.new_id;

-- 6. Carry the merged flags onto the survivor before dropping the losers.
UPDATE "inventory_items" surv
SET "trackStock" = agg.track_stock,
    "lowStockThreshold" = agg.low_threshold
FROM (
  SELECT m.new_id,
         BOOL_OR(i."trackStock") AS track_stock,
         MIN(i."lowStockThreshold") AS low_threshold
  FROM "inventory_items" i
  JOIN _item_merge_map m ON m.old_id = i."id"
  GROUP BY m.new_id
) agg
WHERE surv."id" = agg.new_id;

DELETE FROM "inventory_items" i
USING _item_merge_map m
WHERE i."id" = m.old_id AND m.old_id <> m.new_id;

-- 7. sku/upc may still collide across former branches. Keep the earliest and
-- clear the rest — a duplicate barcode would make scanning ambiguous anyway.
UPDATE "inventory_items" i SET "sku" = NULL
WHERE i."sku" IS NOT NULL AND i."id" <> (
  SELECT k."id" FROM "inventory_items" k
  WHERE k."merchantId" = i."merchantId" AND k."sku" = i."sku"
  ORDER BY k."createdAt" ASC, k."id" ASC LIMIT 1);

UPDATE "inventory_items" i SET "upc" = NULL
WHERE i."upc" IS NOT NULL AND i."id" <> (
  SELECT k."id" FROM "inventory_items" k
  WHERE k."merchantId" = i."merchantId" AND k."upc" = i."upc"
  ORDER BY k."createdAt" ASC, k."id" ASC LIMIT 1);

-- 8. The catalogue is merchant-wide from here.
UPDATE "inventory_items" SET "branchId" = NULL WHERE "branchId" IS NOT NULL;

DROP INDEX IF EXISTS "inventory_items_merchantId_branchId_code_key";
DROP INDEX IF EXISTS "inventory_items_merchantId_branchId_sku_key";
DROP INDEX IF EXISTS "inventory_items_merchantId_branchId_upc_key";
DROP INDEX IF EXISTS "inventory_items_merchantId_branchId_idx";

CREATE UNIQUE INDEX "inventory_items_merchantId_code_key" ON "inventory_items"("merchantId","code");
CREATE UNIQUE INDEX "inventory_items_merchantId_sku_key" ON "inventory_items"("merchantId","sku");
CREATE UNIQUE INDEX "inventory_items_merchantId_upc_key" ON "inventory_items"("merchantId","upc");
CREATE INDEX "inventory_items_merchantId_idx" ON "inventory_items"("merchantId");

ALTER TABLE "inventory_items" DROP COLUMN "stockQuantity";
