import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import {
  DRAFTS_SYNC_BATCH_SIZE,
  DRAFTS_SYNC_FAILURE_BACKOFF_MS,
  DRAFTS_SYNC_QUEUE,
} from './drafts-sync.constants';
import { InvoicesService } from './invoices.service';

/**
 * Background worker that drains the {@link InvoiceDraft} table.
 *
 * Each tick: pick up to {@link DRAFTS_SYNC_BATCH_SIZE} drafts that
 * are PENDING, or SYNC_FAILED whose `lastAttemptAt` is older than
 * {@link DRAFTS_SYNC_FAILURE_BACKOFF_MS}, and run them through
 * `InvoicesService.syncDraft` one at a time. The service's existing
 * SYNCING-state mutex handles concurrency between the worker, the
 * cashier's manual "Sync now" button, and multi-replica deploys —
 * the worker doesn't need its own lock.
 *
 * Errors per draft are logged + swallowed. The service has already
 * marked the row SYNC_FAILED with `lastError` populated, so the
 * cashier sees the truncated MoR message on the invoices page.
 */
@Processor(DRAFTS_SYNC_QUEUE)
export class DraftsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(DraftsSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const backoffCutoff = new Date(
      Date.now() - DRAFTS_SYNC_FAILURE_BACKOFF_MS,
    );

    // We deliberately don't tenant-scope this query: the worker has no
    // request context, so `tenantScope` would be a no-op anyway, and the
    // intent is to drain drafts platform-wide. Sync per draft is itself
    // tenant-safe because syncDraft operates by id.
    const drafts = await this.prisma.invoiceDraft.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          {
            status: 'SYNC_FAILED',
            lastAttemptAt: { lt: backoffCutoff },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: DRAFTS_SYNC_BATCH_SIZE,
      select: { id: true, status: true },
    });

    if (drafts.length === 0) return;

    this.logger.log(
      `Draining ${drafts.length} draft${drafts.length === 1 ? '' : 's'} this tick.`,
    );

    for (const draft of drafts) {
      try {
        await this.invoices.syncDraft(draft.id);
        this.logger.log(`Draft ${draft.id} synced.`);
      } catch (err) {
        // syncDraft has already flipped the row to SYNC_FAILED with the
        // error message stored. We just log here so the operator sees
        // sustained failures in stdout/audit.
        this.logger.warn(
          `Draft ${draft.id} sync failed: ${(err as Error).message}`,
        );
      }
    }
  }
}
