import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MerchantExport } from '@prisma/client';
import type { Response } from 'express';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ExportsService } from './exports.service';

@ApiTags('Merchant exports')
@Controller()
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post('merchants/:id/exports')
  @RequirePermissions('merchant.export')
  @ApiOperation({
    summary: 'Request a full data export for a merchant (queued).',
    description:
      'Enqueues a background job that bundles every invoice / receipt / inventory item / buyer / audit log for the merchant as JSON (and PDF for invoices + receipts) into a single zip. The merchant owner receives an email when the bundle is ready to download.',
  })
  create(@Param('id') id: string): Promise<MerchantExport> {
    return this.exports.create(id);
  }

  @Get('merchants/:id/exports')
  @RequirePermissions('merchant.export')
  list(@Param('id') id: string): Promise<MerchantExport[]> {
    return this.exports.list(id);
  }

  @Get('merchants/:id/exports/:exportId')
  @RequirePermissions('merchant.export')
  get(
    @Param('id') id: string,
    @Param('exportId') exportId: string,
  ): Promise<MerchantExport> {
    return this.exports.get(id, exportId);
  }

  @Get('merchants/:id/exports/:exportId/download')
  @RequirePermissions('merchant.export')
  @ApiOperation({ summary: 'Stream a ready export as zip.' })
  async download(
    @Param('id') id: string,
    @Param('exportId') exportId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { stream, bytes, filename } = await this.exports.openDownload(
      id,
      exportId,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', bytes);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }
}
