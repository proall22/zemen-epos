-- Per-establishment trade name for a branch (may differ from the merchant's
-- trade name). Nullable; optional in the onboarding wizard.
ALTER TABLE "branches" ADD COLUMN "tradeName" TEXT;
