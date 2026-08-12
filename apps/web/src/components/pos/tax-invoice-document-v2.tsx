import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { VoidWatermark } from "@/components/pos/void-watermark";
import { useSellerInfo } from "@/lib/auth";
import {
  formatInvoiceDate,
  formatInvoiceTime24,
  formatPaymentDueDate,
  formatPaymentTerm,
  paymentModeCaption,
} from "@/lib/invoice-date";
import {
  isPlaceholderTin,
  lineExcise,
  nonTaxableSuffix,
} from "@/lib/invoice-types";
import { amountInWords } from "@/lib/number-to-words";
import type { Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  computeWithholding,
  type WithholdTxType,
} from "@/lib/withholding";

/** Zemen-ePos brand accent — the colour theme for this variant. */
const ACCENT = "#5700FF";

const DOC_TITLES: Record<string, string> = {
  INV: "Cash Sales VAT/Excise Tax Invoice",
  CRE: "Tax Credit Note",
  DEB: "Tax Debit Note",
  PRF: "Pro-forma Invoice",
  OVD: "Overdue Invoice",
  INT: "Interim Invoice",
  RTN: "Return Invoice",
  MIX: "Mixed Invoice",
  FIN: "Final Invoice",
};

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TaxInvoiceDocumentV2Props {
  invoice: Invoice;
  /** DOM id, useful if the host page wants to scope print rules. */
  id?: string;
  /** Original invoice IRN a CRE/DEB memo references. */
  relatedIrn?: string;
}

/**
 * Variant 2 of the tax invoice — a modern, accent-coloured card layout
 * (clean header, identifiers strip, From/To columns, striped item table and a
 * highlighted financial summary). Same data as the classic document.
 */
export function TaxInvoiceDocumentV2({
  invoice,
  id = "tax-invoice-print",
  relatedIrn,
}: TaxInvoiceDocumentV2Props) {
  const SELLER_INFO = useSellerInfo();
  const title = DOC_TITLES[invoice.documentType] ?? invoice.documentType;
  const isWalkIn = isPlaceholderTin(invoice.buyer.tin);
  const date = formatInvoiceDate(invoice.documentDate || invoice.ackDate);
  const time = formatInvoiceTime24(invoice.ackDate);
  const dateTime = time ? `${date} ${time}` : date;

  const totalDiscount = invoice.items.reduce((s, l) => s + (l.discount || 0), 0);
  const totalExcise = round2(
    invoice.items.reduce((s, l) => s + lineExcise(l), 0),
  );
  const grossTotal = round2(
    invoice.items.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  );
  // Total taxable = Total Amount − Discount + Excise (the VAT base).
  const taxableTotal = round2(grossTotal - totalDiscount + totalExcise);
  const nonTaxableTotal = invoice.items
    .filter((l) => l.taxCode === "VAT0" || l.taxCode === "VATEX")
    .reduce((s, l) => s + l.preTaxValue, 0);
  const inWords = amountInWords(invoice.totalValue, "birr");
  const paymentMode = invoice.paymentMode || "CASH";
  const txType = invoice.transactionType || (isWalkIn ? "B2C" : "B2B");

  // Display-only withholding (not deducted, not sent to EIRMS): 3% of the
  // taxable total on B2B/B2G over threshold, plus 50% of VAT on every B2G.
  const withholding = computeWithholding(
    taxableTotal,
    invoice.taxValue,
    txType as WithholdTxType,
  );

  const sellerAddress = [
    SELLER_INFO.region && `Region: ${SELLER_INFO.region}`,
    SELLER_INFO.city && `City: ${SELLER_INFO.city}`,
    SELLER_INFO.wereda && `Woreda: ${SELLER_INFO.wereda}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      id={id}
      className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-lg bg-white text-slate-900 shadow-sm print:rounded-none print:shadow-none"
    >
      {invoice.status === "CANCELLED" && <VoidWatermark />}
      {/* Header */}
      <header
        className="flex items-start justify-between gap-6 border-b-2 p-8 pb-6"
        style={{ borderColor: ACCENT }}
      >
        <div className="flex flex-col gap-2">
          <ZemenEPosLogo className="h-7 w-auto text-[#5700FF]" />
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ color: ACCENT }}
          >
            {SELLER_INFO.legalName}
          </h1>
          <div className="space-y-1 text-xs text-slate-600">
            <p>
              <span className="font-bold">TIN:</span> {SELLER_INFO.tin}
              <span className="mx-2">|</span>
              <span className="font-bold">VAT:</span> {SELLER_INFO.vatNumber}
            </p>
            {sellerAddress && <p>{sellerAddress}</p>}
            <p>
              <span className="font-bold">Tel:</span> {SELLER_INFO.phone}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <h2 className="font-serif text-lg font-bold uppercase tracking-widest text-slate-800">
              {title}
            </h2>
            {invoice.status === "CANCELLED" && (
              <span className="rounded-sm border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                Cancelled
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {invoice.signedQR ? (
            <img
              src={`data:image/png;base64,${invoice.signedQR}`}
              alt="Invoice QR"
              className="h-36 w-36 bg-white"
            />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded border text-[10px] text-slate-400">
              No QR
            </div>
          )}
        </div>
      </header>

      {/* Identifiers strip */}
      <div className="border-b border-slate-200 bg-slate-50 px-8 py-3">
        <p className="pb-1 font-mono text-xs text-slate-600">
          <span>IRN: </span>
          <span className="break-all">{invoice.irn}</span>
        </p>
        {relatedIrn && (
          <p className="pb-1 font-mono text-xs text-slate-600">
            <span>Reference (Source IRN): </span>
            <span className="break-all">{relatedIrn}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Identifier label="System Number" value={SELLER_INFO.systemNumber} />
          <Identifier label="Date" value={dateTime} />
          <Identifier label="Document No" value={invoice.documentNumber} />
        </div>
      </div>

      {/* From / To */}
      <div className="px-8 py-5">
        <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <Party
            label="ከ / From"
            accent
            name={SELLER_INFO.legalName}
            tin={SELLER_INFO.tin}
            vat={SELLER_INFO.vatNumber}
            city={SELLER_INFO.city}
            wereda={SELLER_INFO.wereda}
            kebele={SELLER_INFO.kebele}
            phone={SELLER_INFO.phone}
            email={SELLER_INFO.email}
          />
          <Party
            label="ለ / To"
            name={isWalkIn ? "Walk-in Customer" : invoice.buyer.legalName}
            tin={isWalkIn ? "" : invoice.buyer.tin}
            vat={invoice.buyer.vatNumber ?? ""}
            city={invoice.buyer.city ?? ""}
            wereda={invoice.buyer.wereda ?? ""}
            kebele={invoice.buyer.kebele ?? ""}
            phone={invoice.buyer.phone ?? ""}
            email={invoice.buyer.email ?? ""}
          />
        </div>
      </div>

      {/* Items */}
      <div className="px-8">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr
                className="border-b-2"
                style={{ borderColor: ACCENT, backgroundColor: `${ACCENT}0d` }}
              >
                <Th en="#" />
                <Th am="ዕቃ/አገልግሎት" en="Description" />
                <Th am="ምድብ" en="Nature" />
                <Th am="መለኪያ" en="UoM" align="center" />
                <Th am="ታክስ ኮድ" en="Tax Code" align="center" />
                <Th am="ብዛት" en="Qty" align="right" />
                <Th am="የአንዱ ዋጋ" en="Unit Price" align="right" />
                <Th am="ቅናሽ" en="Discount" align="right" />
                <Th am="ኤክሳይዝ ታክስ" en="Excise Tax" align="right" />
                <Th am="ጠቅላላ ዋጋ" en="Total Amount" align="right" />
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((line) => (
                <tr key={line.id} className="border-b border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {line.lineNumber}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {line.description}
                    {nonTaxableSuffix(line.taxCode)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {invoice.natureOfSupplies || "goods"}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">
                    {line.unit}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">
                    {line.taxCode}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {line.quantity}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {fmtNumber(line.unitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {line.discount > 0 ? fmtNumber(line.discount) : "0"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {fmtNumber(lineExcise(line))}
                  </td>
                  <td className="bg-slate-100 px-3 py-2 text-right font-bold text-slate-900">
                    {fmtNumber(line.unitPrice * line.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment + Financial summary */}
      <div className="px-8 py-5">
        <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <div className="space-y-3 text-sm">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex justify-between text-slate-700">
                <span>Payment Method:</span>
                <span className="font-medium">{paymentMode}</span>
              </div>
              {paymentModeCaption(paymentMode) && (
                <div className="text-xs text-slate-600">
                  {paymentModeCaption(paymentMode)}
                </div>
              )}
              {paymentMode.toUpperCase() === "CREDIT" && (
                <div className="mt-1 space-y-1 border-t border-slate-200 pt-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Payment schedule:</span>
                    <span className="font-semibold">
                      {formatPaymentTerm(invoice.paymentTerm)}
                    </span>
                  </div>
                  {formatPaymentDueDate(invoice.ackDate, invoice.paymentTerm) && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Due by:</span>
                      <span className="font-semibold tabular-nums">
                        {formatPaymentDueDate(
                          invoice.ackDate,
                          invoice.paymentTerm,
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className="overflow-hidden rounded-lg border-2"
            style={{ borderColor: `${ACCENT}66` }}
          >
            <div
              className="px-4 py-2 text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <h3 className="text-sm font-bold">
                የገንዘብ ማጠቃለያ / Financial Summary
              </h3>
            </div>
            <div
              className="flex flex-col gap-y-2 p-4 text-xs"
              style={{ backgroundColor: `${ACCENT}08` }}
            >
              <SummaryRow
                label="ጠቅላላ የደረሰኝ መጠን / Total Amount (ETB):"
                value={fmtNumber(grossTotal)}
                border
                bold
              />
              <SummaryRow
                label="ቅናሽ / Discount (−):"
                value={fmtNumber(totalDiscount)}
              />
              <SummaryRow
                label="ኤክሳይዝ ታክስ / Excise Tax (+):"
                value={fmtNumber(totalExcise)}
              />
              <SummaryRow
                label="ታክስ የሚከፈልበት ድምር / Total Taxable Amount:"
                value={fmtNumber(taxableTotal)}
                border
                bold
              />
              {nonTaxableTotal > 0 && (
                <SummaryRow
                  label="ታክስ ነፃ ድምር / Non-taxable:"
                  value={fmtNumber(nonTaxableTotal)}
                />
              )}
              <div
                className="flex justify-between border-b-2 pb-2"
                style={{ borderColor: `${ACCENT}66` }}
              >
                <span className="font-bold text-slate-700">
                  VAT15 ታክስ / VAT15 Tax:
                </span>
                <span className="font-bold" style={{ color: ACCENT }}>
                  {fmtNumber(invoice.taxValue)}
                </span>
              </div>
              {withholding.income > 0 && (
                <SummaryRow
                  label="ተቀናሽ ግብር / Withholding (3%):"
                  value={fmtNumber(withholding.income)}
                />
              )}
              {withholding.vat > 0 && (
                <SummaryRow
                  label="የተያዘ ተ.እ.ታ / VAT Withholding (50% of VAT):"
                  value={fmtNumber(withholding.vat)}
                />
              )}
              <div
                className="-mx-4 -mb-4 flex items-center justify-between px-4 pb-4 pt-2"
                style={{ backgroundColor: `${ACCENT}1a` }}
              >
                <span className="text-sm font-bold text-slate-900">
                  ጠቅላላ ዋጋ ከታክስ ጋር
                  <br />
                  <span className="text-xs">Total including Tax</span>
                </span>
                <span className="text-2xl font-bold" style={{ color: ACCENT }}>
                  {fmtNumber(invoice.totalValue)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-6 rounded-lg border-l-4 p-4"
          style={{ borderColor: ACCENT, backgroundColor: `${ACCENT}08` }}
        >
          <p className="text-sm font-medium italic text-slate-900">
            <span className="pr-1 text-xs font-semibold text-slate-600">
              Amount in Words:
            </span>
            {inWords}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t-2 border-slate-200 bg-slate-100 px-8 py-4 text-center text-xs text-slate-600">
        <div className="flex items-center justify-center gap-1.5">
          <span>Powered by</span>
          <ZemenEPosLogo className="h-4 w-auto text-[#5700FF]" />
        </div>
        <p className="mt-1">Zemen-ePos e-Invoicing · {SELLER_INFO.email}</p>
      </div>
    </article>
  );
}

function Identifier({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-slate-600">{label}</p>
      <p className="font-mono text-slate-900">{value}</p>
    </div>
  );
}

function Th({
  am,
  en,
  align = "left",
}: {
  am?: string;
  en: string;
  align?: "left" | "center" | "right";
}) {
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th className={cn("px-3 py-2.5 font-bold text-slate-800", alignCls)}>
      {am && (
        <span className="mb-0.5 block text-[9px] font-normal opacity-75">
          {am}
        </span>
      )}
      {en}
    </th>
  );
}

function Party({
  label,
  accent,
  name,
  tin,
  vat,
  city,
  wereda,
  kebele,
  phone,
  email,
}: {
  label: string;
  accent?: boolean;
  name: string;
  tin: string;
  vat: string;
  city: string;
  wereda: string;
  kebele: string;
  phone: string;
  email: string;
}) {
  return (
    <div
      className="border-l-4 pl-4"
      style={{ borderColor: accent ? ACCENT : "#94a3b8" }}
    >
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
        {label}
      </h2>
      <div className="space-y-1.5 text-sm">
        <p className="font-bold text-slate-900">{name}</p>
        <div className="space-y-0.5 text-slate-700">
          <Field label="TIN:" value={tin} />
          <Field label="VAT Reg:" value={vat} />
          <Field label="ከተማ/City:" value={city} />
          <Field label="ወረዳ/Woreda:" value={wereda} />
          <Field label="ቀበሌ/Kebele:" value={kebele} />
          <Field label="ስልክ/Phone:" value={phone} />
          <Field label="Email:" value={email} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-semibold">{label}</span> {value}
    </p>
  );
}

function SummaryRow({
  label,
  value,
  border,
  bold,
}: {
  label: string;
  value: string;
  border?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex justify-between", border && "border-b border-slate-300 pb-2")}>
      <span className={cn("text-slate-700", bold && "font-bold")}>{label}</span>
      <span className={cn("text-slate-900", bold ? "font-bold" : "font-semibold")}>
        {value}
      </span>
    </div>
  );
}
