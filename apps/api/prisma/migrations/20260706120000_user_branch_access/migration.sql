-- Multi-branch access grant. Rows here list every branch a
-- CASHIER/ACCOUNTANT/SUPPORT user may switch between; the pinned default
-- (users.branchId) is a hint for "first branch selected on login".
-- MERCHANT_ADMIN derives access implicitly from role + merchantId and does
-- not carry rows here.
CREATE TABLE "user_branches" (
  "userId"    TEXT      NOT NULL,
  "branchId"  TEXT      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_branches_pkey" PRIMARY KEY ("userId", "branchId")
);

CREATE INDEX "user_branches_branchId_idx" ON "user_branches"("branchId");

ALTER TABLE "user_branches"
  ADD CONSTRAINT "user_branches_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_branches"
  ADD CONSTRAINT "user_branches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing user with a pinned branchId gets a matching
-- UserBranch row so their access is preserved after the switcher goes live.
-- ON CONFLICT DO NOTHING covers the (unlikely) case a row exists already.
INSERT INTO "user_branches" ("userId", "branchId", "createdAt")
SELECT id, "branchId", NOW()
FROM "users"
WHERE "branchId" IS NOT NULL
ON CONFLICT ("userId", "branchId") DO NOTHING;
