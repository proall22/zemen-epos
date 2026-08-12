-- Guarantee every branch has exactly one store flagged as its sales floor.
--
-- The flag was a preference, not a constraint: StoreResolverService orders by
-- isSalesFloor -> isDefault -> createdAt, so a branch with nothing flagged
-- silently sold out of whatever store sorted first — a back room or a cold
-- store. That is invisible in the UI, and it is how stock ends up negative in
-- a store nobody sells from.
--
-- Picks the default store, else the oldest active one. Read-only for branches
-- that already have a flag.
UPDATE "stores" s
SET "isSalesFloor" = true
WHERE s."id" IN (
  SELECT DISTINCT ON (b."id") st."id"
  FROM "branches" b
  JOIN "stores" st ON st."branchId" = b."id" AND st."active"
  WHERE NOT EXISTS (
    SELECT 1 FROM "stores" f
    WHERE f."branchId" = b."id" AND f."active" AND f."isSalesFloor"
  )
  ORDER BY b."id", st."isDefault" DESC, st."createdAt" ASC
);

-- Demote any extras so the "exactly one" half holds too: keep the oldest
-- flagged store per branch, clear the rest.
UPDATE "stores" s
SET "isSalesFloor" = false
WHERE s."isSalesFloor"
  AND s."id" <> (
    SELECT k."id" FROM "stores" k
    WHERE k."branchId" = s."branchId" AND k."active" AND k."isSalesFloor"
    ORDER BY k."isDefault" DESC, k."createdAt" ASC
    LIMIT 1
  );
