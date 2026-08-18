import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type InventoryCategory,
  type InventoryItem,
  type StockMovement,
  type Store,
} from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { StoreResolverService } from '../common/store-resolver.service';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { StockCountDto } from './dto/stock-count.dto';
import { WriteOffDto } from './dto/write-off.dto';
import { DEFAULT_TAX_CODE, taxRateForCode } from './tax-codes';

/** Catalogue row with on-hand computed at read time. */
export type InventoryItemWithStock = InventoryItem & {
  /** Sum across every store in the merchant. */
  totalOnHand: number;
  /** Sum across the acting branch's stores; null when no branch is selected. */
  onHand: number | null;
  /**
   * On the branch's sales-floor store only — what the till can actually sell,
   * and what the stock gate checks. Differs from `onHand` whenever the branch
   * keeps a back room, so the POS must show this and not `onHand`.
   */
  sellable: number | null;
};

export interface InventoryPage {
  items: InventoryItemWithStock[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ItemStockRow {
  storeId: string;
  storeName: string;
  storeCode: string;
  branchId: string;
  branchName: string;
  isSalesFloor: boolean;
  quantity: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storeResolver: StoreResolverService,
  ) {}

  /** Resolve the merchant to write inventory rows / stock movements against.
   *  SUPER_ADMIN writing inventory is out of scope until Phase D; refuse. */
  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    throw new NotFoundException(
      'A merchant context is required to write inventory.',
    );
  }

  /**
   * Turn a Prisma unique-constraint violation (P2002) into a readable 409 so
   * the form can show "Another item already uses this item code" rather than a
   * raw 500. `code` and `sku` are both unique; meta.target tells us which.
   */
  private rethrowAsConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // Prisma reports compound-unique violations with an array of the
      // participating columns — for (merchantId, branchId, X) that lists all
      // three, so match on which of the three "user-facing" columns is
      // present rather than trusting an index into the array.
      const target = error.meta?.target;
      const tokens = Array.isArray(target)
        ? target.map(String)
        : [String(target ?? '')];
      const label = tokens.some((t) => t.includes('upc'))
        ? 'UPC/barcode'
        : tokens.some((t) => t.includes('sku'))
          ? 'SKU'
          : 'item code';
      throw new ConflictException(`Another item already uses this ${label}.`);
    }
    throw error;
  }

  /**
   * Catalogue rows plus two computed on-hand figures — there is no stored
   * total. `onHand` is what the acting branch can actually sell; `totalOnHand`
   * spans every store in the merchant, for the read-only rollup.
   */
  async list(
    includeInactive = false,
    q?: string,
    categoryId?: string,
  ): Promise<InventoryItemWithStock[]> {
    const rows = await this.listRows(includeInactive, q, categoryId);
    return this.withStock(rows);
  }

  async page(
    page = 1,
    pageSize = 10,
    q?: string,
    categoryId?: string,
  ): Promise<InventoryPage> {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
    const baseWhere: Prisma.InventoryItemWhereInput = {
      ...merchantScope(this.context.get()),
      active: true,
      ...(categoryId?.trim() ? { categoryId: categoryId.trim() } : {}),
    };
    const query = q?.trim();
    const contains = query
      ? { contains: query, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.InventoryItemWhereInput = contains
      ? {
          AND: [baseWhere, { OR: [
            { code: contains }, { sku: contains }, { upc: contains },
            { description: contains }, { longDescription: contains },
          ] }],
        }
      : baseWhere;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return {
      items: await this.withStock(rows),
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  private listRows(
    includeInactive = false,
    q?: string,
    categoryId?: string,
  ): Promise<InventoryItem[]> {
    const baseWhere: Prisma.InventoryItemWhereInput = {
      ...merchantScope(this.context.get()),
      ...(includeInactive ? {} : { active: true }),
      ...(categoryId?.trim() ? { categoryId: categoryId.trim() } : {}),
    };
    const query = q?.trim();
    if (!query) {
      return this.prisma.inventoryItem.findMany({
        where: baseWhere,
        orderBy: { code: 'asc' },
      });
    }
    // ILIKE '%q%' across every searchable column. pg_trgm GIN indexes on
    // code/sku/upc/description accelerate the wildcard match; longDescription
    // falls back to a seq-scan on the already-filtered subset which is small
    // enough not to matter for typical inventory sizes.
    const contains = { contains: query, mode: 'insensitive' as const };
    return this.prisma.inventoryItem.findMany({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { code: contains },
              { sku: contains },
              { upc: contains },
              { description: contains },
              { longDescription: contains },
            ],
          },
        ],
      },
      orderBy: { code: 'asc' },
      take: 50,
    });
  }

  listCategories(): Promise<InventoryCategory[]> {
    return this.prisma.inventoryCategory.findMany({
      where: { ...merchantScope(this.context.get()), active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(input: {
    name: string;
    description?: string;
  }): Promise<InventoryCategory> {
    const merchantId = this.resolveMerchantId();
    try {
      return await this.prisma.inventoryCategory.create({
        data: {
          merchantId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A category with this name already exists.');
      }
      throw error;
    }
  }

  private async assertCategory(categoryId: string, merchantId: string) {
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { id: categoryId, merchantId, active: true },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('Category is invalid or inactive.');
    }
  }

  /**
   * Attach on-hand to catalogue rows in two grouped queries rather than one
   * per item. Branch figure is null when the caller has no branch context.
   */
  private async withStock(
    rows: InventoryItem[],
  ): Promise<InventoryItemWithStock[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const branchId = this.context.get()?.branchId;
    const sumBy = async (where: Prisma.InventoryStockWhereInput) => {
      const rowsAgg = await this.prisma.inventoryStock.groupBy({
        by: ['inventoryItemId'],
        where,
        _sum: { quantity: true },
      });
      return new Map(
        rowsAgg.map((t) => [t.inventoryItemId, t._sum.quantity ?? 0]),
      );
    };
    const totalBy = await sumBy({ inventoryItemId: { in: ids } });
    const branchBy = branchId
      ? await sumBy({ inventoryItemId: { in: ids }, store: { branchId } })
      : new Map<string, number>();
    const salesFloor = branchId
      ? await this.storeResolver.salesFloorForOrNull(branchId)
      : null;
    const sellableBy = salesFloor
      ? await sumBy({ inventoryItemId: { in: ids }, storeId: salesFloor.id })
      : new Map<string, number>();
    return rows.map((r) => ({
      ...r,
      totalOnHand: totalBy.get(r.id) ?? 0,
      onHand: branchId ? (branchBy.get(r.id) ?? 0) : null,
      sellable: salesFloor ? (sellableBy.get(r.id) ?? 0) : null,
    }));
  }

  /** Per-store breakdown for one item, across the stores the caller can see. */
  async stockByStore(id: string): Promise<ItemStockRow[]> {
    await this.get(id); // tenant check
    const ctx = this.context.get();
    const rows = await this.prisma.inventoryStock.findMany({
      where: {
        inventoryItemId: id,
        store: {
          ...merchantScope(ctx),
          ...(ctx?.branchId ? { branchId: ctx.branchId } : {}),
        },
      },
      include: { store: { include: { branch: { select: { name: true } } } } },
      orderBy: { storeId: 'asc' },
    });
    return rows.map((r) => ({
      storeId: r.storeId,
      storeName: r.store.name,
      storeCode: r.store.code,
      branchId: r.store.branchId,
      branchName: r.store.branch.name,
      isSalesFloor: r.store.isSalesFloor,
      quantity: r.quantity,
    }));
  }

  /**
   * Exact-match lookup used by the POS barcode scanner. Matches on UPC first
   * (the code physically on the package); falls back to SKU / item code so
   * the same input works when a merchant scans an internal label. Returns
   * null when nothing matches — the POS then falls back to a fuzzy search.
   */
  async scan(code: string): Promise<InventoryItem | null> {
    const value = code.trim();
    if (!value) return null;
    const scope: Prisma.InventoryItemWhereInput = {
      ...merchantScope(this.context.get()),
      active: true,
    };
    // UPC first — the intended barcode field. Then sku, then code as
    // fallbacks so a shop that hasn't set UPCs yet still gets a match on
    // whichever field they printed on labels.
    for (const field of ['upc', 'sku', 'code'] as const) {
      const hit = await this.prisma.inventoryItem.findFirst({
        where: { ...scope, [field]: value },
      });
      if (hit) return hit;
    }
    return null;
  }

  async get(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        id,
        ...merchantScope(this.context.get()),
        },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  private toCreateData(
    input: CreateInventoryItemDto,
    merchantId: string,
  ): Prisma.InventoryItemCreateInput {
    const trackStock = input.trackStock ?? false;
    const taxCode = input.taxCode ?? DEFAULT_TAX_CODE;
    return {
      code: input.code,
      sku: input.sku?.trim() || null,
      upc: input.upc?.trim() || null,
      description: input.description,
      longDescription: input.longDescription?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      ...(input.categoryId
        ? { category: { connect: { id: input.categoryId } } }
        : {}),
      unit: input.unit ?? 'PCS',
      unitPrice: input.unitPrice,
      avgCost:
        trackStock && (input.stockQuantity ?? 0) > 0
          ? (input.openingUnitCost ?? null)
          : null,
      taxCode,
      // Always derived — never taken from the client, so the code and the rate
      // can't disagree.
      taxRate: taxRateForCode(taxCode),
      harmonizationCode: input.harmonizationCode?.trim() || null,
      exciseRate: input.exciseRate ?? null,
      nature: input.nature ?? 'goods',
      active: input.active ?? true,
      trackStock,
      lowStockThreshold: input.lowStockThreshold ?? null,
      merchant: { connect: { id: merchantId } },
    };
  }

  async create(input: CreateInventoryItemDto): Promise<InventoryItem> {
    const merchantId = this.resolveMerchantId();
    this.assertOpeningCost(input);
    if (input.categoryId) {
      await this.assertCategory(input.categoryId, merchantId);
    }
    try {
      const item = await this.prisma.inventoryItem.create({
        data: this.toCreateData(input, merchantId),
      });
      // Opening balance lands in the acting branch's store. Skipped when the
      // caller has no branch — stock is added later via Restock.
      const opening = input.stockQuantity ?? 0;
      const branchId = this.context.get()?.branchId;
      if (item.trackStock && opening > 0 && branchId) {
        const store = await this.storeResolver.salesFloorFor(branchId);
        await this.prisma.$transaction([
          this.prisma.inventoryStock.create({
            data: {
              inventoryItemId: item.id,
              storeId: store.id,
              quantity: opening,
            },
          }),
          this.prisma.stockMovement.create({
            data: {
              inventoryItemId: item.id,
              delta: opening,
              reason: 'RESTOCK',
              note: 'Opening balance',
              merchantId,
              branchId,
              storeId: store.id,
            },
          }),
        ]);
      }
      return item;
    } catch (error) {
      this.rethrowAsConflict(error);
    }
  }

  /**
   * Price-versioning: create a NEW item (new code/sku/price) that supersedes an
   * existing one, link it back via predecessorId, and deactivate the old row.
   * Old invoices keep their snapshot lines + optional FK, so they're unaffected.
   */
  async supersede(
    id: string,
    input: CreateInventoryItemDto,
  ): Promise<InventoryItem> {
    const old = await this.get(id); // 404 if missing — already merchant-scoped
    const merchantId = this.resolveMerchantId();
    this.assertOpeningCost(input);
    try {
      const [created] = await this.prisma.$transaction([
        this.prisma.inventoryItem.create({
          data: {
            ...this.toCreateData(input, merchantId),
            predecessor: { connect: { id: old.id } },
          },
        }),
        this.prisma.inventoryItem.update({
          where: { id: old.id },
          data: { active: false },
        }),
      ]);
      return created;
    } catch (error) {
      this.rethrowAsConflict(error);
    }
  }

  /**
   * Manual stock change (restock / correction) against one store. Does NOT
   * enable tracking — the item form is the only place that happens.
   */
  async adjustStock(
    id: string,
    input: AdjustStockDto,
    actorEmail?: string,
  ): Promise<InventoryItem> {
    const item = await this.get(id); // 404 if missing — already merchant-scoped
    const ctx = this.context.get();
    const store = await this.resolveWriteStore(input.storeId);
    if (input.delta < 0) {
      await this.assertSufficientStock(id, store.id, -input.delta);
    }
    return this.prisma.$transaction(async (tx) => {
      await this.applyDelta(tx, id, store.id, input.delta);
      await tx.stockMovement.create({
        data: {
          inventoryItemId: id,
          delta: input.delta,
          reason: input.reason ?? 'ADJUSTMENT',
          note: input.note ?? null,
          actorEmail: actorEmail ?? null,
          merchantId: ctx?.merchantId ?? item.merchantId,
          branchId: store.branchId,
          storeId: store.id,
        },
      });
      return tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Record a stock decrement that isn't a sale — damage, expiry, theft,
   * internal use. Same mechanics as adjustStock with reason locked to the
   * write-off enum, delta forced negative, and a required note (enforced at
   * the DTO layer). Refuses when the target store lacks the on-hand
   * regardless of the branch's BLOCK_ON_EMPTY setting — writing off more
   * than you have is a data-entry mistake, not a legitimate operation.
   */
  async writeOff(
    id: string,
    input: WriteOffDto,
    actorEmail?: string,
  ): Promise<InventoryItem> {
    const item = await this.get(id);
    const ctx = this.context.get();
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than zero');
    }
    const store = await this.resolveWriteStore(input.storeId);
    await this.assertSufficientStock(id, store.id, input.quantity);
    const delta = -input.quantity;
    return this.prisma.$transaction(async (tx) => {
      await this.applyDelta(tx, id, store.id, delta);
      await tx.stockMovement.create({
        data: {
          inventoryItemId: id,
          delta,
          reason: input.reason,
          note: input.note,
          actorEmail: actorEmail ?? null,
          merchantId: ctx?.merchantId ?? item.merchantId,
          branchId: store.branchId,
          storeId: store.id,
        },
      });
      return tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Physical stock take: set a store's on-hand to what was actually counted.
   * The delta is derived here rather than supplied, because a count happens
   * exactly when the recorded figure is not trusted — including when it has
   * gone negative, which no ordinary adjustment should be asked to reason
   * about. Records the correction in the ledger like any other movement.
   */
  async recordCount(
    id: string,
    input: StockCountDto,
    actorEmail?: string,
  ): Promise<InventoryItem> {
    const item = await this.get(id);
    const ctx = this.context.get();
    const store = await this.resolveWriteStore(input.storeId);
    const existing = await this.prisma.inventoryStock.findUnique({
      where: {
        inventoryItemId_storeId: { inventoryItemId: id, storeId: store.id },
      },
    });
    const before = existing?.quantity ?? 0;
    const delta = input.counted - before;
    if (delta === 0) return item;
    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryStock.upsert({
        where: {
          inventoryItemId_storeId: { inventoryItemId: id, storeId: store.id },
        },
        create: {
          inventoryItemId: id,
          storeId: store.id,
          quantity: input.counted,
        },
        // Absolute, not an increment: the counted figure is the truth.
        update: { quantity: input.counted },
      });
      await tx.stockMovement.create({
        data: {
          inventoryItemId: id,
          delta,
          reason: 'ADJUSTMENT',
          note:
            `Stock take: counted ${input.counted}, was ${before}` +
            (input.note ? ` — ${input.note}` : ''),
          actorEmail: actorEmail ?? null,
          merchantId: ctx?.merchantId ?? item.merchantId,
          branchId: store.branchId,
          storeId: store.id,
          refType: 'stock-count',
        },
      });
      return tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Target store for a stock write, keyed off the acting branch — the
   * catalogue is merchant-wide, so the item can't say where its stock lives.
   * Callers with no branch context must name a store explicitly.
   */
  private async resolveWriteStore(explicitStoreId?: string): Promise<Store> {
    const branchId = this.context.get()?.branchId;
    if (branchId) {
      return this.storeResolver.resolveWriteStore({ branchId, explicitStoreId });
    }
    if (!explicitStoreId) {
      throw new BadRequestException({
        message: 'A store is required.',
        userMessages: [
          'Pick a branch in the switcher, or name the store to adjust.',
        ],
      });
    }
    const store = await this.prisma.store.findFirst({
      where: {
        id: explicitStoreId,
        active: true,
        ...merchantScope(this.context.get()),
      },
    });
    if (!store) throw new NotFoundException(`Store ${explicitStoreId} not found`);
    return store;
  }

  /** Overdrawing is a data-entry mistake regardless of the branch's stock
   *  policy — that policy governs selling, not corrections. */
  private async assertSufficientStock(
    inventoryItemId: string,
    storeId: string,
    needed: number,
  ): Promise<void> {
    const row = await this.prisma.inventoryStock.findUnique({
      where: { inventoryItemId_storeId: { inventoryItemId, storeId } },
    });
    const onHand = row?.quantity ?? 0;
    if (needed > onHand) {
      throw new BadRequestException({
        message: 'Not enough stock at that store.',
        userMessages: [`Only ${onHand} on hand; asked to remove ${needed}.`],
      });
    }
  }

  /** Atomic per-store delta — never read-then-write, so concurrent sales and
   *  restocks can't lose each other's update. */
  private async applyDelta(
    tx: Prisma.TransactionClient,
    inventoryItemId: string,
    storeId: string,
    delta: number,
  ): Promise<void> {
    await tx.inventoryStock.upsert({
      where: { inventoryItemId_storeId: { inventoryItemId, storeId } },
      create: { inventoryItemId, storeId, quantity: delta },
      update: { quantity: { increment: delta } },
    });
  }

  async listMovements(id: string): Promise<StockMovement[]> {
    await this.get(id); // tenant check — 404 if cross-tenant or missing
    const ctx = this.context.get();
    return this.prisma.stockMovement.findMany({
      where: {
        inventoryItemId: id,
        ...merchantScope(ctx),
        ...(ctx?.branchId
          ? { OR: [{ branchId: ctx.branchId }, { branchId: null }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async update(
    id: string,
    input: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    const existing = await this.get(id); // tenant check — 404 if cross-tenant or missing
    if (input.categoryId) {
      await this.assertCategory(input.categoryId, existing.merchantId);
    }
    const {
      categoryId,
      stockQuantity: _stockQuantity,
      openingUnitCost: _openingUnitCost,
      branchId: _branchId,
      ...fields
    } = input;
    const data: Prisma.InventoryItemUpdateInput = { ...fields };
    if (categoryId !== undefined) {
      data.category = categoryId
        ? { connect: { id: categoryId } }
        : { disconnect: true };
    }
    if (input.harmonizationCode !== undefined) {
      data.harmonizationCode = input.harmonizationCode.trim() || null;
    }
    // Keep the rate pinned to the code on edit, same as on create.
    if (input.taxCode !== undefined) {
      data.taxRate = taxRateForCode(input.taxCode);
    }
    try {
      return await this.prisma.inventoryItem.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Item ${id} not found`);
      }
      this.rethrowAsConflict(error);
    }
  }

  private assertOpeningCost(input: CreateInventoryItemDto): void {
    if (
      input.trackStock &&
      (input.stockQuantity ?? 0) > 0 &&
      !(typeof input.openingUnitCost === 'number' && input.openingUnitCost > 0)
    ) {
      throw new BadRequestException(
        'Enter the opening unit cost when creating an item with opening stock. Selling price cannot be used as inventory cost.',
      );
    }
  }
}
