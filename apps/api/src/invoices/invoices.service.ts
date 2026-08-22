import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService, type ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  Branch,
  Invoice,
  InvoiceDraft,
  Merchant,
} from '@prisma/client';
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
import { StoreResolverService } from '../common/store-resolver.service';
import { SystemConfigurationService } from '../system-configuration/system-configuration.service';
import {
  branchScope,
  merchantScope,
  listScope,
  tenantScope,
} from '../common/tenant-scope';
import { BuyersService } from '../buyers/buyers.service';
import { MerchantsService } from '../merchants/merchants.service';
import { eirmsConfig } from '../eirms/eirms.config';
import { EirmsAuthService } from '../eirms/eirms-auth.service';
import { EirmsSigningService } from '../eirms/eirms-signing.service';
import { formatEirmsErrors } from '../eirms/eirms-error-formatter';
import { NotificationsService } from '../notifications/notifications.service';
import { ReservationsService } from '../pos/reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  CancelInvoiceUpstreamEnvelope,
  RegisterInvoiceEnvelope,
  RegisterInvoiceResponse,
  VerifyInvoiceResult,
} from './invoices.types';

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    buyer: true;
    items: true;
    cancellation: true;
    branch: { select: typeof BRANCH_IDENTITY_SELECT };
    merchant: { select: typeof MERCHANT_IDENTITY_SELECT };
  };
}>;

/** Shape exposed by the drafts endpoints — flat scalar columns; the SPA
 *  doesn't get the verbatim MoR payload back. */
type InvoiceDraftRow = InvoiceDraft;

export interface InvoiceListFilters {
  crossBranch?: boolean;
  from?: string;
  to?: string;
  q?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject(eirmsConfig.KEY)
    private readonly config: ConfigType<typeof eirmsConfig>,
    private readonly auth: EirmsAuthService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly buyers: BuyersService,
    private readonly notifications: NotificationsService,
    private readonly configService: ConfigService,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly merchants: MerchantsService,
    private readonly signing: EirmsSigningService,
    private readonly reservations: ReservationsService,
    private readonly storeResolver: StoreResolverService,
    private readonly systemConfiguration: SystemConfigurationService,
  ) {}

  /** Resolve the (merchantId, branchId) the caller must write under when
   *  registering an invoice.
   *  - Merchant always comes from the request context — never overrideable.
   *  - Branch: cashiers (ctx.branchId set) are pinned to their branch and
   *    can't pass a different one; merchant admins / SUPER_ADMIN supply
   *    branchId via the DTO so the sale gets attributed to a specific branch
   *    (driving its MOR sequence + stock). */
  /** Tenant derived from the current request context — used by read-only
   *  MoR calls (verify, lookup, cancel) that don't take a DTO branch. Throws
   *  the same 404 as writes when the caller has no merchant context. */
  private contextTenant(): { merchantId: string; branchId: string } {
    const ctx = this.context.get();
    if (!ctx?.merchantId || !ctx?.branchId) {
      throw new NotFoundException(
        'A merchant + branch context is required for this MoR call.',
      );
    }
    return { merchantId: ctx.merchantId, branchId: ctx.branchId };
  }

  private resolveTenantForWrite(dtoBranchId?: string): {
    merchantId: string;
    branchId: string;
  } {
    const ctx = this.context.get();
    if (!ctx?.merchantId) {
      throw new NotFoundException(
        'A merchant context is required to register an invoice.',
      );
    }
    if (ctx.branchId) {
      // Cashier — explicit DTO branch must match (or be omitted).
      if (dtoBranchId && dtoBranchId !== ctx.branchId) {
        throw new NotFoundException(
          'Cashiers can only register invoices in their own branch.',
        );
      }
      return { merchantId: ctx.merchantId, branchId: ctx.branchId };
    }
    if (!dtoBranchId) {
      throw new NotFoundException(
        'Pick a branch to record this sale under (your role spans multiple branches).',
      );
    }
    return { merchantId: ctx.merchantId, branchId: dtoBranchId };
  }

  /**
   * Buyer-facing fetch for the public printable invoice page. Gated by an HMAC
   * token in the link (not a login) — a bad/missing token reads as "not found"
   * so the page shows a neutral message instead of bouncing to a login screen.
   */
  async getPublic(
    id: string,
    token: string | undefined,
  ): Promise<InvoiceWithRelations> {
    const secret =
      this.configService.get<string>('PUBLIC_LINK_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      '';
    if (!verifyPublicToken(id, token, secret)) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return this.get(id);
  }

  /**
   * Returns the IRN of the most-recently registered document for this seller,
   * or null if none exists yet. EIRMS expects `ReferenceDetails.PreviousIrn`
   * to chain back to the previous document — null/empty is tolerated for the
   * very first one only.
   */
  /** Most recently registered IRN for the caller's branch (or an explicit
   *  override). Scoped by branch because each branch chains its own IRN
   *  history with MOR. Returns null when none exists yet. */
  async getLastIrn(branchId?: string): Promise<string | null> {
    const where: Prisma.InvoiceWhereInput = {
      ...merchantScope(this.context.get()),
      ...(branchId ? { branchId } : branchScope(this.context.get())),
    };
    const row = await this.prisma.invoice.findFirst({
      where,
      select: { irn: true },
      orderBy: { createdAt: 'desc' },
    });
    return row?.irn ?? null;
  }

  /**
   * EIRMS rule (post-June-2026 semantics): a credit or debit memo carries
   * only the **difference** between what was originally billed and what
   * should have been billed. The ItemList holds correction-line(s) whose
   * qty × unitPrice equals the amount to refund (CRE) or additionally
   * charge (DEB) — not the corrected-invoice total. So the only invariant
   * we can enforce locally is that the memo total is strictly positive; a
   * zero-value memo is a no-op the cashier didn't mean to file.
   *
   * The old check (`CRE < original`, `DEB > original`) assumed the memo
   * carried the *corrected-invoice* total. That model is retired.
   */
  private async assertMemoAmountRule(input: CreateInvoiceDto): Promise<void> {
    const type = input.DocumentDetails.Type;
    if (type !== 'CRE' && type !== 'DEB') return;

    const memoTotal = input.ValueDetails.TotalValue;
    const label = type === 'CRE' ? 'Credit' : 'Debit';

    if (memoTotal <= 0) {
      throw new BadRequestException({
        message: `${label} memo total must be greater than zero.`,
        userMessages: [
          `${label} memo carries the correction amount only — enter the differing quantity/unit price on the affected line(s).`,
        ],
      });
    }

    // CRE ceiling: a credit correction can't exceed what was originally
    // billed — that would take the net negative (refund > what was paid).
    // Almost always means the cashier fell back to the old "corrected-to
    // values" habit instead of the diff. DEB has no upper bound.
    const originalIrn = input.ReferenceDetails?.RelatedDocument?.trim();
    if (!originalIrn) return;

    const original = await this.prisma.invoice.findFirst({
      where: { irn: originalIrn, ...tenantScope(this.context.get()) },
      include: { items: true },
    });
    if (!original) {
      // Do not distinguish missing from another tenant's document.
      throw new NotFoundException('Related invoice not found.');
    }

    if (type !== 'CRE') return;

    // Chained memos (CRE on CRE, CRE on DEB) have no meaningful "original
    // total" ceiling — MoR is authoritative here. Skip our per-line and
    // total ceilings when the parent is itself a memo.
    if (original.documentType !== 'INV') return;

    if (memoTotal > original.totalValue) {
      throw new BadRequestException({
        message: 'Credit memo total exceeds the original invoice total.',
        userMessages: [
          `Credit memo total (${memoTotal.toFixed(2)}) exceeds the original invoice total (${original.totalValue.toFixed(2)}). A CRE refunds against what was charged — double-check the qty × unit price on the correction line(s).`,
        ],
      });
    }

    // Per-line ceiling: even if the envelope passes, a single line's
    // correction can't exceed what was billed on the same LineNumber of
    // the original. Catches "return 15 of 10 units" where the envelope
    // check might pass because the cashier touched only one of several
    // lines.
    const originalByLine = new Map(
      original.items.map((i) => [i.lineNumber, i.totalAmount]),
    );
    for (const item of input.ItemList) {
      if (!item.changed) continue;
      const origTotal = originalByLine.get(item.LineNumber);
      if (origTotal === undefined) continue;
      if (item.TotalLineAmount > origTotal) {
        throw new BadRequestException({
          message: `Credit correction on line ${item.LineNumber} exceeds what was billed for that line.`,
          userMessages: [
            `Line ${item.LineNumber} correction (${item.TotalLineAmount.toFixed(2)}) exceeds the original line total (${origTotal.toFixed(2)}). A CRE can't refund more than was billed on that line.`,
          ],
        });
      }
    }
  }

  async getNextSequenceNumbers(branchId?: string): Promise<{
    documentNumber: string;
    invoiceCounter: number;
  }> {
    // Pull max counter via aggregate; documentNumber is a string column so we
    // fetch them all and parse. Both grow monotonically — cancelled invoices
    // still occupy their slot, so we don't skip them. Scoped per branch —
    // each branch has its own MOR sequence keyed by its system number. The
    // explicit branchId override is used by register() when a merchant admin
    // (no ctx.branchId) targets a specific branch via the DTO.
    const where: Prisma.InvoiceWhereInput = {
      ...merchantScope(this.context.get()),
      ...(branchId ? { branchId } : branchScope(this.context.get())),
    };
    const [counterAgg, rows] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _max: { invoiceCounter: true },
      }),
      this.prisma.invoice.findMany({
        where,
        select: { documentNumber: true },
      }),
    ]);
    const maxDoc = rows.reduce((max, r) => {
      const n = parseInt(r.documentNumber, 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return {
      documentNumber: String(maxDoc + 1),
      invoiceCounter: (counterAgg._max.invoiceCounter ?? 0) + 1,
    };
  }

  /** Goods and services may not be combined on a single invoice/memo. */
  private assertSingleNature(input: CreateInvoiceDto): void {
    const natures = new Set(
      input.ItemList.map((i) => i.NatureOfSupplies?.trim().toLowerCase()).filter(
        Boolean,
      ),
    );
    if (natures.size > 1) {
      throw new BadRequestException({
        message: 'An invoice cannot mix goods and services.',
        userMessages: [
          'Goods and services cannot be combined on the same invoice.',
        ],
      });
    }
    // CASH and ADVANCE settlements are paid at issue by definition — refuse
    // a deferred PaymentTerm on those, so an operator can't accidentally
    // record a Cash sale under "Net 30" (which would break AR reporting).
    const mode = input.PaymentDetails.Mode?.trim().toUpperCase();
    const term = input.PaymentDetails.PaymentTerm?.trim().toUpperCase();
    if (
      (mode === 'CASH' || mode === 'ADVANCE') &&
      term !== 'IMMIDIATE' &&
      term !== ''
    ) {
      throw new BadRequestException({
        message: `A ${mode.toLowerCase()} sale must use PaymentTerm=IMMIDIATE.`,
        userMessages: [
          `A ${mode.toLowerCase()} sale is settled at issue — set the payment term to IMMIDIATE.`,
        ],
      });
    }
  }

  /** MoR pairs ExciseTaxValue with HarmonizationCode on every line that
   *  carries excise. Refuse an ItemList with excise > 0 but no HC so the
   *  bad payload never leaves this system. */
  private assertExciseHasHarmonizationCode(input: CreateInvoiceDto): void {
    const offenders: number[] = [];
    for (const item of input.ItemList) {
      const excise = Number(item.ExciseTaxValue) || 0;
      const hc = item.HarmonizationCode?.trim();
      if (excise > 0 && !hc) offenders.push(item.LineNumber);
    }
    if (offenders.length === 0) return;
    throw new BadRequestException({
      message:
        'HarmonizationCode is required on invoice lines with an excise value.',
      userMessages: [
        `Line ${offenders.join(', ')} carries excise but no harmonization code. Set the code on the inventory item (or the custom line) before issuing.`,
      ],
    });
  }

  async register(input: CreateInvoiceDto): Promise<InvoiceWithRelations> {
    // Pin the tenant once up front so persist / sequence / IRN lookups all
    // refer to the same (merchant, branch). Cashiers' branch comes from
    // their JWT; merchant admins pass the branch explicitly in the DTO.
    const tenant = this.resolveTenantForWrite(input.branchId);
    // Refuse for pending or disabled merchants — surfaces a clear message
    // instead of an opaque EIRMS auth failure later.
    await this.merchants.assertMerchantActive(tenant.merchantId);
    this.assertSingleNature(input);
    await this.applyConfiguredTax(input);
    await this.assertMemoAmountRule(input);
    this.assertExciseHasHarmonizationCode(input);
    // cartSessionId is client-supplied; verify the caller actually owns the
    // session before we let it exclude reservations from availability or
    // trigger a release. Bogus / stolen ids are quietly discarded so a stale
    // POS tab surfaces as "not enough stock" rather than an authorization
    // error the cashier can't act on.
    const trustedCartSessionId = input.cartSessionId
      ? await this.reservations.ownedCartSessionId(input.cartSessionId)
      : undefined;
    // Refuse an over-selling INV when the branch is in BLOCK_ON_EMPTY mode.
    // Runs before we hit MoR so a live sale of a stock-empty item errors
    // cleanly instead of racing MoR + a downstream Stock adjustment.
    await this.assertStockPolicy(tenant, input, trustedCartSessionId);

    // DocumentDetails.Date is the moment the document was issued. The SPA
    // sends its own "now" so the timestamp reflects the cashier's intent;
    // we keep that value unless the device clock is far enough ahead of the
    // server's that MoR would reject it as future (it must fall within the
    // last 3 days and never lie in the future; error 7026). When that
    // happens — or when the SPA value is unparseable — we stamp the server's
    // own UTC "now" minus a 2-minute backoff, the same safe-past value used
    // for memos. Either way the persisted documentDate matches the value
    // sent to MoR.
    input.DocumentDetails.Date = safeIssuanceDate(input.DocumentDetails.Date);

    // Already passing branchId explicitly so a merchant-admin sale (no ctx
    // branchId) still hits the right branch's MOR account.
    const token = await this.auth.getAccessToken(tenant.branchId);
    const identity = this.auth.getSystemIdentity(tenant.branchId);
    // Seller info now comes from the merchant + branch DB rows (not env).
    // The env vars only seed the very first bootstrap; from there forward
    // merchants and their branches are first-class records.
    const branchWithMerchant = await this.prisma.branch.findUnique({
      where: { id: tenant.branchId },
      include: { merchant: true },
    });
    if (!branchWithMerchant) {
      throw new NotFoundException(
        `Branch ${tenant.branchId} not found while registering invoice.`,
      );
    }
    const seller = buildSellerFromMerchantBranch(branchWithMerchant);

    const [initialNext, lastIrn] = await Promise.all([
      this.getNextSequenceNumbers(tenant.branchId),
      this.getLastIrn(tenant.branchId),
    ]);
    let next = initialNext;

    // Up to two attempts: first with our DB-derived next, second with whatever
    // EIRMS tells us it actually expects (it surfaces "expected : N" in 406
    // bodies). This makes the system self-heal when our DB lags behind EIRMS
    // (e.g. fresh DB but invoices were previously registered via curl).
    for (let attempt = 1; attempt <= 2; attempt++) {
      const payload = this.buildRegisterPayload(
        input,
        identity,
        seller,
        next,
        lastIrn,
      );

      try {
        const envelope = await this.postUpstream<RegisterInvoiceEnvelope>(
          '/v1/register',
          payload,
          token,
          tenant,
        );

        const ok =
          envelope?.statusCode >= 200 &&
          envelope.statusCode < 300 &&
          envelope.message?.toUpperCase() === 'SUCCESS' &&
          envelope.body?.irn;

        if (!ok) {
          const userMessages = formatEirmsErrors(envelope?.body);
          throw new BadGatewayException({
            message:
              userMessages.length > 0
                ? "We couldn't register this invoice with MOR."
                : `EIRMS rejected the invoice: ${envelope?.body?.errorMessage ?? envelope?.message ?? 'unknown'}`,
            userMessages,
            statusCode: envelope?.statusCode,
            eirmsMessage: envelope?.message,
            eirmsBody: envelope?.body ?? null,
          });
        }

        if (process.env.EIRMS_LOG_PAYLOADS === '1') {
          this.logger.debug(`Sent payload: ${JSON.stringify(payload)}`);
        }

        const created = await this.persist(
          input,
          payload,
          envelope.body,
          next.invoiceCounter,
          tenant,
          trustedCartSessionId,
        );
        const action =
          created.documentType === 'CRE'
            ? 'memo.credit'
            : created.documentType === 'DEB'
              ? 'memo.debit'
              : 'invoice.registered';
        await this.notifications.enqueue({ action, invoiceId: created.id });
        return created;
      } catch (err) {
        if (err instanceof BadGatewayException && attempt === 1) {
          const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
          const corrected = parseExpectedSequence(body);
          if (corrected) {
            this.logger.warn(
              `EIRMS sequence drift — retrying in ${RETRY_DELAY_MS}ms with documentNumber=${corrected.documentNumber}, invoiceCounter=${corrected.invoiceCounter}`,
            );
            next = corrected;
            // MOR rate-limits when we hammer it back-to-back. Pause briefly
            // before the corrected retry so we don't trigger 429.
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        throw err;
      }
    }

    throw new BadGatewayException({
      message: 'EIRMS rejected the invoice even after sequence correction',
    });
  }

  /** The backend owns invoice arithmetic. Client totals are overwritten using
   * active global tax configuration before validation, EIRMS, and persistence. */
  async calculate(input: CreateInvoiceDto) {
    this.assertSingleNature(input);
    const result = await this.systemConfiguration.calculateLines(
      input.ItemList,
    );
    const nature = this.invoiceNature(input);
    const withholding = await this.systemConfiguration.withholding(
      result.preTaxValue,
      nature,
    );
    return { ...result, withholding };
  }

  private async applyConfiguredTax(input: CreateInvoiceDto): Promise<void> {
    const result = await this.systemConfiguration.calculateLines(
      input.ItemList,
    );
    const byLine = new Map(result.lines.map((line) => [line.LineNumber, line]));
    for (const item of input.ItemList) {
      const resolved = byLine.get(item.LineNumber)!;
      item.TaxCode = resolved.TaxCode;
      item.PreTaxValue = resolved.PreTaxValue;
      item.ExciseTaxValue = resolved.ExciseTaxValue;
      item.TaxAmount = resolved.TaxAmount;
      item.TotalLineAmount = resolved.TotalLineAmount;
      item.resolvedTaxRate = resolved.TaxRate;
      item.resolvedTaxType = resolved.TaxType;
    }
    input.ValueDetails.ExciseValue = result.exciseValue;
    input.ValueDetails.TaxValue = result.taxValue;
    input.ValueDetails.TotalValue = result.totalValue;
    if (input.DocumentDetails.Type === 'INV') {
      const withholding = await this.systemConfiguration.withholding(
        result.preTaxValue,
        this.invoiceNature(input),
      );
      input.ValueDetails.IncomeWithholdValue = withholding.withholdingAmount;
      input.resolvedWithholding = withholding;
    }
  }

  private invoiceNature(input: CreateInvoiceDto): 'goods' | 'service' {
    return input.ItemList[0]?.NatureOfSupplies?.trim().toLowerCase() ===
      'service'
      ? 'service'
      : 'goods';
  }

  private buildRegisterPayload(
    input: CreateInvoiceDto,
    identity: { tin: string; systemType: 'POS'; systemNumber: string },
    seller: SellerForPayload,
    next: { documentNumber: string; invoiceCounter: number },
    lastIrn: string | null,
  ) {
    // Memo (CRE / DEB) payloads carry only the lines that were actually
    // changed — each line keeps its **original** LineNumber from the invoice
    // it amends so MoR can reconcile. Invoices forward the full ItemList.
    const isMemo =
      input.DocumentDetails.Type === 'CRE' ||
      input.DocumentDetails.Type === 'DEB';
    const sourceItems = isMemo
      ? input.ItemList.filter((item) => item.changed)
      : input.ItemList;
    const upstreamItems = sourceItems.map(
      ({ inventoryItemId: _ignored, changed: _changed, ...rest }) => rest,
    );

    // ValueDetails MUST agree with what's in ItemList — MoR cross-checks and
    // rejects "Calculation accuracy error" otherwise. The SPA does its own
    // computation against the same filtered set, but for memos we also
    // recompute server-side so a stale or inconsistent client can't trigger
    // a 4xx loop. The whole-invoice ValueDetails from the SPA is honoured
    // verbatim for non-memo documents.
    const valueDetails = isMemo
      ? recomputeValueDetails(upstreamItems, input.ValueDetails)
      : input.ValueDetails;
    return {
      BuyerDetails: normaliseBuyerForMor(
        input.BuyerDetails as unknown as Record<string, unknown>,
      ),
      DocumentDetails: {
        ...input.DocumentDetails,
        DocumentNumber: next.documentNumber,
      },
      ItemList: upstreamItems,
      PaymentDetails: input.PaymentDetails,
      ReferenceDetails: {
        PreviousIrn: lastIrn ?? '',
        RelatedDocument: input.ReferenceDetails?.RelatedDocument ?? null,
      },
      SellerDetails: {
        Tin: identity.tin,
        LegalName: input.SellerOverrides?.LegalName ?? seller.legalName,
        Email: input.SellerOverrides?.Email ?? seller.email,
        Phone: input.SellerOverrides?.Phone ?? seller.phone,
        Region: input.SellerOverrides?.Region ?? seller.region,
        Wereda: input.SellerOverrides?.Wereda ?? seller.wereda,
        VatNumber: input.SellerOverrides?.VatNumber ?? seller.vatNumber,
        City: input.SellerOverrides?.City ?? seller.city ?? null,
        HouseNumber:
          input.SellerOverrides?.HouseNumber ?? seller.houseNumber ?? null,
        SubCity: input.SellerOverrides?.SubCity ?? null,
        Locality: input.SellerOverrides?.Locality ?? null,
      },
      SourceSystem: {
        CashierName: input.SourceSystem.CashierName,
        InvoiceCounter: next.invoiceCounter,
        SalesPersonName: input.SourceSystem.SalesPersonName,
        SystemNumber: identity.systemNumber,
        SystemType: identity.systemType,
      },
      TransactionType: input.TransactionType,
      ValueDetails: valueDetails,
      Version: '1',
    };
  }

  /**
   * `status` flattens two columns the user thinks of as one list: CANCELLED
   * lives on `status`, the rest on `paymentStatus`. A cancelled invoice keeps
   * whatever payment status it had, so CANCELLED is checked first and wins.
   */
  private invoiceStatusWhere(status?: string): Prisma.InvoiceWhereInput {
    switch (status) {
      case 'CANCELLED':
        return { status: 'CANCELLED' };
      case 'PAID':
      case 'UNPAID':
      case 'PARTIAL':
        return { status: { not: 'CANCELLED' }, paymentStatus: status };
      default:
        return {};
    }
  }

  async list(opts: InvoiceListFilters = {}): Promise<Page<InvoiceWithRelations>> {
    const take = pageSize(opts.limit);
    const createdAt = dateRange(opts.from, opts.to);
    const q = opts.q?.trim();
    const where: Prisma.InvoiceWhereInput = {
      ...listScope(this.context.get(), { crossBranch: opts.crossBranch }),
      ...this.invoiceStatusWhere(opts.status),
      ...(createdAt ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { buyer: { legalName: { contains: q, mode: 'insensitive' } } },
              { buyer: { tin: { contains: q, mode: 'insensitive' } } },
              { documentNumber: { contains: q, mode: 'insensitive' } },
              { irn: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          buyer: true,
          items: true,
          cancellation: true,
          ...SELLER_IDENTITY_INCLUDE,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...cursorArgs(opts.cursor, take),
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return toPage(rows, take, total);
  }

  async get(id: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...tenantScope(this.context.get()) },
      include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  /**
   * Resolve an invoice by its MoR-issued IRN — used by the receipts page's
   * "record payment by IRN" dialog so the cashier can settle an invoice
   * from a printed copy without first locating it in the list. Tenant-
   * scoped via `tenantScope`: a merchant user cannot pull another tenant's
   * row even if they happen to type a correct IRN.
   *
   * `Invoice.irn` is globally unique (MoR-assigned), but the tenant filter
   * is what enforces the read; without it a SUPER_ADMIN bootstrap would
   * silently expose any tenant's row.
   */
  /**
   * Return every invoice that participates in this document's chain: the
   * root INV (found by walking `relatedIrn` upward), and every memo (CRE /
   * DEB) whose `relatedIrn` points at any node already in the chain. Nodes
   * come back ordered by ackDate/createdAt so the SPA can render a timeline.
   *
   * Cheap: at most three DB round-trips regardless of chain depth (upward
   * walk, root-siblings, descendant siblings). Guards against corrupt
   * self-referencing loops by capping the upward walk at 8 hops.
   */
  async getChain(id: string): Promise<InvoiceWithRelations[]> {
    const anchor = await this.get(id);
    const seen = new Map<string, InvoiceWithRelations>();
    seen.set(anchor.irn, anchor);

    let current: InvoiceWithRelations | null = anchor;
    for (let hop = 0; hop < 8 && current?.relatedIrn; hop++) {
      if (seen.has(current.relatedIrn)) break;
      const parent = await this.prisma.invoice.findFirst({
        where: { irn: current.relatedIrn, ...tenantScope(this.context.get()) },
        include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
      });
      if (!parent) break;
      seen.set(parent.irn, parent);
      current = parent;
    }

    // Descendant expansion — any memo whose relatedIrn is in the set.
    let frontier = Array.from(seen.values()).map((n) => n.irn);
    while (frontier.length) {
      const children = await this.prisma.invoice.findMany({
        where: {
          relatedIrn: { in: frontier },
          ...tenantScope(this.context.get()),
        },
        include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
      });
      const fresh = children.filter((c) => !seen.has(c.irn));
      if (fresh.length === 0) break;
      for (const c of fresh) seen.set(c.irn, c);
      frontier = fresh.map((c) => c.irn);
    }

    return Array.from(seen.values()).sort((a, b) => {
      const ta = a.ackDate?.trim() || a.createdAt.toISOString();
      const tb = b.ackDate?.trim() || b.createdAt.toISOString();
      return ta.localeCompare(tb);
    });
  }

  async getByIrn(irn: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { irn, ...tenantScope(this.context.get()) },
      include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with IRN ${irn} not found`);
    }
    return invoice;
  }

  // ===========================================================================
  // Offline-issued drafts (POST /invoices/draft + /invoices/drafts/:id/sync)
  // ===========================================================================

  /**
   * Persist a draft invoice without touching MoR. Used as the auto-fallback
   * when {@link register} fails with a transport/EIRMS error so the cashier
   * can keep selling through an outage. The payload is captured verbatim
   * (with documentNumber + invoiceCounter recomputed at sync time) so the
   * eventual sync can replay it byte-for-byte modulo sequence corrections.
   */
  /**
   * Offline drafts are parked. The feature stays in the codebase behind
   * DRAFTS_ENABLED but is off by default: nothing creates, lists or syncs a
   * draft, and the background sync job is not scheduled. Flip the env var to
   * bring it back.
   */
  private get draftsEnabled(): boolean {
    return this.configService.get<string>('DRAFTS_ENABLED') === 'true';
  }

  private assertDraftsEnabled(): void {
    if (!this.draftsEnabled) {
      throw new NotFoundException('Offline drafts are not enabled.');
    }
  }

  async createDraft(input: CreateInvoiceDto): Promise<InvoiceDraftRow> {
    this.assertDraftsEnabled();
    const tenant = this.resolveTenantForWrite(input.branchId);
    await this.merchants.assertMerchantActive(tenant.merchantId);
    await this.assertMemoAmountRule(input);
    this.assertSingleNature(input);
    this.assertExciseHasHarmonizationCode(input);
    // CRE/DEB drafts must reference an already-SYNCED original. We can't
    // chain a draft against an unsynced parent because the parent has no
    // IRN yet — MoR would reject the sync, and there's no clean way to
    // recover. The SPA also blocks this affordance.
    if (
      input.DocumentDetails.Type === 'CRE' ||
      input.DocumentDetails.Type === 'DEB'
    ) {
      const relatedIrn = input.ReferenceDetails?.RelatedDocument?.trim();
      if (!relatedIrn) {
        throw new BadRequestException({
          message: 'Memo drafts must reference an original invoice.',
          userMessages: [
            "Pick the original invoice for this memo before saving as draft.",
          ],
        });
      }
      const parentExists = await this.prisma.invoice.findFirst({
        where: { irn: relatedIrn, ...tenantScope(this.context.get()) },
        select: { id: true },
      });
      if (!parentExists) {
        throw new BadRequestException({
          message:
            "The original invoice referenced by this memo isn't synced with MoR.",
          userMessages: [
            "Wait until the original invoice is registered with MoR before drafting a memo against it.",
          ],
        });
      }
    }

    input.DocumentDetails.Date = safeIssuanceDate(input.DocumentDetails.Date);

    const branchWithMerchant = await this.prisma.branch.findUnique({
      where: { id: tenant.branchId },
      include: { merchant: true },
    });
    if (!branchWithMerchant) {
      throw new NotFoundException(
        `Branch ${tenant.branchId} not found while saving draft.`,
      );
    }
    const seller = buildSellerFromMerchantBranch(branchWithMerchant);
    // Best-effort system identity. The cached EIRMS token may be cold (no
    // login since boot) — that's fine, the identity falls back to env-shape
    // defaults and sync re-stamps SystemNumber from the live token.
    const identity = this.auth.getSystemIdentity(tenant.branchId);

    const [syncedNext, lastIrn, draftMax] = await Promise.all([
      this.getNextSequenceNumbers(tenant.branchId),
      this.getLastIrn(tenant.branchId),
      this.maxDraftDocumentNumber(tenant.branchId),
    ]);
    // Provisional number = max(synced max, drafts max) + 1. Drafts share
    // the sequence with issued invoices for display purposes; sync
    // recomputes against SYNCED-only at MoR-send time.
    const provisionalCounter = Math.max(
      syncedNext.invoiceCounter,
      draftMax + 1,
    );
    const next = {
      documentNumber: String(provisionalCounter),
      invoiceCounter: provisionalCounter,
    };

    const payload = this.buildRegisterPayload(
      input,
      identity,
      seller,
      next,
      lastIrn,
    );

    const buyerTinRaw = input.BuyerDetails.Tin?.trim();
    const draftIsMemo =
      input.DocumentDetails.Type === 'CRE' ||
      input.DocumentDetails.Type === 'DEB';
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const draft = await this.prisma.invoiceDraft.create({
      data: {
        provisionalDocumentNumber: next.documentNumber,
        payload: payload as unknown as Prisma.InputJsonValue,
        documentType: input.DocumentDetails.Type,
        transactionType: input.TransactionType,
        buyerTin: buyerTinRaw || null,
        buyerLegalName: input.BuyerDetails.LegalName,
        // A memo carries only the correction, so its total is the sum over the
        // changed lines — not the parent invoice's total the SPA sends in
        // ValueDetails. Same rule persist() applies on sync.
        totalValue: draftIsMemo
          ? round2(
              input.ItemList.filter((i) => i.changed).reduce(
                (sum, i) => sum + i.TotalLineAmount,
                0,
              ),
            )
          : input.ValueDetails.TotalValue,
        currency: input.ValueDetails.InvoiceCurrency,
        cashierName: input.SourceSystem.CashierName,
        salespersonName: input.SourceSystem.SalesPersonName,
        relatedIrn:
          input.ReferenceDetails?.RelatedDocument?.trim() || null,
        status: 'PENDING',
        merchantId: tenant.merchantId,
        branchId: tenant.branchId,
      },
    });
    return draft;
  }

  listDrafts(): Promise<InvoiceDraftRow[]> {
    this.assertDraftsEnabled();
    return this.prisma.invoiceDraft.findMany({
      where: { ...tenantScope(this.context.get()) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDraft(id: string): Promise<InvoiceDraftRow> {
    const draft = await this.prisma.invoiceDraft.findFirst({
      where: { id, ...tenantScope(this.context.get()) },
    });
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    return draft;
  }

  async deleteDraft(id: string): Promise<{ ok: true }> {
    this.assertDraftsEnabled();
    const draft = await this.getDraft(id);
    await this.prisma.invoiceDraft.delete({ where: { id: draft.id } });
    return { ok: true };
  }

  /**
   * Push a draft to MoR /v1/register. On success: atomically delete the
   * draft and create the real {@link Invoice} row in a single transaction
   * — the same `persist()` helper the live path uses, with the same
   * sequence self-heal loop on a 406 with corrected counters.
   *
   * Concurrency: a SYNCING-state mutex (set via a conditional update so
   * the read-then-update is atomic at the DB level) prevents two callers
   * from racing the same draft to MoR.
   */
  async syncDraft(id: string): Promise<InvoiceWithRelations> {
    this.assertDraftsEnabled();
    // Atomic transition PENDING|SYNC_FAILED → SYNCING. updateMany gives us
    // a count without the throw-on-not-found that `update` does, so we
    // can distinguish "already syncing" from "doesn't exist".
    const acquired = await this.prisma.invoiceDraft.updateMany({
      where: {
        id,
        ...tenantScope(this.context.get()),
        status: { in: ['PENDING', 'SYNC_FAILED'] },
      },
      data: { status: 'SYNCING', lastAttemptAt: new Date() },
    });
    if (acquired.count === 0) {
      // Either doesn't exist in this tenant, or already SYNCING.
      const existing = await this.prisma.invoiceDraft.findFirst({
        where: { id, ...tenantScope(this.context.get()) },
        select: { status: true },
      });
      if (!existing) throw new NotFoundException(`Draft ${id} not found`);
      throw new ConflictException(
        `Draft ${id} is already being synced (status: ${existing.status}).`,
      );
    }

    let draft: InvoiceDraftRow;
    try {
      draft = await this.getDraft(id);
    } catch (err) {
      // Shouldn't happen — we just acquired it. Defensive.
      await this.markDraftFailed(id, (err as Error).message);
      throw err;
    }

    const tenant = {
      merchantId: draft.merchantId,
      branchId: draft.branchId,
    };
    await this.merchants.assertMerchantActive(tenant.merchantId);

    const payload = draft.payload as Record<string, unknown>;
    // Re-stamp the payload's identity + sequence + previous IRN against
    // the current state of the branch. Other invoices may have been
    // registered live during the outage; we must land on the next free
    // counter, not the provisional one we picked at draft-creation.
    const token = await this.auth.getAccessToken(tenant.branchId);
    const identity = this.auth.getSystemIdentity(tenant.branchId);
    const [syncedNext, lastIrn] = await Promise.all([
      this.getNextSequenceNumbers(tenant.branchId),
      this.getLastIrn(tenant.branchId),
    ]);
    let next = syncedNext;
    payload.SourceSystem = {
      ...(payload.SourceSystem as Record<string, unknown>),
      SystemNumber: identity.systemNumber,
      SystemType: identity.systemType,
    };
    (payload.ReferenceDetails as Record<string, unknown>).PreviousIrn =
      lastIrn ?? '';

    // Stock gate, before the MoR call — this is the path that previously
    // escaped it entirely. A draft can sit for hours, so re-check against
    // stock as it is now rather than as it was when the cashier saved it.
    // Failing here marks the draft failed and leaves nothing upstream.
    const draftDto = payloadToCreateInvoiceDto(payload);
    try {
      await this.assertStockPolicy(tenant, draftDto);
    } catch (err) {
      await this.markDraftFailed(draft.id, (err as Error).message);
      throw err;
    }

    // Sync loop: same two-attempt sequence self-heal as the live path.
    for (let attempt = 1; attempt <= 2; attempt++) {
      (payload.DocumentDetails as Record<string, unknown>).DocumentNumber =
        next.documentNumber;
      (payload.SourceSystem as Record<string, unknown>).InvoiceCounter =
        next.invoiceCounter;

      try {
        const envelope = await this.postUpstream<RegisterInvoiceEnvelope>(
          '/v1/register',
          payload,
          token,
          tenant,
        );
        const ok =
          envelope?.statusCode >= 200 &&
          envelope.statusCode < 300 &&
          envelope.body?.irn;
        if (!ok) {
          throw new BadGatewayException({
            message: 'EIRMS returned an unsuccessful envelope on sync.',
            eirmsBody: envelope,
          });
        }

        // Persist the real Invoice row using the same helper the live
        // register path uses. Then delete the draft. Not wrapped in a
        // transaction on purpose — persist() needs to upsert the buyer,
        // and threading a tx client through `BuyersService` is more
        // refactor than it's worth here. If the delete fails after the
        // create succeeds we have a duplicate draft row visible briefly;
        // we log loudly so an operator can clean it up. Data-duplication
        // is the right failure mode over data-loss.
        const created = await this.persist(
          payloadToCreateInvoiceDto(payload),
          payload,
          envelope.body,
          next.invoiceCounter,
          tenant,
        );
        try {
          await this.prisma.invoiceDraft.delete({ where: { id: draft.id } });
        } catch (err) {
          this.logger.error(
            `Synced draft ${draft.id} → invoice ${created.id} (IRN ${created.irn}) but failed to delete the draft row: ${(err as Error).message}. Manual cleanup needed.`,
          );
        }

        const action =
          created.documentType === 'CRE'
            ? 'memo.credit'
            : created.documentType === 'DEB'
              ? 'memo.debit'
              : 'invoice.registered';
        await this.notifications.enqueue({
          action,
          invoiceId: created.id,
        });
        return created;
      } catch (err) {
        if (err instanceof BadGatewayException && attempt === 1) {
          const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
          const corrected = parseExpectedSequence(body);
          if (corrected) {
            this.logger.warn(
              `EIRMS sequence drift on draft sync — retrying with documentNumber=${corrected.documentNumber}, invoiceCounter=${corrected.invoiceCounter}`,
            );
            next = corrected;
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        const message =
          err instanceof Error ? err.message : 'unknown sync failure';
        await this.markDraftFailed(id, message);
        throw err;
      }
    }

    await this.markDraftFailed(
      id,
      'EIRMS rejected the draft even after sequence correction.',
    );
    throw new BadGatewayException({
      message: 'EIRMS rejected the draft even after sequence correction',
    });
  }

  /** Mark a draft as SYNC_FAILED with a truncated last-error message. */
  private async markDraftFailed(id: string, message: string): Promise<void> {
    await this.prisma.invoiceDraft.update({
      where: { id },
      data: {
        status: 'SYNC_FAILED',
        lastError: message.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
  }

  /** Max provisional document number across PENDING + SYNC_FAILED drafts
   *  in this branch (SYNCING drafts in flight are also included to be
   *  conservative). Returns 0 when there are none. */
  private async maxDraftDocumentNumber(branchId: string): Promise<number> {
    const rows = await this.prisma.invoiceDraft.findMany({
      where: { branchId },
      select: { provisionalDocumentNumber: true },
    });
    let max = 0;
    for (const r of rows) {
      const n = parseInt(r.provisionalDocumentNumber, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  /**
   * Resolve an invoice by IRN; if it isn't local, ask MoR /v1/verify for it
   * and persist a stub `Invoice` row marked `source: EXTERNAL` so the
   * standard receipt flow can settle it. Idempotent: a second call with
   * the same IRN returns the row created on the first.
   *
   * Tenant safety: the EIRMS auth token used for /v1/verify is keyed to
   * the caller's branch, so MoR rejects any IRN not in that merchant's
   * scope — there's no cross-merchant import path. Cancelled invoices are
   * refused explicitly so a cashier can't accidentally file a receipt
   * against one.
   */
  async importFromIrn(irn: string): Promise<InvoiceWithRelations> {
    // Already local? (Idempotent; covers the user pasting the same IRN twice
    // or hitting the dialog after the import already happened.)
    const existing = await this.prisma.invoice.findFirst({
      where: { irn, ...tenantScope(this.context.get()) },
      include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
    });
    if (existing) return existing;

    const tenant = this.resolveTenantForWrite();
    await this.merchants.assertMerchantActive(tenant.merchantId);

    // /v1/verify against the caller's branch token. MoR-side rejection
    // covers both "no such IRN" and "IRN exists but isn't yours".
    const token = await this.auth.getAccessToken(tenant.branchId);
    let verify: VerifyInvoiceResult;
    try {
      verify = await this.postUpstream<VerifyInvoiceResult>(
        '/v1/verify',
        { irn },
        token,
        tenant,
      );
    } catch (err) {
      if (err instanceof BadGatewayException) {
        const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
        if (isFlatVerifyResponse(body)) {
          // MoR's flat-shape responses are usually "Invoice is cancelled"
          // or similar — informational, not transport failure.
          throw new ConflictException({
            message: `MoR: ${body.message}`,
            userMessages: [
              'This IRN is not in an active state in MoR and cannot have a receipt filed against it.',
            ],
          });
        }
      }
      throw new NotFoundException(
        `Could not verify IRN ${irn} with MoR. Double-check the value, or it may not belong to this merchant.`,
      );
    }

    if (isFlatVerifyResponse(verify)) {
      throw new ConflictException({
        message: `MoR: ${verify.message}`,
        userMessages: [
          'This IRN is not in an active state in MoR and cannot have a receipt filed against it.',
        ],
      });
    }
    const body = verify.body;
    if (!body || Array.isArray(body)) {
      throw new NotFoundException(
        `MoR did not return invoice details for IRN ${irn}.`,
      );
    }
    const view = body as Record<string, unknown>;
    const status = String(view.Status ?? '').toUpperCase();
    if (status.includes('CANCEL')) {
      throw new ConflictException({
        message: `Invoice ${irn} is cancelled in MoR.`,
        userMessages: [
          'You cannot record a payment against a cancelled invoice.',
        ],
      });
    }

    // ---------------- map MoR verify body → local Invoice ----------------
    const documentDetails = (view.DocumentDetails ?? {}) as Record<
      string,
      unknown
    >;
    const valueDetails = (view.ValueDetails ?? {}) as Record<string, unknown>;
    const paymentDetails = (view.PaymentDetails ?? {}) as Record<
      string,
      unknown
    >;
    const sourceSystem = (view.SourceSystem ?? {}) as Record<string, unknown>;
    const buyerDetails = (view.BuyerDetails ?? {}) as Record<string, unknown>;
    const itemList = (view.ItemList ?? []) as Array<Record<string, unknown>>;

    // Buyer — upsert by TIN within the tenant. Walk-in fallback keyed to
    // the same `WALKIN` sentinel the register flow uses.
    const buyerTinRaw =
      typeof buyerDetails.Tin === 'string' ? buyerDetails.Tin.trim() : '';
    const buyerTin = buyerTinRaw || 'WALKIN';
    const isWalkIn = buyerTin === 'WALKIN';
    const buyer = await this.buyers.upsertByTin({
      tin: buyerTin,
      legalName: isWalkIn
        ? 'Walk In Customer'
        : (buyerDetails.LegalName as string) || 'Unknown',
      email: pickStr(buyerDetails.Email),
      phone: pickStr(buyerDetails.Phone),
      vatNumber: pickStr(buyerDetails.VatNumber),
      idType: pickStr(buyerDetails.IdType),
      idNumber: pickStr(buyerDetails.IdNumber),
      houseNumber: pickStr(buyerDetails.HouseNumber),
      region: pickStr(buyerDetails.Region),
      country: pickStr(buyerDetails.Country),
      zone: pickStr(buyerDetails.Zone),
      kebele: pickStr(buyerDetails.Kebele),
      wereda: pickStr(buyerDetails.Wereda),
      city: pickStr(buyerDetails.City),
    });

    const totalValue = num(valueDetails.TotalValue);
    const taxValue = num(valueDetails.TaxValue);
    const preTaxValue =
      totalValue > 0 ? totalValue - taxValue : sumNum(itemList, 'PreTaxValue');
    const natureOfSupplies =
      (itemList[0]?.NatureOfSupplies as string) || 'goods';

    try {
      return await this.prisma.invoice.create({
        data: {
          irn,
          documentNumber: (documentDetails.DocumentNumber as string) ?? '',
          documentType: (documentDetails.Type as string) || 'INV',
          documentDate: (documentDetails.Date as string) ?? '',
          // We don't have an ackDate — MoR's verify doesn't return one.
          // Empty string keeps the column NOT NULL invariant; consumers
          // already treat empty `ackDate` as "not stamped yet".
          ackDate: '',
          status: 'ACCEPTED',
          eirmsStatus: status || 'A',
          // MoR's verify response carries neither the QR PNG nor the signed
          // invoice bytes. Empty strings honour the NOT NULL schema; the
          // print + email layers gate on `signedQR && ...` so the missing
          // QR is rendered as a placeholder (no broken image).
          signedQR: '',
          signedInvoice: '',
          preTaxValue,
          taxValue,
          totalValue,
          withholdValue: num(valueDetails.IncomeWithholdValue),
          currency: (valueDetails.InvoiceCurrency as string) || 'ETB',
          transactionType: (view.TransactionType as string) || 'B2C',
          natureOfSupplies,
          paymentMode: (paymentDetails.Mode as string) || 'CASH',
          paymentTerm: (paymentDetails.PaymentTerm as string) || 'IMMIDIATE',
          cashierName: (sourceSystem.CashierName as string) ?? '',
          salespersonName: (sourceSystem.SalesPersonName as string) ?? '',
          invoiceCounter: Number(sourceSystem.InvoiceCounter ?? 0),
          relatedIrn:
            (documentDetails.Type as string) === 'CRE' ||
            (documentDetails.Type as string) === 'DEB'
              ? typeof (view.ReferenceDetails as Record<string, unknown>)?.RelatedDocument === 'string'
                ? ((view.ReferenceDetails as Record<string, unknown>).RelatedDocument as string).trim() || null
                : null
              : null,
          // No "we sent this to MoR" payload — we received it. Persist a
          // small marker so memo flows (which read rawRequest) can tell
          // this row apart from a real registration. The verify envelope
          // lives on rawResponse for forensic recovery.
          rawRequest: {
            _imported: true,
            irn,
          } as unknown as Prisma.InputJsonValue,
          rawResponse: verify as unknown as Prisma.InputJsonValue,
          source: 'EXTERNAL',
          buyer: { connect: { id: buyer.id } },
          merchant: { connect: { id: tenant.merchantId } },
          branch: { connect: { id: tenant.branchId } },
          items: {
            create: itemList.map((it, idx) => ({
              lineNumber: Number(it.LineNumber ?? idx + 1),
              itemCode: String(it.ItemCode ?? ''),
              description: String(it.ProductDescription ?? ''),
              unit: String(it.Unit ?? ''),
              quantity: num(it.Quantity),
              unitPrice: num(it.UnitPrice),
              discount: num(it.Discount),
              taxCode: String(it.TaxCode ?? ''),
              taxAmount: num(it.TaxAmount),
              preTaxValue: num(it.PreTaxValue),
              totalAmount: num(it.TotalLineAmount),
            })),
          },
        },
        include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
      });
    } catch (err) {
      // Concurrent import: two cashiers click "Find" on the same IRN at the
      // same time — the second create races a P2002 on `irn @unique`.
      // Re-read and return the winning row so the second caller is happy.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const racedIn = await this.prisma.invoice.findFirst({
          where: { irn, ...tenantScope(this.context.get()) },
          include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
        });
        if (racedIn) return racedIn;
      }
      throw err;
    }
  }

  /** Decoded QR PNG for public embedding (e.g. notification emails). The QR is
   *  already printed on the invoice, so it carries no extra confidentiality. */
  async getQrPng(id: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { signedQR: true },
    });
    if (!invoice?.signedQR) {
      throw new NotFoundException(`QR for invoice ${id} not found`);
    }
    return Buffer.from(invoice.signedQR, 'base64');
  }

  /**
   * Re-checks the current state of an invoice with EIRMS via /v1/verify.
   * Returns whatever MOR sent back — either the standard `{statusCode,message,body}`
   * envelope or the flat `{message,status}` shape (used for cancelled invoices).
   * Does not mutate local state; verification is a passive check.
   */
  async verify(id: string): Promise<VerifyInvoiceResult> {
    const invoice = await this.get(id);
    // Verify signs with the invoice's origin branch — that's the branch
    // whose creds registered the invoice with MoR, so it's the branch whose
    // token + cert MoR expects on the /v1/verify call.
    const tenant = {
      merchantId: invoice.merchantId,
      branchId: invoice.branchId,
    };
    const token = await this.auth.getAccessToken(tenant.branchId);
    try {
      return await this.postUpstream<VerifyInvoiceResult>(
        '/v1/verify',
        { irn: invoice.irn },
        token,
        tenant,
      );
    } catch (err) {
      // MOR sometimes returns the cancelled shape as a 4xx body. That's
      // informational, not a transport error, so unwrap it instead of throwing.
      if (err instanceof BadGatewayException) {
        const body = (err.getResponse() as { eirmsBody?: unknown }).eirmsBody;
        if (isFlatVerifyResponse(body)) {
          return body;
        }
      }
      throw err;
    }
  }

  /**
   * Read-only IRN lookup against MoR /v1/verify — no persistence. Powers the
   * "check an invoice from external sources" dialog on the invoice list: the
   * caller pastes an IRN and sees MoR's authoritative details before deciding
   * whether to import it (via importFromIrn). Returns MoR's envelope or the
   * flat shape used for cancelled/non-active documents.
   */
  async lookupByIrn(irn: string): Promise<VerifyInvoiceResult> {
    const tenant = this.contextTenant();
    const token = await this.auth.getAccessToken(tenant.branchId);
    try {
      return await this.postUpstream<VerifyInvoiceResult>(
        '/v1/verify',
        { irn },
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

  async cancel(
    id: string,
    input: CancelInvoiceDto,
  ): Promise<InvoiceWithRelations> {
    const invoice = await this.get(id);
    if (invoice.status === 'CANCELLED' || invoice.cancellation) {
      throw new ConflictException('Invoice already cancelled');
    }

    // Cancel goes back to the branch that registered the invoice — same
    // creds, same cert. Auditing and receipts stay aligned this way.
    const tenant = {
      merchantId: invoice.merchantId,
      branchId: invoice.branchId,
    };
    const token = await this.auth.getAccessToken(tenant.branchId);
    const payload = {
      Irn: invoice.irn,
      ReasonCode: input.reasonCode,
      Remark: input.remark ?? '',
    };
    const envelope = await this.postUpstream<CancelInvoiceUpstreamEnvelope>(
      '/v1/cancel',
      payload,
      token,
      tenant,
    );

    const ok =
      envelope?.statusCode >= 200 &&
      envelope.statusCode < 300 &&
      envelope.message?.toUpperCase() === 'SUCCESS';

    if (!ok) {
      throw new BadGatewayException({
        message: `EIRMS rejected the cancellation: ${envelope?.message ?? 'unknown'}`,
        statusCode: envelope?.statusCode,
        eirmsBody: envelope?.body ?? null,
      });
    }

    const ackDate =
      typeof envelope.body?.ackDate === 'string'
        ? envelope.body.ackDate
        : null;

    // Stock the sale consumed goes back. Read the store off the SALE ledger
    // rows rather than re-resolving the sales floor — the isSalesFloor flag
    // may have moved to a different store since the sale.
    const saleMovements = await this.prisma.stockMovement.findMany({
      where: { refType: 'invoice', refId: invoice.id, reason: 'SALE' },
    });

    const cancelled = await this.prisma.$transaction(async (tx) => {
      for (const mv of saleMovements) {
        if (!mv.storeId) continue;
        await tx.inventoryStock.upsert({
          where: {
            inventoryItemId_storeId: {
              inventoryItemId: mv.inventoryItemId,
              storeId: mv.storeId,
            },
          },
          create: {
            inventoryItemId: mv.inventoryItemId,
            storeId: mv.storeId,
            quantity: -mv.delta,
          },
          update: { quantity: { increment: -mv.delta } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryItemId: mv.inventoryItemId,
            delta: -mv.delta,
            reason: 'ADJUSTMENT',
            note: 'Invoice cancelled',
            refType: 'invoice-cancel',
            refId: invoice.id,
            merchantId: mv.merchantId,
            branchId: mv.branchId,
            storeId: mv.storeId,
          },
        });
      }
      await tx.invoiceCancellation.create({
        data: {
          invoiceId: invoice.id,
          reasonCode: input.reasonCode,
          remark: input.remark ?? null,
          ackDate,
          rawResponse: envelope as unknown as Prisma.InputJsonValue,
          // Inherited from the invoice so a cancellation can be windowed by
          // tenant without joining invoices — scheduled reports treat it as
          // an event in its own right.
          merchantId: invoice.merchantId,
          branchId: invoice.branchId,
        },
      });
      return tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'CANCELLED' },
        include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
      });
    });

    await this.notifications.enqueue({
      action: 'invoice.cancelled',
      invoiceId: cancelled.id,
    });
    return cancelled;
  }

  private async persist(
    input: CreateInvoiceDto,
    payload: unknown,
    response: RegisterInvoiceResponse,
    invoiceCounter: number,
    tenant: { merchantId: string; branchId: string },
    trustedCartSessionId?: string,
  ): Promise<InvoiceWithRelations> {
    // Walk-in customers don't have a TIN. We still want one Buyer row to link
    // invoices to (for reporting/joins), so route them all to a singleton
    // record under the internal "WALKIN" TIN.
    const tin = input.BuyerDetails.Tin?.trim() || 'WALKIN';
    const isWalkIn = tin === 'WALKIN';
    const buyer = await this.buyers.upsertByTin({
      tin,
      legalName: isWalkIn
        ? 'Walk In Customer'
        : input.BuyerDetails.LegalName,
      email: input.BuyerDetails.Email,
      phone: input.BuyerDetails.Phone,
      vatNumber: input.BuyerDetails.VatNumber,
      idType: input.BuyerDetails.IdType,
      idNumber: input.BuyerDetails.IdNumber,
      houseNumber: input.BuyerDetails.HouseNumber,
      region: input.BuyerDetails.Region,
      country: input.BuyerDetails.Country,
      zone: input.BuyerDetails.Zone,
      kebele: input.BuyerDetails.Kebele,
      wereda: input.BuyerDetails.Wereda,
      city: input.BuyerDetails.City,
    });

    const natureOfSupplies = input.ItemList[0]?.NatureOfSupplies ?? 'goods';

    const isMemo =
      input.DocumentDetails.Type === 'CRE' ||
      input.DocumentDetails.Type === 'DEB';
    const storedItems = isMemo
      ? input.ItemList.filter((item) => item.changed)
      : input.ItemList;

    // Persist aggregates over the same set we sent to EIRMS — for memos that
    // is the changed-lines subset, not the full SPA-supplied ItemList.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const preTaxTotal = round2(
      storedItems.reduce((s, i) => s + i.PreTaxValue, 0),
    );
    const taxTotal = round2(storedItems.reduce((s, i) => s + i.TaxAmount, 0));
    const totalAmount = round2(
      storedItems.reduce((s, i) => s + i.TotalLineAmount, 0),
    );

    // CASH + IMMIDIATE sales settle at issue — MoR treats the invoice itself
    // as the payment record, so a separate receipt is redundant. Stamp PAID
    // here and skip the receipts flow entirely (blocked upstream by the
    // "invoice already PAID" guard if someone still tries).
    const paidTotal = isMemo ? totalAmount : input.ValueDetails.TotalValue;
    const settledOnSite =
      !isMemo &&
      input.PaymentDetails.Mode?.trim().toUpperCase() === 'CASH' &&
      input.PaymentDetails.PaymentTerm?.trim().toUpperCase() === 'IMMIDIATE';

    const created = await this.prisma.invoice.create({
      data: {
        irn: response.irn,
        documentNumber: response.documentNumber,
        documentType: input.DocumentDetails.Type,
        documentDate: input.DocumentDetails.Date,
        ackDate: response.ackDate,
        eirmsStatus: response.status,
        signedQR: response.signedQR,
        signedInvoice: response.signedInvoice,
        preTaxValue: preTaxTotal,
        taxValue: isMemo ? taxTotal : input.ValueDetails.TaxValue,
        totalValue: isMemo ? totalAmount : input.ValueDetails.TotalValue,
        withholdValue: input.ValueDetails.IncomeWithholdValue,
        withholdingRate: input.resolvedWithholding?.rate,
        withholdingBase: input.resolvedWithholding?.preTaxAmount,
        withholdingThreshold: input.resolvedWithholding?.threshold,
        currency: input.ValueDetails.InvoiceCurrency,
        transactionType: input.TransactionType,
        natureOfSupplies,
        paymentStatus: settledOnSite ? 'PAID' : undefined,
        paidAmount: settledOnSite ? paidTotal : undefined,
        paymentMode: input.PaymentDetails.Mode,
        paymentTerm: input.PaymentDetails.PaymentTerm,
        cashierName: input.SourceSystem.CashierName,
        salespersonName: input.SourceSystem.SalesPersonName,
        invoiceCounter,
        relatedIrn: isMemo
          ? (input.ReferenceDetails?.RelatedDocument?.trim() || null)
          : null,
        rawRequest: payload as unknown as Prisma.InputJsonValue,
        rawResponse: response as unknown as Prisma.InputJsonValue,
        buyer: { connect: { id: buyer.id } },
        merchant: { connect: { id: tenant.merchantId } },
        branch: { connect: { id: tenant.branchId } },
        items: {
          create: storedItems.map((item) => ({
            lineNumber: item.LineNumber,
            itemCode: item.ItemCode,
            description: item.ProductDescription,
            unit: item.Unit,
            quantity: item.Quantity,
            unitPrice: item.UnitPrice,
            discount: item.Discount,
            taxCode: item.TaxCode,
            taxRate: item.resolvedTaxRate,
            taxType: item.resolvedTaxType,
            taxAmount: item.TaxAmount,
            preTaxValue: item.PreTaxValue,
            totalAmount: item.TotalLineAmount,
            inventoryItemId: item.inventoryItemId ?? null,
          })),
        },
      },
      include: { buyer: true, items: true, cancellation: true, ...SELLER_IDENTITY_INCLUDE },
    });

    // No stock gate here — persist() runs *after* MoR has accepted the
    // document, so refusing now would leave a registration upstream that we
    // have no local record of. Every caller gates before its MoR call
    // instead; this only records what has already happened.
    if (input.DocumentDetails.Type === 'INV') {
      await this.applySaleStock(
        input.ItemList,
        created.id,
        tenant,
        trustedCartSessionId,
      );
    }
    return created;
  }

  /**
   * Enforce the branch's stock policy on a live sale. No-op for CRE/DEB
   * memos (they're corrections, not new consumption), for branches in
   * ALLOW_NEGATIVE (the pre-policy default), and for lines that either
   * lack an inventoryItemId or point at an untracked item.
   *
   * Rejects with a 400 that carries per-item messages so the SPA can show
   * a single-line "Coca-Cola 500ml — only 2 in stock" callout instead of a
   * bland "conflict".
   */
  private async assertStockPolicy(
    tenant: { merchantId: string; branchId: string },
    input: CreateInvoiceDto,
    trustedCartSessionId?: string,
  ): Promise<void> {
    if (input.DocumentDetails.Type !== 'INV') return;
    const branch = await this.prisma.branch.findUnique({
      where: { id: tenant.branchId },
      select: { stockPolicy: true },
    });
    if (branch?.stockPolicy !== 'BLOCK_ON_EMPTY') return;

    // Ad-hoc lines carry no inventoryItemId, so they can't be stock-checked.
    // On a branch that opted into strict control they'd be an open back door:
    // re-type an out-of-stock item as a custom line and it sells unchecked.
    const adhoc = input.ItemList.filter((l) => !l.inventoryItemId);
    if (adhoc.length > 0) {
      throw new BadRequestException({
        message: 'Custom lines are not allowed at this branch.',
        userMessages: [
          ...adhoc.map(
            (l) =>
              `"${l.ProductDescription}" is not in the catalogue. Add it to inventory first, then sell it.`,
          ),
          'This branch blocks sales of items with no stock on record.',
        ],
      });
    }

    const itemIds = input.ItemList.map((l) => l.inventoryItemId).filter(
      (id): id is string => !!id,
    );
    if (itemIds.length === 0) return;
    const inventory = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, description: true, trackStock: true },
    });
    const byId = new Map(inventory.map((i) => [i.id, i]));

    // Throws when the branch has no store: under BLOCK_ON_EMPTY we cannot
    // prove availability, so refusing beats guessing.
    const salesFloor = await this.storeResolver.salesFloorFor(tenant.branchId);

    const failures: string[] = [];
    // Sum requested quantity per item so the check tolerates the same item
    // appearing on multiple lines of the same invoice.
    const requested = new Map<string, number>();
    for (const line of input.ItemList) {
      if (!line.inventoryItemId) continue;
      requested.set(
        line.inventoryItemId,
        (requested.get(line.inventoryItemId) ?? 0) + line.Quantity,
      );
    }

    // Availability is always the sales-floor store's on-hand net of other
    // cashiers' live reservations — the exact figure the sale will decrement.
    for (const [id, qty] of requested) {
      const item = byId.get(id);
      if (!item || !item.trackStock) continue;
      const snap = await this.reservations.available(
        id,
        salesFloor.id,
        trustedCartSessionId,
      );
      const onHand = snap.onHand;
      const available = snap.available;
      if (qty > available) {
        failures.push(
          onHand <= 0
            ? `${item.description} — out of stock.`
            : available <= 0
              ? `${item.description} — every unit is reserved by another cashier.`
              : `${item.description} — only ${available} available (asked for ${qty}; ${onHand - available} reserved elsewhere).`,
        );
      }
    }
    if (failures.length > 0) {
      throw new BadRequestException({
        message: 'Some items are out of stock for this branch.',
        userMessages: failures,
      });
    }
  }

  /**
   * Records what a registered sale did to stock. Runs only after MoR has
   * accepted the document, so it never refuses: the goods have left the shop
   * and the books must say so. Overselling is prevented by assertStockPolicy
   * before the MoR call — if a decrement still lands short here, something
   * raced past the gate and that is worth an error in the log, not a
   * half-recorded sale.
   */
  private async applySaleStock(
    items: CreateInvoiceDto['ItemList'],
    invoiceId: string,
    tenant: { merchantId: string; branchId: string },
    cartSessionId?: string,
  ): Promise<void> {
    const salesFloor = await this.storeResolver.salesFloorFor(tenant.branchId);
    // Sum per item so a cart listing the same SKU twice decrements once.
    const perItem = new Map<string, number>();
    for (const item of items) {
      if (!item.inventoryItemId) continue;
      perItem.set(
        item.inventoryItemId,
        (perItem.get(item.inventoryItemId) ?? 0) + item.Quantity,
      );
    }
    if (perItem.size > 0) {
      const tracked = await this.prisma.inventoryItem.findMany({
        where: { id: { in: [...perItem.keys()] }, trackStock: true },
        select: { id: true, description: true },
      });
      // One transaction for the whole invoice: a 3-line sale must not be able
      // to half-apply.
      await this.prisma.$transaction(async (tx) => {
        for (const inv of tracked) {
          const qty = perItem.get(inv.id)!;
          // Atomic decrement — never read-then-write, so concurrent sales
          // can't lose each other's update. Not guarded on the current value:
          // the sale is already registered upstream, so recording less than
          // was sold would be the bigger lie.
          const row = await tx.inventoryStock.upsert({
            where: {
              inventoryItemId_storeId: {
                inventoryItemId: inv.id,
                storeId: salesFloor.id,
              },
            },
            create: {
              inventoryItemId: inv.id,
              storeId: salesFloor.id,
              quantity: -qty,
            },
            update: { quantity: { decrement: qty } },
          });
          if (row.quantity < 0) {
            this.logger.error(
              `Stock went negative: ${inv.description} at ${salesFloor.name} ` +
                `is ${row.quantity} after invoice ${invoiceId}. The pre-MoR ` +
                `stock gate should have refused this sale.`,
            );
          }
          await tx.stockMovement.create({
            data: {
              inventoryItemId: inv.id,
              delta: -qty,
              reason: 'SALE',
              refType: 'invoice',
              refId: invoiceId,
              merchantId: tenant.merchantId,
              branchId: tenant.branchId,
              storeId: salesFloor.id,
            },
          });
        }
      });
    }
    // Release the cart's reservations — best-effort, outside the per-item
    // transaction so an errant reservation delete never rolls back a sale.
    if (cartSessionId) {
      try {
        await this.reservations.release(cartSessionId);
      } catch (err) {
        this.logger.warn(
          `Reservation release failed for cart ${cartSessionId}: ${(err as Error).message}`,
        );
      }
    }
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
              ? "MOR rejected the request."
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

// Exported for consumers that need to type around list/get responses.
export type { InvoiceWithRelations, InvoiceDraftRow };

/** Shape MOR's SellerDetails wants. Merchant fields drive the identity bits
 *  (LegalName/Email/Phone/Region/Wereda/VatNumber); branch fields drive the
 *  location bits (City/HouseNumber). Per-invoice SellerOverrides on the DTO
 *  still win when present. */
interface SellerForPayload {
  legalName: string;
  email: string;
  phone: string;
  region: string;
  wereda: string;
  vatNumber: string;
  city: string | null;
  houseNumber: string | null;
}

function buildSellerFromMerchantBranch(
  branchWithMerchant: Branch & { merchant: Merchant },
): SellerForPayload {
  const m = branchWithMerchant.merchant;
  return {
    legalName: m.legalName,
    email: m.email ?? '',
    phone: m.phone ?? '',
    region: m.region ?? '',
    wereda: m.wereda ?? '',
    vatNumber: m.vatNumber ?? '',
    // Branch-level address — different branches of the same merchant may sit
    // in different cities.
    city: branchWithMerchant.city,
    houseNumber: branchWithMerchant.houseNumber,
  };
}

const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sum the per-line tax / excise / total from a filtered ItemList and merge
 *  with non-line ValueDetails the caller still controls (Discount, currency,
 *  withhold values). Used for memos where the SPA-supplied envelope totals
 *  may not match the trimmed line set we forward to MoR. Rounded to 2 dp to
 *  match MoR's accuracy check tolerance. */
export function recomputeValueDetails(
  items: Array<Record<string, unknown>>,
  base: {
    Discount?: number | null;
    IncomeWithholdValue: number;
    TransactionWithholdValue: number;
    InvoiceCurrency: string;
  },
): {
  Discount: number | null;
  ExciseValue: number;
  TaxValue: number;
  IncomeWithholdValue: number;
  TransactionWithholdValue: number;
  TotalValue: number;
  InvoiceCurrency: string;
} {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const tax = round2(sumNum(items, 'TaxAmount'));
  const excise = round2(sumNum(items, 'ExciseTaxValue'));
  const total = round2(sumNum(items, 'TotalLineAmount'));
  return {
    Discount: base.Discount ?? null,
    ExciseValue: excise,
    TaxValue: tax,
    IncomeWithholdValue: base.IncomeWithholdValue,
    TransactionWithholdValue: base.TransactionWithholdValue,
    TotalValue: total,
    InvoiceCurrency: base.InvoiceCurrency,
  };
}

/**
 * EIRMS surfaces sequence mismatches as a 406 with a body like:
 *   { body: [
 *       { portion: "DocumentDetails", errorMessage: ["... expected : 3"] },
 *       { portion: "SourceSystem",   errorMessage: ["... expected : 3"] },
 *     ] }
 * Both portions must be present for an auto-retry; otherwise we don't know
 * what to send and should surface the original error.
 */
/**
 * Build the BuyerDetails block MOR expects:
 *   - LegalName always present
 *   - IdType defaults to "NID" when absent (walk-in customers still need it)
 *   - Tin OMITTED entirely when empty (not null) — MOR rejects placeholder
 *     TINs like "0000000000" with "buyer not found"
 *   - All other optional fields are dropped when empty so MOR doesn't try to
 *     validate empty strings against its enums (IdType, etc.)
 *
 * For B2B/B2G with full buyer info, every populated field is still forwarded.
 */
/** Memos (credit/debit notes) reference an original invoice. */
function isMemoType(type: string): boolean {
  return type === 'CRE' || type === 'DEB';
}

/** Small backdate margin so the timestamp never lands in MOR's future. */
const MEMO_DATE_BACKOFF_MS = 2 * 60 * 1000;

/** Current UTC time, backed off a margin, in MOR's DD-MM-YYYYTHH:mm:ss shape. */
function morRegisterDate(): string {
  const d = new Date(Date.now() - MEMO_DATE_BACKOFF_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Parse the EIRMS date format back into a Date (UTC). Returns null when the
 *  string doesn't match — callers fall back to the server clock in that case. */
function parseEirmsDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})T(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(
    Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss),
  );
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Decide the DocumentDetails.Date to send MoR. Prefers the cashier-supplied
 * value (so the timestamp reflects the moment the cashier hit submit), but
 * substitutes the server's safe-past clock when the supplied value is missing,
 * malformed, or ahead of the server's safe-past threshold — any of which
 * would otherwise trip MoR's "not future" rule. The threshold is the same
 * 2-minute backoff memos use; a device whose clock is within 2 minutes of
 * the server is treated as trustworthy.
 */
function safeIssuanceDate(supplied: string | undefined | null): string {
  const parsed = parseEirmsDate(supplied);
  if (!parsed) return morRegisterDate();
  const safePast = Date.now() - MEMO_DATE_BACKOFF_MS;
  if (parsed.getTime() > safePast) return morRegisterDate();
  return supplied!;
}

function normaliseBuyerForMor(
  buyer: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    LegalName: buyer.LegalName,
    IdType:
      typeof buyer.IdType === 'string' && buyer.IdType.trim()
        ? buyer.IdType.trim()
        : 'NID',
  };
  const include = (key: string) => {
    const value = buyer[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    } else if (value !== null && value !== undefined) {
      out[key] = value;
    }
  };
  include('Tin');
  include('IdNumber');
  include('VatNumber');
  include('Email');
  include('Phone');
  include('HouseNumber');
  include('Region');
  include('Country');
  include('Zone');
  include('Kebele');
  include('Wereda');
  include('City');
  return out;
}

function isFlatVerifyResponse(
  body: unknown,
): body is { message: string; status: string } {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.message === 'string' && typeof obj.status === 'string';
}

function parseExpectedSequence(
  body: unknown,
): { documentNumber: string; invoiceCounter: number } | null {
  if (!body || typeof body !== 'object') return null;
  const items = (body as { body?: unknown }).body;
  if (!Array.isArray(items)) return null;

  let documentNumber: string | null = null;
  let invoiceCounter: number | null = null;
  const pattern = /expected\s*:\s*(\d+)/i;

  for (const entry of items as Array<{
    portion?: string;
    errorMessage?: string[];
  }>) {
    const messages = Array.isArray(entry.errorMessage) ? entry.errorMessage : [];
    for (const msg of messages) {
      const match = pattern.exec(msg);
      if (!match) continue;
      if (entry.portion === 'DocumentDetails' && documentNumber === null) {
        documentNumber = match[1];
      } else if (entry.portion === 'SourceSystem' && invoiceCounter === null) {
        invoiceCounter = parseInt(match[1], 10);
      }
    }
  }

  if (documentNumber === null || invoiceCounter === null) return null;
  return { documentNumber, invoiceCounter };
}

/** Coerce an unknown value (typically a MoR verify payload field) to a
 *  finite number, with `0` as the safe fallback. Used during external-IRN
 *  import where the verify response is typed `unknown` end-to-end. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumNum(items: Array<Record<string, unknown>>, key: string): number {
  let total = 0;
  for (const it of items) total += num(it[key]);
  return total;
}

/** Trim + collapse-to-undefined for optional MoR-verify string fields.
 *  Keeps CreateBuyerDto's `string | undefined` contract intact (passing
 *  `null` from a JS source would fail class-validator's `@IsString`). */
function pickStr(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Reconstruct a {@link CreateInvoiceDto}-shaped object from a stored
 * register payload so `persist()` can be called with the same input it
 * sees in the live register path. We don't run class-validator over it
 * — the payload was already validated at draft-creation time, and a
 * shape mismatch here would be a programming error, not a user error.
 */
function payloadToCreateInvoiceDto(
  payload: Record<string, unknown>,
): CreateInvoiceDto {
  // Casts are wide-on-purpose: the JSON column is `Prisma.JsonValue` so
  // TS doesn't know the shape. Field names + structure are guaranteed
  // by `buildRegisterPayload` at draft-creation time.
  return payload as unknown as CreateInvoiceDto;
}
