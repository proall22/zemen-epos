CREATE TYPE "TaxCodeType" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'OTHER');

CREATE TABLE "tax_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "type" "TaxCodeType" NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_rules" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_codes_code_key" ON "tax_codes"("code");
CREATE INDEX "tax_codes_active_idx" ON "tax_codes"("active");
CREATE UNIQUE INDEX "system_rules_code_key" ON "system_rules"("code");
CREATE INDEX "system_rules_active_idx" ON "system_rules"("active");

ALTER TABLE "invoice_items" ADD COLUMN "taxRate" DOUBLE PRECISION;
ALTER TABLE "invoice_items" ADD COLUMN "taxType" "TaxCodeType";

INSERT INTO "tax_codes" ("id", "code", "name", "rate", "type", "description", "active", "updatedAt") VALUES
  ('tax_vat15', 'VAT15', 'Standard VAT', 15, 'STANDARD', 'Standard value added tax', true, CURRENT_TIMESTAMP),
  ('tax_vat0', 'VAT0', 'Zero-rated VAT', 0, 'ZERO_RATED', 'Taxable supply charged at zero percent', true, CURRENT_TIMESTAMP),
  ('tax_vatex', 'VATEX', 'VAT exempt', 0, 'EXEMPT', 'Supply exempt from VAT', true, CURRENT_TIMESTAMP),
  ('tax_vat10', 'VAT10', 'Legacy VAT 10%', 10, 'STANDARD', 'Retained for backward compatibility with existing catalogue items', true, CURRENT_TIMESTAMP);

INSERT INTO "system_rules" ("id", "code", "name", "value", "unit", "description", "active", "updatedAt") VALUES
  ('rule_withholding_supplier', 'WITHHOLDING_SUPPLIER', 'Supplier withholding', 3, 'percent', 'Withholding rate applied to qualifying supplier transactions', true, CURRENT_TIMESTAMP),
  ('rule_supply_goods', 'SUPPLY_GOODS_THRESHOLD', 'Goods', 20000, 'ETB', 'Supplier withholding threshold for goods', true, CURRENT_TIMESTAMP),
  ('rule_supply_services', 'SUPPLY_SERVICES_THRESHOLD', 'Services', 10000, 'ETB', 'Supplier withholding threshold for services', true, CURRENT_TIMESTAMP);

UPDATE "invoice_items" SET
  "taxRate" = CASE UPPER("taxCode") WHEN 'VAT15' THEN 15 WHEN 'VAT' THEN 15 WHEN 'VAT10' THEN 10 ELSE 0 END,
  "taxType" = CASE UPPER("taxCode") WHEN 'VAT0' THEN 'ZERO_RATED'::"TaxCodeType" WHEN 'VATEX' THEN 'EXEMPT'::"TaxCodeType" ELSE 'STANDARD'::"TaxCodeType" END;
