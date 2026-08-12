-- Multi-tenancy foundation: add Merchant + Branch + tenant keys on every
-- operational table. Real-data-safe: all existing rows are backfilled to a
-- default merchant/branch BEFORE NOT NULL is enforced, and unique constraints
-- are only swapped after the backfill. The entire migration runs in one
-- transaction by `prisma migrate deploy`, so any failure rolls everything
-- back — no partial state.

-- =========================================================================
-- 1. New tenant tables
-- =========================================================================

CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "tin" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "vatNumber" TEXT,
    "city" TEXT,
    "region" TEXT,
    "zone" TEXT,
    "wereda" TEXT,
    "kebele" TEXT,
    "houseNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "merchants_tin_key" ON "merchants"("tin");

CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemNumber" TEXT NOT NULL DEFAULT '',
    "city" TEXT,
    "region" TEXT,
    "zone" TEXT,
    "wereda" TEXT,
    "kebele" TEXT,
    "houseNumber" TEXT,
    "eirmsClientId" TEXT,
    "eirmsClientSecret" TEXT,
    "eirmsApikey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "branches_merchantId_systemNumber_key" ON "branches"("merchantId", "systemNumber");

-- =========================================================================
-- 2. Seed the default merchant + branch (placeholder values; MerchantsService
--    populates them from env on first boot, see Phase A bootstrap). The tin
--    uses a clearly-fake sentinel so a real merchant TIN can't collide.
-- =========================================================================

INSERT INTO "merchants" ("id", "legalName", "tin", "createdAt", "updatedAt")
VALUES ('default-merchant', '', '__BOOTSTRAP__', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "branches" ("id", "merchantId", "name", "createdAt", "updatedAt")
VALUES ('default-branch', 'default-merchant', 'Default Branch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- =========================================================================
-- 3. users — add tenant keys; SUPER_ADMIN stays cross-tenant (null), other
--    roles get the default merchant + branch so existing logins keep working.
-- =========================================================================

ALTER TABLE "users" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "users" ADD COLUMN "branchId"   TEXT;
UPDATE "users"
   SET "merchantId" = 'default-merchant',
       "branchId"   = 'default-branch'
 WHERE "role" <> 'SUPER_ADMIN';
ALTER TABLE "users" ADD CONSTRAINT "users_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "branches"("id")   ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- 4. buyers — merchantId NOT NULL + composite unique replacing tin @unique.
-- =========================================================================

ALTER TABLE "buyers" ADD COLUMN "merchantId" TEXT;
UPDATE "buyers" SET "merchantId" = 'default-merchant';
ALTER TABLE "buyers" ALTER COLUMN "merchantId" SET NOT NULL;
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "buyers_tin_key";
CREATE UNIQUE INDEX "buyers_merchantId_tin_key" ON "buyers"("merchantId", "tin");

-- =========================================================================
-- 5. inventory_items — merchantId NOT NULL + composite uniques on (code) and
--    (sku); inventory stays merchant-wide for now (branch scoping = Phase F).
-- =========================================================================

ALTER TABLE "inventory_items" ADD COLUMN "merchantId" TEXT;
UPDATE "inventory_items" SET "merchantId" = 'default-merchant';
ALTER TABLE "inventory_items" ALTER COLUMN "merchantId" SET NOT NULL;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "inventory_items_code_key";
DROP INDEX "inventory_items_sku_key";
CREATE UNIQUE INDEX "inventory_items_merchantId_code_key" ON "inventory_items"("merchantId", "code");
CREATE UNIQUE INDEX "inventory_items_merchantId_sku_key"  ON "inventory_items"("merchantId", "sku");

-- =========================================================================
-- 6. invoices — merchantId + branchId NOT NULL.
-- =========================================================================

ALTER TABLE "invoices" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "branchId"   TEXT;
UPDATE "invoices"
   SET "merchantId" = 'default-merchant',
       "branchId"   = 'default-branch';
ALTER TABLE "invoices" ALTER COLUMN "merchantId" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "branchId"   SET NOT NULL;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "branches"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "invoices_merchantId_branchId_createdAt_idx" ON "invoices"("merchantId", "branchId", "createdAt");

-- =========================================================================
-- 7. receipts — merchantId + branchId NOT NULL; receiptNumber unique becomes
--    composite per branch (each branch has its own EIRMS sequence).
-- =========================================================================

ALTER TABLE "receipts" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "receipts" ADD COLUMN "branchId"   TEXT;
UPDATE "receipts"
   SET "merchantId" = 'default-merchant',
       "branchId"   = 'default-branch';
ALTER TABLE "receipts" ALTER COLUMN "merchantId" SET NOT NULL;
ALTER TABLE "receipts" ALTER COLUMN "branchId"   SET NOT NULL;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "branches"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "receipts_merchantId_branchId_createdAt_idx" ON "receipts"("merchantId", "branchId", "createdAt");
DROP INDEX "receipts_receiptNumber_key";
CREATE UNIQUE INDEX "receipts_branchId_receiptNumber_key" ON "receipts"("branchId", "receiptNumber");

-- =========================================================================
-- 8. audit_logs — nullable tenant keys (system events / pre-tenancy entries
--    legitimately have no merchant). Existing rows are left null (we won't
--    pretend they belonged to the default merchant — they pre-date tenancy).
-- =========================================================================

ALTER TABLE "audit_logs" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "branchId"   TEXT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "branches"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "audit_logs_merchantId_createdAt_idx" ON "audit_logs"("merchantId", "createdAt");

-- =========================================================================
-- 9. stock_movements — nullable tenant keys; backfill existing history to
--    the default merchant/branch so admin lists stay scoped sensibly.
-- =========================================================================

ALTER TABLE "stock_movements" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "branchId"   TEXT;
UPDATE "stock_movements"
   SET "merchantId" = 'default-merchant',
       "branchId"   = 'default-branch';
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "branches"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
