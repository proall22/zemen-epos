import { Injectable } from '@nestjs/common';
import type { Prisma, ReportSection, StockMovementReason } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type {
  InventorySection,
  ReportPayload,
  ReportScope,
  ReportWindow,
  SalesEventRow,
  SalesSection,
  StoreMovementRow,
} from './reports.types';

/**
 * Runs on a queue, where there is no request context. Takes merchantId
 * explicitly and never injects RequestContextService — the tenant-scope
 * helpers return {} for an absent merchant, which reads every tenant.
 * DashboardService is not reused for the same reason.
 */
@Injectable()
export class ReportsAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  private where(scope: ReportScope): { merchantId: string; branchId?: string } {
    if (!scope?.merchantId?.trim()) {
      throw new Error(
        'ReportsAggregationService: refusing to query without a merchantId.',
      );
    }
    return {
      merchantId: scope.merchantId,
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    };
  }

  private range(window: ReportWindow): Prisma.DateTimeFilter {
    return { gte: window.start, lt: window.end };
  }

  async build(
    scope: ReportScope,
    window: ReportWindow,
    sections: ReportSection[],
  ): Promise<ReportPayload> {
    const wantsSales = sections.includes('SALES');
    const wantsInventory = sections.includes('INVENTORY');

    const [sales, inventory] = await Promise.all([
      wantsSales ? this.salesSection(scope, window) : undefined,
      wantsInventory ? this.inventorySection(scope, window) : undefined,
    ]);

    const counts = {
      invoices: sales?.generated.count ?? 0,
      cancellations: sales?.cancelled.count ?? 0,
      receipts: sales?.receipts.count ?? 0,
      movements: inventory?.totalMovements ?? 0,
    };

    return {
      window,
      sections,
      sales,
      inventory,
      counts,
      empty: Object.values(counts).every((n) => n === 0),
    };
  }

  /** Each event windows on its OWN timestamp: an invoice raised last week and
   *  cancelled today belongs in today's report. Invoice has no paidAt /
   *  cancelledAt — payments are Receipts, cancellations their own rows. */
  async salesSection(
    scope: ReportScope,
    window: ReportWindow,
  ): Promise<SalesSection> {
    const where = this.where(scope);
    const createdAt = this.range(window);

    const [generated, cancelled, receipts, byBranchRaw] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { ...where, status: 'ACCEPTED', createdAt },
        _count: { _all: true },
        _sum: { preTaxValue: true, taxValue: true, totalValue: true },
      }),
      this.prisma.invoiceCancellation.aggregate({
        where: { ...where, createdAt },
        _count: { _all: true },
      }),
      this.prisma.receipt.groupBy({
        by: ['kind'],
        where: { ...where, createdAt },
        _count: { _all: true },
        _sum: { collectedAmount: true, withholdAmount: true },
      }),
      scope.branchId
        ? Promise.resolve([])
        : this.prisma.invoice.groupBy({
            by: ['branchId'],
            where: { ...where, status: 'ACCEPTED', createdAt },
            _count: { _all: true },
            _sum: { preTaxValue: true, taxValue: true, totalValue: true },
          }),
    ]);

    const sales = receipts.find((r) => r.kind === 'SALES');
    const withhold = receipts.find((r) => r.kind === 'WITHHOLD');

    return {
      generated: {
        count: generated._count._all,
        preTax: generated._sum.preTaxValue ?? 0,
        tax: generated._sum.taxValue ?? 0,
        total: generated._sum.totalValue ?? 0,
      },
      // Value needs the parent invoice; CSV carries per-document detail.
      cancelled: { count: cancelled._count._all, total: 0 },
      receipts: {
        count: sales?._count._all ?? 0,
        collected: sales?._sum.collectedAmount ?? 0,
      },
      withholding: {
        count: withhold?._count._all ?? 0,
        withheld: withhold?._sum.withholdAmount ?? 0,
      },
      byBranch: await this.nameBranches(scope.merchantId, byBranchRaw),
    };
  }

  /** Per-document rows for the CSV. Capped: a report firing after a week of
   *  downtime has a very large window, and the result is an email attachment. */
  async salesEvents(
    scope: ReportScope,
    window: ReportWindow,
    limit: number,
  ): Promise<{ rows: SalesEventRow[]; truncated: boolean }> {
    const where = this.where(scope);
    const createdAt = this.range(window);
    const take = limit + 1;

    const [invoices, cancellations, receipts] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...where, status: 'ACCEPTED', createdAt },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          createdAt: true,
          branchId: true,
          irn: true,
          documentNumber: true,
          documentType: true,
          preTaxValue: true,
          taxValue: true,
          totalValue: true,
          currency: true,
          paymentStatus: true,
          branch: { select: { name: true } },
          buyer: { select: { tin: true, legalName: true } },
        },
      }),
      this.prisma.invoiceCancellation.findMany({
        where: { ...where, createdAt },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          createdAt: true,
          reasonCode: true,
          remark: true,
          invoice: {
            select: {
              irn: true,
              documentNumber: true,
              documentType: true,
              totalValue: true,
              currency: true,
              branchId: true,
              branch: { select: { name: true } },
              buyer: { select: { tin: true, legalName: true } },
            },
          },
        },
      }),
      this.prisma.receipt.findMany({
        where: { ...where, createdAt },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          createdAt: true,
          kind: true,
          branchId: true,
          receiptNumber: true,
          receiptType: true,
          collectedAmount: true,
          withholdAmount: true,
          receiptCurrency: true,
          modeOfPayment: true,
          branch: { select: { name: true } },
        },
      }),
    ]);

    const truncated =
      invoices.length > limit ||
      cancellations.length > limit ||
      receipts.length > limit;

    const rows: SalesEventRow[] = [
      ...invoices.slice(0, limit).map((i) => ({
        type: 'invoice_generated' as const,
        occurredAt: i.createdAt,
        branchId: i.branchId,
        branchName: i.branch?.name ?? null,
        reference: i.irn || i.documentNumber,
        documentType: i.documentType,
        buyerTin: i.buyer?.tin ?? null,
        buyerName: i.buyer?.legalName ?? null,
        preTax: i.preTaxValue,
        tax: i.taxValue,
        total: i.totalValue,
        currency: i.currency,
        detail: i.paymentStatus,
      })),
      ...cancellations.slice(0, limit).map((c) => ({
        type: 'invoice_cancelled' as const,
        occurredAt: c.createdAt,
        branchId: c.invoice.branchId,
        branchName: c.invoice.branch?.name ?? null,
        reference: c.invoice.irn || c.invoice.documentNumber,
        documentType: c.invoice.documentType,
        buyerTin: c.invoice.buyer?.tin ?? null,
        buyerName: c.invoice.buyer?.legalName ?? null,
        preTax: null,
        tax: null,
        total: c.invoice.totalValue,
        currency: c.invoice.currency,
        detail: [c.reasonCode, c.remark].filter(Boolean).join(' — ') || null,
      })),
      ...receipts.slice(0, limit).map((r) => ({
        type:
          r.kind === 'WITHHOLD'
            ? ('withholding_filed' as const)
            : ('receipt_created' as const),
        occurredAt: r.createdAt,
        branchId: r.branchId,
        branchName: r.branch?.name ?? null,
        reference: r.receiptNumber,
        documentType: r.receiptType,
        buyerTin: null,
        buyerName: null,
        preTax: null,
        tax: null,
        total:
          r.kind === 'WITHHOLD' ? (r.withholdAmount ?? 0) : r.collectedAmount,
        currency: r.receiptCurrency,
        detail: r.modeOfPayment,
      })),
    ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    return { rows, truncated };
  }

  /** Re-pins merchantId on the name lookup even though the ids came from a
   *  scoped query. */
  private async nameBranches(
    merchantId: string,
    rows: Array<{
      branchId: string;
      _count: { _all: number };
      _sum: {
        preTaxValue: number | null;
        taxValue: number | null;
        totalValue: number | null;
      };
    }>,
  ) {
    if (rows.length === 0) return [];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: rows.map((r) => r.branchId) }, merchantId },
      select: { id: true, name: true },
    });
    const nameOf = new Map(branches.map((b) => [b.id, b.name]));
    return rows
      .map((r) => ({
        branchId: r.branchId,
        branchName: nameOf.get(r.branchId) ?? r.branchId,
        count: r._count._all,
        preTax: r._sum.preTaxValue ?? 0,
        tax: r._sum.taxValue ?? 0,
        total: r._sum.totalValue ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /** Legacy rows have a null merchantId and are excluded by the tenant
   *  filter. That under-counts pre-feature history; don't "fix" it by
   *  widening the filter. */
  async inventorySection(
    scope: ReportScope,
    window: ReportWindow,
  ): Promise<InventorySection> {
    const rows = await this.prisma.stockMovement.groupBy({
      by: ['storeId', 'reason'],
      where: {
        ...this.where(scope),
        createdAt: this.range(window),
        storeId: { not: null },
      },
      _sum: { delta: true },
      _count: { _all: true },
    });

    if (rows.length === 0) return { stores: [], totalMovements: 0 };

    const storeIds = [
      ...new Set(rows.map((r) => r.storeId).filter((id): id is string => !!id)),
    ];
    const stores = await this.prisma.store.findMany({
      where: { id: { in: storeIds }, merchantId: scope.merchantId },
      select: {
        id: true,
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    const storeById = new Map(stores.map((s) => [s.id, s]));

    const byStore = new Map<string, StoreMovementRow>();
    let totalMovements = 0;

    for (const row of rows) {
      const storeId = row.storeId;
      if (!storeId) continue;
      const store = storeById.get(storeId);
      // Not ours — drop rather than render an unattributed line.
      if (!store) continue;

      const delta = row._sum.delta ?? 0;
      const count = row._count._all;
      totalMovements += count;

      const existing = byStore.get(storeId) ?? {
        storeId,
        storeName: store.name,
        branchId: store.branchId,
        branchName: store.branch?.name ?? null,
        net: 0,
        in: 0,
        out: 0,
        count: 0,
        byReason: [] as Array<{
          reason: StockMovementReason;
          delta: number;
          count: number;
        }>,
      };

      existing.net += delta;
      if (delta >= 0) existing.in += delta;
      else existing.out += Math.abs(delta);
      existing.count += count;
      existing.byReason.push({ reason: row.reason, delta, count });
      byStore.set(storeId, existing);
    }

    return {
      stores: [...byStore.values()].sort((a, b) =>
        a.storeName.localeCompare(b.storeName),
      ),
      totalMovements,
    };
  }
}
