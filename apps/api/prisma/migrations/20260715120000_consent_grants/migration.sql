-- Consent grants: time-limited, scoped cross-tenant access a SUPER_ADMIN
-- requests from a merchant. Additive — a new table + two enums, no changes to
-- existing tables. Approval is via an emailed magic link (tokenHash = sha256
-- of the raw token, mirroring password_reset_tokens).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ConsentScope" AS ENUM ('DASHBOARD', 'INVOICES', 'RECEIPTS', 'INVENTORY', 'INVENTORY_EDIT', 'USERS_EDIT');

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
CREATE TABLE "consent_grants" (
  "id"              TEXT NOT NULL,
  "superAdminId"    TEXT NOT NULL,
  "merchantId"      TEXT NOT NULL,
  "scopes"          "ConsentScope"[] NOT NULL DEFAULT ARRAY[]::"ConsentScope"[],
  "status"          "ConsentStatus" NOT NULL DEFAULT 'PENDING',
  "proposedMinutes" INTEGER NOT NULL,
  "grantedMinutes"  INTEGER,
  "expiresAt"       TIMESTAMP(3),
  "tokenHash"       TEXT NOT NULL,
  "linkExpiresAt"   TIMESTAMP(3) NOT NULL,
  "decidedByUserId" TEXT,
  "decidedAt"       TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revokedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "consent_grants_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "consent_grants_tokenHash_key" ON "consent_grants"("tokenHash");
CREATE INDEX "consent_grants_merchantId_status_idx" ON "consent_grants"("merchantId", "status");
CREATE INDEX "consent_grants_superAdminId_status_idx" ON "consent_grants"("superAdminId", "status");

-- ---------------------------------------------------------------------------
-- 4. Foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
