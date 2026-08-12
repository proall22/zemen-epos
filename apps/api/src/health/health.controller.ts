import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { HealthService, type HealthReport } from './health.service';

/**
 * Two probes, each `@Public()` so a load balancer doesn't need credentials:
 *
 *  - `GET /livez`   — process is alive. 200 always. No dependency checks.
 *  - `GET /healthz` — runtime dependencies (DB + Redis) reachable. Returns
 *                     200 when everything passes, 503 when any check is
 *                     `down`. Skipped checks (e.g. Redis when REDIS_URL is
 *                     unset) don't degrade the overall status.
 *
 * Neither leaks version, hostname, or stack info — they're public.
 */
@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('livez')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Liveness probe — process is up.',
    description:
      'Returns 200 unconditionally. Use this for k8s liveness; for readiness use /healthz.',
  })
  livez(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('healthz')
  @ApiOperation({
    summary: 'Readiness probe — runtime dependencies reachable.',
    description:
      'Pings the DB (SELECT 1) and Redis (PING). Returns 200 when everything is ok, 503 when any required dependency is down. Skipped checks (e.g. Redis when REDIS_URL is unset) leave the status `ok`.',
  })
  async healthz(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status === 'degraded') res.status(503);
    return report;
  }
}
