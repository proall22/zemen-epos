import type { ReportScheduleKind } from "@/lib/resources";

/** Mirrors the API's computeNextRunAt so the form can show the next fire
 *  before saving. Display only — the server remains authoritative. */
export function nextRunPreview(
  schedule: {
    scheduleKind: ReportScheduleKind;
    intervalHours?: number | null;
    dailyAtMinute?: number | null;
    timezone: string;
  },
  after: Date = new Date(),
): Date | null {
  const { timezone: tz } = schedule;
  try {
    if (schedule.scheduleKind === "DAILY_AT") {
      const minute = schedule.dailyAtMinute ?? 0;
      const p = parts(after, tz);
      let candidate = instantFor(p.year, p.month, p.day, minute, tz);
      if (candidate.getTime() <= after.getTime()) {
        const q = parts(new Date(after.getTime() + 86_400_000), tz);
        candidate = instantFor(q.year, q.month, q.day, minute, tz);
      }
      return candidate;
    }
    const hours = Math.min(Math.max(schedule.intervalHours ?? 1, 1), 24);
    const p = parts(after, tz);
    const midnight = instantFor(p.year, p.month, p.day, 0, tz);
    const step = hours * 3_600_000;
    const slot = Math.floor((after.getTime() - midnight.getTime()) / step) + 1;
    const candidate = new Date(midnight.getTime() + slot * step);
    const q = parts(new Date(midnight.getTime() + 90_000_000), tz);
    const nextMidnight = instantFor(q.year, q.month, q.day, 0, tz);
    return candidate.getTime() >= nextMidnight.getTime()
      ? nextMidnight
      : candidate;
  } catch {
    return null;
  }
}

function parts(instant: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (t: string) => Number(f.find((x) => x.type === t)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
    second: pick("second"),
  };
}

function instantFor(
  year: number,
  month: number,
  day: number,
  minutes: number,
  tz: string,
): Date {
  const local = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * 60_000;
  const off1 = offsetAt(new Date(local), tz);
  let candidate = local - off1;
  const off2 = offsetAt(new Date(candidate), tz);
  if (off2 !== off1) candidate = local - off2;
  return new Date(candidate);
}

function offsetAt(instant: Date, tz: string): number {
  const p = parts(instant, tz);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(instant.getTime() / 1000) * 1000
  );
}

export function formatInZone(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
}

export function describeSchedule(r: {
  scheduleKind: ReportScheduleKind;
  intervalHours: number | null;
  dailyAtMinute: number | null;
}): string {
  if (r.scheduleKind === "DAILY_AT") {
    const m = r.dailyAtMinute ?? 0;
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `Daily at ${hh}:${mm}`;
  }
  const h = r.intervalHours ?? 1;
  return h === 1 ? "Every hour" : `Every ${h} hours`;
}
