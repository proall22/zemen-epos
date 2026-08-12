/**
 * The tax codes MoR accepts on an invoice line. The code is forwarded verbatim
 * as `ItemList[].TaxCode`, so this list is a wire contract, not a label set.
 *
 * The rate always follows from the code — callers may not supply their own, or
 * an item could claim to be VAT15 while carrying a 100% rate.
 */
export const TAX_RATE_BY_CODE: Record<string, number> = {
  VAT15: 15,
  VAT10: 10,
  VAT0: 0,
  VATEX: 0,
};

export const TAX_CODES = Object.keys(TAX_RATE_BY_CODE);

export const DEFAULT_TAX_CODE = 'VAT15';

/** Rate (percentage) for a stored code. Legacy rows used a bare "VAT" for the
 *  standard band; anything unrecognised is treated as untaxed. */
export function taxRateForCode(code: string | null | undefined): number {
  const c = code?.trim().toUpperCase();
  if (!c) return 0;
  if (c === 'VAT') return 15;
  return TAX_RATE_BY_CODE[c] ?? 0;
}
