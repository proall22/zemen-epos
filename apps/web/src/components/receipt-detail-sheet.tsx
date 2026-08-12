import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCheck,
  Copy,
  Percent,
  Printer,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VerifyReceiptSheet } from "@/components/verify-receipt-sheet";
import { formatAckDate, isPlaceholderTin } from "@/lib/invoice-types";
import { formatReceiptIssuedAt } from "@/lib/invoice-date";
import type { Receipt } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAYMENT_CLASSIFICATION_LABEL: Record<string, string> = {
  CASH: "Cash",
  ADVANCE: "Advance",
  CREDIT: "Credit",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  CPO: "Cashier's payment order",
  SWIFT: "SWIFT",
  CARD: "Card",
  WIRE: "Wire transfer",
  BANK_TRANSFER: "Bank transfer",
  LETTER_OF_CREDIT: "Letter of credit",
};

const WITHHOLD_TYPE_LABEL: Record<string, string> = {
  TWTH: "TWTH — Transaction withholding",
  IWTH: "IWTH — Income withholding",
};

export interface ReceiptDetailSheetProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export function ReceiptDetailSheet({
  receipt,
  onClose,
}: ReceiptDetailSheetProps) {
  const [verifyOpen, setVerifyOpen] = useState(false);

  function handleClose() {
    setVerifyOpen(false);
    onClose();
  }

  return (
    <>
    <Sheet
      open={receipt !== null}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent side="right">
        {receipt && (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="flex flex-col gap-1">
                  <SheetTitle className="flex items-center gap-2">
                    {receipt.kind === "WITHHOLD" ? (
                      <Percent className="size-4 text-muted-foreground" />
                    ) : (
                      <ReceiptText className="size-4 text-muted-foreground" />
                    )}
                    {receipt.kind === "WITHHOLD"
                      ? "Withhold receipt"
                      : "Sales receipt"}
                  </SheetTitle>
                  <SheetDescription>
                    Counter {receipt.receiptCounter} · {formatReceiptIssuedAt(receipt)}
                  </SheetDescription>
                </div>
                <Badge
                  variant={receipt.kind === "WITHHOLD" ? "muted" : "success"}
                >
                  {receipt.kind === "WITHHOLD" ? "Withhold" : "Sales"}
                </Badge>
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-6">
              <Section title="Amounts">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {receipt.kind === "WITHHOLD" ? "Withheld" : "Collected"}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {receipt.collectedAmount.toFixed(2)} {receipt.receiptCurrency}
                  </span>
                </div>
                {receipt.kind === "WITHHOLD" && (
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <DetailRow label="Type">
                      {WITHHOLD_TYPE_LABEL[receipt.withholdType ?? ""] ??
                        receipt.withholdType ??
                        "—"}
                    </DetailRow>
                    {receipt.withholdRate !== null && (
                      <DetailRow label="Rate">{receipt.withholdRate}%</DetailRow>
                    )}
                    {receipt.withholdPreTax !== null && (
                      <DetailRow label="Pre-tax">
                        {receipt.withholdPreTax.toFixed(2)}{" "}
                        {receipt.receiptCurrency}
                      </DetailRow>
                    )}
                  </dl>
                )}
              </Section>

              {receipt.rrn && (
                <Section title="RRN">
                  <div className="flex items-start gap-2">
                    <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                      {receipt.rrn}
                    </code>
                    <CopyButton value={receipt.rrn} />
                  </div>
                </Section>
              )}

              {receipt.kind === "WITHHOLD" && receipt.externalInvoiceIrn && (
                <Section title="Supplier invoice IRN">
                  <div className="flex items-start gap-2">
                    <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                      {receipt.externalInvoiceIrn}
                    </code>
                    <CopyButton value={receipt.externalInvoiceIrn} />
                  </div>
                </Section>
              )}

              {receipt.kind === "SALES" && receipt.invoices.length > 0 && (
                <Section
                  title={
                    receipt.invoices.length === 1
                      ? "Invoice IRN"
                      : `Invoice IRNs (${receipt.invoices.length})`
                  }
                >
                  <div className="flex flex-col gap-2">
                    {receipt.invoices.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-start gap-2"
                      >
                        <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                          {line.invoice.irn}
                        </code>
                        <CopyButton value={line.invoice.irn} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {receipt.signedQR && (
                <Section title="QR">
                  <img
                    alt="Receipt QR"
                    src={`data:image/png;base64,${receipt.signedQR}`}
                    className="size-44 rounded-md border bg-white p-2"
                  />
                </Section>
              )}

              <Section title="Reference">
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <DetailRow label="Receipt #">
                    <span className="font-mono text-xs">
                      {receipt.receiptNumber}
                    </span>
                  </DetailRow>
                  {receipt.manualReceiptNumber && (
                    <DetailRow label="Manual #">
                      {receipt.manualReceiptNumber}
                    </DetailRow>
                  )}
                  <DetailRow label="Date">
                    {formatAckDate(receipt.receiptDate)}
                  </DetailRow>
                  <DetailRow label="Currency">
                    {receipt.receiptCurrency}
                    {receipt.exchangeRate !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        (rate {receipt.exchangeRate})
                      </span>
                    )}
                  </DetailRow>
                  {receipt.reason && (
                    <DetailRow label="Reason">{receipt.reason}</DetailRow>
                  )}
                </dl>
              </Section>

              {receipt.kind === "SALES" && (
                <Section title="Payment">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {receipt.paymentClassification && (
                      <DetailRow label="Type">
                        {PAYMENT_CLASSIFICATION_LABEL[
                          receipt.paymentClassification
                        ] ?? receipt.paymentClassification}
                      </DetailRow>
                    )}
                    {receipt.modeOfPayment && (
                      <DetailRow label="Method">
                        {PAYMENT_METHOD_LABEL[receipt.modeOfPayment] ??
                          receipt.modeOfPayment}
                      </DetailRow>
                    )}
                    {receipt.collectorName && (
                      <DetailRow label="Collector">
                        {receipt.collectorName}
                      </DetailRow>
                    )}
                    {receipt.paymentServiceProvider && (
                      <DetailRow label="Provider">
                        {receipt.paymentServiceProvider}
                      </DetailRow>
                    )}
                    {receipt.otherPaymentServiceProviderName && (
                      <DetailRow label="Provider (other)">
                        {receipt.otherPaymentServiceProviderName}
                      </DetailRow>
                    )}
                    {receipt.accountNumber && (
                      <DetailRow label="Account #">
                        {receipt.accountNumber}
                      </DetailRow>
                    )}
                    {receipt.transactionNumber && (
                      <DetailRow label="Transaction #">
                        {receipt.transactionNumber}
                      </DetailRow>
                    )}
                    {receipt.chequeNumber && (
                      <DetailRow label="Cheque #">
                        {receipt.chequeNumber}
                      </DetailRow>
                    )}
                    {receipt.cpoNumber && (
                      <DetailRow label="CPO #">{receipt.cpoNumber}</DetailRow>
                    )}
                    {receipt.documentNumber && (
                      <DetailRow label="Doc #">{receipt.documentNumber}</DetailRow>
                    )}
                  </dl>
                </Section>
              )}

              <Section title={`Invoices (${receipt.invoices.length})`}>
                <ul className="flex flex-col divide-y rounded-md border">
                  {receipt.invoices.map((line) => (
                    <li key={line.id}>
                      <Link
                        to={`/invoices/${line.invoice.id}`}
                        className="flex items-start justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            Doc #{line.invoice.documentNumber}
                            {line.invoice.status === "CANCELLED" && (
                              <Badge
                                variant="destructive"
                                className="ml-2 text-[10px]"
                              >
                                Cancelled
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {line.invoice.buyer.legalName}
                            {!isPlaceholderTin(line.invoice.buyer.tin) &&
                              ` · TIN ${line.invoice.buyer.tin}`}
                          </span>
                          {/* Full copyable IRN lives in the "Invoice IRN(s)"
                           *  section above; here we keep only a short preview
                           *  to identify the row at a glance. */}
                          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            IRN {line.invoice.irn.slice(0, 16)}…
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant={
                              line.paymentCoverage === "FULL"
                                ? "success"
                                : line.paymentCoverage === "WITHHOLD"
                                  ? "muted"
                                  : "outline"
                            }
                          >
                            {line.paymentCoverage}
                          </Badge>
                          <span className="text-sm font-medium tabular-nums">
                            {line.invoicePaidAmount.toFixed(2)}{" "}
                            {receipt.receiptCurrency}
                          </span>
                          {line.remainingAmount !== null && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {line.remainingAmount.toFixed(2)} remaining
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </SheetBody>

            <SheetFooter>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/receipts/${receipt.id}`}>
                  <Printer /> Print receipt
                </Link>
              </Button>
              {receipt.rrn && (
                <Button variant="outline" onClick={() => setVerifyOpen(true)}>
                  <ShieldCheck /> Verify
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>

      <VerifyReceiptSheet
        receipt={verifyOpen ? receipt : null}
        onClose={() => setVerifyOpen(false)}
      />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {children}
      <Separator />
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
    >
      {copied ? <CheckCheck className={cn("size-3.5")} /> : <Copy className="size-3.5" />}
    </Button>
  );
}
