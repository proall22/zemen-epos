-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptType" TEXT NOT NULL DEFAULT 'Sales Receipts',
    "receiptDate" TEXT NOT NULL,
    "receiptCounter" INTEGER NOT NULL,
    "manualReceiptNumber" TEXT,
    "reason" TEXT,
    "collectedAmount" DOUBLE PRECISION NOT NULL,
    "receiptCurrency" TEXT NOT NULL DEFAULT 'ETB',
    "exchangeRate" DOUBLE PRECISION,
    "modeOfPayment" TEXT NOT NULL,
    "collectorName" TEXT NOT NULL,
    "paymentServiceProvider" TEXT,
    "otherPaymentServiceProviderName" TEXT,
    "chequeNumber" TEXT,
    "cpoNumber" TEXT,
    "documentNumber" TEXT,
    "accountNumber" TEXT,
    "transactionNumber" TEXT,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_invoices" (
    "id" TEXT NOT NULL,
    "paymentCoverage" TEXT NOT NULL,
    "invoicePaidAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION,
    "remainingAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "receipt_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "receipts_createdAt_idx" ON "receipts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_invoices_receiptId_invoiceId_key" ON "receipt_invoices"("receiptId", "invoiceId");

-- AddForeignKey
ALTER TABLE "receipt_invoices" ADD CONSTRAINT "receipt_invoices_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_invoices" ADD CONSTRAINT "receipt_invoices_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
