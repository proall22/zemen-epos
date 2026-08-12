-- Phase G: merchant self-signup + approval gate.
--
-- approvedAt: null while a merchant is awaiting super-admin review; set on
-- the first activation. approvedBy: the super-admin who approved.
--
-- Existing rows are pre-approved (they were created by the back-office via
-- the seed or admin UI, not via the new public signup endpoint) — set
-- approvedAt = createdAt so they stay un-pending after this migration.
--
-- The active column default is also flipping from true to false so future
-- signups land "pending" by default. Existing rows keep their current
-- active value (the ALTER COLUMN SET DEFAULT only affects new inserts).
-- Real-data-safe: additive nullable columns, no row touched destructively.

ALTER TABLE "merchants" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "merchants" ADD COLUMN "approvedBy" TEXT;

-- Backfill: every existing merchant is "approved" — set approvedAt to their
-- createdAt timestamp so the UI doesn't suddenly mark them as pending.
UPDATE "merchants" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;

-- Flip the default for new inserts. Existing rows keep their explicit value.
ALTER TABLE "merchants" ALTER COLUMN "active" SET DEFAULT false;
