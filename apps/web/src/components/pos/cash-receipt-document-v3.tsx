import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { useSellerInfo } from "@/lib/auth";
import { formatInvoiceDate, formatInvoiceTime } from "@/lib/invoice-date";
import { isPlaceholderTin } from "@/lib/invoice-types";
import { amountInWords } from "@/lib/number-to-words";
import type { Receipt } from "@/lib/types";

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export interface CashReceiptDocumentV3Props {
  receipt: Receipt;
  id?: string;
}

/**
 * Variant 3 — the "Cash Receipt Voucher" MoR template. Compact clean frame:
 * logo · POS System · big receipt counter · title bar · From/To grid · line
 * table · in-words · Mode of Payment + Collector · thank-you · MoR footer.
 * Sales receipts only — withholding keeps its dedicated layout.
 */
export function CashReceiptDocumentV3({
  receipt,
  id = "cash-receipt-print",
}: CashReceiptDocumentV3Props) {
  const seller = useSellerInfo();
  const date = formatInvoiceDate(receipt.receiptDate);
  const time = formatInvoiceTime(receipt.receiptDate);
  const currency = receipt.receiptCurrency || "ETB";

  const buyer = receipt.invoices[0]?.invoice.buyer ?? null;
  const isWalkIn = buyer ? isPlaceholderTin(buyer.tin) : true;
  const buyerName = buyer && !isWalkIn ? buyer.legalName : "Walk-in Customer";

  const collected = receipt.collectedAmount;
  const inWords = `${currency} ${amountInWords(collected, "birr").toUpperCase()} ONLY.`;

  return (
    <article
      id={id}
      className="mx-auto w-full max-w-[900px] bg-white text-[12px] leading-tight text-slate-900 shadow-sm print:max-w-none print:shadow-none"
    >
      {/* Header — logo · POS System / merchant name · receipt meta */}
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
          <span className="text-slate-600">Receipt Counter:</span>
          <span className="text-right text-lg font-bold text-blue-600 underline">
            {receipt.receiptCounter}
          </span>
          <span className="text-slate-600">Date/ቀን:</span>
          <span className="text-right font-semibold tabular-nums">{date}</span>
          <span className="text-slate-600">ሰዓት/Time:</span>
          <span className="text-right font-semibold tabular-nums">{time}</span>
        </div>
      </header>

      {/* Title band */}
      <div className="bg-slate-100 px-6 py-3 text-center">
        <div className="text-[12px] text-slate-700">የገንዘብ መቀበያ ደረሰኝ</div>
        <div className="text-lg font-bold text-slate-900">Cash Receipt Voucher</div>
      </div>

      {/* RRN + System Number + QR */}
      <section className="grid grid-cols-[1fr_140px] items-start gap-4 px-6 py-4">
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          <div className="break-all">
            <span className="font-semibold">RRN:</span>{" "}
            <span>{receipt.rrn ?? "N/A"}</span>
          </div>
          <div>
            <span className="font-semibold">System Number:</span>{" "}
            <span>{seller.systemNumber}</span>
          </div>
        </div>
        <div className="flex items-center justify-end">
          {receipt.signedQR ? (
            <img
              src={`data:image/png;base64,${receipt.signedQR}`}
              alt="Receipt QR"
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
        <PartyBlock
          fromLabel="ከ / From:"
          name={seller.legalName}
          address={joinAddress(seller.city, seller.region)}
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
        <PartyBlock
          fromLabel="ለ / To:"
          name={buyerName}
          address={
            buyer ? joinAddress(buyer.city, buyer.zone, buyer.wereda) : ""
          }
          city={buyer?.city ?? ""}
          zone={buyer?.zone ?? ""}
          wereda={buyer?.wereda ?? ""}
          kebele={buyer?.kebele ?? ""}
          phone={buyer?.phone ?? ""}
          vatLabel="የገዢ ተ.ኤ.ታ / Buyer VAT Reg."
          vat={buyer?.vatNumber ?? ""}
          tin={buyer?.tin ?? ""}
          subTin=""
        />
      </section>

      {/* Line-item table */}
      <section className="px-6">
        <table className="w-full border border-slate-300 text-[11px]">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <ThV3 am="ተ/ቁ" en="No." width="w-12" />
              <ThV3 am="የደረሰኝ ቁጥር" en="IRN" />
              <ThV3 am="ጠቅላላ መጠን" en="Total" align="right" width="w-24" />
              <ThV3 am="የተያዘ" en="Withheld amount" align="right" width="w-24" />
              <ThV3 am="ቀሪ" en="Remain." align="right" width="w-20" />
              <ThV3 am="ቅናሽ" en="Disc." align="right" width="w-20" />
              <ThV3 am="ተከፈለ" en="Coll." align="right" width="w-24" />
            </tr>
          </thead>
          <tbody>
            {receipt.invoices.map((line, i) => {
              const inv = line.invoice;
              const withheld = 0; // Sales receipt — MoR-side withholding tracked separately
              const remaining =
                line.remainingAmount ??
                Math.max(0, inv.totalValue - line.invoicePaidAmount);
              const discount = line.discountAmount ?? 0;
              return (
                <tr key={line.id} className="border-t border-slate-200">
                  <td className="border-r border-slate-200 px-2 py-2 text-center tabular-nums">
                    {i + 1}
                  </td>
                  <td className="break-all border-r border-slate-200 px-2 py-2 font-mono text-[10px]">
                    {inv.irn}
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                    {fmtNumber(inv.totalValue)}
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                    {fmtNumber(withheld)}
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                    {fmtNumber(remaining)}
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums">
                    {fmtNumber(discount)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {fmtNumber(line.invoicePaidAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* In Words */}
      <section className="mt-3 px-6">
        <div className="rounded border border-slate-300 px-3 py-2 text-[11px]">
          <div className="text-slate-600">በፊደል / In Words</div>
          <div className="mt-0.5 font-semibold uppercase">{inWords}</div>
        </div>
      </section>

      {/* Mode of Payment + Collector */}
      <section className="mt-2 grid grid-cols-2 gap-3 px-6">
        <div className="rounded border border-slate-300 px-3 py-2 text-[11px]">
          <div className="text-slate-600">የክፍያ ሁኔታ / Mode of Payment</div>
          <div className="mt-0.5 text-[11px] text-slate-700">Mode:</div>
          <div className="text-sm font-bold uppercase">
            {receipt.modeOfPayment || "CASH"}
          </div>
        </div>
        <div className="rounded border border-slate-300 px-3 py-2 text-[11px]">
          <div className="text-slate-600">የተቀባይ መርጃ / Collector</div>
          <div className="mt-0.5 text-[11px] text-slate-700">Name:</div>
          <div className="text-sm font-semibold">
            {receipt.collectorName || "—"}
          </div>
        </div>
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

function joinAddress(...parts: Array<string | null | undefined>): string {
  return parts.filter((s): s is string => !!s && s.trim().length > 0).join(", ");
}

function ThV3({
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

function PartyBlock({
  fromLabel,
  name,
  address,
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
  address: string;
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
