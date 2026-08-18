CREATE TYPE "AuthChallengeType" AS ENUM ('EMAIL_VERIFICATION', 'LOGIN_EMAIL', 'LOGIN_PHONE');

ALTER TABLE "users"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Existing accounts predate mandatory verification. Preserve their access;
-- only accounts created after this migration begin unverified.
UPDATE "users" SET "emailVerifiedAt" = COALESCE("lastLoginAt", "createdAt");

CREATE TABLE "merchant_legal_documents" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_challenges" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AuthChallengeType" NOT NULL,
  "otpHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_legal_documents_storageKey_key" ON "merchant_legal_documents"("storageKey");
CREATE INDEX "merchant_legal_documents_merchantId_idx" ON "merchant_legal_documents"("merchantId");
CREATE INDEX "auth_challenges_userId_type_consumedAt_createdAt_idx" ON "auth_challenges"("userId", "type", "consumedAt", "createdAt");
CREATE INDEX "auth_challenges_expiresAt_idx" ON "auth_challenges"("expiresAt");
ALTER TABLE "merchant_legal_documents" ADD CONSTRAINT "merchant_legal_documents_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
