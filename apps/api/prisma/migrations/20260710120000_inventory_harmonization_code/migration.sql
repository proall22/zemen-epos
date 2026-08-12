-- MoR Harmonized-System code, per-item. Required at invoice-line time when
-- ExciseTaxValue > 0 on that line; nullable here so most catalog rows can
-- stay untouched.
ALTER TABLE "inventory_items"
  ADD COLUMN "harmonizationCode" TEXT;
