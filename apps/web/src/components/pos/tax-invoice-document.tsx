import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { VoidWatermark } from "@/components/pos/void-watermark";
import { useSellerInfo } from "@/lib/auth";
import { sellerInfoFromDocument } from "@/lib/seller-info";
import {
  formatInvoiceDate,
  formatInvoiceTime12WithSeconds,
  formatPaymentDueDate,
  formatPaymentTerm,
  paymentModeCaption,
} from "@/lib/invoice-date";
import {
  isPlaceholderTin,
  lineExcise,
  nonTaxableSuffix,
  vatRateForLine,
} from "@/lib/invoice-types";
import { amountInWords } from "@/lib/number-to-words";
import type { Invoice, Receipt } from "@/lib/types";
import { computeWithholding, type WithholdTxType } from "@/lib/withholding";

interface DocTitle {
  en: string;
  am: string;
}

const DOC_TITLES: Record<string, DocTitle> = {
  INV: {
    en: "Cash Sales VAT/EXCISE TAX Invoice",
    am: "እጅ በእጅ የሽያጭ ደረሰኝ-ተእታ/ኤክሳይዝ ታክስ ኢንቮይስ",
  },
  CRE: { en: "Tax Credit Note", am: "የታክስ ክሬዲት ማስታወሻ" },
  DEB: { en: "Tax Debit Note", am: "የታክስ ዴቢት ማስታወሻ" },
  PRF: { en: "Pro-forma Invoice", am: "የቅድመ ሽያጭ ኢንቮይስ" },
  OVD: { en: "Overdue Invoice", am: "ዘገየ ኢንቮይስ" },
  INT: { en: "Interim Invoice", am: "ጊዜያዊ ኢንቮይስ" },
  RTN: { en: "Return Invoice", am: "የመመለስ ኢንቮይስ" },
  MIX: { en: "Mixed Invoice", am: "የተደባለቀ ኢንቮይስ" },
  FIN: { en: "Final Invoice", am: "የመጨረሻ ኢንቮይስ" },
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

/** Birr prints as the "Br" symbol; any other currency prints its code. */
function currencySymbol(currency: string): string {
  return currency?.trim().toUpperCase() === "ETB" ? "Br" : currency;
}

/** Money as it appears on the document — always two decimals, always carrying
 *  the currency notation, including when the amount is zero. Rows that don't
 *  apply to an invoice print `0.00 Br` rather than going blank, so the document
 *  occupies the same space and reads the same way every time. */
function money(n: number, currency: string): string {
  return `${fmtNumber(n)} ${currencySymbol(currency)}`;
}

export interface TaxInvoiceDocumentProps {
  invoice: Invoice;
  /** Optional receipt — when present, the doc shows mode of payment from the receipt. */
  receipt?: Receipt;
  /** DOM id, useful if the host page wants to scope print rules. */
  id?: string;
  /** Optional related-document IRN (CRE/DEB notes reference the original invoice). */
  relatedIrn?: string;
}

export function TaxInvoiceDocument({
  invoice,
  receipt,
  id = "tax-invoice-print",
  relatedIrn,
}: TaxInvoiceDocumentProps) {
  // The document's own issuing branch wins over the active one, so a reprint
  // from another branch still shows the issuer. Falls back to the auth context
  // only for documents registered before we stored this.
  const contextSeller = useSellerInfo();
  const SELLER_INFO =
    invoice.branch || invoice.merchant
      ? sellerInfoFromDocument(invoice)
      : contextSeller;
  const title = DOC_TITLES[invoice.documentType] ?? {
    en: invoice.documentType,
    am: "",
  };
  const isWalkIn = isPlaceholderTin(invoice.buyer.tin);
  const txType = invoice.transactionType || (isWalkIn ? "B2C" : "B2B");
  const date = formatInvoiceDate(invoice.documentDate || invoice.ackDate);
  // ackDate is EIRMS' acknowledgement timestamp, stored verbatim from the
  // register response.
  const time = formatInvoiceTime12WithSeconds(invoice.ackDate);

  // Excise is derived per line from the persisted tax fields (see lineExcise).
  const totalExcise = round2(
    invoice.items.reduce((s, l) => s + lineExcise(l), 0),
  );
  const totalDiscount = invoice.items.reduce(
    (s, l) => s + (l.discount || 0),
    0,
  );
  // Gross line total (before discount) — matches the "Total Amount" column.
  const grossTotal = round2(
    invoice.items.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  );
  // The VAT base covers only VAT-rated lines — VAT0/VATEX lines are reported
  // separately as Non Taxable Total. Per line the base is the discounted net
  // plus excise, matching what the register sends to MoR.
  const taxableTotal = round2(
    invoice.items
      .filter((l) => vatRateForLine(l) > 0)
      .reduce((s, l) => s + l.preTaxValue + lineExcise(l), 0),
  );
  const nonTaxableTotal = round2(
    invoice.items
      .filter((l) => vatRateForLine(l) === 0)
      .reduce((s, l) => s + l.preTaxValue, 0),
  );
  // MoR folds excise into `taxValue`; the VAT row and the B2G withholding
  // basis need VAT on its own, so strip the excise back out.
  const vatValue = round2(
    invoice.items.reduce((s, l) => s + (l.taxAmount - lineExcise(l)), 0),
  );
  const inWords = amountInWords(invoice.totalValue, "birr");

  // Withholding is display-only: NOT deducted from the total and NOT sent to
  // EIRMS. Both components print on their own fixed row (0.00 when they don't
  // apply) and can co-occur on a B2G invoice.
  const legacyWithholding = computeWithholding(
    taxableTotal,
    vatValue,
    txType as WithholdTxType,
  );
  const withholding = {
    ...legacyWithholding,
    income:
      invoice.withholdingRate != null
        ? invoice.withholdValue
        : legacyWithholding.income,
  };

  const paymentMode = receipt?.modeOfPayment || invoice.paymentMode || "CASH";

  return (
    <article
      id={id}
      className="relative mx-auto w-full max-w-[820px] bg-white text-[11px] leading-tight text-black shadow-sm print:max-w-none print:shadow-none"
    >
      {invoice.status === "CANCELLED" && <VoidWatermark />}
      {/* Top banner: logo · company · invoice meta */}
      <header className="grid grid-cols-[180px_1fr_220px] items-stretch border border-neutral-300">
        <div className="flex items-center justify-center border-r border-neutral-300 p-4">
          <ZemenEPosLogo className="h-10 w-auto text-black" />
        </div>
        <div className="flex flex-col items-center justify-center border-r border-neutral-300 p-3 text-center">
          <div className="text-base font-semibold">{SELLER_INFO.legalName}</div>
          {SELLER_INFO.tradeName && (
            <div className="font-semibold">{SELLER_INFO.tradeName}</div>
          )}
          <div className="text-neutral-700">{SELLER_INFO.city}</div>
        </div>
        <div className="flex flex-col text-[11px]">
          <MetaRow
            label="የደረሰኝ ቁጥር/Invoice No"
            value={invoice.documentNumber}
          />
          <MetaRow label="ቀን/Date" value={date} />
          <MetaRow label="ሰዓት/Time" value={time} last />
        </div>
      </header>

      {/* Title + sale type + QR */}
      <section className="grid grid-cols-[1fr_160px] border-x border-b border-neutral-300">
        <div className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          {title.am && (
            <div className="text-[13px] font-semibold">{title.am}</div>
          )}
          <div className="text-sm">{title.en}</div>
          <div className="text-xs text-neutral-600">የሽያጭ አይነት ({txType})</div>
          {invoice.status === "CANCELLED" && (
            <div className="mt-1 inline-block rounded-sm border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
              Cancelled
            </div>
          )}
        </div>
        <div className="flex items-center justify-center border-l border-neutral-300 p-2">
          {invoice.signedQR ? (
            <img
              src={`data:image/png;base64,${invoice.signedQR}`}
              alt="Invoice QR"
              className="h-32 w-32 bg-white"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center text-[10px] text-neutral-400">
              No QR
            </div>
          )}
        </div>
      </section>

      {/* IRN + (optional related IRN) + system number */}
      <section className="flex flex-col gap-2 border-x border-b border-neutral-300 px-4 py-3">
        <Labeled am="የደረሰኝ ምዝገባ ቁጥር" en="IRN" value={invoice.irn} mono />
        {relatedIrn && (
          <Labeled
            am="የተዛማጅ ደረሰኝ ምዝገባ ቁጥር"
            en="Related Document IRN"
            value={relatedIrn}
            mono
          />
        )}
        <Labeled
          am="የሲስተም ቁጥር"
          en="System Number"
          value={SELLER_INFO.systemNumber}
        />
      </section>

      {/* From / To */}
      <section className="grid grid-cols-2 border-x border-b border-neutral-300">
        <PartyBlock
          fromOrTo="from"
          name={SELLER_INFO.legalName}
          city={SELLER_INFO.region || SELLER_INFO.city}
          zone={SELLER_INFO.zone}
          wereda={SELLER_INFO.wereda}
          kebele={SELLER_INFO.kebele}
          houseNumber={SELLER_INFO.houseNumber}
          phone={SELLER_INFO.phone}
          vatNumber={SELLER_INFO.vatNumber}
          tin={SELLER_INFO.tin}
          subTin={SELLER_INFO.subTin}
          side="seller"
        />
        <PartyBlock
          fromOrTo="to"
          name={isWalkIn ? "Walk-in Customer" : invoice.buyer.legalName}
          city={invoice.buyer.city || invoice.buyer.region || ""}
          zone={invoice.buyer.zone || ""}
          wereda={invoice.buyer.wereda || ""}
          kebele={invoice.buyer.kebele || ""}
          houseNumber={invoice.buyer.houseNumber || ""}
          phone={invoice.buyer.phone || ""}
          vatNumber={invoice.buyer.vatNumber || ""}
          tin={isWalkIn ? "" : invoice.buyer.tin}
          subTin=""
          side="buyer"
        />
      </section>

      {/* Payment description */}
      <section className="border-x border-b border-neutral-300 px-4 py-2">
        <div className="text-[10px] text-neutral-600">የክፍያ ምክንያት</div>
        <div className="font-medium">
          Payment Description:{" "}
          <span className="font-normal">Sales Invoice</span>
        </div>
      </section>

      {/* Items table */}
      <section className="border-x border-b border-neutral-300">
        <table className="w-full border-collapse text-[10.5px]">
          <thead className="bg-neutral-50">
            <tr className="text-left">
              <Th width="36px">
                <div>ተ.ቁ</div>
                <div>No.</div>
              </Th>
              <Th>
                <div>መግለጫ</div>
                <div>Product / Service Description</div>
              </Th>
              <Th width="60px">
                <div>ምድብ</div>
                <div>Nature of Supply</div>
              </Th>
              <Th width="50px" right>
                <div>ብዛት</div>
                <div>Quantity</div>
              </Th>
              <Th width="60px">
                <div>መለኪያ</div>
                <div>UoM</div>
              </Th>
              <Th width="90px" right>
                <div>ዋጋ</div>
                <div>Unit Price</div>
              </Th>
              <Th width="90px" right>
                <div>ቅናሽ</div>
                <div>Discount</div>
              </Th>
              <Th width="90px" right>
                <div>ኤክሳይዝ</div>
                <div>Excise</div>
              </Th>
              <Th width="70px">
                <div>ኮድ</div>
                <div>Tax Code</div>
              </Th>
              <Th width="100px" right>
                <div>ጠቅላላ ዋጋ</div>
                <div>Total Amount</div>
              </Th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((line) => (
              <tr
                key={line.id}
                className="border-t border-neutral-200 align-top"
              >
                <Td>{line.lineNumber}</Td>
                <Td>
                  {line.description}
                  {nonTaxableSuffix(line.taxCode)}
                </Td>
                <Td>{invoice.natureOfSupplies || "goods"}</Td>
                <Td right>{line.quantity}</Td>
                <Td>{line.unit}</Td>
                <Td right>{money(line.unitPrice, invoice.currency)}</Td>
                <Td right>{money(line.discount, invoice.currency)}</Td>
                <Td right>{money(lineExcise(line), invoice.currency)}</Td>
                <Td>{line.taxCode}</Td>
                <Td right>
                  {money(line.unitPrice * line.quantity, invoice.currency)}
                </Td>
              </tr>
            ))}
            {/* Totals block (right-aligned over last 4 cols) */}
            <TotalsRows
              totalAmount={grossTotal}
              excise={totalExcise}
              discount={totalDiscount}
              taxableTotal={taxableTotal}
              vatValue={vatValue}
              nonTaxableTotal={nonTaxableTotal}
              incomeWithheld={withholding.income}
              vatWithheld={withholding.vat}
              grandTotal={invoice.totalValue}
              currency={invoice.currency}
            />
          </tbody>
        </table>
      </section>

      {/* In Words */}
      <section className="border-x border-b border-neutral-300 px-4 py-3">
        <div className="text-[10px] text-neutral-600">ጠቅላላ ዋጋ በፊደል ብር</div>
        <div>
          <span className="font-medium">In Words Birr:</span> {inWords}
        </div>
      </section>

      {/* Mode of payment (+ schedule when CREDIT) */}
      <section className="border-x border-b border-neutral-300 px-4 py-3">
        <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
          የክፍያ ሁኔታ / Mode of Payment
        </div>
        <div className="mt-2 text-[10px] text-neutral-600">አይነት</div>
        <div>
          <span className="font-medium">Type/Method:</span> {paymentMode}
          {paymentModeCaption(paymentMode) && (
            <span className="ml-2 text-[10px] text-neutral-500">
              ({paymentModeCaption(paymentMode)})
            </span>
          )}
        </div>
        {paymentMode.toUpperCase() === "CREDIT" && (
          <div className="mt-1.5 border-t border-neutral-200 pt-1.5 text-[11px]">
            <div>
              <span className="text-neutral-600">Payment schedule: </span>
              <span className="font-semibold">
                {formatPaymentTerm(invoice.paymentTerm)}
              </span>
            </div>
            {formatPaymentDueDate(invoice.ackDate, invoice.paymentTerm) && (
              <div>
                <span className="text-neutral-600">Due by: </span>
                <span className="font-semibold tabular-nums">
                  {formatPaymentDueDate(invoice.ackDate, invoice.paymentTerm)}
                </span>
              </div>
            )}
          </div>
        )}
        {receipt?.receiptNumber && (
          <div className="mt-1 text-[10px] text-neutral-600">
            Receipt #:{" "}
            <span className="font-mono">{receipt.receiptNumber}</span>
            {receipt.rrn && (
              <>
                {" "}
                · RRN: <span className="font-mono">{receipt.rrn}</span>
              </>
            )}
          </div>
        )}
      </section>

      {/* Signatures */}
      <section className="grid grid-cols-2 border border-neutral-300">
        <div className="border-r border-neutral-300 p-3">
          <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
            የሻጭ መረጃ / Seller Information
          </div>
          <div className="mt-2 text-[10px] text-neutral-600">የሻጩ ስም እና ፊርማ</div>
          <div className="min-h-[28px] border-b border-neutral-300 pt-3">
            {SELLER_INFO.tradeName || SELLER_INFO.legalName}
          </div>
        </div>
        <div className="p-3">
          <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
            የገዥ መረጃ / Purchaser Information
          </div>
          <div className="mt-2 text-[10px] text-neutral-600">
            የገዥው ስም እና ፊርማ
          </div>
          <div className="min-h-[28px] border-b border-neutral-300 pt-3" />
        </div>
      </section>
    </article>
  );
}

/* ---------- helpers ---------- */

function MetaRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2 px-3 py-2 " +
        (last ? "" : "border-b border-neutral-300")
      }
    >
      <span className="text-neutral-700">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Labeled({
  am,
  en,
  value,
  mono,
}: {
  am: string;
  en: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-neutral-600">{am}</div>
      <div className={mono ? "break-all font-mono text-[11px]" : ""}>
        <span className="font-medium">{en}:</span> {value}
      </div>
    </div>
  );
}

function PartyBlock({
  fromOrTo,
  name,
  city,
  zone,
  wereda,
  kebele,
  houseNumber,
  phone,
  vatNumber,
  tin,
  subTin,
  side,
}: {
  fromOrTo: "from" | "to";
  name: string;
  city: string;
  zone: string;
  wereda: string;
  kebele: string;
  houseNumber: string;
  phone: string;
  vatNumber: string;
  tin: string;
  subTin: string;
  side: "seller" | "buyer";
}) {
  const role = side === "seller" ? "Seller" : "Customer";
  const roleAm = side === "seller" ? "ሻጭ" : "ገዥ";
  return (
    <div
      className={
        "flex flex-col gap-2 p-3 " +
        (fromOrTo === "from" ? "border-r border-neutral-300" : "")
      }
    >
      <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
        {fromOrTo === "from" ? "ከ / From" : "ለ / To"}
      </div>
      <div className="font-medium">{name || "—"}</div>

      <div className="text-[10px] text-neutral-600">አድራሻ/Address</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        <AddrField am="ከተማ / City" value={city} />
        <AddrField am="ዞን / ክ/ከተማ / Zone/Sub city" value={zone} />
        <span />
        <AddrField am="ወረዳ / Woreda" value={wereda} />
        <AddrField am="ቀበሌ / Kebele" value={kebele} />
        <AddrField am="ቤት ቁ. / H.No" value={houseNumber} />
      </div>

      <Line
        label={`${role}'s Phone No`}
        labelAm={`የ${roleAm} ስልክ ቁጥር`}
        value={phone}
      />
      <Line
        label={`${role}'s VAT Reg.No`}
        labelAm={`የ${roleAm} ተ.እ.ታ ቁጥር`}
        value={vatNumber}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Line
          label={side === "seller" ? "Seller' TIN" : "Customer' TIN"}
          labelAm={`የ${roleAm} የግብር ከፋይ መለያ ቁጥር`}
          value={tin}
          inline
        />
        {subTin ? (
          <Line
            label={side === "seller" ? "Seller' Sub TIN" : "Customer's Sub TIN"}
            labelAm={`የ${roleAm} የግብር ከፋይ ንዑስ መለያ ቁጥር`}
            value={subTin}
            inline
          />
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function AddrField({ am, value }: { am: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-neutral-600">{am}</div>
      <div className="border-b border-neutral-300 pb-0.5">{value || "—"}</div>
    </div>
  );
}

function Line({
  label,
  labelAm,
  value,
  inline,
}: {
  label: string;
  labelAm: string;
  value: string;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "" : "mt-1"}>
      <div className="text-[10px] text-neutral-600">{labelAm}</div>
      <div className="border-b border-neutral-300 pb-0.5">
        <span className="font-medium">{label}:</span> {value || "—"}
      </div>
    </div>
  );
}

function Th({
  children,
  width,
  right,
}: {
  children: React.ReactNode;
  width?: string;
  right?: boolean;
}) {
  return (
    <th
      className={
        "border-r border-neutral-200 px-2 py-1.5 text-[10px] font-semibold leading-tight last:border-r-0 " +
        (right ? "text-right" : "text-left")
      }
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
}: {
  children?: React.ReactNode;
  right?: boolean;
}) {
  return (
    <td
      className={
        "border-r border-neutral-200 px-2 py-1.5 last:border-r-0 tabular-nums " +
        (right ? "text-right" : "")
      }
    >
      {children}
    </td>
  );
}

function TotalsRows({
  totalAmount,
  excise,
  discount,
  taxableTotal,
  vatValue,
  nonTaxableTotal,
  incomeWithheld,
  vatWithheld,
  grandTotal,
  currency,
}: {
  totalAmount: number;
  excise: number;
  discount: number;
  taxableTotal: number;
  vatValue: number;
  nonTaxableTotal: number;
  incomeWithheld: number;
  vatWithheld: number;
  grandTotal: number;
  currency: string;
}) {
  // A fixed layout: every row is always printed, and an amount that doesn't
  // apply to this invoice prints 0.00 rather than going blank. Labels never
  // change with the transaction type — a C2B sale still shows the 3% withheld
  // row at 0.00 — so the document occupies the same space and reads the same
  // way every time.
  //
  // Ordered so the VAT computation reads top-down: gross, plus excise, less
  // discount, giving the VAT-rated base (Taxable Total) and the VAT on it.
  // VAT0/VATEX lines land in Non Taxable Total instead.
  const rows: Array<{ label: string; value: number; bold?: boolean }> = [
    {
      label: `ድምር (${currency}) / Total (${currency})`,
      value: totalAmount,
    },
    { label: "ኤክሳይዝ ታክስ / Excise Tax", value: excise },
    { label: "የቅናሽ መጠን / Discount Amount", value: discount },
    {
      label: "ተ.እ.ታክስ የሚከፈልበት ድምር / Taxable Total",
      value: taxableTotal,
      bold: true,
    },
    { label: "ተ.እ.ታ / VAT 15%", value: vatValue },
    {
      label: "ተ.እ.ታ / VAT0, VATEX / የማይከፈልበት ድምር / Non Taxable Total",
      value: nonTaxableTotal,
    },
    {
      label: "ጠቅላላ የተያዘ መጠን / Total Withheld Amount 3%",
      value: incomeWithheld,
    },
    {
      label: "ጠቅላላ የተያዘ መጠን ተ.እ.ታ / Total VAT Withheld Amount 50%",
      value: vatWithheld,
    },
    {
      label: "ግብር ጨምሮ ጠቅላላ ድምር / Total Price including Tax",
      value: grandTotal,
      bold: true,
    },
  ];

  return (
    <>
      {rows.map((row, idx) => (
        <tr key={idx} className="border-t border-neutral-200">
          <td colSpan={6} className="px-2 py-1.5" />
          <td
            colSpan={3}
            className={
              "border-r border-l border-neutral-200 px-2 py-1.5 text-right " +
              (row.bold ? "font-semibold" : "")
            }
          >
            {row.label}
          </td>
          <td
            className={
              "px-2 py-1.5 text-right tabular-nums " +
              (row.bold ? "font-semibold" : "")
            }
          >
            {money(row.value, currency)}
          </td>
        </tr>
      ))}
    </>
  );
}
