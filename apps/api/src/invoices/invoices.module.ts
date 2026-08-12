import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BuyersModule } from '../buyers/buyers.module';
import { eirmsConfig } from '../eirms/eirms.config';
import { EirmsModule } from '../eirms/eirms.module';
import { PosModule } from '../pos/pos.module';
import { DRAFTS_SYNC_QUEUE } from './drafts-sync.constants';
import { DraftsSyncProcessor } from './drafts-sync.processor';
import { DraftsSyncScheduler } from './drafts-sync.scheduler';
import { InvoicesController } from './invoices.controller';
import { DraftsEnabledGuard } from './drafts-enabled.guard';
import { InvoicesService } from './invoices.service';

// Bull is only wired at the app root when REDIS_URL is set
// (see BullSetupModule). When it's absent we leave the worker out
// entirely — drafts still work, they just only sync when an operator
// presses "Sync now" on the invoices page.
const draftsSyncEnabled = !!process.env.REDIS_URL;

@Module({
  imports: [
    EirmsModule,
    BuyersModule,
    PosModule,
    ConfigModule.forFeature(eirmsConfig),
    HttpModule.register({ timeout: 30_000 }),
    ...(draftsSyncEnabled
      ? [BullModule.registerQueue({ name: DRAFTS_SYNC_QUEUE })]
      : []),
  ],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    DraftsEnabledGuard,
    ...(draftsSyncEnabled ? [DraftsSyncProcessor, DraftsSyncScheduler] : []),
  ],
})
export class InvoicesModule {}
