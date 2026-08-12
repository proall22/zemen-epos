ALTER TABLE "invoices" ADD COLUMN "relatedIrn" TEXT;

-- Backfill from the existing rawRequest JSON for every CRE/DEB row.
-- rawRequest.ReferenceDetails.RelatedDocument is the IRN of the invoice
-- the memo amends. Cast NULL / non-string JSON values to NULL cleanly.
UPDATE "invoices"
SET "relatedIrn" = NULLIF(
  ("rawRequest" -> 'ReferenceDetails' ->> 'RelatedDocument'),
  ''
)
WHERE "documentType" IN ('CRE', 'DEB');

CREATE INDEX "invoices_relatedIrn_idx" ON "invoices" ("relatedIrn");
