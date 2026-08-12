import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  Copy,
  ListChecks,
  Plus,
  Printer,
} from "lucide-react";

import { PaymentReceiptSheet } from "@/components/payment-receipt-sheet";
import { Button } from "@/components/ui/button";
import { formatAckDate, isPlaceholderTin } from "@/lib/invoice-types";
import type { Invoice, Receipt } from "@/lib/types";

export interface InvoiceIssuedScreenProps {
  invoice: Invoice;
  onPaid: (receipt: Receipt) => void;
  onNewSale: () => void;
}

export function InvoiceIssuedScreen({
  invoice,
  onPaid,
  onNewSale,
}: InvoiceIssuedScreenProps) {
  const [payOpen, setPayOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // MoR treats CASH + IMMIDIATE sales as settled at issue, so the backend
  // stamps them PAID on register. Suppress the "Pay now" affordance so we
  // don't lure the cashier into a redundant round-trip.
  const settledOnSite = invoice.paymentStatus === "PAID";

  async function copyIrn() {
    try {
      await navigator.clipboard.writeText(invoice.irn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="relative bg-gradient-to-br from-[#5700FF] via-[#7c2bff] to-fuchsia-500 px-8 py-10 text-center text-white">
          <div
            aria-hidden
            className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]"
          />
          <div className="relative flex flex-col items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="size-8" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {settledOnSite ? "Paid on site" : "Invoice issued"}
            </h1>
            <p className="text-sm text-white/80">
              {settledOnSite
                ? "MOR accepted the e-invoice and marked it paid. The invoice itself is the payment record — no separate receipt needed."
                : "MOR has accepted the e-invoice. Collect payment to complete the sale."}
            </p>
          </div>
        </div>

        <div className="grid gap-6 p-8 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Total amount
              </span>
              <span className="text-4xl font-semibold tabular-nums">
                {invoice.totalValue.toFixed(2)}{" "}
                <span className="text-xl text-muted-foreground">
                  {invoice.currency}
                </span>
              </span>
            </div>

            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Document #</dt>
              <dd className="font-medium tabular-nums">
                {invoice.documentNumber}
              </dd>
              <dt className="text-muted-foreground">Customer</dt>
              <dd>
                <span className="font-medium">{invoice.buyer.legalName}</span>
                {!isPlaceholderTin(invoice.buyer.tin) && (
                  <span className="text-muted-foreground">
                    {" "}
                    · TIN {invoice.buyer.tin}
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Issued</dt>
              <dd>{formatAckDate(invoice.ackDate)}</dd>
            </dl>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                IRN
              </span>
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-[11px]">
                  {invoice.irn}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyIrn}
                >
                  {copied ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 md:pt-1">
            <img
              src={`data:image/png;base64,${invoice.signedQR}`}
              alt="Invoice QR"
              className="size-44 rounded-md border bg-white p-2"
            />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              EIRMS QR
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t bg-muted/20 px-8 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" asChild>
            <Link to="/invoices">
              <ListChecks /> Invoices
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={`/invoices/${invoice.id}`}>
              <Printer /> Print invoice
            </Link>
          </Button>
          {settledOnSite ? (
            <Button
              type="button"
              onClick={onNewSale}
              className="h-11 bg-[#5700FF] px-6 text-white hover:bg-[#5700FF]/90"
            >
              <Plus /> New sale
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onNewSale}>
                <Plus /> New sale
              </Button>
              <Button
                type="button"
                onClick={() => setPayOpen(true)}
                className="h-11 bg-[#5700FF] px-6 text-white hover:bg-[#5700FF]/90"
              >
                <Banknote /> Pay now
              </Button>
            </>
          )}
        </div>
      </div>

      {!settledOnSite && (
        <PaymentReceiptSheet
          invoice={payOpen ? invoice : null}
          onClose={() => setPayOpen(false)}
          onPaid={(receipt) => {
            setPayOpen(false);
            if (receipt) onPaid(receipt);
          }}
        />
      )}
    </div>
  );
}
