import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';

import {
  DocumentFilterDto,
  type Page,
} from '../common/document-filters';
import { Public } from '../auth/public.decorator';
import { DraftsEnabledGuard } from './drafts-enabled.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ImportInvoiceDto } from './dto/import-invoice.dto';
import {
  InvoicesService,
  type InvoiceDraftRow,
  type InvoiceWithRelations,
} from './invoices.service';
import type { VerifyInvoiceResult } from './invoices.types';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @RequirePermissions('invoice.create')
  // 60 invoices per minute per user — a real cashier rings 1-2/min sustained,
  // so this leaves ~30x headroom for batch entry while preventing a stolen
  // token (or a runaway integration) from flooding MoR with /v1/register calls.
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Register an e-invoice with EIRMS and persist locally',
    description:
      'Stamps SellerDetails.Tin and SourceSystem.SystemNumber/SystemType from the cached system identity, calls MOR /v1/register, upserts the buyer by TIN, and stores the invoice + line items.',
  })
  create(@Body() body: CreateInvoiceDto): Promise<InvoiceWithRelations> {
    return this.invoices.register(body);
  }

  @Post('calculate')
  @RequirePermissions('invoice.create')
  calculate(@Body() body: CreateInvoiceDto) {
    return this.invoices.calculate(body);
  }

  @Get()
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary: 'List registered invoices (newest first)',
    description:
      "By default scoped to the caller's active branch. MERCHANT_ADMIN may pass ?scope=merchant to span every branch under the merchant (read-only).",
  })
  @ApiQuery({ name: 'from', required: false, description: 'Inclusive start date (ISO).' })
  @ApiQuery({ name: 'to', required: false, description: 'Inclusive end date (ISO).' })
  @ApiQuery({ name: 'q', required: false, description: 'Buyer name/TIN, document number or IRN.' })
  @ApiQuery({ name: 'status', required: false, enum: ['PAID', 'UNPAID', 'PARTIAL', 'CANCELLED'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query() filters: DocumentFilterDto,
  ): Promise<Page<InvoiceWithRelations>> {
    return this.invoices.list({
      crossBranch: filters.scope === 'merchant',
      from: filters.from,
      to: filters.to,
      q: filters.q,
      status: filters.status,
      cursor: filters.cursor,
      limit: filters.limit,
    });
  }

  @Get('next-sequence')
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary: 'Get the next DocumentNumber + InvoiceCounter to assign',
    description:
      "Derived from the highest values currently in the local database. EIRMS enforces strict monotonic sequencing.",
  })
  nextSequence(): Promise<{ documentNumber: string; invoiceCounter: number }> {
    return this.invoices.getNextSequenceNumbers();
  }

  // ---------------------------------------------------------------------------
  // Offline-mode drafts — parked behind DRAFTS_ENABLED (default off).
  // ---------------------------------------------------------------------------

  @Post('draft')
  @UseGuards(DraftsEnabledGuard)
  @RequirePermissions('invoice.create')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Save a draft invoice (offline-mode fallback for /v1/register)',
    description:
      'Captures the same body /invoices accepts but skips the EIRMS round-trip. Used as the auto-fallback when MoR is unreachable so the cashier keeps selling. The full register payload is stored verbatim; sync replays it (with the document number + invoice counter recomputed against SYNCED invoices at sync time).',
  })
  createDraft(@Body() body: CreateInvoiceDto): Promise<InvoiceDraftRow> {
    return this.invoices.createDraft(body);
  }

  @Get('drafts')
  @UseGuards(DraftsEnabledGuard)
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary: 'List pending / failed draft invoices for this tenant',
  })
  listDrafts(): Promise<InvoiceDraftRow[]> {
    return this.invoices.listDrafts();
  }

  @Post('drafts/:id/sync')
  @UseGuards(DraftsEnabledGuard)
  @RequirePermissions('invoice.create')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Push a draft to MoR /v1/register and promote to a real invoice',
    description:
      'On success: the live Invoice row is created (with IRN, signedQR, ack date) and the draft row deleted. On 406 sequence drift, the same self-heal loop the live path uses retries once with MoR\'s corrected counter. On any other failure: draft is marked SYNC_FAILED with a truncated error message; the operator can retry or delete it.',
  })
  syncDraft(@Param('id') id: string): Promise<InvoiceWithRelations> {
    return this.invoices.syncDraft(id);
  }

  @Delete('drafts/:id')
  @UseGuards(DraftsEnabledGuard)
  @RequirePermissions('invoice.create')
  @ApiOperation({
    summary: 'Discard an unsynced draft invoice (no MoR call)',
  })
  deleteDraft(@Param('id') id: string): Promise<{ ok: true }> {
    return this.invoices.deleteDraft(id);
  }

  @Public()
  @Get(':id/qr.png')
  @Header('Cache-Control', 'public, max-age=86400')
  // Email clients prefetch images on open; one inbox open can hit this several
  // times per second from different relays. Skip the per-IP global limiter on
  // this route — the response is cached for a day, the image bytes are tiny,
  // and the upstream `Cache-Control` makes most hits CDN-deflected anyway.
  @SkipThrottle()
  @ApiOperation({
    summary: 'Public QR PNG for the invoice (used by notification emails)',
  })
  async qr(@Param('id') id: string): Promise<StreamableFile> {
    const png = await this.invoices.getQrPng(id);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  @Public()
  @Get(':id/public')
  @ApiOperation({
    summary: 'Buyer-facing invoice for the printable Variant 1 page',
    description:
      'Tokenized public access (?t=) used by notification email/SMS links so buyers can view/print the invoice without a login.',
  })
  getPublic(
    @Param('id') id: string,
    @Query('t') token?: string,
  ): Promise<InvoiceWithRelations> {
    return this.invoices.getPublic(id, token);
  }

  @Get('by-irn/:irn')
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary: 'Resolve an invoice by its MoR-issued IRN',
    description:
      'Used by the receipts "record payment by IRN" flow so a cashier can settle an invoice from a printed copy without searching the list. Tenant-scoped: 404 when the IRN exists in another merchant.',
  })
  getByIrn(@Param('irn') irn: string): Promise<InvoiceWithRelations> {
    return this.invoices.getByIrn(irn);
  }

  @Post('lookup-external')
  @RequirePermissions('invoice.view')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Look up an invoice by IRN via MoR /v1/verify (read-only)',
    description:
      "For checking an externally-issued invoice's details before importing. Calls MoR /v1/verify and returns the response as-is — nothing is persisted. Use POST /invoices/import-from-irn to actually file it.",
  })
  lookupExternal(@Body() body: ImportInvoiceDto): Promise<VerifyInvoiceResult> {
    return this.invoices.lookupByIrn(body.irn.trim());
  }

  @Post('import-from-irn')
  @RequirePermissions('invoice.create')
  // EIRMS auth + persistence — same throttle as a regular registration.
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Import an externally-issued invoice by IRN via MoR /v1/verify',
    description:
      'For invoices issued elsewhere (e.g. another POS) whose payment the merchant wants to file through this platform. Calls EIRMS /v1/verify with the caller branch token; on success bootstraps a stub Invoice row marked source=EXTERNAL with the buyer + items returned by MoR. Idempotent: a second call with the same IRN returns the original row. Cancelled invoices are refused.',
  })
  importFromIrn(
    @Body() body: ImportInvoiceDto,
  ): Promise<InvoiceWithRelations> {
    return this.invoices.importFromIrn(body.irn.trim());
  }

  @Get(':id')
  @RequirePermissions('invoice.view')
  get(@Param('id') id: string): Promise<InvoiceWithRelations> {
    return this.invoices.get(id);
  }

  @Get(':id/chain')
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary:
      'Return every invoice in this document\'s memo chain — root INV + every CRE/DEB descendant, oldest first.',
  })
  chain(@Param('id') id: string): Promise<InvoiceWithRelations[]> {
    return this.invoices.getChain(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('invoice.update')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Cancel a registered invoice via MOR /v1/cancel',
    description:
      'Looks up the local invoice, calls upstream cancel with the stored IRN, and persists the cancellation.',
  })
  cancel(
    @Param('id') id: string,
    @Body() body: CancelInvoiceDto,
  ): Promise<InvoiceWithRelations> {
    return this.invoices.cancel(id, body);
  }

  @Post(':id/verify')
  @RequirePermissions('invoice.view')
  @ApiOperation({
    summary: 'Verify an invoice with MOR /v1/verify',
    description:
      "Calls upstream verify with the locally-stored IRN. Returns MOR's response envelope as-is so the UI can display the current authoritative state of the invoice.",
  })
  verify(@Param('id') id: string): Promise<VerifyInvoiceResult> {
    return this.invoices.verify(id);
  }
}
