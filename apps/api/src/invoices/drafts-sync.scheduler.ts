import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import {
  DRAFTS_SYNC_QUEUE,
  DRAFTS_SYNC_TICK_JOB_ID,
  DRAFTS_SYNC_TICK_MS,
} from './drafts-sync.constants';

/**
 * Installs the repeatable BullMQ job that fires the drafts-sync
 * processor every {@link DRAFTS_SYNC_TICK_MS}.
 *
 * Idempotency: the job is added with a stable `jobId` and a repeat
 * pattern keyed by `every`. BullMQ dedups on the combination so a
 * second API replica (or a restart of this one) doesn't double-
 * schedule. Repeatable jobs are stored in Redis and survive process
 * restarts, so we only need to add it once — but adding on every boot
 * is the simplest "self-heal" if someone wiped Redis between runs.
 */
@Injectable()
export class DraftsSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(DraftsSyncScheduler.name);

  constructor(
    @InjectQueue(DRAFTS_SYNC_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('DRAFTS_ENABLED') !== 'true') {
      // Drafts are parked. Remove any repeatable tick a previous run left in
      // Redis — it survives restarts, so simply not adding one isn't enough.
      const repeatables = await this.queue.getRepeatableJobs();
      for (const job of repeatables) {
        await this.queue.removeRepeatableByKey(job.key);
      }
      this.logger.log('drafts-sync disabled (DRAFTS_ENABLED is not true).');
      return;
    }
    await this.queue.add(
      'tick',
      {},
      {
        jobId: DRAFTS_SYNC_TICK_JOB_ID,
        repeat: { every: DRAFTS_SYNC_TICK_MS },
        // Don't pile up old tick jobs if the worker stalls — just keep
        // the latest tick alive. Bull cleans completed/failed jobs
        // automatically; these flags pin the bounds.
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.logger.log(
      `drafts-sync tick scheduled every ${DRAFTS_SYNC_TICK_MS / 1000}s.`,
    );
  }
}
