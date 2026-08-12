import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";

import { CashReceiptDocument } from "@/components/pos/cash-receipt-document";
import { PosReceiptDocument } from "@/components/pos/pos-receipt-document";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getInvoice, getReceipt } from "@/lib/resources";
import type { Receipt } from "@/lib/types";

type ReceiptView = "a4" | "pos";

export function ReceiptPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ReceiptView>("a4");
  // Withhold receipts don't have a thermal / POS variant — they're always
  // A4, so hide the toggle and force the a4 view.
  const canToggleView = receipt && receipt.kind !== "WITHHOLD";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getReceipt(id);
        // The receipts endpoint omits line items on each nested invoice, so
        // fetch the full invoice(s) to render the receipt's sale lines.
        const fullInvoices = await Promise.all(
          r.invoices.map((line) => getInvoice(line.invoice.id)),
        );
        const enriched: Receipt = {
          ...r,
          invoices: r.invoices.map((line, i) => ({
            ...line,
            invoice: fullInvoices[i],
          })),
        };
        if (!cancelled) setReceipt(enriched);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : (err as Error).message,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        {canToggleView && (
          <div className="inline-flex gap-1 rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === "a4" ? "default" : "ghost"}
              onClick={() => setView("a4")}
            >
              A4
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "pos" ? "default" : "ghost"}
              onClick={() => setView("pos")}
            >
              Thermal
            </Button>
          </div>
        )}
        <Button
          type="button"
          onClick={() => window.print()}
          disabled={!receipt}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          <Printer /> Print receipt
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load receipt: {error}{" "}
          <Link to="/receipts" className="underline">
            Back to list
          </Link>
        </p>
      )}
      {!receipt && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {receipt && renderReceipt(receipt, canToggleView ? view : "a4")}
    </div>
  );
}

function renderReceipt(receipt: Receipt, view: ReceiptView) {
  if (view === "pos") {
    return <PosReceiptDocument receipt={receipt} id="receipt-print" />;
  }
  return <CashReceiptDocument receipt={receipt} id="receipt-print" />;
}
