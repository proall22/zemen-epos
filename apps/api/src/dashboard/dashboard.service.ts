import { Injectable } from '@nestjs/common';

import { RequestContextService } from '../audit/request-context.service';
import { listScope, merchantScope, tenantScope } from '../common/tenant-scope';
import { HealthService, type HealthReport } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';

interface PeriodStats {
  invoices: number;
  revenue: number;
  receipts: number;
  collected: number;
}

/**
 * Platform-wide aggregate for the SUPER_ADMIN. Deliberately exposes NO
 * per-merchant business detail (no revenue, no buyer names) — only counts and
 * a top-merchants-by-document-volume leaderboard. Anything more granular
 * requires a consent grant into a specific merchant.
 */
export interface SystemSummary {
  merchants: {
    total: number;
    active: number;
    pending: number;
    rejected: number;
    suspended: number;
  };
  tenants: { totalBranches: number; activeBranches: number; activeUsers: number };
  documents: {
    invoicesToday: number;
    invoicesThisMonth: number;
    invoicesAllTime: number;
    receiptsAllTime: number;
  };
  platformActivity: {
    receiptsToday: number;
    failedInvoices: number;
    pendingInvoices: number;
    cancelledInvoices: number;
  };
  pendingMerchantList: Array<{
    id: string;
    legalName: string;
    tin: string;
    email: string | null;
    createdAt: string;
    ownerEmail: string | null;
    ownerName: string | null;
    mainBranch: { id: string; name: string; city: string | null; region: string | null } | null;
  }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    summary: string | null;
    success: boolean;
    createdAt: string;
  }>;
  topMerchants: Array<{
    merchantId: string;
    legalName: string;
    invoiceCount: number;
  }>;
}

export interface SystemHealthSummary extends HealthReport {
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  security: {
    failedLogins: number;
    lockedAccounts: number;
  };
}

export interface CashierSummary {
  today: {
    transactions: number;
    sales: number;
    itemsSold: number;
  };
  paymentSummary: {
    cash: number;
    credit: number;
    advance: number;
  };
  recentInvoices: Array<{
    id: string;
    irn: string;
    documentNumber: string;
    documentType: string;
    status: string;
    totalValue: number;
    currency: string;
    createdAt: string;
    buyer: { legalName: string; tin: string };
  }>;
}

export interface AccountantSummary {
  invoiced: number;
  collected: number;
  outstanding: number;
  withholding: number;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    receiptCounter: number;
    kind: string;
    collectedAmount: number;
    receiptCurrency: string;
    modeOfPayment: string | null;
    createdAt: string;
  }>;
  outstandingInvoices: Array<{
    id: string;
    documentNumber: string;
    buyerLegalName: string;
    totalValue: number;
    paidAmount: number;
  }>;
}

export interface DashboardSummary {
  today: PeriodStats;
  thisMonth: PeriodStats;
  lastMonth: PeriodStats;
  allTime: PeriodStats;
  outstanding: { count: number; total: number };
  activeUsers: number;
  recentInvoices: Array<{
    id: string;
    irn: string;
    documentNumber: string;
    documentType: string;
    transactionType: string;
    status: string;
    paymentStatus: string;
    totalValue: number;
    currency: string;
    createdAt: string;
    buyer: { legalName: string; tin: string };
  }>;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    receiptCounter: number;
    kind: string;
    collectedAmount: number;
    receiptCurrency: string;
    modeOfPayment: string | null;
    createdAt: string;
  }>;
  topBuyers: Array<{
    buyerId: string;
    legalName: string;
    tin: string;
    invoiceCount: number;
    totalValue: number;
  }>;
  inventoryAlerts: Array<{
    code: string;
    description: string;
    onHand: number;
    lowStockThreshold: number;
  }>;
  eirmsCompliance: {
    configured: boolean;
    invoicesRegistered: number;
    pending: number;
    failed: number;
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly health: HealthService,
  ) {}

  async summary(opts?: { crossBranch?: boolean }): Promise<DashboardSummary> {
    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = startOfThisMonth;
    const scope = listScope(this.context.get(), opts);
    const merchantOnly = merchantScope(this.context.get());
    const userScope = scope.branchId
      ? {
          active: true,
          merchantId: merchantOnly.merchantId,
          OR: [
            { branchId: scope.branchId },
            { branchAccess: { some: { branchId: scope.branchId } } },
          ],
        }
      : merchantOnly.merchantId
        ? { active: true, merchantId: merchantOnly.merchantId }
        : { active: true };

    const [
      today,
      thisMonth,
      lastMonth,
      allTime,
      outstanding,
      activeUsers,
      recentInvoices,
      recentReceipts,
      topBuyersRaw,
    ] = await Promise.all([
      this.statsBetween(startOfToday, undefined, opts),
      this.statsBetween(startOfThisMonth, undefined, opts),
      this.statsBetween(startOfLastMonth, endOfLastMonth, opts),
      this.statsBetween(undefined, undefined, opts),
      this.outstanding(opts),
      this.prisma.user.count({ where: userScope }),
      this.prisma.invoice.findMany({
        where: { ...scope },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { buyer: { select: { legalName: true, tin: true } } },
      }),
      this.prisma.receipt.findMany({
        where: { ...scope },
        take: 8,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.groupBy({
        by: ['buyerId'],
        where: { status: 'ACCEPTED', ...scope },
        _count: { id: true },
        _sum: { totalValue: true },
        orderBy: { _sum: { totalValue: 'desc' } },
        take: 5,
      }),
    ]);

    const topBuyerIds = topBuyersRaw.map((b) => b.buyerId);
    const topBuyerRecords = topBuyerIds.length
      ? await this.prisma.buyer.findMany({
          where: { id: { in: topBuyerIds }, ...merchantOnly },
          select: { id: true, legalName: true, tin: true },
        })
      : [];
    const buyerById = new Map(topBuyerRecords.map((b) => [b.id, b]));

    // Low-stock alerts: join InventoryStock and sum quantities per item,
    // then keep only items whose total on-hand <= lowStockThreshold.
    const stockAgg = await this.prisma.inventoryStock.groupBy({
      by: ['inventoryItemId'],
      where: {
        inventoryItem: { ...merchantOnly, trackStock: true, active: true },
        ...(scope.branchId ? { store: { branchId: scope.branchId } } : {}),
      },
      _sum: { quantity: true },
    });
    const lowStockItemIds = stockAgg
      .filter(s => s._sum.quantity !== null)
      .map(s => ({ id: s.inventoryItemId, onHand: s._sum.quantity! }));
    const lowStockItems = lowStockItemIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: {
            id: { in: lowStockItemIds.map(s => s.id) },
            lowStockThreshold: { not: null },
            ...merchantOnly,
          },
          select: { id: true, code: true, description: true, lowStockThreshold: true },
        })
      : [];
    const inventoryAlerts = lowStockItems
      .map(item => {
        const stock = lowStockItemIds.find(s => s.id === item.id);
        return { code: item.code, description: item.description, onHand: stock?.onHand ?? 0, lowStockThreshold: item.lowStockThreshold! };
      })
      .filter(item => item.onHand <= item.lowStockThreshold);

    const branches = await this.prisma.branch.findMany({
      where: {
        ...merchantOnly,
        active: true,
        ...(scope.branchId ? { id: scope.branchId } : {}),
      },
    });
    // A branch is EIRMS-configured when eirmsApikey, eirmsClientId and eirmsClientSecret are set.
    const configured = branches.some(b => !!b.eirmsApikey && !!b.eirmsClientId && !!b.eirmsClientSecret);
    
    const [invoicesRegistered, pending, failed] = await Promise.all([
      this.prisma.invoice.count({ where: { ...scope, status: 'ACCEPTED' } }),
      this.prisma.invoiceDraft.count({ where: { ...scope, status: 'PENDING' } }),
      this.prisma.invoiceDraft.count({ where: { ...scope, status: 'SYNC_FAILED' } }),
    ]);
    const eirmsCompliance = {
      configured,
      invoicesRegistered,
      pending,
      failed,
    };

    return {
      today,
      thisMonth,
      lastMonth,
      allTime,
      outstanding,
      activeUsers,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        irn: inv.irn,
        documentNumber: inv.documentNumber,
        documentType: inv.documentType,
        transactionType: inv.transactionType,
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        totalValue: inv.totalValue,
        currency: inv.currency,
        createdAt: inv.createdAt.toISOString(),
        buyer: { legalName: inv.buyer.legalName, tin: inv.buyer.tin },
      })),
      recentReceipts: recentReceipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        receiptCounter: r.receiptCounter,
        kind: r.kind,
        collectedAmount: r.collectedAmount,
        receiptCurrency: r.receiptCurrency,
        modeOfPayment: r.modeOfPayment,
        createdAt: r.createdAt.toISOString(),
      })),
      topBuyers: topBuyersRaw.map((b) => {
        const meta = buyerById.get(b.buyerId);
        return {
          buyerId: b.buyerId,
          legalName: meta?.legalName ?? 'Unknown buyer',
          tin: meta?.tin ?? '',
          invoiceCount: b._count.id,
          totalValue: b._sum.totalValue ?? 0,
        };
      }),
      inventoryAlerts,
      eirmsCompliance,
    };
  }

  async cashierSummary(opts?: { crossBranch?: boolean }): Promise<CashierSummary> {
    const now = new Date();
    const startOfToday = startOfDay(now);
    const scope = listScope(this.context.get(), opts);

    const invoices = await this.prisma.invoice.findMany({
      where: { ...scope, createdAt: { gte: startOfToday } },
      include: { items: true },
    });

    const receipts = await this.prisma.receipt.findMany({
      where: { ...scope, createdAt: { gte: startOfToday } },
    });

    let sales = 0;
    let itemsSold = 0;
    invoices.forEach(inv => {
      sales += inv.totalValue;
      itemsSold += inv.items.reduce((sum, item) => sum + item.quantity, 0);
    });

    let cash = 0, credit = 0, advance = 0;
    receipts.forEach(r => {
      if (r.modeOfPayment === 'CASH') cash += r.collectedAmount;
      else if (r.modeOfPayment === 'CREDIT') credit += r.collectedAmount;
      else advance += r.collectedAmount;
    });

    const recentInvoices = await this.prisma.invoice.findMany({
      where: { ...scope },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { buyer: { select: { legalName: true, tin: true } } },
    });

    return {
      today: {
        transactions: invoices.length,
        sales,
        itemsSold,
      },
      paymentSummary: {
        cash,
        credit,
        advance,
      },
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        irn: inv.irn,
        documentNumber: inv.documentNumber,
        documentType: inv.documentType,
        transactionType: inv.transactionType, // B2C | B2B | B2G
        status: inv.status,
        totalValue: inv.totalValue,
        currency: inv.currency,
        createdAt: inv.createdAt.toISOString(),
        buyer: { legalName: inv.buyer.legalName, tin: inv.buyer.tin },
      })),
    };
  }

  async accountantSummary(opts?: { crossBranch?: boolean }): Promise<AccountantSummary> {
    const scope = listScope(this.context.get(), opts);
    
    const [invoiceAgg, receiptAgg, withholdAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { status: 'ACCEPTED', ...scope },
        _sum: { totalValue: true },
      }),
      this.prisma.receipt.aggregate({
        where: { kind: 'SALES', ...scope },
        _sum: { collectedAmount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { kind: 'WITHHOLD', ...scope },
        _sum: { collectedAmount: true },
      }),
    ]);
    
    const invoiced = invoiceAgg._sum.totalValue ?? 0;
    const collected = receiptAgg._sum.collectedAmount ?? 0;
    const outstanding = Math.max(0, invoiced - collected);
    
    const recentReceipts = await this.prisma.receipt.findMany({
      where: { ...scope },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });

    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: { status: 'ACCEPTED', paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, ...scope },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { buyer: { select: { legalName: true } } },
    });

    return {
      invoiced,
      collected,
      outstanding,
      withholding: withholdAgg._sum.collectedAmount ?? 0,
      recentReceipts: recentReceipts.map(r => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        receiptCounter: r.receiptCounter,
        kind: r.kind,
        collectedAmount: r.collectedAmount,
        receiptCurrency: r.receiptCurrency,
        modeOfPayment: r.modeOfPayment,
        createdAt: r.createdAt.toISOString(),
      })),
      outstandingInvoices: outstandingInvoices.map(inv => ({
        id: inv.id,
        documentNumber: inv.documentNumber,
        buyerLegalName: inv.buyer.legalName,
        totalValue: inv.totalValue,
        paidAmount: inv.paidAmount,
      })),
    };
  }

  /**
   * Platform-wide aggregate for the SUPER_ADMIN dashboard. Intentionally
   * unscoped (spans every merchant) but exposes only counts + a top-merchants
   * leaderboard by document volume — never amounts or buyer detail.
   */
  async systemSummary(): Promise<SystemSummary> {
    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      rejectedMerchants,
      suspendedMerchants,
      totalBranches,
      activeBranches,
      activeUsers,
      invoicesToday,
      invoicesThisMonth,
      invoicesAllTime,
      receiptsAllTime,
      receiptsToday,
      failedInvoices,
      cancelledInvoices,
      topMerchantsRaw,
      pendingMerchantListRaw,
      recentAuditLogsRaw,
    ] = await Promise.all([
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { active: true } }),
      this.prisma.merchant.count({
        where: { approvedAt: null, rejectedAt: null },
      }),
      this.prisma.merchant.count({ where: { rejectedAt: { not: null } } }),
      this.prisma.merchant.count({ where: { approvedAt: { not: null }, active: false } }),
      this.prisma.branch.count(),
      this.prisma.branch.count({ where: { active: true, approvedAt: { not: null } } }),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.invoice.count({
        where: { status: 'ACCEPTED', createdAt: { gte: startOfToday } },
      }),
      this.prisma.invoice.count({
        where: { status: 'ACCEPTED', createdAt: { gte: startOfThisMonth } },
      }),
      this.prisma.invoice.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.receipt.count(),
      this.prisma.receipt.count({ where: { createdAt: { gte: startOfToday } } }),
      // Invoices that have been submitted but MoR rejected or errored
      this.prisma.invoice.count({ where: { eirmsStatus: { in: ['FAILED', 'ERROR'] } } }),
      this.prisma.invoice.count({ where: { status: 'CANCELLED' } }),
      this.prisma.invoice.groupBy({
        by: ['merchantId'],
        where: { status: 'ACCEPTED' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),
      // Pending merchant registrations with owner info
      this.prisma.merchant.findMany({
        where: { approvedAt: null, rejectedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          legalName: true,
          tin: true,
          email: true,
          createdAt: true,
          users: {
            where: { role: 'MERCHANT_ADMIN' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { email: true, name: true },
          },
          branches: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, name: true, city: true, region: true },
          },
        },
      }),
      // Recent platform audit log entries
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          actorEmail: true,
          summary: true,
          success: true,
          createdAt: true,
        },
      }),
    ]);

    // Pending invoices = submitted to EIRMS but awaiting final response
    const pendingInvoices = await this.prisma.invoice.count({
      where: { eirmsStatus: { in: ['PENDING', 'SUBMITTED', 'PROCESSING'] } },
    });

    const topIds = topMerchantsRaw.map((m) => m.merchantId);
    const topRecords = topIds.length
      ? await this.prisma.merchant.findMany({
          where: { id: { in: topIds } },
          select: { id: true, legalName: true },
        })
      : [];
    const nameById = new Map(topRecords.map((m) => [m.id, m.legalName]));

    return {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        pending: pendingMerchants,
        rejected: rejectedMerchants,
        suspended: suspendedMerchants,
      },
      tenants: { totalBranches, activeBranches, activeUsers },
      documents: {
        invoicesToday,
        invoicesThisMonth,
        invoicesAllTime,
        receiptsAllTime,
      },
      platformActivity: {
        receiptsToday,
        failedInvoices,
        pendingInvoices,
        cancelledInvoices,
      },
      pendingMerchantList: pendingMerchantListRaw.map((m) => ({
        id: m.id,
        legalName: m.legalName,
        tin: m.tin,
        email: m.email,
        createdAt: m.createdAt.toISOString(),
        ownerEmail: m.users[0]?.email ?? null,
        ownerName: m.users[0]?.name ?? null,
        mainBranch: m.branches[0] ?? null,
      })),
      recentAuditLogs: recentAuditLogsRaw.map((l) => ({
        id: l.id,
        action: l.action,
        actorEmail: l.actorEmail,
        summary: l.summary,
        success: l.success,
        createdAt: l.createdAt.toISOString(),
      })),
      topMerchants: topMerchantsRaw.map((m) => ({
        merchantId: m.merchantId,
        legalName: nameById.get(m.merchantId) ?? 'Unknown merchant',
        invoiceCount: m._count.id,
      })),
    };
  }

  async systemHealth(): Promise<SystemHealthSummary> {
    const [healthReport, queue] = await Promise.all([
      this.health.check(),
      this.health.queueCounts(),
    ]);

    // Query audit log for failed login attempts (inbound, success = false)
    const [failedLogins, lockedAccounts] = await Promise.all([
      this.prisma.auditLog.count({
        where: { action: 'auth.login', success: false },
      }),
      this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
    ]);

    return {
      status: healthReport.status,
      checks: healthReport.checks,
      queue,
      security: {
        failedLogins,
        lockedAccounts,
      },
    };
  }

  /** Stats over an optional [from, to) window. Both undefined ⇒ all time. */
  private async statsBetween(
    from: Date | undefined,
    to: Date | undefined,
    opts?: { crossBranch?: boolean },
  ): Promise<PeriodStats> {
    const dateFilter = from || to ? { gte: from, lt: to } : undefined;
    const scope = listScope(this.context.get(), opts);

    const [invoiceAgg, receiptAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          status: 'ACCEPTED',
          ...scope,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _count: { id: true },
        _sum: { totalValue: true },
      }),
      this.prisma.receipt.aggregate({
        where: {
          ...scope,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _count: { id: true },
        _sum: { collectedAmount: true },
      }),
    ]);

    return {
      invoices: invoiceAgg._count.id,
      revenue: invoiceAgg._sum.totalValue ?? 0,
      receipts: receiptAgg._count.id,
      collected: receiptAgg._sum.collectedAmount ?? 0,
    };
  }

  private async outstanding(opts?: {
    crossBranch?: boolean;
  }): Promise<{ count: number; total: number }> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        status: 'ACCEPTED',
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        ...listScope(this.context.get(), opts),
      },
      select: { totalValue: true, paidAmount: true },
    });
    const total = rows.reduce(
      (sum, r) => sum + Math.max(0, r.totalValue - r.paidAmount),
      0,
    );
    return { count: rows.length, total };
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
