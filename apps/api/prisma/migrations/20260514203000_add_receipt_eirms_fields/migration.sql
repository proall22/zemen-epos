-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "eirmsId" INTEGER,
ADD COLUMN     "eirmsStatus" TEXT,
ADD COLUMN     "rrn" TEXT,
ADD COLUMN     "signedQR" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipts_rrn_key" ON "receipts"("rrn");
