ALTER TABLE "branches"
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedBy" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedBy" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- Existing branches of live/previously-approved merchants predate this
-- workflow and remain usable. Branches belonging to pending or rejected
-- signups deliberately stay pending for the merchant approval decision.
UPDATE "branches" AS b
SET "approvedAt" = b."createdAt"
FROM "merchants" AS m
WHERE b."merchantId" = m."id"
  AND b."approvedAt" IS NULL
  AND (m."approvedAt" IS NOT NULL OR m."active" = TRUE);
