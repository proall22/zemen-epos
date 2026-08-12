-- Add supplier identity columns to `receipts` for WITHHOLD receipts.
-- All nullable: sales receipts leave them null, and older withhold rows
-- (issued before this migration) also stay null.

ALTER TABLE "receipts"
  ADD COLUMN "supplierLegalName" TEXT,
  ADD COLUMN "supplierTin" TEXT,
  ADD COLUMN "supplierSubTin" TEXT,
  ADD COLUMN "supplierVatNumber" TEXT,
  ADD COLUMN "supplierPhone" TEXT,
  ADD COLUMN "supplierEmail" TEXT,
  ADD COLUMN "supplierCity" TEXT,
  ADD COLUMN "supplierZone" TEXT,
  ADD COLUMN "supplierWereda" TEXT,
  ADD COLUMN "supplierKebele" TEXT;
