import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { turnstileConfig } from './turnstile.config';
import { TurnstileGuard } from './turnstile.guard';
import { TurnstileService } from './turnstile.service';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(turnstileConfig),
    HttpModule.register({ timeout: 10_000 }),
  ],
  providers: [
    TurnstileService,
    { provide: APP_GUARD, useClass: TurnstileGuard },
  ],
  exports: [TurnstileService],
})
export class TurnstileModule {}
