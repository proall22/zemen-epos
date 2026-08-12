-- SUPER_ADMIN-editable languages + per-string translation overrides.
-- Overrides merge on top of the base JSON bundle shipped in
-- `@eirms/i18n-strings` at the `/i18n/bundle/:lang` boundary.

CREATE TABLE "languages" (
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "nativeName" TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "ordering"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "translation_overrides" (
  "id"        TEXT NOT NULL,
  "language"  TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "translation_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "translation_overrides_language_key_key"
  ON "translation_overrides"("language", "key");
CREATE INDEX "translation_overrides_language_idx"
  ON "translation_overrides"("language");
ALTER TABLE "translation_overrides"
  ADD CONSTRAINT "translation_overrides_language_fkey"
  FOREIGN KEY ("language") REFERENCES "languages"("code")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the two languages the platform ships with.
INSERT INTO "languages" ("code", "name", "nativeName", "active", "ordering", "updatedAt")
VALUES
  ('en', 'English', 'English',  true, 10, CURRENT_TIMESTAMP),
  ('am', 'Amharic', 'አማርኛ',   true, 20, CURRENT_TIMESTAMP);
