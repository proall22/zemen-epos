import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';

import { reportsConfig } from './reports.config';
import {
  REPORTS_QUEUE,
  REPORTS_TICK_JOB_ID,
  type ReportsJob,
} from './reports.constants';

@Injectable()
export class ReportsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReportsScheduler.name);

  constructor(
    @InjectQueue(REPORTS_QUEUE) private readonly queue: Queue,
    @Inject(reportsConfig.KEY)
    private readonly config: ConfigType<typeof reportsConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Tear down when off, or a repeatable installed by an earlier boot keeps
    // firing against a feature nobody thinks is running.
    if (!this.config.enabled) {
      for (const job of await this.queue.getRepeatableJobs()) {
        await this.queue.removeRepeatableByKey(job.key);
      }
      return;
    }

    await this.queue.add(
      'tick',
      { kind: 'tick' } satisfies ReportsJob,
      {
        jobId: REPORTS_TICK_JOB_ID,
        repeat: { every: this.config.tickMs },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Scheduled reports tick every ${this.config.tickMs}ms.`);
  }
}
