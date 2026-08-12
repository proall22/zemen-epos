import { ReportsAggregationService } from './reports-aggregation.service';
import type { PrismaService } from '../prisma/prisma.service';

/** Asserts the `where` reaching Prisma, with no request context anywhere —
 *  the worker's real condition, where merchantScope() would return {}. */

type Captured = { model: string; args: any };

function harness() {
  const calls: Captured[] = [];
  const record = (model: string) => ({
    aggregate: jest.fn(async (args: any) => {
      calls.push({ model, args });
      return { _count: { _all: 0 }, _sum: {} };
    }),
    groupBy: jest.fn(async (args: any) => {
      calls.push({ model, args });
      return [];
    }),
    findMany: jest.fn(async (args: any) => {
      calls.push({ model, args });
      return [];
    }),
  });

  const prisma = {
    invoice: record('invoice'),
    invoiceCancellation: record('invoiceCancellation'),
    receipt: record('receipt'),
    stockMovement: record('stockMovement'),
    branch: record('branch'),
    store: record('store'),
  } as unknown as PrismaService;

  return { prisma, calls, service: new ReportsAggregationService(prisma) };
}

const WINDOW = {
  start: new Date('2026-07-19T00:00:00Z'),
  end: new Date('2026-07-19T06:00:00Z'),
};

describe('ReportsAggregationService tenancy', () => {
  it('never injects the request context', () => {
    const deps =
      Reflect.getMetadata('design:paramtypes', ReportsAggregationService) ?? [];
    const names = deps.map((d: { name?: string }) => d?.name);
    expect(names).not.toContain('RequestContextService');
  });

  it('pins every query to the merchant, with no context established', async () => {
    const { service, calls } = harness();
    await service.build({ merchantId: 'mA' }, WINDOW, ['SALES', 'INVENTORY']);

    expect(calls.length).toBeGreaterThan(0);
    for (const { model, args } of calls) {
      const where = args.where ?? {};
      expect(where.merchantId).toBe('mA');
      expect(model).toBeTruthy();
    }
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['undefined', undefined as unknown as string],
  ])(
    'refuses to query at all when the merchant is %s',
    async (_label, merchantId) => {
      const { service, calls } = harness();
      await expect(
        service.salesSection({ merchantId }, WINDOW),
      ).rejects.toThrow(/refusing to query without a merchantId/);
      // The throw isn't the point; nothing reaching the DB is.
      expect(calls).toHaveLength(0);
    },
  );

  it('adds a branch filter only when the report is branch-scoped', async () => {
    const wide = harness();
    await wide.service.salesSection({ merchantId: 'mA' }, WINDOW);
    for (const { args } of wide.calls) {
      expect(args.where).not.toHaveProperty('branchId');
    }

    const single = harness();
    await single.service.salesSection(
      { merchantId: 'mA', branchId: 'bA' },
      WINDOW,
    );
    const scoped = single.calls.filter((c) => c.model !== 'branch');
    expect(scoped.length).toBeGreaterThan(0);
    for (const { args } of scoped) {
      expect(args.where.branchId).toBe('bA');
    }
  });

  it('skips the per-branch breakdown when already pinned to one branch', async () => {
    const { service, calls } = harness();
    await service.salesSection({ merchantId: 'mA', branchId: 'bA' }, WINDOW);
    const groupBys = calls.filter(
      (c) => c.model === 'invoice' && c.args.by !== undefined,
    );
    expect(groupBys).toHaveLength(0);
  });
});

describe('event windowing', () => {
  it('windows each event on its own timestamp, half-open', async () => {
    const { service, calls } = harness();
    await service.build({ merchantId: 'mA' }, WINDOW, ['SALES', 'INVENTORY']);

    const models = ['invoice', 'invoiceCancellation', 'receipt', 'stockMovement'];
    for (const model of models) {
      const call = calls.find((c) => c.model === model);
      expect(call).toBeDefined();
      expect(call!.args.where.createdAt).toEqual({
        gte: WINDOW.start,
        lt: WINDOW.end,
      });
    }
  });

  it('only queries the sections that were asked for', async () => {
    const salesOnly = harness();
    await salesOnly.service.build({ merchantId: 'mA' }, WINDOW, ['SALES']);
    expect(salesOnly.calls.some((c) => c.model === 'stockMovement')).toBe(false);

    const invOnly = harness();
    await invOnly.service.build({ merchantId: 'mA' }, WINDOW, ['INVENTORY']);
    expect(invOnly.calls.some((c) => c.model === 'invoice')).toBe(false);
  });
});

describe('empty detection', () => {
  it('reports empty when nothing happened, so the caller can skip the send', async () => {
    const { service } = harness();
    const payload = await service.build({ merchantId: 'mA' }, WINDOW, [
      'SALES',
      'INVENTORY',
    ]);
    expect(payload.empty).toBe(true);
    expect(payload.counts).toEqual({
      invoices: 0,
      cancellations: 0,
      receipts: 0,
      movements: 0,
    });
  });
});
