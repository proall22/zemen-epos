import { randomUUID } from 'node:crypto';

import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { ScheduledReport } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { EmailRenderer } from '../notifications/email-renderer';
import { ResendClient } from '../notifications/resend.client';
import { PrismaService } from '../prisma/prisma.service';
import { csvFilename, inventoryCsv, salesCsv } from './report-csv';
import { formatWindow, reportRows, reportSubject } from './report-email';
import { ReportsAggregationService } from './reports-aggregation.service';
import { reportsConfig } from './reports.config';
import { REPORTS_QUEUE, type ReportsJob } from './reports.constants';
import { ReportsRunService } from './reports-run.service';
import type { ReportWindow } from './reports.types';

const MAX_CSV_ROWS = 20_000;
const FAILURES_BEFORE_DEACTIVATE = 3;

@Processor(REPORTS_QUEUE)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);
  private readonly workerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: ReportsRunService,
    private readonly aggregation: ReportsAggregationService,
    private readonly renderer: EmailRenderer,
    private readonly resend: ResendClient,
    @InjectQueue(REPORTS_QUEUE) private readonly queue: Queue,
    @Inject(reportsConfig.KEY)
    private readonly config: ConfigType<typeof reportsConfig>,
  ) {
    super();
  }

  async process(job: Job<ReportsJob>): Promise<void> {
    if (job.data.kind === 'tick') return this.tick();
    return this.runOne(job.data.runId);
  }

  private async tick(): Promise<void> {
    const claimed = await this.runs.claimDue(this.workerId);
    for (const { id } of claimed) {
      await this.queue.add(
        'run',
        { kind: 'run', runId: id } satisfies ReportsJob,
        { removeOnComplete: 200, removeOnFail: 200 },
      );
    }
  }

  /** `runId` here is the SUBSCRIPTION id — the run row is opened inside, once
   *  the window is known, so a retry re-sends the same window. */
  private async runOne(reportId: string): Promise<void> {
    const report = await this.prisma.scheduledReport.findUnique({
      where: { id: reportId },
    });
    if (!report || !report.active) return;

    const window = this.runs.windowFor(report);
    if (!window) {
      await this.runs.rearm(report);
      return;
    }

    const run = await this.runs.openRun(report, window);

    try {
      const payload = await this.aggregation.build(
        { merchantId: report.merchantId, branchId: report.branchId },
        window,
        report.sections,
      );

      if (payload.empty) {
        await this.runs.markSkipped(run.id, report.id);
        await this.runs.rearm(report);
        return;
      }

      const providerId = await this.deliver(report, window, payload, run.id);
      await this.runs.recordSent(run.id, providerId, {
        invoiceCount: payload.counts.invoices,
        cancellationCount: payload.counts.cancellations,
        receiptCount: payload.counts.receipts,
        movementCount: payload.counts.movements,
        recipientCount: report.recipients.length,
      });
      await this.runs.completeSent(run.id, report, window);
      await this.runs.rearm(report);
    } catch (err) {
      const message = (err as Error).message;
      await this.runs.markFailed(run.id, report.id, message);
      await this.runs.rearm(report);
      const failures = report.consecutiveFailures + 1;
      if (failures >= FAILURES_BEFORE_DEACTIVATE) {
        await this.runs.autoDeactivate(report.id, failures);
      }
      throw err;
    }
  }

  private async deliver(
    report: ScheduledReport,
    window: ReportWindow,
    payload: Awaited<ReturnType<ReportsAggregationService['build']>>,
    runId: string,
  ): Promise<string> {
    const tz = report.timezone;
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: report.merchantId },
      select: { id: true, legalName: true, email: true, phone: true },
    });

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    let truncated = false;

    if (report.sections.includes('SALES')) {
      const events = await this.aggregation.salesEvents(
        { merchantId: report.merchantId, branchId: report.branchId },
        window,
        MAX_CSV_ROWS,
      );
      truncated = events.truncated;
      if (events.rows.length > 0) {
        attachments.push({
          filename: csvFilename('sales', window.end, tz),
          content: Buffer.from(salesCsv(events.rows, tz), 'utf8'),
        });
      }
    }

    if (payload.inventory && payload.inventory.stores.length > 0) {
      attachments.push({
        filename: csvFilename('inventory', window.end, tz),
        content: Buffer.from(inventoryCsv(payload.inventory), 'utf8'),
      });
    }

    const totalBytes = attachments.reduce((n, a) => n + a.content.length, 0);
    const overSize = totalBytes > this.config.maxAttachmentBytes;
    const sent = overSize ? [] : attachments;

    const branchLabel = report.branchId
      ? ((
          await this.prisma.branch.findFirst({
            where: { id: report.branchId, merchantId: report.merchantId },
            select: { name: true },
          })
        )?.name ?? 'One branch')
      : 'All branches';

    const skipped = await this.runs.skippedSpanSince(
      report.id,
      report.deliveredThrough,
      window.end,
    );

    const rendered = await this.renderer.renderScheduledReport({
      merchant,
      reportName: report.name,
      scopeLabel: branchLabel,
      windowLabel: formatWindow(window, tz),
      skippedLabel: skipped ? formatWindow(skipped, tz) : null,
      rows: reportRows(payload),
      subject: reportSubject(report.name, window, tz),
      attachmentNote: sent.length
        ? `Attached: ${sent.map((a) => a.filename).join(', ')}.`
        : null,
      truncatedNote: truncated
        ? `Some rows were omitted — this window exceeded ${MAX_CSV_ROWS.toLocaleString()} events.`
        : overSize
          ? 'The attachments exceeded the size limit and were not included.'
          : null,
    });

    if (this.config.dryRun) {
      this.logger.log(
        `[dry-run] ${report.id}: would mail ${report.recipients.length} recipient(s), ${sent.length} attachment(s).`,
      );
      return `dry-run-${runId}`;
    }

    return this.resend.send({
      to: report.recipients,
      subject: rendered.subject,
      html: rendered.html,
      attachments: sent,
      idempotencyKey: runId,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReportsJob>, err: Error): void {
    this.logger.error(
      `${JSON.stringify(job.data)} attempt ${job.attemptsMade} failed: ${err.message}`,
    );
  }
}
