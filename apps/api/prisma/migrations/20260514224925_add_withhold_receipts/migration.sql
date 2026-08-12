-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('SALES', 'WITHHOLD');

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "kind" "ReceiptKind" NOT NULL DEFAULT 'SALES',
ADD COLUMN     "withholdAmount" DOUBLE PRECISION,
ADD COLUMN     "withholdPreTax" DOUBLE PRECISION,
ADD COLUMN     "withholdRate" DOUBLE PRECISION,
ADD COLUMN     "withholdType" TEXT,
ALTER COLUMN "collectedAmount" SET DEFAULT 0,
ALTER COLUMN "modeOfPayment" DROP NOT NULL,
ALTER COLUMN "collectorName" DROP NOT NULL;
