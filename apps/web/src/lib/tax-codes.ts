/**
 * The tax codes MoR accepts on an invoice line. `code` is sent verbatim as
 * `ItemList[].TaxCode`, so this list is the wire contract — not just a label
 * set. The rate is derived from the code and is never entered by hand, which
 * is what keeps a "VAT15" item from carrying, say, a 100% rate.
 */
export interface TaxCodeOption {
  code: string;
  /** VAT rate as a percentage (15 → 15%). */
  rate: number;
  label: string;
}

export const TAX_CODES: readonly TaxCodeOption[] = [
  { code: "VAT15", rate: 15, label: "VAT 15%" },
  { code: "VAT10", rate: 10, label: "VAT 10%" },
  { code: "VAT0", rate: 0, label: "Zero-rated (0%)" },
  { code: "VATEX", rate: 0, label: "Exempt (0%)" },
];

export const DEFAULT_TAX_CODE = "VAT15";

/** Rate as a percentage for a stored tax code (15, 10 or 0). Legacy rows stored
 *  a bare "VAT" for the standard band. Unknown codes are treated as untaxed. */
export function taxRateForCode(code: string | null | undefined): number {
  const c = code?.trim().toUpperCase();
  if (!c) return 0;
  if (c === "VAT") return 15;
  return TAX_CODES.find((t) => t.code === c)?.rate ?? 0;
}

/** Coerce a stored code onto the current list so the edit form always has a
 *  matching option. Unknown codes were already being taxed at 0, so they land
 *  on VATEX rather than silently gaining a rate. */
export function normalizeTaxCode(code: string | null | undefined): string {
  const c = code?.trim().toUpperCase();
  if (!c) return DEFAULT_TAX_CODE;
  if (TAX_CODES.some((t) => t.code === c)) return c;
  return c === "VAT" ? "VAT15" : "VATEX";
}
