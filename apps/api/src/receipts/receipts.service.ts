import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService, type ConfigType } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { AuditService } from '../audit/audit.service';
import { eirmsAction } from '../audit/eirms-action';
import { RequestContextService } from '../audit/request-context.service';
import {
  cursorArgs,
  dateRange,
  pageSize,
  toPage,
  type Page,
} from '../common/document-filters';
import { verifyPublicToken } from '../common/public-link';
import {
  BRANCH_IDENTITY_SELECT,
  MERCHANT_IDENTITY_SELECT,
  SELLER_IDENTITY_INCLUDE,
} from '../common/seller-identity';
import {
  branchScope,
  listScope,
  merchantScope,
  tenantScope,
} from '../common/tenant-scope';
import { eirmsConfig } from '../eirms/eirms.config';
import { EirmsAuthService } from '../eirms/eirms-auth.service';
import { EirmsSigningService } from '../eirms/eirms-signing.service';
import { formatEirmsErrors } from '../eirms/eirms-error-formatter';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { CreateWithholdReceiptDto } from './dto/create-withhold-receipt.dto';
import {
  ReceiptUpstreamBody,
  ReceiptUpstreamEnvelope,
  VerifyReceiptFlatResponse,
  VerifyReceiptResult,
} from './receipts.types';

type ReceiptWithRelations = Prisma.ReceiptGetPayload<{
  include: {
    invoices: { include: { invoice: { include: { buyer: true } } } };
    branch: { select: typeof BRANCH_IDENTITY_SELECT };
    merchant: { select: typeof MERCHANT_IDENTITY_SELECT };
  };
}>;

/** Richer shape returned by the public endpoint — each linked invoice
 *  carries its own line items so the buyer-facing print page can render
 *  without an authenticated round-trip per invoice. */
type PublicReceiptWithRelations = Prisma.ReceiptGetPayload<{
  include: {
    invoices: {
      include: {
        invoice: {
          include: { buyer: true; items: true; cancellation: true };
        };
      };
    };
    branch: { select: typeof BRANCH_IDENTITY_SELECT };
    merchant: { select: typeof MERCHANT_IDENTITY_SELECT };
  };
}>;

export interface ReceiptListFilters {
  crossBranch?: boolean;
  from?: string;
  to?: string;
  q?: string;
  kind?: 'SALES' | 'WITHHOLD';
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @Inject(eirmsConfig.KEY)
    private readonly config: ConfigType<typeof eirmsConfig>,
    private readonly auth: EirmsAuthService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly merchants: MerchantsService,
    private readonly configService: ConfigService,
    private readonly signing: EirmsSigningService,
  ) {}

  /**
   * Sales-receipt counter is per-branch (each branch has its own MOR
   * sequence). `branchId` must be the branch the receipt will be *written*
   * to, which is the settled invoice's branch — not necessarily the branch
   * the caller is acting as. A merchant admin settling another branch's
   * invoice would otherwise stamp this branch's counter onto that branch's
   * stream and duplicate a sequence number.
   */
  async getNextSequence(branchId?: string | null): Promise<{
    receiptNumber: string;
    receiptCounter: number;
  }> {
    const where = {
      kind: { not: 'WITHHOLD' as const },
      ...merchantScope(this.context.get()),
      ...(branchId ? { branchId } : branchScope(this.context.get())),
    };
    const agg = await this.prisma.receipt.aggregate({
      where,
      _max: { receiptCounter: true },
    });
    const nextCounter = (agg._max.receiptCounter ?? 0) + 1;
    return {
      receiptNumber: `REC${String(nextCounter).padStart(16, '0')}`,
      receiptCounter: nextCounter,
    };
  }

  private receiptWhere(opts: ReceiptListFilters): Prisma.ReceiptWhereInput {
    const createdAt = dateRange(opts.from, opts.to);
    const q = opts.q?.trim();
    return {
      ...listScope(this.context.get(), { crossBranch: opts.crossBranch }),
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              // Sales receipts carry the counterparty through the invoice;
              // withhold receipts carry the supplier on the receipt itself.
              { supplierLegalName: { contains: q, mode: 'insensitive' } },
              { supplierTin: { contains: q, mode: 'insensitive' } },
              { receiptNumber: { contains: q, mode: 'insensitive' } },
              {
                invoices: {
                  some: {
                    invoice: {
                      buyer: {
                        OR: [
                          { legalName: { contains: q, mode: 'insensitive' } },
                          { tin: { contains: q, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  async list(
    opts: ReceiptListFilters = {},
  ): Promise<Page<ReceiptWithRelations>> {
    const take = pageSize(opts.limit);
    const where = this.receiptWhere(opts);
    const [rows, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        include: {
          invoices: { include: { invoice: { include: { buyer: true } } } },
          ...SELLER_IDENTITY_INCLUDE,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...cursorArgs(opts.cursor, take),
      }),
      this.prisma.receipt.count({ where }),
    ]);
    return toPage(rows, take, total);
  }

  /**
   * Withholding register (FR-WHT-003): every amount withheld over a period,
   * with the period total. Filing needs the sum, not just the rows, so the
   * aggregate is computed over the whole filter rather than the page.
   */
  async withholdingRegister(
    opts: ReceiptListFilters = {},
  ): Promise<Page<ReceiptWithRelations> & { withheldTotal: number; preTaxTotal: number }> {
    const page = await this.list({ ...opts, kind: 'WITHHOLD' });
    const sums = await this.prisma.receipt.aggregate({
      where: this.receiptWhere({ ...opts, kind: 'WITHHOLD' }),
      _sum: { withholdAmount: true, withholdPreTax: true },
    });
    return {
      ...page,
      withheldTotal: sums._sum.withholdAmount ?? 0,
      preTaxTotal: sums._sum.withholdPreTax ?? 0,
    };
  }

  async get(id: string): Promise<ReceiptWithRelations> {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, ...tenantScope(this.context.get()) },
      include: {
        invoices: { include: { invoice: { include: { buyer: true } } } },
        ...SELLER_IDENTITY_INCLUDE,
      },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    return receipt;
  }

  /**
   * Re-checks a receipt's state with MoR via /v1/verify, keyed by the receipt's
   * RRN (receipts have no IRN). Uses the receipt's own branch token. Passive —
   * does not mutate local state. Returns MoR's envelope (or the flat shape used
   * for some non-active states) so the UI can render the authoritative view.
   */
  async verify(id: string): Promise<VerifyReceiptResult> {
    const receipt = await this.get(id);
    if (!receipt.rrn) {
      throw new ConflictException(
        'This receipt has no MoR reference (RRN) to verify against.',
      );
    }
    // Verify runs against the branch that originally recorded the receipt —
    // its creds and cert are what MoR expects on this RRN.
    const tenant = {
      merchantId: receipt.merchantId,
      branchId: receipt.branchId,
    };
    const token = await this.auth.getAccessToken(tenant.branchId);
    try {
      return await this.postUpstream<VerifyReceiptResult>(
        '/v1/verify',
        { irn: receipt.rrn },
        token,
        tenant,
      );
    } catch (err) {
      if (err instanceof BadGatewayException) {
        const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
        if (isFlatVerifyResponse(body)) return body;
      }
      throw err;
    }
  }

  /**
   * Buyer-facing fetch for the public printable receipt page. Mirrors
   * `InvoicesService.getPublic` exactly: gated by an HMAC token on the
   * link (no login), bad/missing token reads as 404 so the page shows a
   * neutral message instead of a login bounce. Public access is
   * intentionally not tenant-scoped — the token itself is the proof of
   * authorisation, derived from a server-only secret.
   *
   * Returns a richer include than `get()` — each linked invoice carries
   * its line items + cancellation flag, so the print view can render the
   * receipt without an additional round-trip per invoice (the staff
   * print page does that round-trip itself; the public page has no
   * credentials for it).
   */
  async getPublic(
    id: string,
    token: string | undefined,
  ): Promise<PublicReceiptWithRelations> {
    const secret =
      this.configService.get<string>('PUBLIC_LINK_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      '';
    if (!verifyPublicToken(id, token, secret)) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        invoices: {
          include: {
            invoice: {
              include: {
                buyer: true,
                items: true,
                cancellation: true,
              },
            },
          },
        },
        ...SELLER_IDENTITY_INCLUDE,
      },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    return receipt;
  }

  private resolveTenantForWrite(): {
    merchantId: string;
    branchId: string;
  } {
    const ctx = this.context.get();
    if (!ctx?.merchantId || !ctx?.branchId) {
      throw new NotFoundException(
        'A merchant + branch context is required to record receipts.',
      );
    }
    return { merchantId: ctx.merchantId, branchId: ctx.branchId };
  }

  /** Merchant-scoped tenant for cases where the branch is derived from
   *  domain data (e.g. sales receipts inherit the branch of the invoices
   *  they settle). Falls back to the switcher's active branch only when
   *  the domain path can't produce one. */
  private resolveMerchantForWrite(): string {
    const ctx = this.context.get();
    if (!ctx?.merchantId) {
      throw new NotFoundException(
        'A merchant context is required to record receipts.',
      );
    }
    return ctx.merchantId;
  }

  /** Decoded QR PNG for public embedding (e.g. notification emails). */
  async getQrPng(id: string): Promise<Buffer> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      select: { signedQR: true },
    });
    if (!receipt?.signedQR) {
      throw new NotFoundException(`QR for receipt ${id} not found`);
    }
    return Buffer.from(receipt.signedQR, 'base64');
  }

  async create(input: CreateReceiptDto): Promise<ReceiptWithRelations> {
    if (input.invoices.length === 0) {
      throw new ConflictException('At least one invoice is required.');
    }

    const merchantId = this.resolveMerchantForWrite();
    await this.merchants.assertMerchantActive(merchantId);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: input.invoices.map((i) => i.invoiceId) },
        merchantId,
      },
    });
    // Attribute the receipt to the branch that ISSUED the invoice being
    // settled — that keeps AR reporting coherent (invoice.branch and
    // receipt.branch match) and lets a merchant admin viewing "All branches"
    // record payments without touching the branch switcher first. All
    // invoices in one receipt must share a branch so cross-branch payment
    // aggregation stays clean.
    const invoiceBranches = new Set(invoices.map((i) => i.branchId));
    if (invoiceBranches.size > 1) {
      throw new ConflictException(
        'This receipt covers invoices from more than one branch — file one receipt per branch.',
      );
    }
    const invoiceBranchId = invoices[0]?.branchId ?? null;
    const ctx = this.context.get();
    const isMerchantAdmin = ctx?.actorRole === 'MERCHANT_ADMIN';
    const branchId = invoiceBranchId ?? ctx?.branchId ?? null;
    if (!branchId) {
      throw new NotFoundException(
        'Cannot infer a branch for this receipt — pick a branch in the top-left switcher first.',
      );
    }
    // Non-admins can only settle invoices in their own active branch. This
    // stops a cashier from paying an invoice from another branch (which
    // would attribute the receipt to that other branch's sequence).
    if (
      !isMerchantAdmin &&
      invoiceBranchId &&
      ctx?.branchId &&
      invoiceBranchId !== ctx.branchId
    ) {
      throw new ForbiddenException(
        "You can only record payments for invoices issued at your own branch.",
      );
    }
    const tenant = { merchantId, branchId };
    const byId = new Map(invoices.map((i) => [i.id, i]));
    for (const ref of input.invoices) {
      const inv = byId.get(ref.invoiceId);
      if (!inv) {
        throw new NotFoundException(`Invoice ${ref.invoiceId} not found`);
      }
      if (inv.status === 'CANCELLED') {
        throw new ConflictException(
          `Invoice ${inv.documentNumber} is cancelled and can't be paid.`,
        );
      }
      if (inv.paymentStatus === 'PAID') {
        throw new ConflictException(
          `Invoice ${inv.documentNumber} is already paid in full.`,
        );
      }
      // Overpayment guard. Cumulative paid (existing + this receipt's
      // contribution) must not exceed the invoice total — otherwise we
      // persist `paidAmount > totalValue` and the books look wrong. Same
      // 0.01 epsilon used by the PAID-flip tolerance below so FP rounding
      // on the boundary never trips this check.
      const cumulative = inv.paidAmount + ref.invoicePaidAmount;
      if (cumulative > inv.totalValue + 0.01) {
        const remaining = Math.max(0, inv.totalValue - inv.paidAmount);
        throw new ConflictException(
          `Payment of ${ref.invoicePaidAmount.toFixed(2)} ${inv.currency} exceeds the remaining due of ${remaining.toFixed(2)} ${inv.currency} on invoice ${inv.documentNumber}.`,
        );
      }
    }

    let next = await this.getNextSequence(tenant.branchId);
    const identity = this.auth.getSystemIdentity(tenant.branchId);
    const token = await this.auth.getAccessToken(tenant.branchId);

    for (let attempt = 1; attempt <= 2; attempt++) {
      const payload = this.buildPayload(input, identity, next, byId);

      try {
        const envelope = await this.postUpstream<ReceiptUpstreamEnvelope>(
          '/v1/receipt/sales',
          payload,
          token,
          tenant,
        );

        const ok =
          envelope?.statusCode >= 200 &&
          envelope.statusCode < 300 &&
          envelope.message?.toUpperCase() === 'SUCCESS';

        if (!ok) {
          const userMessages = formatEirmsErrors(envelope?.body);
          throw new BadGatewayException({
            message:
              userMessages.length > 0
                ? "We couldn't record this payment with MOR."
                : `EIRMS rejected the receipt: ${envelope?.message ?? 'unknown'}`,
            userMessages,
            statusCode: envelope?.statusCode,
            eirmsBody: envelope?.body ?? null,
          });
        }

        if (process.env.EIRMS_LOG_PAYLOADS === '1') {
          this.logger.debug(`Sent receipt payload: ${JSON.stringify(payload)}`);
        }

        const created = await this.persist(
          input,
          payload,
          envelope,
          next,
          invoices,
          tenant,
        );
        await this.notifications.enqueue({
          action: 'receipt.sales',
          receiptId: created.id,
        });
        return created;
      } catch (err) {
        if (err instanceof BadGatewayException && attempt === 1) {
          const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
          const corrected = parseExpectedReceiptCounter(body);
          if (corrected !== null) {
            this.logger.warn(
              `EIRMS expected receipt counter ${corrected}; retrying in ${RETRY_DELAY_MS}ms`,
            );
            next = {
              receiptNumber: `REC${String(corrected).padStart(16, '0')}`,
              receiptCounter: corrected,
            };
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        throw err;
      }
    }

    throw new BadGatewayException({
      message: 'EIRMS rejected the receipt even after sequence correction',
    });
  }

  private buildPayload(
    input: CreateReceiptDto,
    identity: { tin: string; systemType: string; systemNumber: string },
    next: { receiptNumber: string; receiptCounter: number },
    invoiceById: Map<string, { irn: string }>,
  ) {
    return {
      ReceiptNumber: next.receiptNumber,
      ReceiptType: 'Sales Receipts',
      Reason: input.reason ?? '',
      ReceiptDate: nowEat(),
      ReceiptCounter: String(next.receiptCounter),
      ManualReceiptNumber: input.manualReceiptNumber ?? '',
      SourceSystemType: identity.systemType,
      SourceSystemNumber: identity.systemNumber,
      ReceiptCurrency: input.receiptCurrency ?? 'ETB',
      ExchangeRate: input.exchangeRate ?? null,
      CollectedAmount: input.collectedAmount,
      SellerTIN: identity.tin,
      Invoices: input.invoices.map((line) => ({
        InvoiceIRN: invoiceById.get(line.invoiceId)?.irn ?? '',
        PaymentCoverage: line.paymentCoverage,
        InvoicePaidAmount: line.invoicePaidAmount,
        DiscountAmount: line.discountAmount ?? null,
        RemainingAmount: line.remainingAmount ?? null,
        TotalAmount: line.totalAmount,
      })),
      TransactionDetails: {
        // MoR's enum is the payment instrument:
        // CASH | CHEQUE | CPO | SWIFT | CARD | WIRE | BANK_TRANSFER |
        // LETTER_OF_CREDIT — i.e. `modeOfPayment`. The CASH/ADVANCE/CREDIT
        // classification (`paymentMode`) is local-only and never sent here.
        ModeOfPayment: input.transactionDetails.modeOfPayment,
        ChequeNumber: input.transactionDetails.chequeNumber ?? null,
        CPONumber: input.transactionDetails.cpoNumber ?? null,
        DocumentNumber: input.transactionDetails.documentNumber ?? null,
        CollectorName: input.transactionDetails.collectorName,
        PaymentServiceProvider:
          input.transactionDetails.paymentServiceProvider ?? null,
        OtherPaymentServiceProviderName:
          input.transactionDetails.otherPaymentServiceProviderName ?? null,
        AccountNumber: input.transactionDetails.accountNumber ?? null,
        TransactionNumber: input.transactionDetails.transactionNumber ?? null,
      },
    };
  }

  private async persist(
    input: CreateReceiptDto,
    payload: unknown,
    envelope: ReceiptUpstreamEnvelope,
    next: { receiptNumber: string; receiptCounter: number },
    invoices: Array<{ id: string; paidAmount: number; totalValue: number }>,
    tenant: { merchantId: string; branchId: string },
  ): Promise<ReceiptWithRelations> {
    const td = input.transactionDetails;
    const eirms = extractReceiptBody(envelope.body);
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          merchant: { connect: { id: tenant.merchantId } },
          branch: { connect: { id: tenant.branchId } },
          receiptNumber: next.receiptNumber,
          receiptType: 'Sales Receipts',
          receiptDate: nowEat(),
          receiptCounter: next.receiptCounter,
          manualReceiptNumber: input.manualReceiptNumber ?? null,
          reason: input.reason ?? null,
          collectedAmount: input.collectedAmount,
          receiptCurrency: input.receiptCurrency ?? 'ETB',
          exchangeRate: input.exchangeRate ?? null,
          modeOfPayment: td.modeOfPayment,
          paymentClassification: td.paymentMode,
          collectorName: td.collectorName,
          paymentServiceProvider: td.paymentServiceProvider ?? null,
          otherPaymentServiceProviderName:
            td.otherPaymentServiceProviderName ?? null,
          chequeNumber: td.chequeNumber ?? null,
          cpoNumber: td.cpoNumber ?? null,
          documentNumber: td.documentNumber ?? null,
          accountNumber: td.accountNumber ?? null,
          transactionNumber: td.transactionNumber ?? null,
          eirmsId: eirms?.id ?? null,
          rrn: eirms?.rrn ?? null,
          signedQR: eirms?.qr ?? null,
          eirmsStatus: eirms?.status ?? null,
          rawRequest: payload as unknown as Prisma.InputJsonValue,
          rawResponse: envelope as unknown as Prisma.InputJsonValue,
          invoices: {
            create: input.invoices.map((line) => ({
              invoiceId: line.invoiceId,
              paymentCoverage: line.paymentCoverage,
              invoicePaidAmount: line.invoicePaidAmount,
              discountAmount: line.discountAmount ?? null,
              remainingAmount: line.remainingAmount ?? null,
              totalAmount: line.totalAmount,
            })),
          },
        },
      });

      // Update each linked invoice's payment status. PAID if cumulative paid
      // covers the total within a small epsilon, else PARTIAL.
      for (const line of input.invoices) {
        const inv = invoices.find((i) => i.id === line.invoiceId);
        if (!inv) continue;
        const cumulative = inv.paidAmount + line.invoicePaidAmount;
        const isPaid = cumulative + 0.01 >= inv.totalValue;
        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: cumulative,
            paymentStatus: isPaid ? 'PAID' : 'PARTIAL',
          },
        });
      }

      return tx.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: {
          invoices: { include: { invoice: { include: { buyer: true } } } },
          ...SELLER_IDENTITY_INCLUDE,
        },
      });
    });
  }

  async getNextWithholdSequence(): Promise<{
    receiptNumber: string;
    receiptCounter: number;
    receiptCounterFormatted: string;
  }> {
    const agg = await this.prisma.receipt.aggregate({
      where: {
        kind: 'WITHHOLD',
        ...merchantScope(this.context.get()),
        ...branchScope(this.context.get()),
      },
      _max: { receiptCounter: true },
    });
    const nextCounter = (agg._max.receiptCounter ?? 0) + 1;
    return {
      // Receipt number stays a global sequence so it never collides with sales.
      receiptNumber: `WTH${String(nextCounter).padStart(16, '0')}`,
      receiptCounter: nextCounter,
      receiptCounterFormatted: `WTH${String(nextCounter).padStart(6, '0')}`,
    };
  }

  async createWithhold(
    input: CreateWithholdReceiptDto,
  ): Promise<ReceiptWithRelations> {
    const supplierIrn = input.invoiceDetail.invoiceIrn.trim();
    if (!supplierIrn) {
      throw new ConflictException("Supplier invoice IRN is required.");
    }

    const tenant = this.resolveTenantForWrite();
    await this.merchants.assertMerchantActive(tenant.merchantId);
    let next = await this.getNextWithholdSequence();
    const identity = this.auth.getSystemIdentity();
    const token = await this.auth.getAccessToken();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const payload = this.buildWithholdPayload(
        input,
        identity,
        next,
        supplierIrn,
      );

      try {
        const envelope = await this.postUpstream<ReceiptUpstreamEnvelope>(
          '/v1/receipt/withholding',
          payload,
          token,
          tenant,
        );

        const ok =
          envelope?.statusCode >= 200 &&
          envelope.statusCode < 300 &&
          envelope.message?.toUpperCase() === 'SUCCESS';

        if (!ok) {
          const userMessages = formatEirmsErrors(envelope?.body);
          throw new BadGatewayException({
            message:
              userMessages.length > 0
                ? "We couldn't file this withhold receipt with MOR."
                : `EIRMS rejected the withhold receipt: ${envelope?.message ?? 'unknown'}`,
            userMessages,
            statusCode: envelope?.statusCode,
            eirmsBody: envelope?.body ?? null,
          });
        }

        if (process.env.EIRMS_LOG_PAYLOADS === '1') {
          this.logger.debug(
            `Sent withhold payload: ${JSON.stringify(payload)}`,
          );
        }

        const eirms = extractReceiptBody(envelope.body);
        const created = await this.prisma.receipt.create({
          data: {
            merchant: { connect: { id: tenant.merchantId } },
            branch: { connect: { id: tenant.branchId } },
            kind: 'WITHHOLD',
            receiptNumber: next.receiptNumber,
            receiptType: 'Withholding Receipt',
            receiptDate: nowEat(),
            receiptCounter: next.receiptCounter,
            manualReceiptNumber: null,
            reason: input.reason ?? null,
            collectedAmount: input.withholdDetail.withholdingAmount,
            receiptCurrency: input.invoiceDetail.currency ?? 'ETB',
            exchangeRate: input.invoiceDetail.exchangeRate ?? null,
            withholdType: input.withholdDetail.type,
            withholdRate: input.withholdDetail.rate ?? 3,
            withholdPreTax: input.withholdDetail.preTaxAmount,
            withholdAmount: input.withholdDetail.withholdingAmount,
            externalInvoiceIrn: supplierIrn,
            supplierLegalName: input.supplier?.legalName ?? null,
            supplierTin: input.supplier?.tin ?? null,
            supplierSubTin: input.supplier?.subTin ?? null,
            supplierVatNumber: input.supplier?.vatNumber ?? null,
            supplierPhone: input.supplier?.phone ?? null,
            supplierEmail: input.supplier?.email ?? null,
            supplierCity: input.supplier?.city ?? null,
            supplierZone: input.supplier?.zone ?? null,
            supplierWereda: input.supplier?.wereda ?? null,
            supplierKebele: input.supplier?.kebele ?? null,
            modeOfPayment: null,
            collectorName: null,
            eirmsId: eirms?.id ?? null,
            rrn: eirms?.rrn ?? null,
            signedQR: eirms?.qr ?? null,
            eirmsStatus: eirms?.status ?? null,
            rawRequest: payload as unknown as Prisma.InputJsonValue,
            rawResponse: envelope as unknown as Prisma.InputJsonValue,
            // No ReceiptInvoice link — the supplier invoice doesn't live in
            // our DB.
          },
          include: {
            invoices: { include: { invoice: { include: { buyer: true } } } },
            ...SELLER_IDENTITY_INCLUDE,
          },
        });
        await this.notifications.enqueue({
          action: 'receipt.withholding',
          receiptId: created.id,
        });
        return created;
      } catch (err) {
        if (err instanceof BadGatewayException && attempt === 1) {
          const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
          const corrected = parseExpectedReceiptCounter(body);
          if (corrected !== null) {
            this.logger.warn(
              `EIRMS expected withhold receipt counter ${corrected}; retrying in ${RETRY_DELAY_MS}ms`,
            );
            next = {
              receiptNumber: `WTH${String(corrected).padStart(16, '0')}`,
              receiptCounter: corrected,
              receiptCounterFormatted: `WTH${String(corrected).padStart(6, '0')}`,
            };
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        throw err;
      }
    }

    throw new BadGatewayException({
      message: 'EIRMS rejected the withhold receipt even after retry',
    });
  }

  private buildWithholdPayload(
    input: CreateWithholdReceiptDto,
    identity: { tin: string; systemType: string; systemNumber: string },
    next: {
      receiptNumber: string;
      receiptCounter: number;
      receiptCounterFormatted: string;
    },
    invoiceIrn: string,
  ) {
    return {
      ReceiptNumber: next.receiptNumber,
      Reason: input.reason ?? '',
      ReceiptCounter: next.receiptCounterFormatted,
      SourceSystemType: identity.systemType,
      SourceSystemNumber: identity.systemNumber,
      InvoiceDetail: {
        InvoiceIRN: invoiceIrn,
        Currency: input.invoiceDetail.currency ?? 'ETB',
        ExchangeRate: input.invoiceDetail.exchangeRate ?? null,
      },
      WithholdDetail: {
        Type: input.withholdDetail.type,
        Rate: input.withholdDetail.rate ?? null,
        PreTaxAmount: input.withholdDetail.preTaxAmount,
        WithholdingAmount: input.withholdDetail.withholdingAmount,
      },
    };
  }

  private async postUpstream<T>(
    path: string,
    body: unknown,
    token: string,
    tenant: { merchantId: string; branchId: string },
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const startedAt = Date.now();
    const action = eirmsAction(path);
    try {
      const wireBody = this.signing.isHttps()
        ? await this.signing.wrap(body, tenant)
        : body;
      const response = await firstValueFrom(
        this.http.post<T>(url, wireBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }),
      );
      void this.audit.recordOutbound({
        action,
        path,
        requestBody: body,
        responseBody: response.data,
        statusCode: response.status,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status ?? 'network';
        const detail =
          (err.response?.data && JSON.stringify(err.response.data)) ??
          err.message;
        this.logger.error(`EIRMS ${path} transport error (${status}): ${detail}`);
        void this.audit.recordOutbound({
          action,
          path,
          requestBody: body,
          responseBody: err.response?.data ?? null,
          statusCode: typeof status === 'number' ? status : undefined,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - startedAt,
        });
        const userMessages = formatEirmsErrors(err.response?.data);
        throw new BadGatewayException({
          message:
            userMessages.length > 0
              ? "We couldn't record this payment with MOR."
              : `EIRMS ${path} call failed (${status})`,
          userMessages,
          statusCode: typeof status === 'number' ? status : 502,
          eirmsBody: err.response?.data ?? null,
        });
      }
      void this.audit.recordOutbound({
        action,
        path,
        requestBody: body,
        success: false,
        errorMessage: (err as Error).message,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  }
}

export type { ReceiptWithRelations, PublicReceiptWithRelations };

const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** MoR's flat verify shape `{ message, status }` (no envelope). */
function isFlatVerifyResponse(
  body: unknown,
): body is VerifyReceiptFlatResponse {
  return (
    !!body &&
    typeof body === 'object' &&
    typeof (body as Record<string, unknown>).message === 'string' &&
    typeof (body as Record<string, unknown>).status === 'string'
  );
}

function extractReceiptBody(body: unknown): ReceiptUpstreamBody | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  return {
    id: typeof b.id === 'number' ? b.id : undefined,
    status: typeof b.status === 'string' ? b.status : undefined,
    rrn: typeof b.rrn === 'string' ? b.rrn : undefined,
    qr: typeof b.qr === 'string' ? b.qr : undefined,
  };
}

/** EAT (UTC+3, no DST) timestamp in EIRMS-friendly format. */
function nowEat(): string {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace('Z', '+03:00');
}

/**
 * EIRMS surfaces receipt-counter mismatches the same way as invoice sequence
 * errors. Look for "expected : N" anywhere in the body.
 */
function parseExpectedReceiptCounter(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const items = (body as { body?: unknown }).body;
  const list = Array.isArray(items) ? items : [body];
  const pattern = /expected\s*:\s*(\d+)/i;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const messages =
      ((entry as { errorMessage?: unknown }).errorMessage as
        | string[]
        | undefined) ?? [];
    for (const msg of messages) {
      const match = pattern.exec(msg);
      if (match) return parseInt(match[1], 10);
    }
  }
  return null;
}
