import { ReportsRunService } from './reports-run.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ScheduledReport } from '@prisma/client';

const CONFIG = {
  enabled: true,
  dryRun: false,
  maxRecipients: 20,
  maxPerMerchant: 10,
  commitLagMs: 120_000,
  maxAttachmentBytes: 5_242_880,
  tickMs: 60_000,
  claimBatch: 50,
  leaseMinutes: 15,
};

const report = (over: Partial<ScheduledReport> = {}) =>
  ({
    id: 'r1',
    merchantId: 'mA',
    deliveredThrough: new Date('2026-07-19T06:00:00.000Z'),
    nextRunAt: new Date('2026-07-19T12:00:00.000Z'),
    scheduleKind: 'INTERVAL_HOURS',
    intervalHours: 6,
    dailyAtMinute: null,
    timezone: 'Africa/Addis_Ababa',
    ...over,
  }) as ScheduledReport;

function harness() {
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
    scheduledReportRun: {
      create: jest.fn(async (a: any) => ({ id: 'run1', ...a.data })),
      update: jest.fn(async (a: any) => a),
      findMany: jest.fn(async () => []),
    },
    scheduledReport: { update: jest.fn(async (a: any) => a) },
  } as unknown as PrismaService;
  return { prisma, service: new ReportsRunService(prisma, CONFIG) };
}

describe('cutoff never reaches now', () => {
  it('trails real time by the commit lag', () => {
    // Postgres now() is transaction-start time: a transaction that opened
    // before the cutoff but commits after this read would land in no window
    // at all. The lag is what makes that impossible.
    const { service } = harness();
    const now = new Date('2026-07-19T12:00:00.000Z');
    const cutoff = service.cutoffFor(
      report({ nextRunAt: new Date('2026-07-19T12:00:00.000Z') }),
      now,
    );
    expect(cutoff.getTime()).toBe(now.getTime() - CONFIG.commitLagMs);
    expect(cutoff.getTime()).toBeLessThan(now.getTime());
  });

  it('never runs past the scheduled slot, even when the tick is late', () => {
    // A tick delayed by an hour must still close the window at its slot, or
    // one report swallows the next one's data.
    const { service } = harness();
    const late = new Date('2026-07-19T13:00:00.000Z');
    const cutoff = service.cutoffFor(
      report({ nextRunAt: new Date('2026-07-19T12:00:00.000Z') }),
      late,
    );
    expect(cutoff.toISOString()).toBe('2026-07-19T12:00:00.000Z');
  });

  it('a row committed just inside the closed window is still reachable', () => {
    // The row's createdAt sits before the cutoff, so the NEXT window — which
    // opens at this window's end — will include it.
    const { service } = harness();
    const now = new Date('2026-07-19T12:00:00.000Z');
    const first = service.windowFor(
      report({ nextRunAt: now, deliveredThrough: new Date('2026-07-19T06:00:00.000Z') }),
      now,
    )!;
    const backdated = new Date(first.end.getTime() + 1_000);
    const second = service.windowFor(
      report({
        deliveredThrough: first.end,
        nextRunAt: new Date('2026-07-19T18:00:00.000Z'),
      }),
      new Date('2026-07-19T18:00:00.000Z'),
    )!;
    expect(backdated.getTime()).toBeGreaterThanOrEqual(second.start.getTime());
    expect(backdated.getTime()).toBeLessThan(second.end.getTime());
  });
});

describe('windows', () => {
  it('opens at the watermark and is half-open', () => {
    const { service } = harness();
    const now = new Date('2026-07-19T12:05:00.000Z');
    const w = service.windowFor(report(), now)!;
    expect(w.start.toISOString()).toBe('2026-07-19T06:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-07-19T12:00:00.000Z');
  });

  it('is null when the watermark already covers the cutoff', () => {
    // Nothing to report; the caller re-arms without opening a run.
    const { service } = harness();
    const w = service.windowFor(
      report({ deliveredThrough: new Date('2026-07-19T12:00:00.000Z') }),
      new Date('2026-07-19T12:05:00.000Z'),
    );
    expect(w).toBeNull();
  });

  it('widens after a skipped window rather than leaving a gap', () => {
    const { service } = harness();
    // First window skipped: deliveredThrough stays put.
    const w2 = service.windowFor(
      report({
        deliveredThrough: new Date('2026-07-19T06:00:00.000Z'),
        nextRunAt: new Date('2026-07-19T18:00:00.000Z'),
      }),
      new Date('2026-07-19T18:05:00.000Z'),
    )!;
    expect(w2.start.toISOString()).toBe('2026-07-19T06:00:00.000Z');
    expect(w2.end.toISOString()).toBe('2026-07-19T18:00:00.000Z');
  });
});

describe('the watermark moves only on a confirmed send', () => {
  it('advances to windowEnd when sent', async () => {
    const { service, prisma } = harness();
    const r = report();
    const w = { start: r.deliveredThrough, end: new Date('2026-07-19T12:00:00.000Z') };
    await service.completeSent('run1', r, w);
    const call = (prisma as any).scheduledReport.update.mock.calls[0][0];
    expect(call.data.deliveredThrough).toBe(w.end);
  });

  it('is untouched when the window was empty', async () => {
    const { service, prisma } = harness();
    await service.markSkipped('run1', 'r1');
    const call = (prisma as any).scheduledReport.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('deliveredThrough');
  });

  it('is untouched when the run failed', async () => {
    // A gap nobody can see is worse than a duplicate everybody can.
    const { service, prisma } = harness();
    await service.markFailed('run1', 'r1', 'smtp exploded');
    const call = (prisma as any).scheduledReport.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('deliveredThrough');
    expect(call.data.consecutiveFailures).toEqual({ increment: 1 });
  });

  it('records the provider id before the watermark moves', async () => {
    // That ordering is what lets a retry tell "already mailed" from "never".
    const { service, prisma } = harness();
    await service.recordSent('run1', 'resend-abc', {
      invoiceCount: 1,
      cancellationCount: 0,
      receiptCount: 0,
      movementCount: 0,
      recipientCount: 2,
    });
    const call = (prisma as any).scheduledReportRun.update.mock.calls[0][0];
    expect(call.data.providerMessageId).toBe('resend-abc');
    expect((prisma as any).scheduledReport.update).not.toHaveBeenCalled();
  });
});

describe('run rows', () => {
  it('fixes the window before any aggregation happens', async () => {
    // Written first so a retry re-sends the identical window, not a drifted one.
    const { service, prisma } = harness();
    const w = {
      start: new Date('2026-07-19T06:00:00.000Z'),
      end: new Date('2026-07-19T12:00:00.000Z'),
    };
    await service.openRun(report(), w);
    const data = (prisma as any).scheduledReportRun.create.mock.calls[0][0].data;
    expect(data.windowStart).toBe(w.start);
    expect(data.windowEnd).toBe(w.end);
    expect(data.status).toBe('PROCESSING');
  });

  it('carries the merchant so the worker reads tenancy off the row', async () => {
    const { service, prisma } = harness();
    await service.openRun(report(), {
      start: new Date(),
      end: new Date(Date.now() + 1000),
    });
    const data = (prisma as any).scheduledReportRun.create.mock.calls[0][0].data;
    expect(data.merchantId).toBe('mA');
  });
});

describe('re-arming', () => {
  it('advances from the scheduled slot, not from completion', async () => {
    // Re-arming from completion lets each run's latency compound into drift.
    const { service, prisma } = harness();
    await service.rearm(
      report({ nextRunAt: new Date(Date.now() + 3_600_000) }),
    );
    const data = (prisma as any).scheduledReport.update.mock.calls[0][0].data;
    expect(data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('releases the lease', async () => {
    const { service, prisma } = harness();
    await service.rearm(report());
    const data = (prisma as any).scheduledReport.update.mock.calls[0][0].data;
    expect(data.lockedAt).toBeNull();
    expect(data.lockedBy).toBeNull();
  });

  it('does not stall on a slot already in the past', async () => {
    const { service, prisma } = harness();
    await service.rearm(report({ nextRunAt: new Date('2020-01-01T00:00:00Z') }));
    const data = (prisma as any).scheduledReport.update.mock.calls[0][0].data;
    expect(data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('claim', () => {
  it('bounds the batch and honours the lease', async () => {
    const { service, prisma } = harness();
    await service.claimDue('worker-1', new Date('2026-07-19T12:00:00.000Z'));
    const sql = (prisma as any).$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"active"');
    expect(sql).toContain('LIMIT');
  });
});
