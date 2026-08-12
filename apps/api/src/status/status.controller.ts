import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { StatusService } from './status.service';
import type { ComponentStatus, StatusReport } from './status.types';

/**
 * Public, unauthenticated SLA status surface. Each component has its own route
 * so an external uptime monitor can track them independently:
 *
 *   GET /status                 — aggregate (all components + overall)
 *   GET /status/:component      — one component (api | invoicing | notifications)
 *
 * `down` returns 503 so uptime monitors record the outage; `operational` and
 * `degraded` return 200. Responses never name internal infrastructure.
 */
@ApiTags('Status')
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Aggregate public service status (for the SLA status page).' })
  async overall(@Res({ passthrough: true }) res: Response): Promise<StatusReport> {
    const report = await this.status.getReport();
    if (report.status === 'down') res.status(503);
    return report;
  }

  @Public()
  @Get(':component')
  @ApiOperation({ summary: 'Status of a single tracked component.' })
  async component(
    @Param('component') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ComponentStatus> {
    const component = await this.status.getComponent(key);
    if (!component) throw new NotFoundException(`Unknown component '${key}'.`);
    if (component.state === 'down') res.status(503);
    return component;
  }
}
