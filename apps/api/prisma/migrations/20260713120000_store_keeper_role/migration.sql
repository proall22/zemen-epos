-- Add STORE_KEEPER to the UserRole enum.
--
-- A merchant-scoped operational role for warehouse / stock staff: manages
-- inventory, stores (incl. transfers), purchases, vendors, and write-offs,
-- plus read-only branch access to switch branches. It cannot register sales
-- (no invoice/receipt), manage buyers, or administer the tenant.
--
-- Real-data-safe: pure enum extension. Existing rows untouched.
ALTER TYPE "UserRole" ADD VALUE 'STORE_KEEPER';
