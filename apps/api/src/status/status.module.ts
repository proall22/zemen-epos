import { Module } from '@nestjs/common';

import { HealthModule } from '../health/health.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [HealthModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
