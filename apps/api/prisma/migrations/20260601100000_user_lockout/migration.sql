-- Account lockout state. Each failed login increments failedLoginCount; on
-- a successful login the counter resets. When it crosses the threshold,
-- lockedUntil is stamped and the account is rejected until that time passes.
-- Real-data-safe: pure additive columns with sensible defaults.
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil"      TIMESTAMP(3);
