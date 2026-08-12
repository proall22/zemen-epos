-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('SALE', 'ADJUSTMENT', 'RESTOCK', 'SUPERSEDE');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockQuantity" DOUBLE PRECISION,
ADD COLUMN     "lowStockThreshold" DOUBLE PRECISION,
ADD COLUMN     "predecessorId" TEXT;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "note" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_inventoryItemId_createdAt_idx" ON "stock_movements"("inventoryItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
