import {
  computeNextRunAt,
  instantForLocalWallClock,
  isValidTimeZone,
  zonedPartsOf,
} from './local-time';

const EAT = 'Africa/Addis_Ababa';
const NY = 'America/New_York';

/** Read an instant back as local wall clock, for readable assertions. */
const wall = (d: Date, tz: string) => {
  const p = zonedPartsOf(d, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
};

describe('isValidTimeZone', () => {
  it.each([EAT, NY, 'UTC', 'Europe/London'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(['Mars/Olympus', 'not a zone', ''])('rejects %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });
});

describe('instantForLocalWallClock', () => {
  it('resolves an EAT wall clock to the right UTC instant', () => {
    // Addis is UTC+3 year round.
    const d = instantForLocalWallClock(2026, 7, 19, 18 * 60, EAT);
    expect(d.toISOString()).toBe('2026-07-19T15:00:00.000Z');
  });

  it('round-trips through the zone it was built for', () => {
    const d = instantForLocalWallClock(2026, 7, 19, 6 * 60 + 30, EAT);
    expect(wall(d, EAT)).toBe('2026-07-19 06:30');
  });

  it('handles a zone with DST on both sides of a transition', () => {
    // New York: EST (-5) in January, EDT (-4) in July.
    const winter = instantForLocalWallClock(2026, 1, 15, 9 * 60, NY);
    expect(winter.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    const summer = instantForLocalWallClock(2026, 7, 15, 9 * 60, NY);
    expect(summer.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });
});

describe('computeNextRunAt — DAILY_AT', () => {
  const daily = (minute: number, timezone = EAT) =>
    ({ scheduleKind: 'DAILY_AT', dailyAtMinute: minute, timezone }) as const;

  it('fires later the same local day when the slot is still ahead', () => {
    const after = new Date('2026-07-19T09:00:00.000Z'); // 12:00 EAT
    const next = computeNextRunAt(daily(18 * 60), after);
    expect(wall(next, EAT)).toBe('2026-07-19 18:00');
  });

  it('rolls to tomorrow when the slot has passed', () => {
    const after = new Date('2026-07-19T16:00:00.000Z'); // 19:00 EAT
    const next = computeNextRunAt(daily(18 * 60), after);
    expect(wall(next, EAT)).toBe('2026-07-20 18:00');
  });

  it('is strictly after — an exact hit rolls forward', () => {
    // Without this the claim loop re-fires the same slot forever.
    const exact = new Date('2026-07-19T15:00:00.000Z'); // 18:00 EAT
    const next = computeNextRunAt(daily(18 * 60), exact);
    expect(next.getTime()).toBeGreaterThan(exact.getTime());
    expect(wall(next, EAT)).toBe('2026-07-20 18:00');
  });

  it('keeps the local hour across a DST spring-forward', () => {
    // US DST starts 8 Mar 2026. 09:00 local must stay 09:00 local, even
    // though the UTC offset changed underneath it.
    const before = new Date('2026-03-07T20:00:00.000Z');
    const next = computeNextRunAt(daily(9 * 60, NY), before);
    expect(wall(next, NY)).toBe('2026-03-08 09:00');
  });

  it('keeps the local hour across a DST fall-back', () => {
    // US DST ends 1 Nov 2026.
    const before = new Date('2026-10-31T20:00:00.000Z');
    const next = computeNextRunAt(daily(9 * 60, NY), before);
    expect(wall(next, NY)).toBe('2026-11-01 09:00');
  });
});

describe('computeNextRunAt — INTERVAL_HOURS', () => {
  const every = (hours: number, timezone = EAT) =>
    ({ scheduleKind: 'INTERVAL_HOURS', intervalHours: hours, timezone }) as const;

  it('anchors to local midnight rather than to the previous run', () => {
    // 13:10 EAT with a 6h interval → 18:00, not 19:10. Anchoring to the last
    // run instead would let the slot drift by the run duration each cycle.
    const after = new Date('2026-07-19T10:10:00.000Z');
    expect(wall(computeNextRunAt(every(6), after), EAT)).toBe('2026-07-19 18:00');
  });

  it.each([
    ['2026-07-18T21:30:00.000Z', '2026-07-19 06:00'], // 00:30 EAT
    ['2026-07-19T04:00:00.000Z', '2026-07-19 12:00'], // 07:00 EAT
    ['2026-07-19T14:00:00.000Z', '2026-07-19 18:00'], // 17:00 EAT
    ['2026-07-19T16:00:00.000Z', '2026-07-20 00:00'], // 19:00 EAT — rolls over
  ])('from %s lands on %s', (from, expected) => {
    expect(wall(computeNextRunAt(every(6), new Date(from)), EAT)).toBe(expected);
  });

  it('restarts at midnight for intervals that do not divide the day', () => {
    // 5h slots are 00/05/10/15/20; the next would be 25:00, so roll over.
    const after = new Date('2026-07-19T18:00:00.000Z'); // 21:00 EAT
    expect(wall(computeNextRunAt(every(5), after), EAT)).toBe('2026-07-20 00:00');
  });

  it('always advances', () => {
    // The scheduler re-arms from the returned value; a non-advancing result
    // would spin the claim loop.
    const start = new Date('2026-07-19T00:00:00.000Z');
    for (const hours of [1, 2, 3, 4, 5, 6, 8, 12, 24]) {
      let cursor = start;
      for (let i = 0; i < 30; i++) {
        const next = computeNextRunAt(every(hours), cursor);
        expect(next.getTime()).toBeGreaterThan(cursor.getTime());
        cursor = next;
      }
    }
  });
});
