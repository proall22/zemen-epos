-- Block out-of-stock sales by default. Existing branches are flipped too:
-- the old ALLOW_NEGATIVE default meant the "Out of stock" badge showed while
-- the sale went through anyway and drove on-hand negative.
--
-- Safe to run after 20260719100000, which materialised every quantity into
-- inventory_stocks — the gate reads those rows, so it is not turning on
-- against empty data.
ALTER TABLE "branches" ALTER COLUMN "stockPolicy" SET DEFAULT 'BLOCK_ON_EMPTY';
UPDATE "branches" SET "stockPolicy" = 'BLOCK_ON_EMPTY';

-- Correlates the two halves of a transfer so the movement log can show
-- "Back room → Sales floor" as one row. Not backfilled: pairing historical
-- rows by timestamp+delta can mismatch, and a wrong pairing in a stock log is
-- worse than an unpaired one.
ALTER TABLE "stock_movements" ADD COLUMN "transferId" TEXT;
CREATE INDEX "stock_movements_transferId_idx" ON "stock_movements"("transferId");
CREATE INDEX "stock_movements_merchantId_branchId_createdAt_idx"
  ON "stock_movements"("merchantId", "branchId", "createdAt");
