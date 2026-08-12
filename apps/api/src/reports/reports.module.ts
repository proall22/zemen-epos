import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsAggregationService } from './reports-aggregation.service';
import { ReportsRunService } from './reports-run.service';
import { reportsConfig } from './reports.config';
import { REPORTS_QUEUE } from './reports.constants';
import { ReportsController } from './reports.controller';
import { ReportsProcessor } from './reports.processor';
import { ReportsScheduler } from './reports.scheduler';
import { ReportsService } from './reports.service';

@Module({})
export class ReportsModule {
  static register(): DynamicModule {
    const enabled = process.env.REPORTS_ENABLED === 'true';
    const notifications = process.env.NOTIFICATIONS_ENABLED === 'true';

    // Delivery goes through ResendClient, which NotificationsModule only
    // provides when notifications are on. Failing at boot beats a worker that
    // starts, claims work, and then cannot mail any of it.
    if (enabled && !notifications) {
      throw new Error(
        'REPORTS_ENABLED=true requires NOTIFICATIONS_ENABLED=true — scheduled reports deliver through the notifications mail client.',
      );
    }

    return {
      module: ReportsModule,
      imports: [
        ConfigModule.forFeature(reportsConfig),
        PrismaModule,
        ...(enabled
          ? [
              BullModule.registerQueue({ name: REPORTS_QUEUE }),
              NotificationsModule.register(),
            ]
          : []),
      ],
      controllers: [ReportsController],
      providers: [
        ReportsService,
        ReportsAggregationService,
        ...(enabled
          ? [ReportsRunService, ReportsProcessor, ReportsScheduler]
          : []),
      ],
      exports: [ReportsService, ReportsAggregationService],
    };
  }
}
