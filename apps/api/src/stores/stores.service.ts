import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Store } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { RequestContextService } from '../audit/request-context.service';
import { StoreResolverService } from '../common/store-resolver.service';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

export interface StoreStockRow {
  inventoryItemId: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  avgCost: number | null;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storeResolver: StoreResolverService,
  ) {}

  private resolveMerchantId(): string {
    const ctx = this.context.get();
    if (ctx?.merchantId) return ctx.merchantId;
    throw new NotFoundException(
      'A merchant context is required to manage stores.',
    );
  }

  /**
   * Cashiers (ctx.branchId set) only see stores at their branch. Merchant
   * admins and SUPER_ADMIN see every store within their merchant.
   */
  private branchVisibility(): Prisma.StoreWhereInput {
    const ctx = this.context.get();
    if (!ctx?.branchId) return {};
    return { branchId: ctx.branchId };
  }

  /**
   * `branchId` narrows to one branch — needed by merchant admins, whose
   * context carries no branch, so the caller's chosen branch and the returned
   * stores actually correspond. Omitted keeps the implicit
   * {@link branchVisibility} behaviour for existing callers.
   */
  async list(includeInactive = false, branchId?: string): Promise<Store[]> {
    if (branchId) await this.assertBranchReadable(branchId);
    return this.prisma.store.findMany({
      where: {
        ...merchantScope(this.context.get()),
        ...(branchId ? { branchId } : this.branchVisibility()),
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
    });
  }

  /** A cashier may only ask for their own branch; anyone else may ask for any
   *  branch inside their merchant. */
  private async assertBranchReadable(branchId: string): Promise<void> {
    const ctx = this.context.get();
    if (ctx?.branchId && ctx.branchId !== branchId) {
      throw new ForbiddenException('You can only view your own branch.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, ...merchantScope(ctx) },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
  }

  async get(id: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({
      where: {
        id,
        ...merchantScope(this.context.get()),
        ...this.branchVisibility(),
      },
    });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return store;
  }

  /**
   * Cashiers may only manage stores in their own branch; merchant admins may
   * target any branch under their merchant. Throws 403 on cross-branch,
   * 404 on cross-merchant (the FK write would also refuse).
   */
  private assertBranchAccess(branchId: string): void {
    const ctx = this.context.get();
    if (ctx?.branchId && ctx.branchId !== branchId) {
      throw new ForbiddenException(
        'You can only manage stores in your own branch.',
      );
    }
  }

  private rethrowAsConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Another store in this branch already uses that code.',
      );
    }
    throw error;
  }

  async create(input: CreateStoreDto): Promise<Store> {
    const merchantId = this.resolveMerchantId();
    this.assertBranchAccess(input.branchId);
    // Enforce that the branch actually belongs to this merchant — the FK
    // catches cross-merchant writes too, but a clearer 404 helps the UI.
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, merchantId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${input.branchId} not found`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        // At most one sales-floor per branch. If the new store claims it,
        // demote the current holder in the same transaction so the invariant
        // never breaks.
        if (input.isSalesFloor) {
          await tx.store.updateMany({
            where: { branchId: input.branchId, isSalesFloor: true },
            data: { isSalesFloor: false },
          });
        }
        const created = await tx.store.create({
          data: {
            merchantId,
            branchId: input.branchId,
            name: input.name.trim(),
            code: input.code.trim().toUpperCase(),
            isSalesFloor: input.isSalesFloor ?? false,
            active: input.active ?? true,
          },
        });
        await this.ensureBranchHasSalesFloor(tx, input.branchId);
        return created;
      });
    } catch (error) {
      this.rethrowAsConflict(error);
    }
  }

  async update(id: string, input: UpdateStoreDto): Promise<Store> {
    const existing = await this.get(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.isSalesFloor === true) {
          await tx.store.updateMany({
            where: {
              branchId: existing.branchId,
              isSalesFloor: true,
              NOT: { id },
            },
            data: { isSalesFloor: false },
          });
        }
        const data: Prisma.StoreUpdateInput = {};
        if (input.name !== undefined) data.name = input.name.trim();
        if (input.code !== undefined) data.code = input.code.trim().toUpperCase();
        if (input.isSalesFloor !== undefined) data.isSalesFloor = input.isSalesFloor;
        if (input.active !== undefined) data.active = input.active;
        const updated = await tx.store.update({ where: { id }, data });
        await this.ensureBranchHasSalesFloor(tx, existing.branchId);
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Store ${id} not found`);
      }
      this.rethrowAsConflict(error);
    }
  }

  /**
   * A branch must always have exactly one sales floor. Without this, clearing
   * the flag (or deactivating the store that held it) leaves the resolver
   * guessing, and sales silently start deducting from a back room.
   */
  private async ensureBranchHasSalesFloor(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<void> {
    const flagged = await tx.store.count({
      where: { branchId, active: true, isSalesFloor: true },
    });
    if (flagged > 0) return;
    const fallback = await tx.store.findFirst({
      where: { branchId, active: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!fallback) return; // branch has no active stores at all
    await tx.store.update({
      where: { id: fallback.id },
      data: { isSalesFloor: true },
    });
  }

  /**
   * Soft-delete via `active=false`. Refuses to touch the default store — the
   * migration guarantees one exists per branch and adjustStock uses it as a
   * fallback, so removing it would break the shim.
   */
  async remove(id: string): Promise<Store> {
    const store = await this.get(id);
    if (store.isDefault) {
      throw new ConflictException(
        'The default store cannot be removed. Assign a different default first.',
      );
    }
    // Refuse if any per-store stock is left, so on-hand isn't silently orphaned.
    const anyStock = await this.prisma.inventoryStock.findFirst({
      where: { storeId: id, quantity: { gt: 0 } },
    });
    if (anyStock) {
      throw new ConflictException(
        'Store still holds stock. Transfer or write off the on-hand before removing.',
      );
    }
    return this.prisma.store.update({
      where: { id },
      data: { active: false },
    });
  }

  /**
   * Move stock between two stores in the same branch. Writes a paired
   * TRANSFER_OUT / TRANSFER_IN in a single transaction, updates both
   * InventoryStock rows, and leaves the summary `stockQuantity` untouched
   * (the total across stores doesn't change).
   */
  async transfer(input: TransferStockDto, actorEmail?: string) {
    const ctx = this.context.get();
    if (input.fromStoreId === input.toStoreId) {
      throw new BadRequestException('Source and destination must be different.');
    }
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be greater than zero');
    }
    const [from, to, item] = await Promise.all([
      this.get(input.fromStoreId),
      this.get(input.toStoreId),
      this.prisma.inventoryItem.findFirst({
        where: {
          id: input.inventoryItemId,
          ...merchantScope(ctx),
        },
      }),
    ]);
    if (!item) {
      throw new NotFoundException(`Item ${input.inventoryItemId} not found`);
    }
    if (from.branchId !== to.branchId) {
      throw new BadRequestException(
        'Cross-branch transfers are not supported. Create a matching store in the destination branch first.',
      );
    }
    const branchWithPolicy = await this.prisma.branch.findUnique({
      where: { id: from.branchId },
      select: { stockPolicy: true },
    });
    const fromRow = await this.prisma.inventoryStock.findUnique({
      where: {
        inventoryItemId_storeId: {
          inventoryItemId: input.inventoryItemId,
          storeId: input.fromStoreId,
        },
      },
    });
    const fromOnHand = fromRow?.quantity ?? 0;
    if (
      branchWithPolicy?.stockPolicy === 'BLOCK_ON_EMPTY' &&
      input.quantity > fromOnHand
    ) {
      throw new BadRequestException({
        message: 'Not enough stock at the source store.',
        userMessages: [
          `Only ${fromOnHand} on hand at ${from.name}; asked to move ${input.quantity}.`,
        ],
      });
    }
    return this.prisma.$transaction(async (tx) => {
      // Guarded decrement: the quantity predicate is part of the match, so a
      // transfer racing a sale can't drive the source store negative.
      const moved = await tx.inventoryStock.updateMany({
        where: {
          inventoryItemId: input.inventoryItemId,
          storeId: input.fromStoreId,
          quantity: { gte: input.quantity },
        },
        data: { quantity: { decrement: input.quantity } },
      });
      if (moved.count === 0) {
        throw new BadRequestException({
          message: 'Not enough stock at the source store.',
          userMessages: [
            `${from.name} no longer holds ${input.quantity} — it may have sold in the meantime.`,
          ],
        });
      }
      await tx.inventoryStock.upsert({
        where: {
          inventoryItemId_storeId: {
            inventoryItemId: input.inventoryItemId,
            storeId: input.toStoreId,
          },
        },
        create: {
          inventoryItemId: input.inventoryItemId,
          storeId: input.toStoreId,
          quantity: input.quantity,
        },
        update: { quantity: { increment: input.quantity } },
      });
      // Paired OUT + IN sharing one transferId so the log renders "A → B" as a
      // single row. Merchant total is unchanged — stock only moved shelves.
      const merchantId = ctx?.merchantId ?? item.merchantId;
      const branchId = from.branchId;
      const noteText = input.note?.trim() || null;
      const transferId = randomUUID();
      await tx.stockMovement.createMany({
        data: [
          {
            inventoryItemId: input.inventoryItemId,
            delta: -input.quantity,
            reason: 'TRANSFER_OUT',
            note: noteText,
            actorEmail: actorEmail ?? null,
            merchantId,
            branchId,
            storeId: input.fromStoreId,
            transferId,
            refType: 'transfer',
            refId: transferId,
          },
          {
            inventoryItemId: input.inventoryItemId,
            delta: input.quantity,
            reason: 'TRANSFER_IN',
            note: noteText,
            actorEmail: actorEmail ?? null,
            merchantId,
            branchId,
            storeId: input.toStoreId,
            transferId,
            refType: 'transfer',
            refId: transferId,
          },
        ],
      });
      const [fromRowAfter, toRowAfter] = await Promise.all([
        tx.inventoryStock.findUnique({
          where: {
            inventoryItemId_storeId: {
              inventoryItemId: input.inventoryItemId,
              storeId: input.fromStoreId,
            },
          },
        }),
        tx.inventoryStock.findUnique({
          where: {
            inventoryItemId_storeId: {
              inventoryItemId: input.inventoryItemId,
              storeId: input.toStoreId,
            },
          },
        }),
      ]);
      return {
        from: fromRowAfter?.quantity ?? 0,
        to: toRowAfter?.quantity ?? 0,
      };
    });
  }

  /**
   * What this store is holding. `reserved` is live POS cart holds, so
   * `available` is what a cashier could actually sell right now.
   */
  async stock(id: string, q?: string): Promise<StoreStockRow[]> {
    const store = await this.get(id); // tenant + branch check
    const query = q?.trim();
    const rows = await this.prisma.inventoryStock.findMany({
      where: {
        storeId: store.id,
        ...(query
          ? {
              inventoryItem: {
                OR: [
                  { code: { contains: query, mode: 'insensitive' } },
                  { description: { contains: query, mode: 'insensitive' } },
                  { sku: { contains: query, mode: 'insensitive' } },
                  { upc: { contains: query, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: { inventoryItem: true },
      orderBy: { inventoryItem: { code: 'asc' } },
    });
    if (rows.length === 0) return [];
    const reservations = await this.prisma.stockReservation.groupBy({
      by: ['inventoryItemId'],
      where: {
        storeId: store.id,
        expiresAt: { gt: new Date() },
        inventoryItemId: { in: rows.map((r) => r.inventoryItemId) },
      },
      _sum: { quantity: true },
    });
    const reservedBy = new Map(
      reservations.map((r) => [r.inventoryItemId, r._sum.quantity ?? 0]),
    );
    return rows.map((r) => {
      const reserved = reservedBy.get(r.inventoryItemId) ?? 0;
      return {
        inventoryItemId: r.inventoryItemId,
        code: r.inventoryItem.code,
        description: r.inventoryItem.description,
        unit: r.inventoryItem.unit,
        quantity: r.quantity,
        reserved,
        available: r.quantity - reserved,
        lowStockThreshold: r.inventoryItem.lowStockThreshold,
        avgCost: r.inventoryItem.avgCost,
      };
    });
  }

  /** @see StoreResolverService.salesFloorFor — kept as a thin alias so existing
   *  callers don't all have to switch at once. */
  defaultStoreFor(branchId: string): Promise<Store> {
    return this.storeResolver.salesFloorFor(branchId);
  }
}
