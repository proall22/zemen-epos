import i18n from "@/i18n";

/**
 * Locale-aware formatters. Everything reads `i18n.language` at call time so
 * they respond immediately when the cashier flips the language switcher.
 *
 * Amharic maps to the BCP-47 tag `am-ET`; English defaults to `en-GB`
 * because the platform's dates are day-first (`27/06/2026`) not month-first.
 * Numbers use the same 1,234.56 grouping in both languages — Ethiopia does
 * not swap comma / period like some European locales — so `Intl.NumberFormat`
 * defaults on `en-GB` give the correct output for both.
 */

function tag(): string {
  const lang = i18n.language;
  if (lang === "am") return "am-ET";
  return "en-GB";
}

/** Short date: `27/06/2026` in en, Amharic month name in am. */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(tag(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

/** Full date + time: `27/06/2026, 14:32` or the Amharic equivalent. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(tag(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Money with the ETB code appended. Amounts are always 2-decimal — the
 * platform never trades in fractional cents.
 */
export function formatMoney(
  value: number,
  currency: string = "ETB",
): string {
  const formatted = new Intl.NumberFormat(tag(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ${currency}`;
}

/** Plain number — group separators only, no currency. */
export function formatNumber(
  value: number,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(tag(), opts).format(value);
}

/** Percent — e.g. `15%` or `፲፭%`. */
export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(tag(), {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
