-- CreateEnum
CREATE TYPE "AuditDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "direction" "AuditDirection" NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "method" TEXT,
    "path" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT,
    "errorMessage" TEXT,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "durationMs" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_direction_idx" ON "audit_logs"("direction");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actorEmail_idx" ON "audit_logs"("actorEmail");
