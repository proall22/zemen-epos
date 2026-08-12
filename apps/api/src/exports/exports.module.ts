import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { exportsConfig } from './exports.config';
import { ExportsController } from './exports.controller';
import { ExportsProcessor } from './exports.processor';
import { ExportsScheduler } from './exports.scheduler';
import { ExportsService } from './exports.service';
import { EXPORTS_QUEUE } from './exports.types';

@Module({
  imports: [
    ConfigModule.forFeature(exportsConfig),
    BullModule.registerQueue({ name: EXPORTS_QUEUE }),
    PrismaModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService, ExportsProcessor, ExportsScheduler],
  exports: [ExportsService],
})
export class ExportsModule {}
