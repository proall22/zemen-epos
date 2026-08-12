import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ScheduledReport, ScheduledReportRun } from '@prisma/client';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateScheduledReportDto } from './dto/create-scheduled-report.dto';
import { PreviewReportDto } from './dto/preview-report.dto';
import { UpdateScheduledReportDto } from './dto/update-scheduled-report.dto';
import { ReportsEnabledGuard } from './reports-enabled.guard';
import { ReportsService } from './reports.service';
import type { ReportPayload } from './reports.types';

@ApiTags('Scheduled reports')
@Controller()
@UseGuards(ReportsEnabledGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/limits')
  @RequirePermissions('report.view')
  @ApiOperation({
    summary: 'Recipient and per-merchant caps, so the UI can show counters.',
  })
  limits(): { maxRecipients: number; maxPerMerchant: number } {
    return this.reports.limits();
  }

  @Get('merchants/:id/scheduled-reports')
  @RequirePermissions('report.view')
  list(@Param('id') id: string): Promise<ScheduledReport[]> {
    return this.reports.list(id);
  }

  @Post('merchants/:id/scheduled-reports')
  @RequirePermissions('report.manage')
  @ApiOperation({
    summary: 'Create a recurring report.',
    description:
      'Reports from creation onward — it does not backfill history. The first send covers everything from now until the first scheduled fire.',
  })
  create(
    @Param('id') id: string,
    @Body() dto: CreateScheduledReportDto,
  ): Promise<ScheduledReport> {
    return this.reports.create(id, dto);
  }

  @Post('merchants/:id/scheduled-reports/preview')
  @RequirePermissions('report.view')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Aggregate an ad-hoc window without sending anything.',
    description:
      'Sends no email and does not move any watermark. Use this to check a configuration before it starts mailing people.',
  })
  preview(
    @Param('id') id: string,
    @Body() dto: PreviewReportDto,
  ): Promise<ReportPayload> {
    return this.reports.preview(id, dto);
  }

  @Post('merchants/:id/scheduled-reports/:reportId/run-now')
  @RequirePermissions('report.manage')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Run this report now.',
    description:
      'Covers everything since the last delivered report, not a fixed window — so a manual run is not a special case and does not disturb the schedule.',
  })
  runNow(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
  ): Promise<{ queued: boolean }> {
    return this.reports.runNow(id, reportId);
  }

  @Get('merchants/:id/scheduled-reports/:reportId')
  @RequirePermissions('report.view')
  get(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
  ): Promise<ScheduledReport> {
    return this.reports.get(id, reportId);
  }

  @Get('merchants/:id/scheduled-reports/:reportId/runs')
  @RequirePermissions('report.view')
  @ApiOperation({
    summary: 'Delivery history, including windows that were skipped as empty.',
  })
  runs(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @Query('limit') limit?: string,
  ): Promise<ScheduledReportRun[]> {
    return this.reports.runs(id, reportId, limit ? Number(limit) : undefined);
  }

  @Patch('merchants/:id/scheduled-reports/:reportId')
  @RequirePermissions('report.manage')
  update(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReport> {
    return this.reports.update(id, reportId, dto);
  }

  @Delete('merchants/:id/scheduled-reports/:reportId')
  @RequirePermissions('report.manage')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
  ): Promise<void> {
    return this.reports.remove(id, reportId);
  }
}
