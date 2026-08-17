-- A branch may be created before MoR assigns a system number. PostgreSQL's
-- ordinary unique constraint treats repeated empty strings as duplicates, so
-- enforce uniqueness only once a real non-blank value exists.
DROP INDEX IF EXISTS "branches_merchantId_systemNumber_key";

CREATE UNIQUE INDEX "branches_merchantId_systemNumber_present_key"
ON "branches"("merchantId", "systemNumber")
WHERE length(trim("systemNumber")) > 0;
