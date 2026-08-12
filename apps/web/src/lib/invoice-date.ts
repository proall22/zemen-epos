/**
 * Date/time helpers for invoice documents.
 *
 * Invoices carry two timestamp shapes:
 *  - `documentDate` is EIRMS day-first "DD-MM-YYYYTHH:mm:ss" (always midnight).
 *  - `ackDate` is ISO 8601 with a non-standard bracketed zone, e.g. "...Z[GMT]".
 * Neither is parseable by `new Date()` as-is, so normalise first.
 */

/**
 * Pick the authoritative "when was this issued" timestamp for an invoice.
 * MoR's `ackDate` is the record of truth — it's the timestamp the tax
 * authority validated against and the one MoR treats as legally issued.
 * `createdAt` is our DB row's creation and can drift from MoR by up to a
 * few seconds on the register round-trip. Fall back to `createdAt` only
 * when MoR hasn't stamped one (imports, cancellations, drafts).
 */
export function invoiceIssuedAt(inv: {
  ackDate?: string | null;
  createdAt: string;
}): string {
  const ack = inv.ackDate?.trim();
  return ack ? ack : inv.createdAt;
}

/** Locale timestamp with the same rules as {@link invoiceIssuedAt}. */
export function formatIssuedAt(inv: {
  ackDate?: string | null;
  createdAt: string;
}): string {
  const raw = invoiceIssuedAt(inv);
  const d = parseInvoiceDate(raw) ?? new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * MoR receipt responses carry no ackDate today — only id/status/rrn/qr. So
 * the authoritative issuance time is the `receiptDate` we stamp at the moment
 * of the /register call in EAT (UTC+3, EIRMS format), which is what MoR
 * associates with the RRN. Fall back to createdAt on legacy rows without it.
 */
export function receiptIssuedAt(rec: {
  receiptDate?: string | null;
  createdAt: string;
}): string {
  const rd = rec.receiptDate?.trim();
  return rd ? rd : rec.createdAt;
}

export function formatReceiptIssuedAt(rec: {
  receiptDate?: string | null;
  createdAt: string;
}): string {
  const raw = receiptIssuedAt(rec);
  const d = parseInvoiceDate(raw) ?? new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Parse either invoice timestamp shape into a JS Date, or null when unparseable. */
export function parseInvoiceDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\[[^\]]+\]$/, "");
  // EIRMS day-first dates aren't ISO; reorder DD-MM-YYYY -> YYYY-MM-DD to parse.
  const m = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})T(.+)$/);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : cleaned;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Date only, dd/mm/yyyy. Falls back to the raw date part if unparseable. */
export function formatInvoiceDate(raw: string): string {
  const d = parseInvoiceDate(raw);
  if (!d) return raw.includes("T") ? raw.split("T")[0] : raw;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Time in 12-hour AM/PM format (e.g. "02:52 PM"); blank if unparseable. */
export function formatInvoiceTime(raw: string | null | undefined): string {
  const d = parseInvoiceDate(raw);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Time as 24-hour HH:mm:ss, matching the fiscal POS receipt format. */
export function formatInvoiceTime24(raw: string | null | undefined): string {
  const d = parseInvoiceDate(raw);
  if (!d) return "";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** Time in 12-hour hh:mm:ss AM/PM (e.g. "09:21:26 PM"). */
export function formatInvoiceTime12WithSeconds(
  raw: string | null | undefined,
): string {
  const d = parseInvoiceDate(raw);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Ethiopian calendar date as DD-MM-YYYY (e.g. Feb 20 2026 → "13-06-2018").
 * Uses the JDN offset for the Amete Mihret epoch (Meskerem 1, 1 EC =
 * 29 Aug 8 CE proleptic Gregorian). Every 4th EC year has a 6-day Pagume;
 * the 4-year 1461-day cycle handles that without a special case.
 */
/** Render a MoR PaymentTerm token for print: `IMMIDIATE` → "Immediate",
 *  `NET_30` → "Net 30 days"; anything else prints verbatim so operator-typed
 *  custom terms survive. */
export function formatPaymentTerm(
  term: string | null | undefined,
): string {
  if (!term) return "—";
  const v = term.trim();
  if (!v) return "—";
  const upper = v.toUpperCase();
  if (upper === "IMMIDIATE" || upper === "IMMEDIATE") return "Immediate";
  const netMatch = /^NET[_\s-]?(\d+)$/i.exec(v);
  if (netMatch) return `Net ${netMatch[1]} days`;
  return v;
}

/** Return the payment due date for a CREDIT invoice: parsed(ackDate) + N
 *  days when the term is `NET_N`. Null when the term is IMMIDIATE or custom
 *  (no rule to derive a date from). */
export function paymentDueDate(
  ackDate: string | null | undefined,
  term: string | null | undefined,
): Date | null {
  if (!term) return null;
  const netMatch = /^NET[_\s-]?(\d+)$/i.exec(term.trim());
  if (!netMatch) return null;
  const base = parseInvoiceDate(ackDate);
  if (!base) return null;
  const due = new Date(base);
  due.setDate(due.getDate() + Number(netMatch[1]));
  return due;
}

export function formatPaymentDueDate(
  ackDate: string | null | undefined,
  term: string | null | undefined,
): string | null {
  const d = paymentDueDate(ackDate, term);
  if (!d) return null;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Descriptive one-liner shown under the payment-mode label on print. Empty
 *  string means "no extra label needed" (the mode itself is self-explanatory). */
export function paymentModeCaption(
  mode: string | null | undefined,
): string {
  const m = (mode ?? "").trim().toUpperCase();
  if (m === "CASH") return "Paid at issue";
  if (m === "ADVANCE") return "Deposit";
  if (m === "CREDIT") return "Deferred payment";
  return "";
}

export function formatEthiopianDate(raw: string): string {
  const d = parseInvoiceDate(raw);
  if (!d) return "";
  const ec = gregorianToEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const dd = String(ec.day).padStart(2, "0");
  const mm = String(ec.month).padStart(2, "0");
  return `${dd}-${mm}-${ec.year}`;
}

export function gregorianToEthiopian(
  gy: number,
  gm: number,
  gd: number,
): { year: number; month: number; day: number } {
  const a = Math.floor((14 - gm) / 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  const jdn =
    gd +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  const q = jdn - 1723855 - 1;
  const cycle = 1461;
  const cyclesElapsed = Math.floor(q / cycle);
  const dayInCycle = q - cyclesElapsed * cycle;
  const yearInCycle = Math.min(3, Math.floor(dayInCycle / 365));
  const year = cyclesElapsed * 4 + yearInCycle;
  const dayInYear = dayInCycle - yearInCycle * 365;
  const month = Math.floor(dayInYear / 30) + 1;
  const day = (dayInYear % 30) + 1;
  return { year, month, day };
}
