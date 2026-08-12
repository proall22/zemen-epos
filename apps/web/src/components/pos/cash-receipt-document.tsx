import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { useSellerInfo } from "@/lib/auth";
import { sellerInfoFromDocument } from "@/lib/seller-info";
import {
  formatEthiopianDate,
  formatInvoiceDate,
  formatInvoiceTime12WithSeconds,
  formatInvoiceTime24,
} from "@/lib/invoice-date";
import { isPlaceholderTin } from "@/lib/invoice-types";
import { amountInWords } from "@/lib/number-to-words";
import type { Buyer, Receipt } from "@/lib/types";
import type { SellerInfo } from "@/lib/seller-info";

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export interface CashReceiptDocumentProps {
  receipt: Receipt;
  /** DOM id, useful if the host page wants to scope print rules. */
  id?: string;
}

/**
 * A4 receipt — shares invoice variant 1's frame (banner, title+QR, From/To,
 * signatures). SALES receipts show payment details (and a partial-coverage
 * block when relevant); WITHHOLDING receipts show the withholding details.
 */
export function CashReceiptDocument({
  receipt,
  id = "cash-receipt-print",
}: CashReceiptDocumentProps) {
  const contextSeller = useSellerInfo();
  const SELLER_INFO =
    receipt.branch || receipt.merchant
      ? sellerInfoFromDocument(receipt)
      : contextSeller;
  const isWithhold = receipt.kind === "WITHHOLD";
  if (isWithhold) {
    return <WithholdReceiptDocument receipt={receipt} id={id} seller={SELLER_INFO} />;
  }
  const date = formatInvoiceDate(receipt.receiptDate);
  const time = formatInvoiceTime24(receipt.receiptDate);
  const currency =
    !receipt.receiptCurrency || receipt.receiptCurrency === "ETB"
      ? "Br"
      : receipt.receiptCurrency;

  const buyer = receipt.invoices[0]?.invoice.buyer ?? null;
  const buyerName = buyer
    ? isPlaceholderTin(buyer.tin)
      ? "Walk-in Customer"
      : buyer.legalName
    : "—";

  const amount = isWithhold
    ? (receipt.withholdAmount ?? receipt.collectedAmount)
    : receipt.collectedAmount;
  const inWords = amountInWords(amount, "birr");
  const internalRef = receipt.manualReceiptNumber || receipt.receiptNumber;

  // Partial when any settled line is partial; sums span every covered invoice.
  const isPartial =
    !isWithhold && receipt.invoices.some((l) => l.paymentCoverage === "PARTIAL");
  const invoiceTotal = receipt.invoices.reduce(
    (s, l) => s + l.invoice.totalValue,
    0,
  );
  const remaining = receipt.invoices.reduce(
    (s, l) =>
      s +
      (l.remainingAmount ??
        Math.max(0, l.invoice.totalValue - l.invoicePaidAmount)),
    0,
  );
  const relatedIrns = receipt.invoices
    .map((l) => `${l.invoice.irn} (${l.invoice.documentNumber})`)
    .join(", ");

  const titleAm = isWithhold
    ? "ከተከፋይ ሒሳብ ላይ ለተቀነሰ ግብር የተሰጠ ደረሰኝ"
    : "የገንዘብ መቀበያ ቫውቸር";
  const titleEn = isWithhold ? "Withholding tax on payment" : "Cash Receipt Voucher";

  const rows: Array<{ label: string; value: string; highlight?: boolean }> =
    isWithhold
      ? [
          {
            label: "Description",
            value: receipt.reason?.trim() || "Withholding Reason",
          },
          { label: "Amount", value: `${fmtNumber(amount)} ${currency}` },
          { label: "Amount In Words", value: inWords },
          {
            label: "ቅድመ ታክስ መጠን / Pre Tax Amount",
            value: `${fmtNumber(receipt.withholdPreTax ?? 0)} ${currency}`,
          },
          {
            label: "ምንጭ ደረሰኝ ቁጥር / Source IRN (Doc Num)",
            value: receipt.externalInvoiceIrn || "—",
          },
        ]
      : [
          { label: "Description", value: receipt.reason?.trim() || "Receipt" },
          { label: "Amount", value: `${fmtNumber(amount)} ${currency}` },
          { label: "Amount In Words", value: inWords },
          { label: "Payment Method", value: receipt.modeOfPayment || "—" },
          {
            label: "ተዛማጅ ደረሰኝ ቁጥር / Related IRN (Doc Num)",
            value: relatedIrns || "—",
          },
        ];
  if (isPartial) {
    rows.push(
      { label: "ክፍያ ዓይነት / Coverage", value: "Partial (ከፊል ክፍያ)", highlight: true },
      { label: "የደረሰኝ ጠቅላላ / Invoice Total", value: `${fmtNumber(invoiceTotal)} ${currency}` },
      {
        label: "በዚህ ደረሰኝ የተከፈለ / Paid (this receipt)",
        value: `${fmtNumber(receipt.collectedAmount)} ${currency}`,
      },
      { label: "ቀሪ ድምር / Remaining", value: `${fmtNumber(remaining)} ${currency}` },
    );
  }

  return (
    <article
      id={id}
      className="mx-auto w-full max-w-[820px] bg-white text-[11px] leading-tight text-black shadow-sm print:max-w-none print:shadow-none"
    >
      {/* Banner: logo · seller · receipt meta */}
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
            label="የደረሰኝ ቁጥር/Doc. No"
            value={String(receipt.receiptCounter)}
          />
          <MetaRow label="ቀን/Date" value={date} />
          <MetaRow label="ሰዓት/Time" value={time} last />
        </div>
      </header>

      {/* Title + QR */}
      <section className="grid grid-cols-[1fr_160px] border-x border-b border-neutral-300">
        <div className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <div className="text-[13px] font-semibold">{titleAm}</div>
          <div className="text-sm">{titleEn}</div>
          {isPartial && (
            <div className="mt-1 inline-block rounded-sm border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Partial payment
            </div>
          )}
        </div>
        <div className="flex flex-col items-center justify-center gap-1 border-l border-neutral-300 p-2">
          {receipt.signedQR ? (
            <img
              src={`data:image/png;base64,${receipt.signedQR}`}
              alt="Receipt QR"
              className="h-32 w-32 bg-white"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center text-[10px] text-neutral-400">
              No QR
            </div>
          )}
          {receipt.eirmsStatus && (
            <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">
              {receipt.eirmsStatus}
            </div>
          )}
        </div>
      </section>

      {/* RRN + system + internal ref */}
      <section className="flex flex-col gap-2 border-x border-b border-neutral-300 px-4 py-3">
        <Labeled am="የደረሰኝ ማመሳከሪያ ቁጥር" en="RRN" value={receipt.rrn ?? "N/A"} mono />
        <Labeled
          am="የሲስተም ቁጥር"
          en="System Number"
          value={SELLER_INFO.systemNumber}
        />
        <Labeled am="የውስጥ ማመሳከሪያ" en="Internal Ref" value={internalRef} mono />
      </section>

      {/* From / To */}
      <section className="grid grid-cols-2 border-x border-b border-neutral-300">
        <ReceiptParty
          header={isWithhold ? "ከ / From (Withholder)" : "ከ / From"}
          role={isWithhold ? "Withholder" : "Seller"}
          name={SELLER_INFO.legalName}
          tin={SELLER_INFO.tin}
          subTin={SELLER_INFO.subTin}
          vatNumber={SELLER_INFO.vatNumber}
          phone={SELLER_INFO.phone}
          email={SELLER_INFO.email}
          city={SELLER_INFO.city}
          zone={SELLER_INFO.zone}
          wereda={SELLER_INFO.wereda}
          kebele={SELLER_INFO.kebele}
          houseNumber={SELLER_INFO.houseNumber}
          border
        />
        <ReceiptParty
          header={isWithhold ? "ለ / To (Supplier)" : "ለ / To"}
          role={isWithhold ? "Supplier" : "Buyer"}
          name={isWithhold ? "—" : buyerName}
          buyer={isWithhold ? null : buyer}
        />
      </section>

      {/* Details */}
      <section className="border-x border-b border-neutral-300">
        {rows.map((row) => (
          <div
            key={row.label}
            className={
              "grid grid-cols-[220px_1fr] border-b border-neutral-200 last:border-b-0 " +
              (row.highlight ? "bg-neutral-100 font-semibold" : "")
            }
          >
            <div className="border-r border-neutral-200 px-4 py-2 font-medium">
              {row.label}
            </div>
            <div className="break-words px-4 py-2 tabular-nums">{row.value}</div>
          </div>
        ))}
      </section>

      {/* Signatures */}
      <section className="grid grid-cols-3 border border-neutral-300">
        <SignatureCell
          am="ያዘጋጀው"
          en="Prepared by"
          value={receipt.collectorName ?? ""}
          border
        />
        <SignatureCell am="ያጸደቀው" en="Approved by" value="" border />
        <SignatureCell am="የተቀበለው" en="Received by" value="" />
      </section>

      <div className="mt-2 text-center text-[9px] text-neutral-500">
        Powered by Zemen-ePos e-Invoicing · {SELLER_INFO.email}
      </div>
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

function ReceiptParty({
  header,
  role,
  name,
  buyer,
  tin,
  subTin,
  vatNumber,
  phone,
  email,
  city,
  zone,
  wereda,
  kebele,
  houseNumber,
  border,
}: {
  header: string;
  role: string;
  name: string;
  /** When the party is the buyer, its fields come straight off the invoice. */
  buyer?: Buyer | null;
  tin?: string;
  subTin?: string;
  vatNumber?: string;
  phone?: string;
  email?: string;
  city?: string;
  zone?: string;
  wereda?: string;
  kebele?: string;
  houseNumber?: string;
  border?: boolean;
}) {
  const v = (s: string | null | undefined) => (s && s.trim() ? s : "N/A");
  const data = buyer
    ? {
        tin: buyer.tin,
        subTin: "",
        vatNumber: buyer.vatNumber,
        phone: buyer.phone,
        email: buyer.email,
        city: buyer.city,
        zone: buyer.zone,
        wereda: buyer.wereda,
        kebele: buyer.kebele,
        houseNumber: buyer.houseNumber,
      }
    : { tin, subTin, vatNumber, phone, email, city, zone, wereda, kebele, houseNumber };

  const address = `City: ${v(data.city)} | Zone: ${v(data.zone)} | Woreda: ${v(
    data.wereda,
  )} | Kebele: ${v(data.kebele)} | H.No: ${v(data.houseNumber)}`;

  return (
    <div className={"flex flex-col gap-2 p-3 " + (border ? "border-r border-neutral-300" : "")}>
      <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
        {header}: {name || "—"}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <PartyField am={`የ${role} የግብር ከፋይ ቁጥር`} en={`${role}'s TIN`} value={v(data.tin)} />
        <PartyField am="ንዑስ ቁ" en="Sub TIN" value={v(data.subTin)} />
        <PartyField am={`የ${role} ተ.እ.ታ ቁጥር`} en={`${role}'s VAT Reg.No`} value={v(data.vatNumber)} />
        <PartyField am="ተ.እ.ታ የተመዘገበበት ቀን" en="VAT Reg. Date" value="N/A" />
        <PartyField am="ስልክ" en="Phone" value={v(data.phone)} />
        <PartyField am="ኢሜይል" en="Email" value={v(data.email)} />
      </div>
      <div>
        <div className="text-[10px] text-neutral-600">አድራሻ/Address</div>
        <div>{address}</div>
      </div>
    </div>
  );
}

function PartyField({
  am,
  en,
  value,
}: {
  am: string;
  en: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-neutral-600">
        {am}/{en}
      </div>
      <div className="border-b border-neutral-300 pb-0.5">{value}</div>
    </div>
  );
}

function SignatureCell({
  am,
  en,
  value,
  border,
}: {
  am: string;
  en: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div className={"p-3 " + (border ? "border-r border-neutral-300" : "")}>
      <div className="bg-neutral-100 px-2 py-1 text-[11px] font-semibold">
        {am} / {en}
      </div>
      <div className="mt-3 min-h-[28px] border-b border-neutral-300 pb-3">
        {value}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Withhold receipt — matches the MoR-approved 2026 template. Distinct enough
 * from the sales receipt (per-line table, sale-type badge, Ethiopian date,
 * simplified party grid) that it lives as its own component rather than
 * threading `isWithhold` through every section of the sales layout.
 * ────────────────────────────────────────────────────────────────────── */
function WithholdReceiptDocument({
  receipt,
  id,
  seller,
}: {
  receipt: Receipt;
  id: string;
  seller: SellerInfo;
}) {
  const date = formatInvoiceDate(receipt.receiptDate);
  const ecDate = formatEthiopianDate(receipt.receiptDate);
  const time = formatInvoiceTime12WithSeconds(receipt.receiptDate);
  const currency = receipt.receiptCurrency || "ETB";
  const preTax = receipt.withholdPreTax ?? 0;
  const withheld = receipt.withholdAmount ?? receipt.collectedAmount;
  const inWords = amountInWords(withheld, "birr");
  const irn = receipt.externalInvoiceIrn ?? "—";
  const description = receipt.reason?.trim() || "Withhold receipts for goods purchased";
  const supplierName = receipt.supplierLegalName?.trim() || "—";

  return (
    <article
      id={id}
      className="mx-auto w-full max-w-[820px] bg-white text-[11px] leading-tight text-black shadow-sm print:max-w-none print:shadow-none"
    >
      {/* Banner: logo · seller · receipt meta */}
      <header className="grid grid-cols-[180px_1fr_260px] items-stretch border border-neutral-300">
        <div className="flex items-center justify-center border-r border-neutral-300 p-4">
          <ZemenEPosLogo className="h-10 w-auto text-black" />
        </div>
        <div className="flex flex-col justify-center border-r border-neutral-300 p-4">
          <div className="text-base font-semibold">{seller.legalName}</div>
          <div className="text-[11px] text-neutral-700">{seller.city}</div>
        </div>
        <div className="flex flex-col justify-center gap-1 px-4 py-3 text-[11px]">
          <div>
            <span className="text-neutral-600">የደረሰኝ ቁጥር / Receipt No: </span>
            <span className="font-medium">{receipt.receiptCounter}</span>
          </div>
          <div>
            <span className="text-neutral-600">Date: </span>
            <span className="font-medium tabular-nums">{date}</span>
          </div>
          <div>
            <span className="text-neutral-600">ቀን: </span>
            <span className="font-medium tabular-nums">{ecDate}</span>
          </div>
          <div>
            <span className="text-neutral-600">Time / ሰዓት: </span>
            <span className="font-medium tabular-nums">{time}</span>
          </div>
        </div>
      </header>

      {/* Title + sale-type badge + QR */}
      <section className="grid grid-cols-[1fr_160px] border-x border-b border-neutral-300">
        <div className="flex flex-col items-start justify-center gap-2 p-4">
          <div className="text-[13px] font-semibold">
            ከትከፋይ ሒሳብ ላይ ለተቀነሰ ግብር የተሰጠ ደረሰኝ{" "}
            <span className="font-normal">(Withholding tax on payment)</span>
          </div>
          <div className="mx-auto text-[12px] font-semibold">
            የሽያጭ አይነት ( B2B )
          </div>
          <div className="w-full break-all text-[11px]">
            <span className="font-semibold">RRN:</span> {receipt.rrn ?? "N/A"}
          </div>
          <div className="w-full text-[11px]">
            <span className="font-semibold">System Number:</span>{" "}
            {seller.systemNumber}
          </div>
        </div>
        <div className="flex items-center justify-center border-l border-neutral-300 p-2">
          {receipt.signedQR ? (
            <img
              src={`data:image/png;base64,${receipt.signedQR}`}
              alt="Receipt QR"
              className="h-32 w-32 bg-white"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center text-[10px] text-neutral-400">
              No QR
            </div>
          )}
        </div>
      </section>

      {/* From / To header row */}
      <section className="grid grid-cols-2 border-x border-b border-neutral-300">
        <div className="border-r border-neutral-300 bg-neutral-100 px-3 py-2 text-[11px]">
          <span className="font-semibold">ከ / From:</span>{" "}
          <span>{seller.legalName}</span>
        </div>
        <div className="bg-neutral-100 px-3 py-2 text-[11px]">
          <span className="font-semibold">ለ / To:</span>{" "}
          <span>{supplierName}</span>
        </div>
      </section>

      {/* Address grid — seller | supplier */}
      <section className="grid grid-cols-2 border-x border-b border-neutral-300">
        <WithholdParty
          heading="አድራሻ / Address"
          city={seller.city}
          zone={seller.zone}
          wereda={seller.wereda}
          kebele={seller.kebele}
          phone={seller.phone}
          phoneLabel="የሻጭ ስልክ ቁጥር / Seller's Phone Number"
          vatNumber={seller.vatNumber}
          vatLabel="የሻጭ ተ.ኤ.ታ ቁጥር / Seller's VAT Reg.No"
          tin={seller.tin}
          subTin={seller.subTin || "N/A"}
          border
        />
        <WithholdParty
          heading="BUYER ADDRESS / የገዢ አድራሻ"
          city={receipt.supplierCity || "N/A"}
          zone={receipt.supplierZone || "N/A"}
          wereda={receipt.supplierWereda || "N/A"}
          kebele={receipt.supplierKebele || "N/A"}
          phone={receipt.supplierPhone || "N/A"}
          phoneLabel="የገዢ ስልክ ቁጥር / Buyer's Phone Number"
          vatNumber={receipt.supplierVatNumber || "N/A"}
          vatLabel="የገዢ ተ.ኤ.ታ ቁጥር / Buyer's VAT Reg.No"
          tin={receipt.supplierTin || "N/A"}
          subTin={receipt.supplierSubTin || "N/A"}
        />
      </section>

      {/* Payment description */}
      <section className="border-x border-b border-neutral-300 px-4 py-3">
        <div className="text-[10px] font-semibold text-neutral-700">
          የክፍያ ምክንያት / Payment Description:
        </div>
        <div className="mt-0.5 text-[11px]">{description}</div>
      </section>

      {/* Line-item table */}
      <section className="border-x border-b border-neutral-300">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-100 text-neutral-700">
              <th className="w-16 border-r border-neutral-300 px-3 py-2 text-center font-semibold">
                <div className="text-[10px] font-normal">ተ.ቁ</div>
                <div>No.</div>
              </th>
              <th className="border-r border-neutral-300 px-3 py-2 text-left font-semibold">
                <div className="text-[10px] font-normal">የደረሰኝ ቁጥር</div>
                <div>IRN</div>
              </th>
              <th className="w-40 border-r border-neutral-300 px-3 py-2 text-right font-semibold">
                <div className="text-[10px] font-normal">የቅድመ ታክስ መጠን</div>
                <div>Pre tax Amount</div>
              </th>
              <th className="w-40 px-3 py-2 text-right font-semibold">
                <div className="text-[10px] font-normal">የተያዘ</div>
                <div>Withhold</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-200">
              <td className="border-r border-neutral-200 px-3 py-3 text-center align-top tabular-nums">
                1
              </td>
              <td className="break-all border-r border-neutral-200 px-3 py-3 align-top font-mono text-[10px]">
                {irn}
              </td>
              <td className="border-r border-neutral-200 px-3 py-3 text-right align-top tabular-nums">
                {fmtNumber(preTax)}
              </td>
              <td className="px-3 py-3 text-right align-top tabular-nums">
                {fmtNumber(withheld)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Totals — right-aligned, spanning the two amount columns */}
        <div className="grid grid-cols-[1fr_240px] border-t border-neutral-300 text-[11px]">
          <div className="border-r border-neutral-300" />
          <div>
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
              <span className="font-semibold">ድምር / Total {currency}</span>
              <span className="tabular-nums">{fmtNumber(preTax)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-semibold">ጠቅላላ የተያዘ / Total Withheld</span>
              <span className="tabular-nums">{fmtNumber(withheld)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Amount in words */}
      <section className="border-x border-b border-neutral-300 px-4 py-3">
        <div className="text-[10px] font-semibold text-neutral-700">
          ጠቅላላ የተያዘ ግብር (በፊደል) / Total Withholding Tax (in words)
        </div>
        <div className="mt-0.5 text-[11px] uppercase">{inWords}</div>
      </section>

      {/* Signatures — Prepared by (withholder) / Received by supplier.
       *  Business names seed the value line so the printed copy is signed by
       *  the party representing the org, not left blank for someone to fill.
       */}
      <section className="grid grid-cols-2 border border-neutral-300">
        <SignatureCell
          am="ያዘጋጀው ስምና ፈርማ"
          en="Prepared by"
          value={seller.legalName}
          border
        />
        <SignatureCell
          am="የተቀባይ (ሻጭ) ስምና ፈርማ"
          en="Received by (Seller)"
          value={receipt.supplierLegalName ?? ""}
        />
      </section>

      <div className="mt-2 text-center text-[9px] text-neutral-500">
        Powered by Zemen-ePos e-Invoicing · {seller.email}
      </div>
    </article>
  );
}

function WithholdParty({
  heading,
  city,
  zone,
  wereda,
  kebele,
  phone,
  phoneLabel,
  vatNumber,
  vatLabel,
  tin,
  subTin,
  border,
}: {
  heading: string;
  city: string;
  zone: string;
  wereda: string;
  kebele: string;
  phone: string;
  phoneLabel: string;
  vatNumber: string;
  vatLabel: string;
  tin: string;
  subTin: string;
  border?: boolean;
}) {
  return (
    <div
      className={"flex flex-col gap-2 p-3 " + (border ? "border-r border-neutral-300" : "")}
    >
      <div className="text-[11px] font-semibold">{heading}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <PartyCell am="ከተማ / City/Town" value={city} />
        <PartyCell am="ዞን / ክ/ከተማ Zone/Sub city" value={zone} />
        <PartyCell am="ወረዳ / Woreda" value={wereda} />
        <PartyCell am="ቀበሌ Kebele" value={kebele} />
        <PartyCell am={phoneLabel} value={phone} full />
        <PartyCell am={vatLabel} value={vatNumber} full />
        <PartyCell am="TIN" value={tin} />
        <PartyCell am="Sub-Tin" value={subTin} />
      </div>
    </div>
  );
}

function PartyCell({
  am,
  value,
  full,
}: {
  am: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[9px] text-neutral-600">{am}</div>
      <div className="border-b border-neutral-300 pb-0.5 text-[11px]">{value}</div>
    </div>
  );
}
