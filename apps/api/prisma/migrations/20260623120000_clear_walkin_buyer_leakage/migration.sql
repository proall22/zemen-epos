-- Null out per-customer fields on every merchant's shared walk-in Buyer row.
-- Source: earlier versions of upsertByTin overwrote the row on each invoice,
-- so any time a cashier typed a phone/email/etc. for a walk-in it stuck and
-- leaked into subsequent walk-in prints.

BEGIN;

UPDATE "buyers"
SET
  "email"        = NULL,
  "phone"        = NULL,
  "vatNumber"    = NULL,
  "idType"       = NULL,
  "idNumber"     = NULL,
  "houseNumber"  = NULL,
  "region"       = NULL,
  "country"      = NULL,
  "zone"         = NULL,
  "kebele"       = NULL,
  "wereda"       = NULL,
  "city"         = NULL
WHERE "tin" = 'WALKIN';

COMMIT;
