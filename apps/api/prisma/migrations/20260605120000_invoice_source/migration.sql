-- Adds an `InvoiceSource` enum + a `source` column on `invoices`.
--
-- Purpose: distinguish invoices we registered ourselves (`EIRMS`) from ones
-- imported by IRN via MoR's /v1/verify so a receipt can be filed against
-- them (`EXTERNAL`). Receipt flow already handles the optional fields
-- (signedQR / signedInvoice / ackDate) being empty strings on imported
-- rows, so no nullable-column migration is needed for them.
--
-- Additive + idempotent + real-data-safe:
--   - The enum is created fresh (no rename, no remap).
--   - The column lands NOT NULL with a default of `EIRMS`, so every
--     existing row backfills correctly at DDL time without a manual UPDATE.
--   - No unique / index changes — this column is for filtering + display,
--     and a partial index can be added later if the SPA grows a "show
--     external only" filter that warrants it.

BEGIN;

CREATE TYPE "InvoiceSource" AS ENUM ('EIRMS', 'EXTERNAL');

ALTER TABLE "invoices"
  ADD COLUMN "source" "InvoiceSource" NOT NULL DEFAULT 'EIRMS';

COMMIT;
