-- Notification-language plumbing. Merchant.defaultLanguage supplies the
-- fallback for buyer emails/SMS; Buyer.language wins over it when set.
ALTER TABLE "merchants"
  ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "buyers"
  ADD COLUMN "language" TEXT;
