import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ScheduledReport, ScheduledReportRun } from '@prisma/client';

import { computeNextRunAt } from '../common/local-time';
import { PrismaService } from '../prisma/prisma.service';
import { reportsConfig } from './reports.config';
import type { ReportWindow } from './reports.types';

export interface ClaimedReport {
  id: string;
  merchantId: string;
}

@Injectable()
export class ReportsRunService {
  private readonly logger = new Logger(ReportsRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(reportsConfig.KEY)
    private readonly config: ConfigType<typeof reportsConfig>,
  ) {}

  /**
   * Claim due subscriptions in one statement. FOR UPDATE SKIP LOCKED plus the
   * lease is what makes two replicas ticking in the same second claim disjoint
   * sets — the claim is the serialization point, not the tick.
   */
  async claimDue(workerId: string, now = new Date()): Promise<ClaimedReport[]> {
    const rows = await this.prisma.$queryRaw<ClaimedReport[]>`
      UPDATE "scheduled_reports"
      SET "lockedAt" = ${now}, "lockedBy" = ${workerId}
      WHERE "id" IN (
        SELECT "id" FROM "scheduled_reports"
        WHERE "active"
          AND "nextRunAt" <= ${now}
          AND ("lockedAt" IS NULL OR "lockedAt" < ${new Date(
            now.getTime() - this.config.leaseMinutes * 60_000,
          )})
        ORDER BY "nextRunAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.config.claimBatch}
      )
      RETURNING "id", "merchantId"
    `;
    return rows;
  }

  /**
   * The window end.
   *
   * Never `now()`: Postgres now() is transaction-start time, so a transaction
   * that opened before the cutoff but commits after this read produces a row
   * that lands in no window at all — a silent, permanent gap. Trailing real
   * time by the commit lag costs freshness and buys correctness.
   */
  cutoffFor(report: ScheduledReport, now = new Date()): Date {
    const lagged = new Date(now.getTime() - this.config.commitLagMs);
    const scheduled = report.nextRunAt;
    return lagged < scheduled ? lagged : scheduled;
  }

  /** null when the window would be empty or inverted — nothing to report. */
  windowFor(report: ScheduledReport, now = new Date()): ReportWindow | null {
    const end = this.cutoffFor(report, now);
    const start = report.deliveredThrough;
    return end.getTime() > start.getTime() ? { start, end } : null;
  }

  async openRun(
    report: ScheduledReport,
    window: ReportWindow,
  ): Promise<ScheduledReportRun> {
    return this.prisma.scheduledReportRun.create({
      data: {
        reportId: report.id,
        merchantId: report.merchantId,
        status: 'PROCESSING',
        windowStart: window.start,
        windowEnd: window.end,
        scheduledFor: report.nextRunAt,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Empty window: record the span and leave `deliveredThrough` alone, so the
   * next window reopens at the same anchor and swallows this one. That is what
   * keeps the timeline gapless with no carry-forward bookkeeping.
   */
  async markSkipped(runId: string, reportId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.scheduledReportRun.update({
        where: { id: runId },
        data: { status: 'SKIPPED_EMPTY', completedAt: new Date() },
      }),
      this.prisma.scheduledReport.update({
        where: { id: reportId },
        data: { lastRunAt: new Date(), consecutiveFailures: 0 },
      }),
    ]);
  }

  /** Records the provider id the instant the send returns, so a crash before
   *  the watermark advance is recoverable without mailing twice. */
  async recordSent(
    runId: string,
    providerMessageId: string,
    counts: {
      invoiceCount: number;
      cancellationCount: number;
      receiptCount: number;
      movementCount: number;
      recipientCount: number;
    },
  ): Promise<void> {
    await this.prisma.scheduledReportRun.update({
      where: { id: runId },
      data: { providerMessageId, ...counts },
    });
  }

  /**
   * Advance the watermark. Runs AFTER a confirmed send: a crash between the
   * two leaves a duplicate report, which is visible and self-correcting,
   * whereas advancing first leaves a silent permanent gap.
   */
  async completeSent(
    runId: string,
    report: ScheduledReport,
    window: ReportWindow,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.scheduledReportRun.update({
        where: { id: runId },
        data: { status: 'SENT', completedAt: new Date() },
      }),
      this.prisma.scheduledReport.update({
        where: { id: report.id },
        data: {
          deliveredThrough: window.end,
          lastRunAt: new Date(),
          consecutiveFailures: 0,
        },
      }),
    ]);
  }

  async markFailed(
    runId: string,
    reportId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.scheduledReportRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: message.slice(0, 500),
          attempt: { increment: 1 },
        },
      }),
      this.prisma.scheduledReport.update({
        where: { id: reportId },
        data: {
          lastRunAt: new Date(),
          consecutiveFailures: { increment: 1 },
        },
      }),
    ]);
  }

  /** Re-arm and release the lease. Computed from the SCHEDULED time, not from
   *  completion, so run latency can't compound into drift. */
  async rearm(report: ScheduledReport): Promise<void> {
    const base =
      report.nextRunAt.getTime() > Date.now() ? report.nextRunAt : new Date();
    await this.prisma.scheduledReport.update({
      where: { id: report.id },
      data: {
        nextRunAt: computeNextRunAt(
          {
            scheduleKind: report.scheduleKind,
            intervalHours: report.intervalHours,
            dailyAtMinute: report.dailyAtMinute,
            timezone: report.timezone,
          },
          base,
        ),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /** Spans skipped as empty since the watermark, for the "no activity" line. */
  async skippedSpanSince(
    reportId: string,
    since: Date,
    before: Date,
  ): Promise<{ start: Date; end: Date } | null> {
    const rows = await this.prisma.scheduledReportRun.findMany({
      where: {
        reportId,
        status: 'SKIPPED_EMPTY',
        windowStart: { gte: since },
        windowEnd: { lte: before },
      },
      orderBy: { windowStart: 'asc' },
      select: { windowStart: true, windowEnd: true },
    });
    if (rows.length === 0) return null;
    return {
      start: rows[0].windowStart,
      end: rows[rows.length - 1].windowEnd,
    };
  }

  async autoDeactivate(reportId: string, failures: number): Promise<void> {
    this.logger.warn(
      `Report ${reportId} deactivated after ${failures} consecutive failures.`,
    );
    await this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: { active: false },
    });
  }
}
