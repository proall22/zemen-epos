ALTER TABLE "invoices"
  ADD COLUMN "withholdingRate" DOUBLE PRECISION,
  ADD COLUMN "withholdingBase" DOUBLE PRECISION,
  ADD COLUMN "withholdingThreshold" DOUBLE PRECISION;

-- Existing issued invoices already preserve the amount and exact request.
-- Recover a rate where an actual withholding amount was stored; leave the
-- configured threshold null because it cannot be reconstructed reliably.
UPDATE "invoices"
SET
  "withholdingBase" = "preTaxValue",
  "withholdingRate" = ROUND(
    (("withholdValue" / NULLIF("preTaxValue", 0)) * 100)::numeric,
    4
  )::double precision
WHERE "withholdValue" > 0 AND "preTaxValue" > 0;
