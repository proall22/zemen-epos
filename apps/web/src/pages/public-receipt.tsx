import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";

import { CashReceiptDocument } from "@/components/pos/cash-receipt-document";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getPublicReceipt } from "@/lib/resources";
import type { Receipt } from "@/lib/types";

/**
 * Public, login-free receipt page reached from notification email/SMS
 * links. Mirrors {@link PublicInvoicePage}: tokenised access via `?t=`,
 * and a Save-as-PDF / Print button driving the browser print dialog.
 * Re-uses {@link CashReceiptDocument} — the A4 receipt layout the staff
 * print page uses, so the buyer's saved PDF matches the seller's copy.
 *
 * The server returns each linked invoice's line items inline, so unlike
 * the authenticated `/receipts/:id` print page we don't need a per-
 * invoice round-trip — there's no credential to make one with.
 */
export function PublicReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPublicReceipt(id, token)
      .then(setReceipt)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? "This receipt link is invalid or has expired."
            : "Couldn't load this receipt. Please try again later.",
        ),
      );
  }, [id, token]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-end print:hidden">
        <Button
          type="button"
          onClick={() => window.print()}
          disabled={!receipt}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          <Printer /> Save as PDF / Print
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!receipt && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {receipt && (
        <CashReceiptDocument receipt={receipt} id="public-receipt-print" />
      )}
    </div>
  );
}
