import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { eirmsConfig } from './eirms.config';
import { EirmsAuthService } from './eirms-auth.service';
import { EirmsSigningService } from './eirms-signing.service';

@Module({
  imports: [
    ConfigModule.forFeature(eirmsConfig),
    HttpModule.register({ timeout: 10_000 }),
    PrismaModule,
  ],
  providers: [EirmsAuthService, EirmsSigningService],
  exports: [EirmsAuthService, EirmsSigningService],
})
export class EirmsModule {}
