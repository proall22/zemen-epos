import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../auth/public.decorator';
import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard';
import { MetricsService } from './metrics.service';

/**
 * `GET /metrics` — Prometheus scrape target.
 *
 *  - `@Public()` skips `JwtAuthGuard` (we authenticate via basic auth instead).
 *  - `@SkipThrottle()` because a 15s scrape cadence shouldn't count against
 *    the global rate limit.
 *  - `@ApiExcludeController()` keeps the Swagger doc focused on tenant
 *    routes — `/metrics` is an operator endpoint, not part of the API.
 *
 * Content-type is the standard Prometheus exposition format. prom-client
 * already serialises to that format; we just stamp the header.
 */
@ApiExcludeController()
@Controller('metrics')
@UseGuards(MetricsBasicAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): Promise<string> {
    return this.metrics.render();
  }
}
