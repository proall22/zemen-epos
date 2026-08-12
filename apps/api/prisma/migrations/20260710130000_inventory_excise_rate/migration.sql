-- Ad-valorem excise rate (percent of unit price). MoR pairs excise with
-- HarmonizationCode against its own registry; storing the rate here lets the
-- register call compute the correct per-line excise (qty * unitPrice * rate /
-- 100) without the cashier having to type it. Nullable so non-excisable
-- goods (the common case) skip it.
ALTER TABLE "inventory_items"
  ADD COLUMN "exciseRate" DOUBLE PRECISION;
