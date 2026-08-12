-- Merchant rejection: when super-admin reviews a pending signup and decides
-- not to approve. Distinct from "approved-then-disabled" — a rejected
-- merchant never got past the front door. The owner can still log in (so
-- they see the rejection reason); everything operational stays blocked, same
-- as pending. A super-admin can later clear rejectedAt and approve.
--
-- Real-data-safe: all-nullable additive columns; existing rows untouched.
ALTER TABLE "merchants" ADD COLUMN "rejectedAt"      TIMESTAMP(3);
ALTER TABLE "merchants" ADD COLUMN "rejectedBy"      TEXT;
ALTER TABLE "merchants" ADD COLUMN "rejectionReason" TEXT;
