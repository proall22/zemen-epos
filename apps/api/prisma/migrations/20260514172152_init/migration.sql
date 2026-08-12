-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ACCEPTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "buyers" (
    "id" TEXT NOT NULL,
    "tin" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "vatNumber" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "houseNumber" TEXT,
    "region" TEXT,
    "country" TEXT,
    "zone" TEXT,
    "kebele" TEXT,
    "wereda" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxCode" TEXT NOT NULL DEFAULT 'VAT15',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "irn" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentDate" TEXT NOT NULL,
    "ackDate" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ACCEPTED',
    "eirmsStatus" TEXT NOT NULL,
    "signedQR" TEXT NOT NULL,
    "signedInvoice" TEXT NOT NULL,
    "preTaxValue" DOUBLE PRECISION NOT NULL,
    "taxValue" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "withholdValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "transactionType" TEXT NOT NULL,
    "natureOfSupplies" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "paymentTerm" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL,
    "salespersonName" TEXT NOT NULL,
    "invoiceCounter" INTEGER NOT NULL,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buyerId" TEXT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCode" TEXT NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "preTaxValue" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "inventoryItemId" TEXT,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_cancellations" (
    "id" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "remark" TEXT,
    "ackDate" TEXT,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "invoice_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buyers_tin_key" ON "buyers"("tin");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_irn_key" ON "invoices"("irn");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_cancellations_invoiceId_key" ON "invoice_cancellations"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_cancellations" ADD CONSTRAINT "invoice_cancellations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
