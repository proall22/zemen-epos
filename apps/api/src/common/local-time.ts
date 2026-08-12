/** Wall-clock arithmetic in an IANA timezone, via Intl. No date library needed. */

export interface ScheduleShape {
  scheduleKind: 'INTERVAL_HOURS' | 'DAILY_AT';
  intervalHours?: number | null;
  dailyAtMinute?: number | null;
  timezone: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function zonedPartsOf(instant: Date, tz: string): ZonedParts {
  const parts = formatterFor(tz).formatToParts(instant);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour') % 24, // ICU renders midnight as 24 in some zones
    minute: pick('minute'),
    second: pick('second'),
  };
}

function offsetAt(instant: Date, tz: string): number {
  const p = zonedPartsOf(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Offset is measured twice: the second pass corrects a guess that landed on
 *  the wrong side of a DST transition. */
export function instantForLocalWallClock(
  year: number,
  month: number,
  day: number,
  minutesPastMidnight: number,
  tz: string,
): Date {
  const localMs =
    Date.UTC(year, month - 1, day, 0, 0, 0) + minutesPastMidnight * MINUTE;

  const firstOffset = offsetAt(new Date(localMs), tz);
  let candidate = localMs - firstOffset;
  const secondOffset = offsetAt(new Date(candidate), tz);
  if (secondOffset !== firstOffset) candidate = localMs - secondOffset;

  return new Date(candidate);
}

function localMidnight(instant: Date, tz: string): Date {
  const p = zonedPartsOf(instant, tz);
  return instantForLocalWallClock(p.year, p.month, p.day, 0, tz);
}

/** Next fire strictly after `after`. Pass the SCHEDULED time, not the
 *  completion time, or run latency accumulates into drift. */
export function computeNextRunAt(schedule: ScheduleShape, after: Date): Date {
  const tz = schedule.timezone;

  if (schedule.scheduleKind === 'DAILY_AT') {
    const minute = schedule.dailyAtMinute ?? 0;
    const p = zonedPartsOf(after, tz);
    let candidate = instantForLocalWallClock(
      p.year,
      p.month,
      p.day,
      minute,
      tz,
    );
    // Strictly after, or the claim loop re-fires the same slot forever.
    if (candidate.getTime() <= after.getTime()) {
      const tomorrow = new Date(after.getTime() + DAY);
      const q = zonedPartsOf(tomorrow, tz);
      candidate = instantForLocalWallClock(q.year, q.month, q.day, minute, tz);
    }
    return candidate;
  }

  // Anchored to local midnight so a 6h report lands at 00/06/12/18 rather
  // than drifting by each run's duration.
  const hours = Math.min(Math.max(schedule.intervalHours ?? 1, 1), 24);
  const midnight = localMidnight(after, tz);
  const elapsed = after.getTime() - midnight.getTime();
  const step = hours * HOUR;
  const nextSlot = Math.floor(elapsed / step) + 1;
  const candidate = new Date(midnight.getTime() + nextSlot * step);

  // Intervals that don't divide 24h restart at midnight rather than walking.
  const nextMidnight = localMidnight(new Date(midnight.getTime() + DAY + HOUR), tz);
  if (candidate.getTime() >= nextMidnight.getTime()) return nextMidnight;
  return candidate;
}
