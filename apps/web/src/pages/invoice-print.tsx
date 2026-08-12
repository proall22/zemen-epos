import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";

import { InvoicePrintView } from "@/components/pos/invoice-print-view";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { relatedIrnOf } from "@/lib/invoice-types";
import { getInvoice } from "@/lib/resources";
import type { Invoice } from "@/lib/types";

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getInvoice(id)
      .then(setInvoice)
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : (err as Error).message,
        ),
      );
  }, [id]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        <Button
          type="button"
          onClick={() => window.print()}
          disabled={!invoice}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          <Printer /> Print invoice
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load invoice: {error}{" "}
          <Link to="/invoices" className="underline">
            Back to list
          </Link>
        </p>
      )}
      {!invoice && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {invoice && (
        <InvoicePrintView
          invoice={invoice}
          relatedIrn={relatedIrnOf(invoice)}
        />
      )}
    </div>
  );
}
