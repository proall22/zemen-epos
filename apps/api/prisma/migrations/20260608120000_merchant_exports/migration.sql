BEGIN;

CREATE TYPE "MerchantExportStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED'
);

CREATE TABLE "merchant_exports" (
  "id"               TEXT                  NOT NULL,
  "merchantId"       TEXT                  NOT NULL,
  "status"           "MerchantExportStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedBy"      TEXT,
  "requestedByEmail" TEXT,
  "startedAt"        TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "expiresAt"        TIMESTAMP(3),
  "filePath"         TEXT,
  "fileBytes"        INTEGER,
  "invoiceCount"     INTEGER               NOT NULL DEFAULT 0,
  "receiptCount"     INTEGER               NOT NULL DEFAULT 0,
  "inventoryCount"   INTEGER               NOT NULL DEFAULT 0,
  "buyerCount"       INTEGER               NOT NULL DEFAULT 0,
  "downloadCount"    INTEGER               NOT NULL DEFAULT 0,
  "errorMessage"     TEXT,

  CONSTRAINT "merchant_exports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "merchant_exports"
  ADD CONSTRAINT "merchant_exports_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "merchant_exports_merchantId_requestedAt_idx"
  ON "merchant_exports" ("merchantId", "requestedAt");

CREATE INDEX "merchant_exports_status_idx"
  ON "merchant_exports" ("status");

COMMIT;
