-- Adds a local-only `paymentClassification` column on `receipts`.
--
-- Background: the sales-receipt form captures two distinct things — the
-- settlement classification (CASH | ADVANCE | CREDIT) and the payment
-- instrument (CASH | CHEQUE | CPO | SWIFT | CARD | WIRE | BANK_TRANSFER |
-- LETTER_OF_CREDIT). MoR's `TransactionDetails.ModeOfPayment` only accepts the
-- instrument; the classification was being sent there by mistake, which MoR
-- rejected for ADVANCE/CREDIT. The instrument now goes to MoR, and the
-- classification is kept locally in this column for our records / printouts.
--
-- Additive + real-data-safe: nullable column, no backfill needed (existing
-- rows simply have no classification recorded).

BEGIN;

ALTER TABLE "receipts" ADD COLUMN "paymentClassification" TEXT;

COMMIT;
