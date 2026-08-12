-- Preferred UI language on the user. BCP-47 short code — 'en' or 'am' today,
-- extensible without a schema change. Defaults to 'en' so the platform's
-- existing behavior is unchanged.
ALTER TABLE "users"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
