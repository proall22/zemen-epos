import { taxRateForCode } from "./tax-codes";

export interface RegisterInvoiceResponse {
  irn: string;
  documentNumber: string;
  ackDate: string;
  status: string;
  signedQR: string;
  signedInvoice: string;
  errorMessage: string | null;
}

export function formatAckDate(raw: string): string {
  const cleaned = raw.replace(/\[[^\]]+\]$/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/**
 * True when a buyer TIN is one of our internal placeholders for walk-in /
 * anonymous customers. UI should hide it; outgoing payloads should drop it.
 */
export function isPlaceholderTin(tin: string | null | undefined): boolean {
  if (!tin) return true;
  const t = tin.trim();
  if (!t) return true;
  return t === "WALKIN" || t === "0000000000";
}

/** The original invoice IRN a CRE/DEB memo references, recovered from the
 *  stored MoR request payload. Returns undefined for regular invoices. */
export function relatedIrnOf(invoice: {
  documentType: string;
  rawRequest?: {
    ReferenceDetails?: { RelatedDocument?: string | null } | null;
  } | null;
}): string | undefined {
  if (invoice.documentType !== "CRE" && invoice.documentType !== "DEB") {
    return undefined;
  }
  return invoice.rawRequest?.ReferenceDetails?.RelatedDocument ?? undefined;
}

/** Tax codes that mark a line item as non-taxable to the buyer:
 *  `VAT0` is zero-rated, `VATEX` is exempt. Both are surfaced with a
 *  trailing "(N)" on customer-facing print artefacts (and on internal
 *  views for cashier ergonomics) per Ethiopian receipt convention. */
const NON_TAXABLE_TAX_CODES = new Set(["VAT0", "VATEX"]);

export function isNonTaxableTaxCode(
  taxCode: string | null | undefined,
): boolean {
  if (!taxCode) return false;
  return NON_TAXABLE_TAX_CODES.has(taxCode.trim().toUpperCase());
}

/** ` (N)` suffix for non-taxable rows, else empty string. Intended for
 *  direct interpolation:
 *      `{line.description}{nonTaxableSuffix(line.taxCode)}` */
export function nonTaxableSuffix(taxCode: string | null | undefined): string {
  return isNonTaxableTaxCode(taxCode) ? " (N)" : "";
}

/** VAT rate (fraction) implied by a stored line's tax code. The persisted
 *  invoice line keeps only the code, not the numeric rate — see
 *  {@link taxRateForCode} for the code → rate table. */
export function vatRateForTaxCode(taxCode: string | null | undefined): number {
  return taxRateForCode(taxCode) / 100;
}

/** Prefer the immutable issue-time rate. The code fallback keeps invoices
 * issued before tax-rate snapshots were introduced readable. */
export function vatRateForLine(line: {
  taxCode: string;
  taxRate?: number | null;
}): number {
  return line.taxRate != null
    ? line.taxRate / 100
    : vatRateForTaxCode(line.taxCode);
}

/**
 * Excise on a stored invoice line, derived from the persisted fields (excise
 * itself isn't stored). The register builds each line as
 *   taxAmount = (preTaxValue + excise) * rate + excise
 * so inverting gives
 *   excise = (taxAmount - preTaxValue * rate) / (1 + rate).
 * Returns 0 for non-excisable lines (float noise clamped). Used to render the
 * per-line Excise column + the totals block across all invoice PDF variants.
 */
export function lineExcise(line: {
  taxAmount: number;
  preTaxValue: number;
  taxCode: string;
  taxRate?: number | null;
}): number {
  const rate = vatRateForLine(line);
  const excise = line.taxAmount - line.preTaxValue * rate;
  return excise > 0.005 ? Math.round(excise * 100) / 100 : 0;
}

export function describeStatus(status: string): string {
  switch (status) {
    case "A":
      return "Accepted";
    case "R":
      return "Rejected";
    case "P":
      return "Pending";
    default:
      return status;
  }
}
