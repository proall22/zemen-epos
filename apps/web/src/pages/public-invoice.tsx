import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";

import { InvoicePrintView } from "@/components/pos/invoice-print-view";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { relatedIrnOf } from "@/lib/invoice-types";
import { getPublicInvoice } from "@/lib/resources";
import type { Invoice } from "@/lib/types";

/**
 * Public, login-free invoice page reached from notification email/SMS links.
 * Renders Variant 1 and lets the buyer Save as PDF / Print via the browser.
 * Access is gated by the `?t=` token validated server-side.
 */
export function PublicInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPublicInvoice(id, token)
      .then(setInvoice)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? "This invoice link is invalid or has expired."
            : "Couldn't load this invoice. Please try again later.",
        ),
      );
  }, [id, token]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-end print:hidden">
        <Button
          type="button"
          onClick={() => window.print()}
          disabled={!invoice}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          <Printer /> Save as PDF / Print
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
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
