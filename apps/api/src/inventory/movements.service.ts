import { Injectable } from '@nestjs/common';
import { Prisma, type StockMovementReason } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { tenantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';

export interface MovementRow {
  id: string;
  createdAt: Date;
  reason: StockMovementReason;
  delta: number;
  note: string | null;
  actorEmail: string | null;
  inventoryItemId: string;
  itemCode: string;
  itemDescription: string;
  itemImageUrl: string | null;
  storeId: string | null;
  storeName: string | null;
  branchName: string | null;
  transferId: string | null;
  refType: string | null;
  refId: string | null;
}

export interface MovementPage {
  items: MovementRow[];
  nextCursor: string | null;
}

export interface MovementQuery {
  storeId?: string;
  inventoryItemId?: string;
  reason?: StockMovementReason;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Read model for the stock ledger. Deliberately separate from AuditService:
 * a stock keeper needs to see what moved and who moved it without being
 * granted `audit.view`, so this exposes stock fields only — never request
 * metadata, IPs, or unrelated entities.
 */
@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async query(q: MovementQuery): Promise<MovementPage> {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const ctx = this.context.get();
    const where: Prisma.StockMovementWhereInput = {
      ...tenantScope(ctx),
      ...(q.storeId ? { storeId: q.storeId } : {}),
      ...(q.inventoryItemId ? { inventoryItemId: q.inventoryItemId } : {}),
      ...(q.reason ? { reason: q.reason } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.stockMovement.findMany({
      where,
      include: {
        inventoryItem: { select: { code: true, description: true, imageUrl: true } },
        store: {
          select: { name: true, branch: { select: { name: true } } },
        },
      },
      // id breaks ties so a cursor can't skip rows sharing a timestamp.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        reason: r.reason,
        delta: r.delta,
        note: r.note,
        actorEmail: r.actorEmail,
        inventoryItemId: r.inventoryItemId,
        itemCode: r.inventoryItem.code,
        itemDescription: r.inventoryItem.description,
        itemImageUrl: r.inventoryItem.imageUrl,
        storeId: r.storeId,
        storeName: r.store?.name ?? null,
        branchName: r.store?.branch.name ?? null,
        transferId: r.transferId,
        refType: r.refType,
        refId: r.refId,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }
}
