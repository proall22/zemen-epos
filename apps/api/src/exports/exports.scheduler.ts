import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ExportsService } from './exports.service';

/** Hourly tick that expires + deletes bundles whose `expiresAt` has passed.
 *  Cheap and idempotent; runs in-process to avoid pulling in a cron lib. */
@Injectable()
export class ExportsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ExportsScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly exports: ExportsService) {}

  onModuleInit(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60 * 60 * 1000);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const n = await this.exports.expireOldBundles();
      if (n > 0) this.logger.log(`Expired ${n} merchant export bundle(s).`);
    } catch (err) {
      this.logger.warn(`Expire tick failed: ${(err as Error).message}`);
    }
  }
}
