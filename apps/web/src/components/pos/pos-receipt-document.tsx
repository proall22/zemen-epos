import { useSellerInfo } from "@/lib/auth";
import { sellerInfoFromDocument } from "@/lib/seller-info";
import { formatInvoiceDate, formatInvoiceTime24 } from "@/lib/invoice-date";
import { nonTaxableSuffix, vatRateForLine } from "@/lib/invoice-types";
import type { Receipt } from "@/lib/types";

/**
 * Fiscal device supplier printed at the foot of every receipt. This is the
 * e-invoicing platform that supplied the POS system (always Zemen-ePos), distinct
 * from the seller/merchant in the header — which is configured per deployment.
 */
const ZEMEN_EPOS_SUPPLIER = {
  authority: "ERCA",
  name: "Zemen-ePos Financial Services S.C.",
  phone: "+251911774343",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "CASH",
  CHEQUE: "CHEQUE",
  CPO: "CPO",
  SWIFT: "SWIFT",
  CARD: "CARD",
  WIRE: "WIRE",
  BANK_TRANSFER: "BANK TRANSFER",
  LETTER_OF_CREDIT: "L/C",
};

const money = (n: number): string => n.toFixed(2);

export interface PosReceiptDocumentProps {
  receipt: Receipt;
  /** DOM id, useful if the host page wants to scope print rules. */
  id?: string;
}

/**
 * Thermal-printer fiscal receipt (ERCA/MoR style, ~32 columns) rendered from a
 * payment receipt: the sale lines come from the linked invoice(s), the amount
 * is what was collected, and the QR is the receipt's own MoR signature. Header
 * is the seller; footer credits Zemen-ePos as the device supplier.
 */
export function PosReceiptDocument({
  receipt,
  id = "pos-receipt-print",
}: PosReceiptDocumentProps) {
  // Issuing branch on the receipt wins over the active one — see
  // sellerInfoFromDocument.
  const contextSeller = useSellerInfo();
  const SELLER_INFO =
    receipt.branch || receipt.merchant
      ? sellerInfoFromDocument(receipt)
      : contextSeller;
  const isWithhold = receipt.kind === "WITHHOLD";
  const date = formatInvoiceDate(receipt.receiptDate);
  const time = formatInvoiceTime24(receipt.receiptDate);
  const fsNo = String(receipt.receiptCounter).padStart(8, "0");
  const typeLabel = isWithhold ? "WITHHOLDING RECEIPT" : "CASH RECEIPT VOUCHER";

  // Sale lines + tax aggregated across every invoice this receipt covers.
  // Nested invoices may arrive without their `items` relation, so default it.
  const allItems = receipt.invoices.flatMap((line) => line.invoice.items ?? []);
  const taxableTotal = allItems
    .filter((l) => vatRateForLine(l) > 0)
    .reduce((s, l) => s + l.preTaxValue, 0);
  const exemptTotal = allItems
    .filter((l) => vatRateForLine(l) === 0)
    .reduce((s, l) => s + l.preTaxValue, 0);
  const vatValue = receipt.invoices.reduce((s, l) => s + l.invoice.taxValue, 0);

  const paymentLabel = receipt.modeOfPayment
    ? (PAYMENT_METHOD_LABEL[receipt.modeOfPayment] ?? receipt.modeOfPayment)
    : null;

  const addressLine = [
    SELLER_INFO.region || SELLER_INFO.city,
    SELLER_INFO.zone,
    SELLER_INFO.wereda && `W-${SELLER_INFO.wereda}`,
    SELLER_INFO.kebele && `K-${SELLER_INFO.kebele}`,
    SELLER_INFO.houseNumber && `H.NO-${SELLER_INFO.houseNumber}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      id={id}
      className="mx-auto w-[320px] bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black shadow-sm print:shadow-none"
    >
      {/* Header — the seller / taxpayer operating the machine */}
      <div className="text-center">
        <div>TIN:{SELLER_INFO.tin}</div>
        <div className="font-semibold">
          {SELLER_INFO.legalName.toUpperCase()}
        </div>
        {addressLine && <div>{addressLine}</div>}
        <div>TEL-{SELLER_INFO.phone}</div>
        {SELLER_INFO.tradeName && (
          <div>{SELLER_INFO.tradeName.toUpperCase()}</div>
        )}
      </div>

      <div className="h-3" />

      <Row label="Machine Number:" value={SELLER_INFO.systemNumber} />
      <div className="text-center font-semibold">{typeLabel}</div>
      <Row label="FS NO." value={fsNo} />
      <div className="flex justify-between">
        <span>DATE:{date}</span>
        <span>TIME:{time}</span>
      </div>
      <Row
        label="Receipt #"
        value={receipt.manualReceiptNumber || receipt.receiptNumber}
      />

      {isWithhold ? (
        <>
          <Divider />
          {receipt.withholdType && (
            <Row label="Type" value={receipt.withholdType} />
          )}
          {receipt.withholdRate !== null && (
            <Row label="Rate" value={`${receipt.withholdRate}%`} />
          )}
          {receipt.withholdPreTax !== null && (
            <Row label="Pre-tax" value={`*${money(receipt.withholdPreTax)}`} />
          )}
          {receipt.externalInvoiceIrn && (
            <div className="mt-1 break-all text-[10px] text-neutral-600">
              Supplier IRN: {receipt.externalInvoiceIrn}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Sale lines, grouped per invoice the receipt settles */}
          <div className="mt-1">
            {receipt.invoices.map((line) => (
              <div key={line.id}>
                <div className="text-neutral-600">
                  INV #{line.invoice.documentNumber}
                </div>
                {(line.invoice.items ?? []).map((item) => (
                  <div key={item.id}>
                    <div className="break-words">
                      {item.description}
                      {nonTaxableSuffix(item.taxCode)}
                    </div>
                    <div className="flex justify-between">
                      <span>
                        {item.quantity} x {money(item.unitPrice)}
                      </span>
                      <span>*{money(item.totalAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <Divider />

          {taxableTotal > 0 && (
            <>
              <Row label="TXBL A(15%)" value={`*${money(taxableTotal)}`} />
              <Row label="TAX A(15%)" value={`*${money(vatValue)}`} />
            </>
          )}
          {exemptTotal > 0 && (
            <Row label="TXBL B(0%)" value={`*${money(exemptTotal)}`} />
          )}
        </>
      )}

      <Divider />

      <Row
        label={isWithhold ? "WITHHELD" : "COLLECTED"}
        value={`*${money(receipt.collectedAmount)}`}
        bold
      />
      {paymentLabel && (
        <div className="flex justify-between gap-2">
          <span>PAID: {paymentLabel}</span>
          {receipt.collectorName && <span>by {receipt.collectorName}</span>}
        </div>
      )}
      {!isWithhold && <Row label="ITEM:" value={String(allItems.length)} />}

      {/* Verification block — the receipt's own MoR QR + RRN reference */}
      {(receipt.signedQR || receipt.rrn) && (
        <>
          <Divider />
          <div className="flex flex-col items-center gap-1.5 py-1">
            {receipt.signedQR && (
              <img
                src={`data:image/png;base64,${receipt.signedQR}`}
                alt="Receipt verification QR"
                className="h-28 w-28"
              />
            )}
            {receipt.rrn && (
              <div className="w-full break-all text-center text-[10px] leading-tight text-neutral-600">
                {receipt.rrn}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer — fiscal authority + Zemen-ePos as the device supplier */}
      <div className="mt-3 text-center">
        <div>{ZEMEN_EPOS_SUPPLIER.authority}</div>
        <div>{SELLER_INFO.systemNumber}</div>
        <div>SUPPLIED BY {ZEMEN_EPOS_SUPPLIER.name.toUpperCase()}</div>
        <div>TEL-{ZEMEN_EPOS_SUPPLIER.phone}</div>
      </div>
    </article>
  );
}

/** A label on the left and a value on the right, monospace-aligned. */
function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${bold ? "font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="break-all text-right tabular-nums">{value}</span>
    </div>
  );
}

/** Full-width dashed rule standing in for a row of "-" characters. */
function Divider() {
  return <div className="my-1 border-t border-dashed border-black" />;
}
