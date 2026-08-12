import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';

import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import {
  DocumentFilterDto,
  type Page,
} from '../common/document-filters';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreateWithholdReceiptDto } from './dto/create-withhold-receipt.dto';
import {
  ReceiptsService,
  type PublicReceiptWithRelations,
  type ReceiptWithRelations,
} from './receipts.service';
import type { VerifyReceiptResult } from './receipts.types';

@ApiTags('Receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post()
  @RequirePermissions('receipt.create')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Record a sales receipt against one or more invoices',
    description:
      'Auto-generates ReceiptNumber + ReceiptCounter, stamps SellerTIN and SourceSystem from cached identity, calls MOR /v1/receipt/sales, and persists locally. Updates each linked invoice payment status.',
  })
  create(@Body() body: CreateReceiptDto): Promise<ReceiptWithRelations> {
    return this.receipts.create(body);
  }

  @Get()
  @RequirePermissions('receipt.view')
  @ApiOperation({
    summary: 'List receipts (newest first), filterable by period and counterparty.',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Supplier/buyer name, TIN or receipt number.' })
  @ApiQuery({ name: 'kind', required: false, enum: ['SALES', 'WITHHOLD'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query() filters: DocumentFilterDto,
  ): Promise<Page<ReceiptWithRelations>> {
    return this.receipts.list({
      crossBranch: filters.scope === 'merchant',
      from: filters.from,
      to: filters.to,
      q: filters.q,
      kind: filters.kind,
      cursor: filters.cursor,
      limit: filters.limit,
    });
  }

  @Get('withholding-register')
  @RequirePermissions('withholding.view')
  @ApiOperation({
    summary:
      'Withholding register: amounts withheld over a period with the period total, filterable by branch and supplier.',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Supplier legal name or TIN.' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  withholdingRegister(@Query() filters: DocumentFilterDto) {
    return this.receipts.withholdingRegister({
      crossBranch: filters.scope === 'merchant',
      from: filters.from,
      to: filters.to,
      q: filters.q,
      cursor: filters.cursor,
      limit: filters.limit,
    });
  }

  @Get('next-sequence')
  @RequirePermissions('receipt.view')
  nextSequence(): Promise<{ receiptNumber: string; receiptCounter: number }> {
    return this.receipts.getNextSequence();
  }

  @Post('withhold')
  @RequirePermissions('withholding.create')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'File a withhold receipt against an external supplier invoice',
    description:
      'Caller provides the supplier IRN + pre-tax + computed withholding amount. Posts to MOR /v1/receipt/withholding and persists locally with kind=WITHHOLD.',
  })
  createWithhold(
    @Body() body: CreateWithholdReceiptDto,
  ): Promise<ReceiptWithRelations> {
    return this.receipts.createWithhold(body);
  }

  @Get('withhold/next-sequence')
  @RequirePermissions('withholding.view')
  nextWithholdSequence(): Promise<{
    receiptNumber: string;
    receiptCounter: number;
    receiptCounterFormatted: string;
  }> {
    return this.receipts.getNextWithholdSequence();
  }

  @Public()
  @Get(':id/qr.png')
  @Header('Cache-Control', 'public, max-age=86400')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Public QR PNG for the receipt (used by notification emails)',
  })
  async qr(@Param('id') id: string): Promise<StreamableFile> {
    const png = await this.receipts.getQrPng(id);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  @Public()
  @Get(':id/public')
  @ApiOperation({
    summary: 'Buyer-facing receipt for the printable public page',
    description:
      'Tokenized public access (?t=) used by the "View receipt" link in notification emails. Mirrors the equivalent invoice route — bad/missing token reads as 404 so the page shows a neutral message instead of a login bounce.',
  })
  getPublic(
    @Param('id') id: string,
    @Query('t') token?: string,
  ): Promise<PublicReceiptWithRelations> {
    return this.receipts.getPublic(id, token);
  }

  @Get(':id')
  @RequirePermissions('receipt.view')
  get(@Param('id') id: string): Promise<ReceiptWithRelations> {
    return this.receipts.get(id);
  }

  @Post(':id/verify')
  @RequirePermissions('receipt.view')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Verify a receipt with MOR /v1/verify (keyed by RRN)',
    description:
      "Re-reads MoR's current view of the receipt using its stored RRN. Returns MoR's response as-is so the UI can show the authoritative state. Passive — does not mutate local data.",
  })
  verify(@Param('id') id: string): Promise<VerifyReceiptResult> {
    return this.receipts.verify(id);
  }
}
