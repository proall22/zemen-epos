import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  // Listing the audit log is a heavy query (joins + filters across a
  // potentially large table); 30 calls/min is plenty for an operator's
  // browsing pattern and well below what a runaway script could push.
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List audit log entries (super admin)' })
  list(@Query() query: QueryAuditDto) {
    return this.audit.list(query);
  }

  @Get(':id')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Full audit entry incl. request/response bodies' })
  async get(@Param('id') id: string) {
    const log = await this.audit.get(id);
    if (!log) throw new NotFoundException(`Audit log ${id} not found`);
    return log;
  }
}
