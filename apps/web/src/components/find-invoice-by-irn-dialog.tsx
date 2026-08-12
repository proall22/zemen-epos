import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { findInvoiceByIrn, importInvoiceByIrn } from "@/lib/resources";
import type { Invoice } from "@/lib/types";

export interface FindInvoiceByIrnDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fires once the IRN resolves to an invoice the caller can act on (the
   *  invoice is loaded with buyer + items + cancellation already, so the
   *  receipt sheet can open immediately without an extra round trip). */
  onFound: (invoice: Invoice) => void;
}

/**
 * Tiny modal: the cashier pastes/types the IRN from a printed invoice, we
 * resolve it server-side (tenant-scoped), and hand back the full invoice so
 * the standard payment-receipt sheet can open against it. No tenant
 * leakage: 404 covers both "no such IRN" and "IRN belongs to another
 * merchant", so the cashier can never tell which.
 */
export function FindInvoiceByIrnDialog({
  open,
  onClose,
  onFound,
}: FindInvoiceByIrnDialogProps) {
  const [irn, setIrn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the dialog reopens — paste a fresh IRN, leave behind any
  // stale error from the previous attempt.
  useEffect(() => {
    if (open) {
      setIrn("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = irn.trim();
    if (!trimmed) {
      setError("Paste an invoice IRN to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Two-stage resolution. Local first — fast path for invoices we
      // registered ourselves. If MoR knows the IRN but we don't (the
      // common "issued on another POS" case), fall back to the import
      // endpoint which calls /v1/verify and bootstraps a stub Invoice
      // row marked source=EXTERNAL. The cashier sees a single click;
      // the fallback is invisible.
      let invoice: Invoice;
      try {
        invoice = await findInvoiceByIrn(trimmed);
      } catch (localErr) {
        if (localErr instanceof ApiError && localErr.status === 404) {
          invoice = await importInvoiceByIrn(trimmed);
        } else {
          throw localErr;
        }
      }
      onFound(invoice);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(
          "MoR doesn't recognise that IRN for your merchant. Double-check the value, or confirm it was issued under your TIN.",
        );
      } else if (err instanceof ApiError && err.status === 409) {
        setError(
          readApiMessage(err.body) ??
            "That invoice is not in an active state and can't have a receipt filed against it.",
        );
      } else if (err instanceof ApiError) {
        setError(readApiMessage(err.body) ?? "Couldn't look up that IRN.");
      } else {
        setError("Couldn't reach the server. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment by IRN</DialogTitle>
          <DialogDescription>
            Paste the IRN from the printed invoice. We'll check your records
            first; if the invoice was issued elsewhere, we ask MoR for it and
            import it as an external invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="irn-input">Invoice IRN</Label>
            <Input
              id="irn-input"
              value={irn}
              onChange={(e) => setIrn(e.target.value)}
              placeholder="e.g. test-cd4d0e110c7b68c9dba543888…"
              className="font-mono"
              autoFocus
              disabled={busy}
            />
          </div>

          {error && <ErrorCallout title={error} items={[]} />}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={(e) => {
              // Form's onSubmit handles this when the user presses Enter,
              // but explicit clicks go through here.
              void submit(e as unknown as React.FormEvent);
            }}
            disabled={busy || !irn.trim()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Search />}
            Find invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
