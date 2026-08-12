import { zonedPartsOf } from '../common/local-time';
import type { InfoRowData } from '../notifications/templates/layout';
import type { ReportPayload, ReportWindow } from './reports.types';

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Short zone label ("EAT", "GMT+3") for the reader. */
export function zoneAbbrev(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(instant);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

/** "19 Jul 2026, 06:00–12:00 EAT" — collapses the date when both ends share
 *  one local day, which is the common case. */
export function formatWindow(window: ReportWindow, tz: string): string {
  const a = zonedPartsOf(window.start, tz);
  const b = zonedPartsOf(window.end, tz);
  const zone = zoneAbbrev(window.end, tz);
  const day = (p: ReturnType<typeof zonedPartsOf>) =>
    `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  const time = (p: ReturnType<typeof zonedPartsOf>) =>
    `${pad(p.hour)}:${pad(p.minute)}`;

  return a.year === b.year && a.month === b.month && a.day === b.day
    ? `${day(a)}, ${time(a)}–${time(b)} ${zone}`
    : `${day(a)} ${time(a)} – ${day(b)} ${time(b)} ${zone}`;
}

const amount = (n: number, currency = 'ETB') =>
  `${currency} ${n.toFixed(2)}`;

export function reportRows(payload: ReportPayload): InfoRowData[] {
  const rows: InfoRowData[] = [];
  const s = payload.sales;

  if (s) {
    rows.push({
      label: 'Invoices issued',
      value: `${s.generated.count} · ${amount(s.generated.total)}`,
    });
    if (s.cancelled.count > 0) {
      rows.push({ label: 'Invoices cancelled', value: String(s.cancelled.count) });
    }
    rows.push({
      label: 'Payments received',
      value: `${s.receipts.count} · ${amount(s.receipts.collected)}`,
    });
    if (s.withholding.count > 0) {
      rows.push({
        label: 'Withholding filed',
        value: `${s.withholding.count} · ${amount(s.withholding.withheld)}`,
      });
    }
    rows.push({ label: 'Tax charged', value: amount(s.generated.tax) });

    for (const b of s.byBranch) {
      rows.push({
        label: b.branchName,
        value: `${b.count} invoices · ${amount(b.total)}`,
      });
    }
  }

  const inv = payload.inventory;
  if (inv) {
    rows.push({
      label: 'Stock movements',
      value: String(inv.totalMovements),
    });
    for (const store of inv.stores) {
      const where = store.branchName
        ? `${store.branchName} · ${store.storeName}`
        : store.storeName;
      rows.push({
        label: where,
        value: `in ${store.in.toFixed(0)} · out ${store.out.toFixed(0)} · net ${store.net.toFixed(0)}`,
      });
    }
  }

  return rows;
}

export function reportSubject(
  reportName: string,
  window: ReportWindow,
  tz: string,
): string {
  return `${reportName} — ${formatWindow(window, tz)}`;
}
