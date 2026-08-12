export type SupplyNature = "goods" | "service";
export type WithholdTxType = "B2B" | "B2C" | "B2G";

/**
 * Taxable total (VAT-rated net + excise, after discount) at or above which the
 * 3% income withholding kicks in. It's a floor on the taxable base, not the
 * pre-tax value — an invoice whose taxable total reaches this qualifies even if
 * its bare line subtotal doesn't.
 */
const INCOME_WITHHOLD_THRESHOLD = 20000;

/**
 * The two withholdings an invoice can carry. They're reported on separate,
 * always-present lines of the document, and both can be populated on the same
 * B2G invoice.
 */
export interface Withholding {
  /** Income withholding — 3% of the taxable total. */
  income: number;
  /** VAT withholding — 50% of the VAT amount. */
  vat: number;
}

/**
 * Withholding shown on the invoice (display only — NOT deducted from the total
 * and NOT sent to EIRMS).
 *
 *   - Income (3%): B2B only, once the taxable total reaches
 *     {@link INCOME_WITHHOLD_THRESHOLD}. Computed on the taxable total itself
 *     (which already includes excise and is net of discount).
 *   - VAT (50%): applies to every B2G invoice, with no threshold. B2G relies
 *     on this alone — it carries no 3% income withholding.
 *   - C2B: neither.
 *
 * `taxableTotal` is the VAT-rated base the document already shows on its
 * "Taxable Total" row; `vatValue` is the VAT alone (excise stripped out).
 */
export function computeWithholding(
  taxableTotal: number,
  vatValue: number,
  tx: WithholdTxType,
): Withholding {
  return {
    income:
      tx === "B2B" && taxableTotal >= INCOME_WITHHOLD_THRESHOLD
        ? round2(taxableTotal * 0.03)
        : 0,
    vat: tx === "B2G" ? round2(vatValue * 0.5) : 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
