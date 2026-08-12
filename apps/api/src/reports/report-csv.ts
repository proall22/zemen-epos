import { toCsv } from '../common/csv';
import { zonedPartsOf } from '../common/local-time';
import type { InventorySection, SalesEventRow } from './reports.types';

const money = (n: number | null) => (n === null ? '' : n.toFixed(2));

function localStamp(d: Date, tz: string): string {
  const p = zonedPartsOf(d, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Long format — one row per event — so a bookkeeper can pivot without
 *  reshaping. Both local and UTC stamps: local is what they recognise, UTC is
 *  what reconciles against anything else. */
export function salesCsv(rows: SalesEventRow[], tz: string): string {
  return toCsv(
    [
      'event_type',
      'occurred_at_local',
      'occurred_at_utc',
      'branch_name',
      'branch_id',
      'reference',
      'document_type',
      'buyer_tin',
      'buyer_name',
      'pre_tax',
      'tax',
      'total',
      'currency',
      'detail',
    ],
    rows.map((r) => [
      r.type,
      localStamp(r.occurredAt, tz),
      r.occurredAt.toISOString(),
      r.branchName,
      r.branchId,
      r.reference,
      r.documentType,
      r.buyerTin,
      r.buyerName,
      money(r.preTax),
      money(r.tax),
      money(r.total),
      r.currency,
      r.detail,
    ]),
  );
}

export function inventoryCsv(section: InventorySection): string {
  const rows: unknown[][] = [];
  for (const s of section.stores) {
    for (const r of s.byReason) {
      rows.push([
        s.branchName,
        s.branchId,
        s.storeName,
        s.storeId,
        r.reason,
        r.count,
        r.delta.toFixed(3),
        r.delta >= 0 ? r.delta.toFixed(3) : '0.000',
        r.delta < 0 ? Math.abs(r.delta).toFixed(3) : '0.000',
      ]);
    }
    rows.push([
      s.branchName,
      s.branchId,
      s.storeName,
      s.storeId,
      'TOTAL',
      s.count,
      s.net.toFixed(3),
      s.in.toFixed(3),
      s.out.toFixed(3),
    ]);
  }
  return toCsv(
    [
      'branch_name',
      'branch_id',
      'store_name',
      'store_id',
      'reason',
      'movement_count',
      'net_delta',
      'total_in',
      'total_out',
    ],
    rows,
  );
}

export function csvFilename(prefix: string, end: Date, tz: string): string {
  const p = zonedPartsOf(end, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}.csv`;
}
