import { Module } from '@nestjs/common';

import { HarmonizationController } from './harmonization.controller';
import { HarmonizationService } from './harmonization.service';

@Module({
  controllers: [HarmonizationController],
  providers: [HarmonizationService],
  exports: [HarmonizationService],
})
export class HarmonizationModule {}
