import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { eirmsConfig } from '../eirms/eirms.config';
import { EirmsModule } from '../eirms/eirms.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [
    EirmsModule,
    ConfigModule.forFeature(eirmsConfig),
    HttpModule.register({ timeout: 30_000 }),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
