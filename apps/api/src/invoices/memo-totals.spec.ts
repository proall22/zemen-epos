import { recomputeValueDetails } from './invoices.service';

/**
 * A credit or debit memo carries only the *difference* between what was
 * billed and what should have been billed — never the corrected invoice
 * total. Both the payload we sign for MoR and the row we store must agree on
 * that, and both must agree with each other.
 *
 * The failure this guards against is subtle: a memo that reports the parent
 * invoice's total is a valid-looking document that refunds or charges the
 * whole sale instead of the correction.
 */

const BASE = {
  Discount: null,
  IncomeWithholdValue: 0,
  TransactionWithholdValue: 0,
  InvoiceCurrency: 'ETB',
};

/** Parent invoice: two lines, only the first was wrong. */
const CHANGED_LINE = {
  LineNumber: 1,
  ItemCode: 'COCA500',
  Quantity: 2,
  UnitPrice: 25,
  PreTaxValue: 50,
  ExciseTaxValue: 0,
  TaxAmount: 7.5,
  TotalLineAmount: 57.5,
  changed: true,
};

const UNCHANGED_LINE = {
  LineNumber: 2,
  ItemCode: 'WATER1L',
  Quantity: 10,
  UnitPrice: 15,
  PreTaxValue: 150,
  ExciseTaxValue: 0,
  TaxAmount: 22.5,
  TotalLineAmount: 172.5,
  changed: false,
};

/** Mirrors the filter both buildRegisterPayload and persist() apply. */
const changedOnly = (items: Array<Record<string, unknown>>) =>
  items.filter((i) => i.changed);

describe('memo totals', () => {
  const all = [CHANGED_LINE, UNCHANGED_LINE];

  it('reports the correction, not the parent invoice total', () => {
    const v = recomputeValueDetails(changedOnly(all), BASE);
    expect(v.TotalValue).toBe(57.5);
    // The whole-invoice figure the SPA would otherwise pass through.
    expect(v.TotalValue).not.toBe(230);
  });

  it('recomputes tax over the changed subset too', () => {
    const v = recomputeValueDetails(changedOnly(all), BASE);
    expect(v.TaxValue).toBe(7.5);
    expect(v.TaxValue).not.toBe(30);
  });

  it('what we send and what we store are the same figure', () => {
    const subset = changedOnly(all);
    const sent = recomputeValueDetails(subset, BASE);
    // persist() sums TotalLineAmount over the identical subset.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const stored = round2(
      subset.reduce((s, i) => s + (i.TotalLineAmount as number), 0),
    );
    expect(stored).toBe(sent.TotalValue);
  });

  it('carries excise from the changed lines only', () => {
    const withExcise = [
      { ...CHANGED_LINE, ExciseTaxValue: 5, TotalLineAmount: 62.5 },
      { ...UNCHANGED_LINE, ExciseTaxValue: 40 },
    ];
    const v = recomputeValueDetails(changedOnly(withExcise), BASE);
    expect(v.ExciseValue).toBe(5);
  });

  it('rounds to two places rather than accumulating float drift', () => {
    const thirds = Array.from({ length: 3 }, (_, i) => ({
      LineNumber: i + 1,
      TaxAmount: 0.1,
      ExciseTaxValue: 0,
      TotalLineAmount: 0.1,
      changed: true,
    }));
    const v = recomputeValueDetails(thirds, BASE);
    expect(v.TotalValue).toBe(0.3);
    expect(v.TaxValue).toBe(0.3);
  });

  it('an all-unchanged memo totals zero, which the amount rule refuses', () => {
    const v = recomputeValueDetails(changedOnly([UNCHANGED_LINE]), BASE);
    expect(v.TotalValue).toBe(0);
  });
});
