-- Refresh tokens table. Opaque random tokens, SHA-256 hashed at rest.
-- Issued on login + every successful refresh; revoked on logout, on rotation,
-- and on reuse-detection (presenting a revoked-but-not-expired token).
CREATE TABLE "refresh_tokens" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "tokenHash"    TEXT NOT NULL,
    "issuedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "revokedAt"    TIMESTAMP(3),
    "replacedById" TEXT,
    "ip"           TEXT,
    "userAgent"    TEXT,

    CONSTRAINT "refresh_tokens_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key"          ON "refresh_tokens"("tokenHash");
CREATE        INDEX "refresh_tokens_userId_revokedAt_idx"   ON "refresh_tokens"("userId", "revokedAt");
CREATE        INDEX "refresh_tokens_expiresAt_idx"          ON "refresh_tokens"("expiresAt");
