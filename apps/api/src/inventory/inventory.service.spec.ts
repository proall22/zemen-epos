import { InventoryService } from './inventory.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StoreResolverService } from '../common/store-resolver.service';
import type {
  RequestContext,
  RequestContextService,
} from '../audit/request-context.service';

/**
 * The catalogue is merchant-wide and on-hand lives only in inventory_stocks,
 * per store. These cover the two things that follow from that: item writes
 * carry no stock column, and stock writes always name a store.
 */

const STORE = { id: 'st-1', branchId: 'b-A', merchantId: 'm-test' };

function makePrisma() {
  const item = ({ where }: { where: { id: string } }) =>
    Promise.resolve({
      id: where.id,
      code: 'C',
      description: 'Old',
      unit: 'PCS',
      unitPrice: 10,
      taxCode: 'VAT15',
      taxRate: 15,
      trackStock: true,
      merchantId: 'm-test',
    });
  const tx = {
    inventoryStock: { upsert: jest.fn(() => Promise.resolve({})) },
    stockMovement: { create: jest.fn(({ data }) => Promise.resolve(data)) },
    inventoryItem: {
      findUniqueOrThrow: jest.fn(item),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
      update: jest.fn(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
    },
  };
  const prisma = {
    inventoryItem: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-id', ...data }),
      ),
      update: jest.fn(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data }),
      ),
      findFirst: jest.fn(item),
      findUnique: jest.fn(item),
      findMany: jest.fn((_args?: unknown): Promise<unknown[]> =>
        Promise.resolve([]),
      ),
    },
    inventoryStock: {
      create: jest.fn(({ data }) => Promise.resolve(data)),
      findUnique: jest.fn(() => Promise.resolve({ quantity: 5 })),
      groupBy: jest.fn((_args?: unknown): Promise<unknown[]> =>
        Promise.resolve([]),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    stockMovement: { create: jest.fn(({ data }) => Promise.resolve(data)) },
    store: { findFirst: jest.fn(() => Promise.resolve(STORE)) },
    // Callback form — the service runs its per-store writes inside one.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: unknown) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return { prisma, tx };
}

function makeStoreResolver(): StoreResolverService {
  return {
    salesFloorFor: jest.fn(() => Promise.resolve(STORE)),
    salesFloorForOrNull: jest.fn(() => Promise.resolve(STORE)),
    resolveWriteStore: jest.fn(() => Promise.resolve(STORE)),
  } as unknown as StoreResolverService;
}

function makeCtx(
  merchantId: string | null = 'm-test',
  branchId: string | null = 'b-A',
): RequestContextService {
  const ctx: RequestContext = { requestId: 'r', merchantId, branchId };
  return { get: () => ctx } as unknown as RequestContextService;
}

function build(merchantId = 'm-test', branchId: string | null = 'b-A') {
  const { prisma, tx } = makePrisma();
  const svc = new InventoryService(
    prisma as unknown as PrismaService,
    makeCtx(merchantId, branchId),
    makeStoreResolver(),
  );
  return { svc, prisma, tx };
}

describe('InventoryService', () => {
  it('creates an item with no stock column and no branch', async () => {
    const { svc, prisma } = build();
    await svc.create({ code: 'C', description: 'D', unitPrice: 10 });
    const data = prisma.inventoryItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ code: 'C', trackStock: false });
    expect(data).not.toHaveProperty('stockQuantity');
    expect(data).not.toHaveProperty('branch');
  });

  it('seeds an opening balance into the acting branch store', async () => {
    const { svc, prisma } = build();
    await svc.create({
      code: 'C',
      description: 'D',
      unitPrice: 10,
      trackStock: true,
      stockQuantity: 7,
      openingUnitCost: 6,
    });
    // Array form: [stock row, RESTOCK movement].
    expect(prisma.$transaction).toHaveBeenCalled();
    const ops = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(ops)).toBe(true);
  });

  it('skips the opening balance when there is no branch to put it in', async () => {
    const { svc, prisma } = build('m-test', null);
    await svc.create({
      code: 'C',
      description: 'D',
      unitPrice: 10,
      trackStock: true,
      stockQuantity: 7,
      openingUnitCost: 6,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects opening stock when its cost basis is missing', async () => {
    const { svc } = build();
    await expect(
      svc.create({
        code: 'C',
        description: 'D',
        unitPrice: 10,
        trackStock: true,
        stockQuantity: 7,
      }),
    ).rejects.toThrow(/opening unit cost/i);
  });

  it('adjustStock moves the store row atomically and logs the movement', async () => {
    const { svc, tx } = build();
    await svc.adjustStock('abc', { delta: 3, reason: 'RESTOCK' }, 'a@b.c');
    expect(tx.inventoryStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // increment, not a computed absolute — concurrent writes must not
        // clobber each other.
        update: { quantity: { increment: 3 } },
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        delta: 3,
        reason: 'RESTOCK',
        actorEmail: 'a@b.c',
        storeId: 'st-1',
      }),
    });
  });

  it('refuses a write-off larger than the store holds', async () => {
    const { svc } = build();
    // mock reports 5 on hand
    await expect(
      svc.writeOff('abc', { quantity: 99, reason: 'DAMAGE', note: 'n' }),
    ).rejects.toThrow(/Not enough stock/);
  });

  it('list scopes to the caller merchant — no cross-tenant leak', async () => {
    const { svc, prisma } = build('m-A');
    prisma.inventoryItem.findMany = jest.fn(
      ({ where }: { where: { merchantId?: string } }) => {
        const rows = [
          { id: 'a', merchantId: 'm-A', code: 'A' },
          { id: 'b', merchantId: 'm-B', code: 'B' },
        ];
        return Promise.resolve(
          where.merchantId
            ? rows.filter((r) => r.merchantId === where.merchantId)
            : rows,
        );
      },
    );
    const result = await svc.list(true);
    expect(result.map((r) => r.id)).toEqual(['a']);
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId: 'm-A' }),
      }),
    );
  });

  it('reports merchant total, branch on-hand and sellable separately', async () => {
    const { svc, prisma } = build('m-A');
    prisma.inventoryItem.findMany = jest.fn(() =>
      Promise.resolve([{ id: 'a', merchantId: 'm-A', code: 'A' }]),
    );
    // Query order: merchant total, then this branch, then the sales floor.
    prisma.inventoryStock.groupBy = jest
      .fn()
      .mockResolvedValueOnce([{ inventoryItemId: 'a', _sum: { quantity: 52 } }])
      .mockResolvedValueOnce([{ inventoryItemId: 'a', _sum: { quantity: 40 } }])
      .mockResolvedValueOnce([{ inventoryItemId: 'a', _sum: { quantity: 25 } }]);
    const [row] = await svc.list(true);
    expect(row.totalOnHand).toBe(52);
    expect(row.onHand).toBe(40);
    // The POS reads this one — a back room holding 15 isn't sellable.
    expect(row.sellable).toBe(25);
  });
});
