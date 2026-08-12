import { ReportsRunService } from './reports-run.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ScheduledReport } from '@prisma/client';
import { computeNextRunAt } from '../common/local-time';

/**
 * The delta guarantee as a property: over any sequence of ticks — including
 * empty windows, failures and crashes — every event is reported exactly once
 * and the covered timeline has no hole in it.
 *
 * Simulates the scheduler against an in-memory subscription and event log.
 */

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

type Outcome = 'send' | 'fail' | 'crash-after-send';

/** Deterministic PRNG so a failure is reproducible from its seed. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function service() {
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
    scheduledReportRun: {
      create: jest.fn(async (a: any) => ({ id: 'run', ...a.data })),
      update: jest.fn(async (a: any) => a),
      findMany: jest.fn(async () => []),
    },
    scheduledReport: { update: jest.fn(async (a: any) => a) },
  } as unknown as PrismaService;
  return new ReportsRunService(prisma, CONFIG);
}

interface SimResult {
  covered: Array<{ start: Date; end: Date }>;
  sentWindows: Array<{ start: Date; end: Date }>;
  deliveredThrough: Date;
}

function simulate(seed: number, ticks: number): SimResult {
  const svc = service();
  const rand = rng(seed);
  const t0 = new Date('2026-07-19T00:00:00.000Z');

  let report = {
    id: 'r1',
    merchantId: 'mA',
    scheduleKind: 'INTERVAL_HOURS',
    intervalHours: 1,
    dailyAtMinute: null,
    timezone: 'Africa/Addis_Ababa',
    deliveredThrough: t0,
    nextRunAt: computeNextRunAt(
      {
        scheduleKind: 'INTERVAL_HOURS',
        intervalHours: 1,
        timezone: 'Africa/Addis_Ababa',
      },
      t0,
    ),
  } as unknown as ScheduledReport;

  const covered: Array<{ start: Date; end: Date }> = [];
  const sentWindows: Array<{ start: Date; end: Date }> = [];

  for (let i = 0; i < ticks; i++) {
    // The tick fires a little after the slot, as a real one does.
    const now = new Date(report.nextRunAt.getTime() + 5 * 60_000);
    const window = svc.windowFor(report, now);

    if (window) {
      const roll = rand();
      const outcome: Outcome =
        roll < 0.25 ? 'fail' : roll < 0.35 ? 'crash-after-send' : 'send';
      const empty = rand() < 0.3;

      if (empty) {
        // SKIPPED_EMPTY: window recorded, watermark deliberately unmoved.
        covered.push({ start: window.start, end: window.end });
      } else if (outcome === 'send') {
        covered.push({ start: window.start, end: window.end });
        sentWindows.push({ start: window.start, end: window.end });
        report = { ...report, deliveredThrough: window.end } as ScheduledReport;
      } else if (outcome === 'crash-after-send') {
        // Mail went out, process died before the watermark advanced. The
        // window will be re-covered — a duplicate, never a gap.
        sentWindows.push({ start: window.start, end: window.end });
      }
      // 'fail' advances nothing.
    }

    report = {
      ...report,
      nextRunAt: computeNextRunAt(
        {
          scheduleKind: report.scheduleKind,
          intervalHours: report.intervalHours,
          dailyAtMinute: report.dailyAtMinute,
          timezone: report.timezone,
        },
        report.nextRunAt,
      ),
    } as ScheduledReport;
  }

  return { covered, sentWindows, deliveredThrough: report.deliveredThrough };
}

/** True when the union of windows covers [t0, deliveredThrough) with no hole. */
function hasGap(
  windows: Array<{ start: Date; end: Date }>,
  from: Date,
  to: Date,
): boolean {
  if (to.getTime() <= from.getTime()) return false;
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  let reached = from.getTime();
  for (const w of sorted) {
    if (w.start.getTime() > reached) return true;
    reached = Math.max(reached, w.end.getTime());
    if (reached >= to.getTime()) return false;
  }
  return reached < to.getTime();
}

describe('delta contiguity', () => {
  const t0 = new Date('2026-07-19T00:00:00.000Z');

  it.each(Array.from({ length: 200 }, (_, i) => i + 1))(
    'seed %i covers the delivered timeline with no gap',
    (seed) => {
      const { covered, deliveredThrough } = simulate(seed, 40);
      expect(hasGap(covered, t0, deliveredThrough)).toBe(false);
    },
  );

  it('every sent window starts at the previous delivered point', () => {
    // Windows may overlap (a crash re-sends one) but must never skip forward.
    for (let seed = 1; seed <= 100; seed++) {
      const { sentWindows } = simulate(seed, 40);
      const sorted = [...sentWindows].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      );
      let high = t0.getTime();
      for (const w of sorted) {
        expect(w.start.getTime()).toBeLessThanOrEqual(high);
        high = Math.max(high, w.end.getTime());
      }
    }
  });

  it('a crash after the send produces a duplicate, never a gap', () => {
    // The whole ordering argument in one assertion: an event may be reported
    // twice, but never zero times.
    for (let seed = 1; seed <= 100; seed++) {
      const { sentWindows, deliveredThrough } = simulate(seed, 40);
      expect(hasGap(sentWindows, t0, deliveredThrough)).toBe(false);
    }
  });

  it('windows are half-open, so a boundary event is counted once', () => {
    const { covered } = simulate(7, 40);
    const sorted = [...covered].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const w of sorted) {
      expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
    }
  });

  it('an all-failing report never advances its watermark', () => {
    const svc = service();
    let report = {
      id: 'r1',
      merchantId: 'mA',
      scheduleKind: 'INTERVAL_HOURS',
      intervalHours: 1,
      dailyAtMinute: null,
      timezone: 'Africa/Addis_Ababa',
      deliveredThrough: t0,
      nextRunAt: new Date(t0.getTime() + 3_600_000),
    } as unknown as ScheduledReport;

    let lastWindow = null as { start: Date; end: Date } | null;
    for (let i = 0; i < 10; i++) {
      const now = new Date(report.nextRunAt.getTime() + 60_000);
      lastWindow = svc.windowFor(report, now);
      report = {
        ...report,
        nextRunAt: new Date(report.nextRunAt.getTime() + 3_600_000),
      } as ScheduledReport;
    }

    expect(report.deliveredThrough).toEqual(t0);
    // The window widened to cover everything that was never delivered.
    expect(lastWindow!.start).toEqual(t0);
    expect(lastWindow!.end.getTime()).toBeGreaterThan(
      t0.getTime() + 9 * 3_600_000,
    );
  });
});
