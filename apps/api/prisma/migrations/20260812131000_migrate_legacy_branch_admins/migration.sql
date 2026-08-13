UPDATE "users"
SET "role" = 'BRANCH_ADMIN'
WHERE "role" = 'ADMIN'
  AND "merchantId" IS NOT NULL
  AND "branchId" IS NOT NULL;

INSERT INTO "user_branches" ("userId", "branchId", "createdAt")
SELECT "id", "branchId", NOW()
FROM "users"
WHERE "role" = 'BRANCH_ADMIN' AND "branchId" IS NOT NULL
ON CONFLICT ("userId", "branchId") DO NOTHING;
