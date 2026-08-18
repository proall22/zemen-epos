CREATE TYPE "LegalDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "merchant_legal_documents"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "status" "LegalDocumentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- Existing legal documents were produced only by self-signup. Associate each
-- with the merchant's earliest owner account without touching the file bytes.
UPDATE "merchant_legal_documents" d
SET "userId" = (
  SELECT u.id
  FROM "users" u
  WHERE u."merchantId" = d."merchantId" AND u.role = 'MERCHANT_ADMIN'
  ORDER BY u."createdAt" ASC
  LIMIT 1
);

-- Preserve decisions made through the pre-document-review merchant queue.
UPDATE "merchant_legal_documents" d
SET
  "status" = CASE
    WHEN m."rejectedAt" IS NOT NULL THEN 'REJECTED'::"LegalDocumentStatus"
    WHEN m."approvedAt" IS NOT NULL THEN 'APPROVED'::"LegalDocumentStatus"
    ELSE 'PENDING'::"LegalDocumentStatus"
  END,
  "reviewedBy" = COALESCE(m."rejectedBy", m."approvedBy"),
  "reviewedAt" = COALESCE(m."rejectedAt", m."approvedAt"),
  "rejectionReason" = m."rejectionReason"
FROM "merchants" m
WHERE m.id = d."merchantId";

ALTER TABLE "merchant_legal_documents" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "merchant_legal_documents"
  ADD CONSTRAINT "merchant_legal_documents_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchant_legal_documents"
  ADD CONSTRAINT "merchant_legal_documents_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "merchant_legal_documents_userId_idx" ON "merchant_legal_documents"("userId");
CREATE INDEX "merchant_legal_documents_status_createdAt_idx" ON "merchant_legal_documents"("status", "createdAt");
