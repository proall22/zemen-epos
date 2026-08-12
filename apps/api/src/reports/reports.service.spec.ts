import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ReportsService } from './reports.service';
import type { ReportsAggregationService } from './reports-aggregation.service';
import type { RequestContextService } from '../audit/request-context.service';
import type { PrismaService } from '../prisma/prisma.service';

const CONFIG = {
  enabled: true,
  dryRun: false,
  maxRecipients: 3,
  maxPerMerchant: 2,
  commitLagMs: 120_000,
  maxAttachmentBytes: 5_242_880,
  tickMs: 60_000,
  claimBatch: 50,
  leaseMinutes: 15,
};

const VALID = {
  name: 'Daily sales',
  scheduleKind: 'INTERVAL_HOURS' as const,
  intervalHours: 6,
  sections: ['SALES' as const],
  recipients: ['owner@merchant.et'],
};

function harness(opts: {
  actorRole?: string;
  actorMerchantId?: string | null;
  existingCount?: number;
  branchExists?: boolean;
  report?: Record<string, unknown> | null;
} = {}) {
  const created: any[] = [];
  const updated: any[] = [];

  const prisma = {
    scheduledReport: {
      count: jest.fn(async () => opts.existingCount ?? 0),
      create: jest.fn(async (args: any) => {
        created.push(args.data);
        return { id: 'r1', ...args.data };
      }),
      update: jest.fn(async (args: any) => {
        updated.push(args.data);
        return { id: 'r1', ...args.data };
      }),
      findUnique: jest.fn(async () =>
        opts.report === undefined
          ? {
              id: 'r1',
              merchantId: 'mA',
              ...VALID,
              // Prisma returns every column, so the unused half of the
              // schedule is null — not absent. The mock must match or it
              // hides the null-vs-undefined comparison bug.
              dailyAtMinute: null,
              branchScope: 'MERCHANT_WIDE',
              branchId: null,
              language: 'en',
              active: true,
              timezone: 'Africa/Addis_Ababa',
            }
          : opts.report,
      ),
      findMany: jest.fn(async () => []),
      delete: jest.fn(async () => ({})),
    },
    scheduledReportRun: { findMany: jest.fn(async () => []) },
    branch: {
      findFirst: jest.fn(async () =>
        opts.branchExists === false ? null : { id: 'bA' },
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  } as unknown as PrismaService;

  const context = {
    get: () => ({
      actorRole: opts.actorRole ?? 'MERCHANT_ADMIN',
      actorId: 'u1',
      actorEmail: 'admin@merchant.et',
      merchantId:
        opts.actorMerchantId === undefined ? 'mA' : opts.actorMerchantId,
    }),
  } as unknown as RequestContextService;

  const aggregation = {
    build: jest.fn(async () => ({ empty: true })),
  } as unknown as ReportsAggregationService;

  return {
    prisma,
    created,
    updated,
    service: new ReportsService(prisma, context, aggregation, CONFIG),
  };
}

describe('tenancy', () => {
  it('refuses a merchant the actor does not belong to', async () => {
    const { service } = harness({ actorMerchantId: 'mB' });
    await expect(service.list('mA')).rejects.toThrow(ForbiddenException);
  });

  it('refuses an actor with no merchant at all', async () => {
    const { service } = harness({ actorMerchantId: null });
    await expect(service.list('mA')).rejects.toThrow(ForbiddenException);
  });

  it('lets a SUPER_ADMIN through — consent is checked by the guard', async () => {
    const { service } = harness({
      actorRole: 'SUPER_ADMIN',
      actorMerchantId: null,
    });
    await expect(service.list('mA')).resolves.toEqual([]);
  });

  it('404s a report belonging to another merchant, rather than 403', async () => {
    const { service } = harness({ report: { id: 'r1', merchantId: 'mB' } });
    await expect(service.get('mA', 'r1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a branch that belongs to a different merchant', async () => {
    const { service } = harness({ branchExists: false });
    await expect(
      service.create('mA', {
        ...VALID,
        branchScope: 'SINGLE_BRANCH',
        branchId: 'foreign-branch',
      } as any),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('recipient cap', () => {
  it('accepts exactly the limit', async () => {
    const { service } = harness();
    await expect(
      service.create('mA', {
        ...VALID,
        recipients: ['a@x.com', 'b@x.com', 'c@x.com'],
      }),
    ).resolves.toBeDefined();
  });

  it('rejects one over', async () => {
    const { service } = harness();
    await expect(
      service.create('mA', {
        ...VALID,
        recipients: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'],
      }),
    ).rejects.toThrow(/at most 3 recipients/);
  });

  it('counts case-variants as one, so case cannot inflate the list', async () => {
    const { service, created } = harness();
    await service.create('mA', {
      ...VALID,
      recipients: ['a@x.com', 'A@X.com', ' a@x.com '],
    });
    expect(created[0].recipients).toEqual(['a@x.com']);
  });

  it('rejects a malformed address', async () => {
    const { service } = harness();
    await expect(
      service.create('mA', { ...VALID, recipients: ['not-an-email'] }),
    ).rejects.toThrow(/valid email/);
  });

  it('applies on update too — a cap only checked at create is walkable', async () => {
    const { service } = harness();
    await expect(
      service.update('mA', 'r1', {
        recipients: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'],
      }),
    ).rejects.toThrow(/at most 3 recipients/);
  });
});

describe('per-merchant cap', () => {
  it('allows creation below the cap', async () => {
    const { service } = harness({ existingCount: 1 });
    await expect(service.create('mA', VALID)).resolves.toBeDefined();
  });

  it('refuses at the cap, naming the limit and the count', async () => {
    const { service } = harness({ existingCount: 2 });
    await expect(service.create('mA', VALID)).rejects.toThrow(
      /already has 2 of 2 scheduled reports/,
    );
  });

  it('counts inactive reports too — they hold a watermark and can be re-enabled', async () => {
    const { service, prisma } = harness({ existingCount: 2 });
    await expect(service.create('mA', VALID)).rejects.toThrow(BadRequestException);
    // No `active` filter — parked reports would otherwise dodge the cap.
    expect((prisma as any).scheduledReport.count).toHaveBeenCalledWith({
      where: { merchantId: 'mA' },
    });
  });

  it('counts inside the insert transaction', async () => {
    const { service, prisma } = harness({ existingCount: 0 });
    await service.create('mA', VALID);
    expect((prisma as any).$transaction).toHaveBeenCalled();
  });
});

describe('schedule validation', () => {
  it('rejects an unknown timezone', async () => {
    const { service } = harness();
    await expect(
      service.create('mA', { ...VALID, timezone: 'Mars/Olympus' }),
    ).rejects.toThrow(/Unknown timezone/);
  });

  it('drops the daily field when the kind is interval', async () => {
    const { service, created } = harness();
    await service.create('mA', {
      ...VALID,
      scheduleKind: 'INTERVAL_HOURS',
      intervalHours: 6,
      dailyAtMinute: 500,
    } as any);
    expect(created[0].intervalHours).toBe(6);
    expect(created[0].dailyAtMinute).toBeNull();
  });

  it('drops the interval field when the kind is daily', async () => {
    const { service, created } = harness();
    await service.create('mA', {
      ...VALID,
      scheduleKind: 'DAILY_AT',
      dailyAtMinute: 1080,
      intervalHours: 6,
    } as any);
    expect(created[0].dailyAtMinute).toBe(1080);
    expect(created[0].intervalHours).toBeNull();
  });

  it('computes a nextRunAt in the future', async () => {
    const { service, created } = harness();
    await service.create('mA', VALID);
    expect(created[0].nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('the watermark is never editable', () => {
  it('is set to now at creation — a new report does not backfill history', async () => {
    const { service, created } = harness();
    const before = Date.now();
    await service.create('mA', VALID);
    const dt = created[0].deliveredThrough.getTime();
    expect(dt).toBeGreaterThanOrEqual(before);
    expect(dt).toBeLessThanOrEqual(Date.now());
  });

  it('is untouched by an update, even one that changes the schedule', async () => {
    const { service, updated } = harness();
    await service.update('mA', 'r1', {
      scheduleKind: 'DAILY_AT',
      dailyAtMinute: 1080,
    });
    expect(updated[0]).not.toHaveProperty('deliveredThrough');
    expect(updated[0].nextRunAt).toBeDefined();
  });

  it('does not re-arm nextRunAt when the cadence did not change', async () => {
    const { service, updated } = harness();
    await service.update('mA', 'r1', { name: 'Renamed' });
    expect(updated[0]).not.toHaveProperty('nextRunAt');
  });
});

describe('preview', () => {
  it('rejects an inverted window', async () => {
    const { service } = harness();
    await expect(
      service.preview('mA', {
        from: '2026-07-19T12:00:00.000Z',
        to: '2026-07-19T06:00:00.000Z',
        sections: ['SALES'],
      }),
    ).rejects.toThrow(/earlier than/);
  });

  it('aggregates without writing anything', async () => {
    const { service, prisma } = harness();
    await service.preview('mA', {
      from: '2026-07-19T00:00:00.000Z',
      to: '2026-07-19T12:00:00.000Z',
      sections: ['SALES'],
    });
    expect((prisma as any).scheduledReport.create).not.toHaveBeenCalled();
    expect((prisma as any).scheduledReport.update).not.toHaveBeenCalled();
  });
});
