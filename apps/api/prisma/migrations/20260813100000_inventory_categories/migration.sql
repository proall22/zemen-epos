CREATE TABLE "inventory_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT NOT NULL,
    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_items" ADD COLUMN "categoryId" TEXT;
CREATE UNIQUE INDEX "inventory_categories_merchantId_name_key" ON "inventory_categories"("merchantId", "name");
CREATE INDEX "inventory_categories_merchantId_active_idx" ON "inventory_categories"("merchantId", "active");
CREATE INDEX "inventory_items_categoryId_idx" ON "inventory_items"("categoryId");
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
