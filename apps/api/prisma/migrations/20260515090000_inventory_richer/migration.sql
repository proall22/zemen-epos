-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "sku" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");
