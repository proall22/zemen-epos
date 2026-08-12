export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s =
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : JSON.stringify(v);
  // Neutralise spreadsheet formula injection: Excel / Sheets / Numbers
  // evaluate cells whose first byte is one of =, +, -, @, \t, \r.
  // A bare numeric literal is exempt — otherwise every negative amount ships
  // as text and the column won't sum, which is the whole point of the CSV.
  // "-2+3" and "-cmd" are not numeric literals, so they stay neutralised.
  const numeric = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s);
  if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [csvRow(header), ...rows.map(csvRow)].join('\n') + '\n';
}
