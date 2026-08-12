-- Merchant-scoped lookup of harmonization (HS) codes and their excise rates.
CREATE TABLE "harmonization_codes" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "exciseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harmonization_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "harmonization_codes_merchantId_idx" ON "harmonization_codes"("merchantId");

CREATE UNIQUE INDEX "harmonization_codes_merchantId_code_key" ON "harmonization_codes"("merchantId", "code");

ALTER TABLE "harmonization_codes" ADD CONSTRAINT "harmonization_codes_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the lookup table from harmonization codes already typed onto items,
-- so existing excisable stock keeps a matching reference row.
INSERT INTO "harmonization_codes" ("id", "merchantId", "code", "exciseRate", "updatedAt")
SELECT
    gen_random_uuid()::text,
    i."merchantId",
    trim(i."harmonizationCode"),
    COALESCE(MAX(i."exciseRate"), 0),
    CURRENT_TIMESTAMP
FROM "inventory_items" i
WHERE i."harmonizationCode" IS NOT NULL
  AND trim(i."harmonizationCode") <> ''
GROUP BY i."merchantId", trim(i."harmonizationCode");
