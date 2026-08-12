-- Add branch-scoped tax identity columns used by the INSA certificate request
-- form and the outgoing withhold receipt payload. All nullable so existing
-- branches keep parsing until an operator fills them in during cert onboarding.
ALTER TABLE "branches"
  ADD COLUMN "subTin"    TEXT,
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "country"   TEXT;

-- Per-branch INSA certificate onboarding state. The RSA private key and the
-- issued PEM live in Vault; this table keeps the non-secret bits (CSR, DOCX
-- form fields, status timestamps, display fields extracted from the leaf).
CREATE TABLE "branch_certificates" (
  "id"              TEXT      NOT NULL,
  "branchId"        TEXT      NOT NULL,
  "csrPem"          TEXT,
  "contactFullName" TEXT,
  "contactJobTitle" TEXT,
  "contactEmail"    TEXT,
  "contactPhone"    TEXT,
  "reason"          TEXT,
  "submittedAt"     TIMESTAMP(3),
  "issuedAt"        TIMESTAMP(3),
  "certSerial"      TEXT,
  "certSubjectCn"   TEXT,
  "certNotBefore"   TIMESTAMP(3),
  "certNotAfter"    TIMESTAMP(3),
  "usedByo"         BOOLEAN   NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "branch_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_certificates_branchId_key"
  ON "branch_certificates"("branchId");

ALTER TABLE "branch_certificates"
  ADD CONSTRAINT "branch_certificates_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
