import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { VoidWatermark } from "@/components/pos/void-watermark";
import { useSellerInfo } from "@/lib/auth";
import {
  formatInvoiceDate,
  formatInvoiceTime,
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

const DOC_TITLES_AM: Record<string, string> = {
  INV: "የተጨማሪ እሴት ታክስ ደረሰኝ",
  CRE: "የታክስ ክሬዲት ማስታወሻ",
  DEB: "የታክስ ዴቢት ማስታወሻ",
  PRF: "ፕሮፎርማ ደረሰኝ",
  OVD: "የተጎዳ ደረሰኝ",
  INT: "የመሸጋገሪያ ደረሰኝ",
  RTN: "የመመለሻ ደረሰኝ",
  MIX: "የተቀላቀለ ደረሰኝ",
  FIN: "የመጨረሻ ደረሰኝ",
};

const DOC_TITLES_EN: Record<string, string> = {
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

export interface TaxInvoiceDocumentV3Props {
  invoice: Invoice;
  id?: string;
  /** Original invoice IRN a CRE/DEB memo references. */
  relatedIrn?: string;
}

/**
 * Variant 3 — companion to CashReceiptDocumentV3. Same visual DNA (grey title
 * band, From/To parties, minimal-border line table, MoR footer) applied to
 * invoice data, so a merchant's invoice + receipt pair share one aesthetic.
 */
export function TaxInvoiceDocumentV3({
  invoice,
  id = "tax-invoice-print",
  relatedIrn,
}: TaxInvoiceDocumentV3Props) {
  const seller = useSellerInfo();
  const titleAm = DOC_TITLES_AM[invoice.documentType] ?? invoice.documentType;
  const titleEn = DOC_TITLES_EN[invoice.documentType] ?? invoice.documentType;
  const isWalkIn = isPlaceholderTin(invoice.buyer.tin);
  const date = formatInvoiceDate(invoice.documentDate || invoice.ackDate);
  const time = formatInvoiceTime(invoice.ackDate);
  const currency = invoice.currency || "ETB";
  const totalDiscount = invoice.items.reduce((s, l) => s + (l.discount || 0), 0);
  const totalExcise = round2(
    invoice.items.reduce((s, l) => s + lineExcise(l), 0),
  );
  const grossTotal = round2(
    invoice.items.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  );
  // Total taxable = Total Amount − Discount + Excise (the VAT base).
  const taxableTotal = round2(grossTotal - totalDiscount + totalExcise);
  const inWords = `${currency} ${amountInWords(invoice.totalValue, "birr").toUpperCase()} ONLY.`;

  return (
    <article
      id={id}
      className="relative mx-auto w-full max-w-[900px] bg-white text-[12px] leading-tight text-slate-900 shadow-sm print:max-w-none print:shadow-none"
    >
      {invoice.status === "CANCELLED" && <VoidWatermark />}

      {/* Header — logo · POS System / merchant name · document meta */}
      <header className="grid grid-cols-[110px_1fr_260px] items-center gap-4 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-center">
          <ZemenEPosLogo className="h-14 w-auto text-black" />
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="text-[13px] text-slate-600">POS System</span>
          <span className="text-2xl font-bold uppercase tracking-wide text-slate-900">
            {seller.legalName}
          </span>
        </div>
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12px]">
          <span className="text-slate-500">የደረሰኝ ቁጥር</span>
          <span />
          <span className="text-slate-600">Document No:</span>
          <span className="text-right text-lg font-bold text-blue-600 underline">
            {invoice.documentNumber}
          </span>
          <span className="text-slate-600">Date/ቀን:</span>
          <span className="text-right font-semibold tabular-nums">{date}</span>
          <span className="text-slate-600">ሰዓት/Time:</span>
          <span className="text-right font-semibold tabular-nums">{time}</span>
        </div>
      </header>

      {/* Title band */}
      <div className="bg-slate-100 px-6 py-3 text-center">
        <div className="text-[12px] text-slate-700">{titleAm}</div>
        <div className="text-lg font-bold text-slate-900">{titleEn}</div>
      </div>

      {/* IRN + System Number + QR */}
      <section className="grid grid-cols-[1fr_140px] items-start gap-4 px-6 py-4">
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          <div className="break-all">
            <span className="font-semibold">IRN:</span> <span>{invoice.irn}</span>
          </div>
          {relatedIrn && (
            <div className="break-all">
              <span className="font-semibold">Reference IRN:</span>{" "}
              <span>{relatedIrn}</span>
            </div>
          )}
          <div>
            <span className="font-semibold">System Number:</span>{" "}
            <span>{seller.systemNumber}</span>
          </div>
        </div>
        <div className="flex items-center justify-end">
          {invoice.signedQR ? (
            <img
              src={`data:image/png;base64,${invoice.signedQR}`}
              alt="Invoice QR"
              className="h-24 w-24 bg-white"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center border border-dashed border-slate-300 text-[10px] text-slate-400">
              No QR
            </div>
          )}
        </div>
      </section>

      {/* From / To parties */}
      <section className="grid grid-cols-2 gap-x-8 border-t border-slate-200 px-6 py-4">
        <PartyBlockV3
          fromLabel="ከ / From:"
          name={seller.legalName}
          city={seller.city}
          zone={seller.zone}
          wereda={seller.wereda}
          kebele={seller.kebele}
          phone={seller.phone}
          vatLabel="የሻጭ ተ.ኤ.ታ / Seller VAT Reg."
          vat={seller.vatNumber}
          tin={seller.tin}
          subTin={seller.subTin}
        />
        <PartyBlockV3
          fromLabel="ለ / To:"
          name={isWalkIn ? "Walk-in Customer" : invoice.buyer.legalName}
          city={invoice.buyer.city ?? ""}
          zone={invoice.buyer.zone ?? ""}
          wereda={invoice.buyer.wereda ?? ""}
          kebele={invoice.buyer.kebele ?? ""}
          phone={invoice.buyer.phone ?? ""}
          vatLabel="የገዢ ተ.ኤ.ታ / Buyer VAT Reg."
          vat={invoice.buyer.vatNumber ?? ""}
          tin={isWalkIn ? "" : invoice.buyer.tin}
          subTin=""
        />
      </section>

      {/* Line-item table */}
      <section className="px-6">
        <table className="w-full border border-slate-300 text-[11px]">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <ThV3Inv am="ተ/ቁ" en="No." width="w-10" />
              <ThV3Inv am="ዕቃ/አገልግሎት" en="Description" />
              <ThV3Inv am="መለኪያ" en="UoM" align="center" width="w-14" />
              <ThV3Inv am="ታክስ ኮድ" en="Tax Code" align="center" width="w-16" />
              <ThV3Inv am="ብዛት" en="Qty" align="right" width="w-14" />
              <ThV3Inv am="የአንዱ ዋጋ" en="Unit Price" align="right" width="w-20" />
              <ThV3Inv am="ቅናሽ" en="Disc." align="right" width="w-16" />
              <ThV3Inv am="ጠቅላላ" en="Total" align="right" width="w-24" />
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((line) => (
              <tr key={line.id} className="border-t border-slate-200">
                <td className="border-r border-slate-200 px-2 py-2 text-center tabular-nums">
                  {line.lineNumber}
                </td>
                <td className="border-r border-slate-200 px-2 py-2">
                  {line.description}
                  {nonTaxableSuffix(line.taxCode)}
                </td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">
                  {line.unit}
                </td>
                <td className="border-r border-slate-200 px-2 py-2 text-center">
                  {line.taxCode}
                </td>
                <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                  {line.quantity}
                </td>
                <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                  {fmtNumber(line.unitPrice)}
                </td>
                <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                  {fmtNumber(line.discount)}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {fmtNumber(line.unitPrice * line.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Summary + In Words */}
      <section className="mt-3 grid grid-cols-[1fr_280px] gap-3 px-6">
        <div className="rounded border border-slate-300 px-3 py-2 text-[11px]">
          <div className="text-slate-600">በፊደል / In Words</div>
          <div className="mt-0.5 font-semibold uppercase">{inWords}</div>
        </div>
        <div className="rounded border border-slate-300 text-[11px]">
          <SummaryRowV3
            label="ጠቅላላ የደረሰኝ መጠን / Total Amount"
            value={fmtNumber(grossTotal)}
          />
          {totalDiscount > 0 && (
            <SummaryRowV3
              label="ቅናሽ / Discount (−)"
              value={fmtNumber(totalDiscount)}
            />
          )}
          {totalExcise > 0 && (
            <SummaryRowV3
              label="ኤክሳይዝ ታክስ / Excise Tax (+)"
              value={fmtNumber(totalExcise)}
            />
          )}
          <SummaryRowV3
            label="ታክስ የሚከፈልበት ድምር / Total Taxable Amount"
            value={fmtNumber(taxableTotal)}
          />
          <SummaryRowV3
            label="ተ.ኤ.ታ / VAT"
            value={fmtNumber(invoice.taxValue)}
          />
          <SummaryRowV3
            label="ጠቅላላ / Total"
            value={fmtNumber(invoice.totalValue)}
            emphasise
          />
        </div>
      </section>

      {/* Mode of Payment (+ schedule when CREDIT) */}
      <section className="mt-2 px-6">
        <PaymentBox invoice={invoice} />
      </section>

      {/* Thank you */}
      <div className="mt-4 px-6 text-center text-sm font-semibold text-slate-800">
        Thank you for your business!
      </div>

      {/* MoR grey footer bar */}
      <section className="mt-2 bg-slate-200 px-6 py-3 text-center">
        <div className="text-base font-bold text-slate-900">MOR</div>
        <div className="text-[12px] font-semibold text-slate-800">
          Power By {(seller.tradeName || seller.legalName).toUpperCase()} SYSTEMS
        </div>
      </section>

      <div className="px-6 py-2 text-center text-[10px] text-slate-500">
        MOR — merchant copy.
      </div>
    </article>
  );
}

function ThV3Inv({
  am,
  en,
  align = "left",
  width,
}: {
  am?: string;
  en: string;
  align?: "left" | "right" | "center";
  width?: string;
}) {
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th
      className={`border-r border-slate-300 px-2 py-2 font-semibold ${alignCls} ${width ?? ""}`}
    >
      {am && (
        <div className="text-[9px] font-normal text-slate-500">{am} /</div>
      )}
      <div>{en}</div>
    </th>
  );
}

function PartyBlockV3({
  fromLabel,
  name,
  city,
  zone,
  wereda,
  kebele,
  phone,
  vatLabel,
  vat,
  tin,
  subTin,
}: {
  fromLabel: string;
  name: string;
  city: string;
  zone: string;
  wereda: string;
  kebele: string;
  phone: string;
  vatLabel: string;
  vat: string;
  tin: string;
  subTin: string;
}) {
  const v = (s: string | null | undefined) => (s && s.trim() ? s : "—");
  const address = [city, zone, wereda].filter((x) => x && x.trim()).join(", ");
  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-bold text-slate-800">{fromLabel}</span>
        <span className="text-base font-semibold">{name}</span>
      </div>
      <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[11px]">
        <span className="text-slate-600">አድራሻ / Address:</span>
        <span>{v(address)}</span>
        <span className="text-slate-600">ከተማ / City:</span>
        <span>{v(city)}</span>
        <span className="text-slate-600">ዞን / ክ/ከተማ / Zone / Sub City</span>
        <span>{v(zone)}</span>
        <span className="text-slate-600">ወረዳ / Woreda:</span>
        <span>{v(wereda)}</span>
        <span className="text-slate-600">ቀበሌ / Kebele:</span>
        <span>{v(kebele)}</span>
        <span className="text-slate-600">ስልክ / Phone:</span>
        <span>{v(phone)}</span>
        <span className="text-slate-600">{vatLabel}:</span>
        <span className="font-mono tabular-nums">{v(vat)}</span>
        <span className="text-slate-600">TIN:</span>
        <span className="font-mono tabular-nums">{v(tin)}</span>
        <span className="text-slate-600">Sub-TIN:</span>
        <span className="font-mono tabular-nums">{v(subTin)}</span>
      </div>
    </div>
  );
}

function SummaryRowV3({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-slate-200 px-3 py-1.5 last:border-b-0 ${
        emphasise ? "bg-slate-100 font-bold" : ""
      }`}
    >
      <span className={emphasise ? "" : "text-slate-700"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PaymentBox({ invoice }: { invoice: Invoice }) {
  const mode = (invoice.paymentMode || "CASH").toUpperCase();
  const caption = paymentModeCaption(mode);
  const isCredit = mode === "CREDIT";
  const schedule = isCredit ? formatPaymentTerm(invoice.paymentTerm) : null;
  const dueDate = isCredit
    ? formatPaymentDueDate(invoice.ackDate, invoice.paymentTerm)
    : null;
  return (
    <div className="rounded border border-slate-300 px-3 py-2 text-[11px]">
      <div className="text-slate-600">የክፍያ ሁኔታ / Mode of Payment</div>
      <div className="mt-0.5 text-sm font-bold uppercase">{mode}</div>
      {caption && (
        <div className="text-[11px] text-slate-700">{caption}</div>
      )}
      {isCredit && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-slate-200 pt-1.5">
          <div>
            <span className="text-[11px] text-slate-600">
              Payment schedule:{" "}
            </span>
            <span className="text-[12px] font-semibold">
              {schedule}
            </span>
          </div>
          {dueDate && (
            <div>
              <span className="text-[11px] text-slate-600">Due by: </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {dueDate}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
