-- Adds the offline-mode draft pipeline as a *separate table*.
--
-- Why a separate table rather than a flag on `invoices`:
--   - Issued-invoice columns (`irn`, `signedQR`, `signedInvoice`, `ackDate`)
--     stay non-nullable and meaningful.
--   - `Receipt.invoiceId` FK to `invoices` can't accidentally reference a
--     draft — typing enforces "you can't file a receipt against an
--     unsynced invoice".
--   - Dashboard / notification / public-link consumers don't need a
--     `WHERE syncState='SYNCED'` filter to behave correctly.
--   - Sync is an atomic INSERT(invoices) + DELETE(invoice_drafts) at the
--     service layer.
--
-- Additive, idempotent, real-data-safe — no changes to existing rows.

BEGIN;

CREATE TYPE "DraftSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNC_FAILED');

CREATE TABLE "invoice_drafts" (
  "id"                        TEXT              NOT NULL,
  "provisionalDocumentNumber" TEXT              NOT NULL,
  "payload"                   JSONB             NOT NULL,
  "documentType"              TEXT              NOT NULL,
  "transactionType"           TEXT              NOT NULL,
  "buyerTin"                  TEXT,
  "buyerLegalName"            TEXT              NOT NULL,
  "totalValue"                DOUBLE PRECISION  NOT NULL,
  "currency"                  TEXT              NOT NULL DEFAULT 'ETB',
  "cashierName"               TEXT              NOT NULL,
  "salespersonName"           TEXT              NOT NULL,
  "relatedIrn"                TEXT,
  "status"                    "DraftSyncStatus" NOT NULL DEFAULT 'PENDING',
  "lastError"                 TEXT,
  "lastAttemptAt"             TIMESTAMP(3),
  "attempts"                  INTEGER           NOT NULL DEFAULT 0,
  "merchantId"                TEXT              NOT NULL,
  "branchId"                  TEXT              NOT NULL,
  "createdAt"                 TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "invoice_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_drafts_merchantId_branchId_createdAt_idx"
  ON "invoice_drafts" ("merchantId", "branchId", "createdAt");

ALTER TABLE "invoice_drafts"
  ADD CONSTRAINT "invoice_drafts_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_drafts"
  ADD CONSTRAINT "invoice_drafts_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
