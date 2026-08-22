import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { merchantScope, tenantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

/** Purchase header + line items + vendor — the shape the UI expects. */
export type StockPurchaseWithItems = Prisma.StockPurchaseGetPayload<{
  include: { items: true; vendor: true };
}>;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    throw new NotFoundException(
      'A merchant context is required to record purchases.',
    );
  }

  /** Cashiers are pinned to their own branch. Everyone else may name any
   *  branch — but it must belong to their merchant, which is not implied by
   *  anything else on this path. */
  private async assertBranchAccess(branchId: string): Promise<void> {
    const ctx = this.context.get();
    if (ctx?.branchId && ctx.branchId !== branchId) {
      throw new ForbiddenException(
        'You can only record purchases in your own branch.',
      );
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, ...merchantScope(ctx) },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
  }

  list(opts?: { vendorId?: string }) {
    return this.prisma.stockPurchase.findMany({
      where: {
        ...tenantScope(this.context.get()),
        ...(opts?.vendorId ? { vendorId: opts.vendorId } : {}),
      },
      include: { items: true, vendor: true },
      orderBy: { purchaseDate: 'desc' },
      take: 200,
    });
  }

  async get(id: string) {
    const purchase = await this.prisma.stockPurchase.findFirst({
      where: {
        id,
        ...tenantScope(this.context.get()),
      },
      include: { items: true, vendor: true },
    });
    if (!purchase) throw new NotFoundException(`Purchase ${id} not found`);
    return purchase;
  }

  /**
   * Record a goods-received event. Everything happens in one $transaction:
   *   1. Load + validate every item + store belongs to the same branch and
   *      merchant.
   *   2. Insert the purchase header + items.
   *   3. For each item: upsert `inventory_stocks (itemId, storeId)` with the
   *      quantity delta, write a `StockMovement` (reason=RESTOCK, storeId +
   *      purchaseItemId set), recompute weighted-average cost on the item,
   *      and update the summary `stockQuantity`.
   */
  async create(input: CreatePurchaseDto, actorEmail?: string) {
    const merchantId = this.resolveMerchantId();
    await this.assertBranchAccess(input.branchId);
    if (!input.items?.length) {
      throw new BadRequestException('A purchase must include at least one line.');
    }

    // Validate the vendor belongs to this merchant when supplied.
    if (input.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: input.vendorId, merchantId },
      });
      if (!vendor) {
        throw new NotFoundException(`Vendor ${input.vendorId} not found`);
      }
    }

    // Bulk-load items and stores in one round-trip so the transaction stays
    // short. Every item must belong to this merchant + branch, and every
    // store must belong to this branch.
    const itemIds = Array.from(new Set(input.items.map((i) => i.inventoryItemId)));
    const storeIds = Array.from(new Set(input.items.map((i) => i.storeId)));
    const [items, stores] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          id: { in: itemIds },
          merchantId,
          OR: [{ branchId: input.branchId }, { branchId: null }],
        },
      }),
      this.prisma.store.findMany({
        where: {
          id: { in: storeIds },
          merchantId,
          branchId: input.branchId,
          active: true,
        },
      }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const problems: string[] = [];
    for (const line of input.items) {
      if (!itemById.has(line.inventoryItemId)) {
        problems.push(`Item ${line.inventoryItemId} not found for this branch.`);
      }
      if (!storeById.has(line.storeId)) {
        problems.push(`Store ${line.storeId} not found or inactive for this branch.`);
      }
    }
    if (problems.length) {
      throw new BadRequestException({
        message: 'Purchase validation failed.',
        userMessages: problems,
      });
    }

    const purchaseDate = new Date(input.purchaseDate);
    const totalCost = input.items.reduce(
      (sum, l) => sum + round4(l.quantity * l.unitCost),
      0,
    );

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.stockPurchase.create({
        data: {
          merchantId,
          branchId: input.branchId,
          vendorId: input.vendorId ?? null,
          reference: input.reference?.trim() || null,
          purchaseDate,
          totalCost: round2(totalCost),
          currency: input.currency?.trim() || 'ETB',
          note: input.note?.trim() || null,
          createdBy: actorEmail ?? null,
          items: {
            create: input.items.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              storeId: l.storeId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              lineCost: round4(l.quantity * l.unitCost),
            })),
          },
        },
        include: { items: true, vendor: true },
      });

      // Second pass: increment stocks + write movements + recompute avgCost.
      // Do this per line because avgCost needs the running item state — we
      // can't batch across lines that touch the same item without ordering.
      const perItemAggregate = new Map<
        string,
        { addedQty: number; addedCost: number }
      >();
      for (const line of purchase.items) {
        const existing = perItemAggregate.get(line.inventoryItemId) ?? {
          addedQty: 0,
          addedCost: 0,
        };
        existing.addedQty += line.quantity;
        existing.addedCost += line.lineCost;
        perItemAggregate.set(line.inventoryItemId, existing);
      }

      // Increment per-store stocks and record ledger rows (parallel-safe: all
      // rows are keyed by (itemId, storeId) with a unique index).
      for (const line of purchase.items) {
        await tx.inventoryStock.upsert({
          where: {
            inventoryItemId_storeId: {
              inventoryItemId: line.inventoryItemId,
              storeId: line.storeId,
            },
          },
          create: {
            inventoryItemId: line.inventoryItemId,
            storeId: line.storeId,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            inventoryItemId: line.inventoryItemId,
            delta: line.quantity,
            reason: 'RESTOCK',
            note: input.reference?.trim() || null,
            refType: 'purchase',
            refId: purchase.id,
            storeId: line.storeId,
            purchaseItemId: line.id,
            actorEmail: actorEmail ?? null,
            merchantId,
            branchId: input.branchId,
          },
        });
      }

      // Weighted-average cost. Prior on-hand is read inside the transaction
      // (post-increment) so a concurrent sale can't skew the blend.
      for (const [itemId, agg] of perItemAggregate) {
        const item = itemById.get(itemId)!;
        const onHand = await tx.inventoryStock.aggregate({
          where: { inventoryItemId: itemId },
          _sum: { quantity: true },
        });
        const nextQty = onHand._sum.quantity ?? 0;
        const priorQty = nextQty - agg.addedQty;
        // Never infer procurement cost from retail price. When historical
        // opening stock has no cost basis, the first genuine purchase becomes
        // the initial average cost; its known cost must not be diluted by an
        // invented retail-price cost for the older units.
        const purchaseAvg = agg.addedCost / agg.addedQty;
        const priorAvg = item.avgCost;
        const nextAvg =
          priorAvg == null
            ? round4(purchaseAvg)
            : nextQty > 0
            ? round4((priorQty * priorAvg + agg.addedCost) / nextQty)
            : priorAvg;
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { avgCost: nextAvg },
        });
      }

      return purchase;
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
