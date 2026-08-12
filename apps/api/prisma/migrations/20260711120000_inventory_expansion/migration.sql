-- Inventory expansion: named stores per branch, vendor/purchase records,
-- POS cart reservations, extended write-off reasons.
--
-- Additive throughout. Existing inventory_items.stockQuantity is retained as
-- a denormalized summary that stays in sync with the new per-store
-- inventory_stocks rows (maintained inside every write transaction).

-- ---------------------------------------------------------------------------
-- 1. Extend the reason enum
-- ---------------------------------------------------------------------------
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'DAMAGE';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'EXPIRY';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'THEFT';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'INTERNAL_USE';

-- ---------------------------------------------------------------------------
-- 2. Extend existing tables with new columns (all nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE "inventory_items"
  ADD COLUMN "avgCost" DOUBLE PRECISION;

ALTER TABLE "stock_movements"
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "purchaseItemId" TEXT;

-- ---------------------------------------------------------------------------
-- 3. Create the new tables
-- ---------------------------------------------------------------------------
CREATE TABLE "stores" (
  "id"           TEXT NOT NULL,
  "merchantId"   TEXT NOT NULL,
  "branchId"     TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "isDefault"    BOOLEAN NOT NULL DEFAULT false,
  "isSalesFloor" BOOLEAN NOT NULL DEFAULT false,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stores_branchId_code_key" ON "stores"("branchId", "code");
CREATE INDEX "stores_merchantId_branchId_idx" ON "stores"("merchantId", "branchId");
ALTER TABLE "stores"
  ADD CONSTRAINT "stores_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stores"
  ADD CONSTRAINT "stores_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_stocks" (
  "id"              TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "storeId"         TEXT NOT NULL,
  "quantity"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_stocks_inventoryItemId_storeId_key" ON "inventory_stocks"("inventoryItemId", "storeId");
CREATE INDEX "inventory_stocks_storeId_idx" ON "inventory_stocks"("storeId");
ALTER TABLE "inventory_stocks"
  ADD CONSTRAINT "inventory_stocks_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_stocks"
  ADD CONSTRAINT "inventory_stocks_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "vendors" (
  "id"          TEXT NOT NULL,
  "merchantId"  TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "contactName" TEXT,
  "email"       TEXT,
  "phone"       TEXT,
  "tin"         TEXT,
  "notes"       TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendors_merchantId_name_key" ON "vendors"("merchantId", "name");
CREATE INDEX "vendors_merchantId_idx" ON "vendors"("merchantId");
ALTER TABLE "vendors"
  ADD CONSTRAINT "vendors_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_purchases" (
  "id"           TEXT NOT NULL,
  "merchantId"   TEXT NOT NULL,
  "branchId"     TEXT NOT NULL,
  "vendorId"     TEXT,
  "reference"    TEXT,
  "purchaseDate" TIMESTAMP(3) NOT NULL,
  "totalCost"    DOUBLE PRECISION NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'ETB',
  "note"         TEXT,
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_purchases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_purchases_merchantId_branchId_idx" ON "stock_purchases"("merchantId", "branchId");
CREATE INDEX "stock_purchases_vendorId_idx" ON "stock_purchases"("vendorId");
CREATE INDEX "stock_purchases_purchaseDate_idx" ON "stock_purchases"("purchaseDate");
ALTER TABLE "stock_purchases"
  ADD CONSTRAINT "stock_purchases_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_purchases"
  ADD CONSTRAINT "stock_purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_purchases"
  ADD CONSTRAINT "stock_purchases_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "stock_purchase_items" (
  "id"              TEXT NOT NULL,
  "purchaseId"      TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "storeId"         TEXT NOT NULL,
  "quantity"        DOUBLE PRECISION NOT NULL,
  "unitCost"        DOUBLE PRECISION NOT NULL,
  "lineCost"        DOUBLE PRECISION NOT NULL,
  CONSTRAINT "stock_purchase_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_purchase_items_purchaseId_idx" ON "stock_purchase_items"("purchaseId");
CREATE INDEX "stock_purchase_items_inventoryItemId_idx" ON "stock_purchase_items"("inventoryItemId");
ALTER TABLE "stock_purchase_items"
  ADD CONSTRAINT "stock_purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_purchase_items"
  ADD CONSTRAINT "stock_purchase_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_purchase_items"
  ADD CONSTRAINT "stock_purchase_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_reservations" (
  "id"              TEXT NOT NULL,
  "merchantId"      TEXT NOT NULL,
  "branchId"        TEXT NOT NULL,
  "storeId"         TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity"        DOUBLE PRECISION NOT NULL,
  "cartSessionId"   TEXT NOT NULL,
  "userId"          TEXT,
  "actorEmail"      TEXT,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_reservations_inventoryItemId_expiresAt_idx" ON "stock_reservations"("inventoryItemId", "expiresAt");
CREATE INDEX "stock_reservations_cartSessionId_idx" ON "stock_reservations"("cartSessionId");
CREATE INDEX "stock_reservations_branchId_expiresAt_idx" ON "stock_reservations"("branchId", "expiresAt");
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backlink FKs on stock_movements (created after stores + purchase items exist)
CREATE INDEX "stock_movements_storeId_createdAt_idx" ON "stock_movements"("storeId", "createdAt");
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "stock_purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Data seed — one "Main" store per branch + backfill inventory_stocks
--     for existing branch-scoped tracked items so the summary stockQuantity
--     stays consistent with per-store rows.
-- ---------------------------------------------------------------------------
-- gen_random_uuid() from pgcrypto is available on modern Postgres by
-- default; enable it defensively.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "stores" ("id", "merchantId", "branchId", "name", "code", "isDefault", "isSalesFloor", "active", "updatedAt")
SELECT gen_random_uuid()::text, b."merchantId", b."id", 'Main', 'MAIN', true, true, true, CURRENT_TIMESTAMP
FROM "branches" b;

INSERT INTO "inventory_stocks" ("id", "inventoryItemId", "storeId", "quantity", "updatedAt")
SELECT gen_random_uuid()::text, i."id", s."id", COALESCE(i."stockQuantity", 0), CURRENT_TIMESTAMP
FROM "inventory_items" i
JOIN "stores" s ON s."branchId" = i."branchId" AND s."isDefault" = true
WHERE i."branchId" IS NOT NULL
  AND i."trackStock" = true
  AND i."stockQuantity" IS NOT NULL;
