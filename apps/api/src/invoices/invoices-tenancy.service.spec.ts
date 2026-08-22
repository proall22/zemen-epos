import type { AuditService } from '../audit/audit.service';
import type {
  RequestContext,
  RequestContextService,
} from '../audit/request-context.service';
import type { BuyersService } from '../buyers/buyers.service';
import type { EirmsAuthService } from '../eirms/eirms-auth.service';
import type { MerchantsService } from '../merchants/merchants.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from './invoices.service';

/**
 * Focused tenancy tests for InvoicesService. The HTTP/EIRMS happy path is
 * already covered by the integration code; here we only verify that reads
 * (list, getLastIrn, getNextSequenceNumbers) merge a tenant-scoped `where`
 * into the Prisma calls and never leak across branches.
 */

function makeCtx(
  merchantId: string | null = 'm-A',
  branchId: string | null = 'b-A',
): RequestContextService {
  const ctx: RequestContext = { requestId: 'r', merchantId, branchId };
  return { get: () => ctx } as unknown as RequestContextService;
}

interface AggregateArgs {
  where?: { branchId?: string; merchantId?: string };
  _max?: Record<string, boolean>;
}

interface FindManyArgs {
  where?: { branchId?: string; merchantId?: string };
  select?: Record<string, boolean>;
}

function makePrisma() {
  const allRows = [
    {
      id: '1',
      branchId: 'b-A',
      invoiceCounter: 5,
      documentNumber: '5',
      irn: 'IRN-A-5',
    },
    {
      id: '2',
      branchId: 'b-A',
      invoiceCounter: 6,
      documentNumber: '6',
      irn: 'IRN-A-6',
    },
    {
      id: '3',
      branchId: 'b-B',
      invoiceCounter: 9,
      documentNumber: '9',
      irn: 'IRN-B-9',
    },
  ];
  const filterByBranch = (where?: { branchId?: string }) =>
    where?.branchId
      ? allRows.filter((r) => r.branchId === where.branchId)
      : allRows;

  return {
    invoice: {
      aggregate: jest.fn((args: AggregateArgs) => {
        const rows = filterByBranch(args.where);
        const max = Math.max(0, ...rows.map((r) => r.invoiceCounter));
        return Promise.resolve({ _max: { invoiceCounter: max } });
      }),
      findMany: jest.fn((args: FindManyArgs) => {
        const rows = filterByBranch(args.where);
        return Promise.resolve(
          rows.map(({ documentNumber }) => ({ documentNumber })),
        );
      }),
      findFirst: jest.fn((args: FindManyArgs) => {
        const rows = filterByBranch(args.where);
        // Plain order: pick the last one (highest counter) as "most recent".
        const last = rows[rows.length - 1];
        return Promise.resolve(last ? { irn: last.irn } : null);
      }),
    },
  } as unknown as PrismaService;
}

function makeService(
  prisma: PrismaService,
  ctx: RequestContextService,
): InvoicesService {
  // EirmsAuthService, BuyersService, NotificationsService, etc. aren't
  // touched by the scoped reads we're testing, so they're stub objects.
  const noop = {} as unknown;
  return new InvoicesService(
    { seller: {} } as unknown as never,
    noop as EirmsAuthService,
    noop as never,
    prisma,
    noop as BuyersService,
    noop as NotificationsService,
    { get: () => '' } as unknown as never,
    {
      recordOutbound: jest.fn(),
      recordInbound: jest.fn(),
    } as unknown as AuditService,
    ctx,
    {
      assertMerchantActive: jest.fn().mockResolvedValue(undefined),
    } as unknown as MerchantsService,
    {
      wrap: (b: unknown) => Promise.resolve(b),
      isHttps: () => false,
      invalidate: () => {},
      seedFromEnvIfMissing: () => Promise.resolve(),
    } as unknown as never,
    {
      available: jest
        .fn()
        .mockResolvedValue({ onHand: 0, reserved: 0, available: 0 }),
      release: jest.fn().mockResolvedValue({ released: 0 }),
    } as unknown as never,
    {
      salesFloorForOrNull: jest.fn().mockResolvedValue(null),
    } as unknown as never,
    noop as never,
  );
}

describe('InvoicesService tenancy', () => {
  it('getNextSequenceNumbers scopes by branchId from the request context', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeCtx('m-A', 'b-A'));

    const next = await svc.getNextSequenceNumbers();
    // Branch A has counters 5,6 → next is 7 (not 10).
    expect(next.invoiceCounter).toBe(7);
    expect(next.documentNumber).toBe('7');
    expect(
      (prisma.invoice as unknown as { aggregate: jest.Mock }).aggregate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'b-A' }),
      }),
    );
  });

  it("getLastIrn returns the caller branch's last IRN — not the other branch's", async () => {
    const prisma = makePrisma();
    const svcA = makeService(prisma, makeCtx('m-A', 'b-A'));
    const svcB = makeService(prisma, makeCtx('m-A', 'b-B'));

    expect(await svcA.getLastIrn()).toBe('IRN-A-6');
    expect(await svcB.getLastIrn()).toBe('IRN-B-9');
  });

  it('SUPER_ADMIN (no branch in context) sees no branch filter — global sequence', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeCtx(null, null));

    const next = await svc.getNextSequenceNumbers();
    // Branchless = global max (9) + 1 → 10
    expect(next.invoiceCounter).toBe(10);
  });
});
