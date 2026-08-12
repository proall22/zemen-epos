-- Scheduled reports with delta semantics.

-- invoice_cancellations tenancy ----------------------------------------------

ALTER TABLE "invoice_cancellations" ADD COLUMN "merchantId" TEXT;
ALTER TABLE "invoice_cancellations" ADD COLUMN "branchId" TEXT;

UPDATE "invoice_cancellations" c
SET "merchantId" = i."merchantId", "branchId" = i."branchId"
FROM "invoices" i
WHERE i."id" = c."invoiceId";

ALTER TABLE "invoice_cancellations"
  ADD CONSTRAINT "invoice_cancellations_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_cancellations"
  ADD CONSTRAINT "invoice_cancellations_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoice_cancellations_merchantId_createdAt_idx"
  ON "invoice_cancellations" ("merchantId", "createdAt");
CREATE INDEX "invoice_cancellations_merchantId_branchId_createdAt_idx"
  ON "invoice_cancellations" ("merchantId", "branchId", "createdAt");

-- Merchant-wide windows: the existing composites lead with
-- (merchantId, branchId, ...), unusable as a range boundary without a branch.

CREATE INDEX "invoices_merchantId_createdAt_idx"
  ON "invoices" ("merchantId", "createdAt");
CREATE INDEX "receipts_merchantId_createdAt_idx"
  ON "receipts" ("merchantId", "createdAt");
CREATE INDEX "stock_movements_merchantId_createdAt_idx"
  ON "stock_movements" ("merchantId", "createdAt");

-- subscriptions + runs ---------------------------------------------------------

CREATE TYPE "ReportScheduleKind" AS ENUM ('INTERVAL_HOURS', 'DAILY_AT');
CREATE TYPE "ReportBranchScope" AS ENUM ('SINGLE_BRANCH', 'MERCHANT_WIDE');
CREATE TYPE "ReportSection" AS ENUM ('SALES', 'INVENTORY');
CREATE TYPE "ReportRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED_EMPTY', 'FAILED');

CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scheduleKind" "ReportScheduleKind" NOT NULL,
    "intervalHours" INTEGER,
    "dailyAtMinute" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "branchScope" "ReportBranchScope" NOT NULL DEFAULT 'MERCHANT_WIDE',
    "branchId" TEXT,
    "sections" "ReportSection"[],
    "recipients" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "deliveredThrough" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- Enforced here as well as in the DTO: the DB is the layer a future code path
-- cannot bypass.
ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "scheduled_reports_schedule_kind_check" CHECK (
    ("scheduleKind" = 'INTERVAL_HOURS'
      AND "intervalHours" IS NOT NULL AND "intervalHours" BETWEEN 1 AND 24
      AND "dailyAtMinute" IS NULL)
    OR
    ("scheduleKind" = 'DAILY_AT'
      AND "dailyAtMinute" IS NOT NULL AND "dailyAtMinute" BETWEEN 0 AND 1439
      AND "intervalHours" IS NULL)
  );

ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "scheduled_reports_branch_scope_check" CHECK (
    ("branchScope" = 'SINGLE_BRANCH' AND "branchId" IS NOT NULL)
    OR
    ("branchScope" = 'MERCHANT_WIDE' AND "branchId" IS NULL)
  );

CREATE TABLE "scheduled_report_runs" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" "ReportRunStatus" NOT NULL DEFAULT 'PENDING',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "cancellationCount" INTEGER NOT NULL DEFAULT 0,
    "receiptCount" INTEGER NOT NULL DEFAULT 0,
    "movementCount" INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_reports_active_nextRunAt_idx"
  ON "scheduled_reports" ("active", "nextRunAt");
CREATE INDEX "scheduled_reports_merchantId_createdAt_idx"
  ON "scheduled_reports" ("merchantId", "createdAt");

CREATE INDEX "scheduled_report_runs_reportId_scheduledFor_idx"
  ON "scheduled_report_runs" ("reportId", "scheduledFor");
CREATE INDEX "scheduled_report_runs_merchantId_createdAt_idx"
  ON "scheduled_report_runs" ("merchantId", "createdAt");
CREATE INDEX "scheduled_report_runs_status_idx"
  ON "scheduled_report_runs" ("status");

ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "scheduled_reports_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_reports"
  ADD CONSTRAINT "scheduled_reports_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_report_runs"
  ADD CONSTRAINT "scheduled_report_runs_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "scheduled_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_report_runs"
  ADD CONSTRAINT "scheduled_report_runs_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "merchants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
