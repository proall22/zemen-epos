import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Store } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma client or an open transaction — resolution inside a `$transaction`
 *  must run on the same connection or it reads pre-transaction state. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * The single answer to "which store does this write land in".
 *
 * Before this existed the `isSalesFloor desc, isDefault desc, createdAt asc`
 * ordering was copy-pasted into five call sites that disagreed about whether
 * the key was the *item's* branch or the *caller's* branch — which is how
 * merchant-wide items ended up silently skipping their per-store rows. Store
 * resolution is keyed off the acting branch, never off the item.
 */
@Injectable()
export class StoreResolverService {
  private readonly logger = new Logger(StoreResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? this.prisma;
  }

  /**
   * The store a sale decrements at `branchId`: the flagged sales floor, else
   * the default, else the oldest active store. `isSalesFloor` is a preference
   * rather than a DB constraint, so the fallbacks matter.
   */
  async salesFloorFor(
    branchId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Store> {
    const store = await this.db(tx).store.findFirst({
      where: { branchId, active: true },
      orderBy: [
        { isSalesFloor: 'desc' },
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    if (store && !store.isSalesFloor) {
      // Nothing is flagged, so the ordering fell through to whatever store
      // sorts first — which may be a back room or cold store. Sales will
      // deduct from it. Loud, because it is invisible in the UI otherwise.
      this.logger.warn(
        `Branch ${branchId} has no store flagged as its sales floor; ` +
          `falling back to "${store.name}" (${store.code}). Sales will ` +
          `deduct from it until one is flagged.`,
      );
    }
    if (!store) {
      throw new NotFoundException({
        message: `Branch ${branchId} has no active stores.`,
        userMessages: [
          'This branch has no stores yet. Create one before moving stock.',
        ],
      });
    }
    return store;
  }

  /** {@link salesFloorFor} without the throw, for callers that must degrade
   *  rather than fail (e.g. seeding an opening balance at a branch that has
   *  no stores yet). */
  async salesFloorForOrNull(
    branchId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Store | null> {
    return this.db(tx).store.findFirst({
      where: { branchId, active: true },
      orderBy: [
        { isSalesFloor: 'desc' },
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Resolve the target store for a stock write. An explicit id is validated as
   * active, in-branch and in-merchant; omitting it falls back to the sales
   * floor. Cross-merchant ids 404 rather than silently falling back.
   */
  async resolveWriteStore(
    opts: { branchId: string; explicitStoreId?: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<Store> {
    const { branchId, explicitStoreId } = opts;
    if (!explicitStoreId) return this.salesFloorFor(branchId, tx);
    const merchantId = this.context.get()?.merchantId;
    const store = await this.db(tx).store.findFirst({
      where: {
        id: explicitStoreId,
        branchId,
        active: true,
        ...(merchantId ? { merchantId } : {}),
      },
    });
    if (!store) {
      throw new NotFoundException(
        `Store ${explicitStoreId} not found or inactive for this branch.`,
      );
    }
    return store;
  }
}
