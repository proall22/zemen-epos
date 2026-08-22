import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type StockReservation } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { StoreResolverService } from '../common/store-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertReservationsDto } from './dto/reservation.dto';

/** Ten-minute reservation window, extended by heartbeat. */
const RESERVATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly storeResolver: StoreResolverService,
  ) {}

  private ctx() {
    const c = this.context.get();
    if (!c?.merchantId) {
      throw new NotFoundException('A merchant context is required for POS reservations.');
    }
    return c;
  }

  /**
   * Refuse when the session already holds reservations that belong to a
   * different user. `cartSessionId` is client-generated so nothing stops one
   * cashier from typing another's id — the ownership check is what makes
   * heartbeat / release / summary safe against IDOR. First-use of a new
   * session (no rows yet) is allowed; that's the create-my-cart path.
   */
  private async assertOwn(cartSessionId: string): Promise<void> {
    const ctx = this.ctx();
    const first = await this.prisma.stockReservation.findFirst({
      where: { cartSessionId, merchantId: ctx.merchantId! },
    });
    if (!first) return; // session hasn't reserved anything yet — allow.
    if (ctx.branchId && first.branchId !== ctx.branchId) {
      throw new ForbiddenException(
        'Reservation session belongs to a different branch.',
      );
    }
    // The first reservation on this session may pre-date the ownership
    // fields (userId/actorEmail landed with this feature). Nulls fall
    // through to allow — belt-and-braces for any grandfathered rows — but
    // the moment we have identity on the row, it must match the caller.
    if (first.userId && ctx.actorId && first.userId !== ctx.actorId) {
      throw new ForbiddenException(
        'Reservation session belongs to a different user.',
      );
    }
    if (
      !first.userId &&
      first.actorEmail &&
      ctx.actorEmail &&
      first.actorEmail !== ctx.actorEmail
    ) {
      throw new ForbiddenException(
        'Reservation session belongs to a different user.',
      );
    }
  }

  /**
   * Resolve the branch's sales-floor store — that's the one the sale path
   * decrements from, so reservations line up with it.
   */
  private async salesFloorStoreId(branchId: string): Promise<string> {
    const store = await this.storeResolver.salesFloorFor(branchId);
    return store.id;
  }

  /**
   * Compute the available (unreserved) quantity for a single item + store,
   * excluding a specific cart session (so a cashier can add more to their
   * own cart without their existing reservation counting against them).
   */
  async available(
    inventoryItemId: string,
    storeId: string,
    excludeCartSessionId?: string,
  ): Promise<{ onHand: number; reserved: number; available: number }> {
    const stock = await this.prisma.inventoryStock.findUnique({
      where: {
        inventoryItemId_storeId: { inventoryItemId, storeId },
      },
    });
    const onHand = stock?.quantity ?? 0;
    const now = new Date();
    const reservedRows = await this.prisma.stockReservation.findMany({
      where: {
        inventoryItemId,
        storeId,
        expiresAt: { gt: now },
        ...(excludeCartSessionId ? { NOT: { cartSessionId: excludeCartSessionId } } : {}),
      },
      select: { quantity: true },
    });
    const reserved = reservedRows.reduce((s, r) => s + r.quantity, 0);
    return { onHand, reserved, available: onHand - reserved };
  }

  /**
   * Upsert one reservation per requested line for this cart session, into
   * the branch's sales-floor store. Refuses (409) any line that would
   * over-reserve given active reservations by other cart sessions.
   */
  async upsert(input: UpsertReservationsDto, actorEmail?: string) {
    const ctx = this.ctx();
    const merchantId = ctx.merchantId!;
    const branchId = ctx.branchId;
    if (!branchId) {
      throw new BadRequestException(
        'Reservations need a branch context — cashiers only.',
      );
    }
    await this.assertOwn(input.cartSessionId);
    const storeId = await this.salesFloorStoreId(branchId);
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    // Aggregate requested per item so a cart with two lines of the same
    // item only creates one reservation row.
    const requested = new Map<string, number>();
    for (const line of input.items) {
      requested.set(
        line.inventoryItemId,
        (requested.get(line.inventoryItemId) ?? 0) + line.quantity,
      );
    }

    // Every referenced item must belong to the authenticated merchant. The
    // reservation row carries its own merchantId, so relying on the FK alone
    // would allow a client-supplied inventoryItemId from another tenant.
    const ownedItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: [...requested.keys()] }, merchantId },
      select: { id: true },
    });
    const ownedIds = new Set(ownedItems.map((item) => item.id));
    const foreign = [...requested.keys()].find((id) => !ownedIds.has(id));
    if (foreign) {
      throw new NotFoundException(`Inventory item ${foreign} not found.`);
    }

    // Check availability + build the write set.
    const problems: string[] = [];
    for (const [itemId, qty] of requested) {
      const { available } = await this.available(itemId, storeId, input.cartSessionId);
      if (qty > available) {
        problems.push(
          `Item ${itemId}: only ${available} available at this branch after other cashiers' reservations.`,
        );
      }
    }
    if (problems.length) {
      throw new ConflictException({
        message: 'Some items are reserved by another cashier.',
        userMessages: problems,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Reset any prior reservations for this session (simpler than diff'ing).
      await tx.stockReservation.deleteMany({
        where: { cartSessionId: input.cartSessionId, merchantId },
      });
      const created: StockReservation[] = [];
      for (const [itemId, quantity] of requested) {
        created.push(
          await tx.stockReservation.create({
            data: {
              merchantId,
              branchId,
              storeId,
              inventoryItemId: itemId,
              quantity,
              cartSessionId: input.cartSessionId,
              userId: ctx.actorId ?? null,
              actorEmail: actorEmail ?? null,
              expiresAt,
            },
          }),
        );
      }
      return created;
    });
  }

  /** Heartbeat — bump every non-expired reservation's expiresAt for this session. */
  async heartbeat(cartSessionId: string): Promise<{ ok: true; expiresAt: string }> {
    const ctx = this.ctx();
    await this.assertOwn(cartSessionId);
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
    await this.prisma.stockReservation.updateMany({
      where: {
        cartSessionId,
        merchantId: ctx.merchantId!,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt },
    });
    return { ok: true, expiresAt: expiresAt.toISOString() };
  }

  /** Bulk-release every reservation for the cart session. */
  async release(cartSessionId: string): Promise<{ released: number }> {
    const ctx = this.ctx();
    await this.assertOwn(cartSessionId);
    const result = await this.prisma.stockReservation.deleteMany({
      where: { cartSessionId, merchantId: ctx.merchantId! },
    });
    return { released: result.count };
  }

  /**
   * Snapshot for a specific item (used by POS to render "reserved by another").
   * When the caller passes their own `cartSessionId` we exclude it from the
   * reserved count — but only if the session actually belongs to them.
   * Cross-user session ids fall through as if unset (safe default: their
   * reservations count toward the reserved total).
   */
  async summary(inventoryItemId: string, excludeCartSessionId?: string) {
    const ctx = this.ctx();
    if (!ctx.branchId) {
      return { onHand: 0, reserved: 0, available: 0 };
    }
    const storeId = await this.salesFloorStoreId(ctx.branchId);
    let effectiveExclude: string | undefined;
    if (excludeCartSessionId) {
      try {
        await this.assertOwn(excludeCartSessionId);
        effectiveExclude = excludeCartSessionId;
      } catch {
        // Not ours — ignore silently and count those reservations normally.
      }
    }
    return this.available(inventoryItemId, storeId, effectiveExclude);
  }

  /**
   * Ownership gate for callers that received a `cartSessionId` from the
   * request body (invoice submit path). Returns the session id when the
   * caller owns it, or `undefined` when the id is bogus / stolen — safer
   * than throwing because a client-supplied id that doesn't match is more
   * likely a stale tab than an attack. The caller's `assertStockPolicy`
   * still runs without the exclusion, so the request either succeeds
   * normally or fails with a truthful "not enough stock" message.
   */
  async ownedCartSessionId(cartSessionId: string): Promise<string | undefined> {
    try {
      await this.assertOwn(cartSessionId);
      return cartSessionId;
    } catch {
      return undefined;
    }
  }

  /** Housekeeping: called by other services when a sale settles a cart. */
  async releaseInsideTransaction(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    cartSessionId: string,
    merchantId: string,
  ): Promise<void> {
    await tx.stockReservation.deleteMany({
      where: { cartSessionId, merchantId },
    });
  }
}
