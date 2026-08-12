import { useState } from "react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { cancelInvoice } from "@/lib/resources";
import type { Invoice } from "@/lib/types";

const REASON_CODES: { value: string; label: string }[] = [
  { value: "1", label: "1 — Duplicate" },
  { value: "2", label: "2 — Data entry error" },
  { value: "3", label: "3 — Order cancelled" },
  { value: "4", label: "4 — Other" },
];

export interface CancelInvoiceDialogProps {
  invoice: Invoice | null;
  onClose: () => void;
  onCancelled: (invoice: Invoice) => void;
}

export function CancelInvoiceDialog({
  invoice,
  onClose,
  onCancelled,
}: CancelInvoiceDialogProps) {
  const [reasonCode, setReasonCode] = useState("1");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  function reset() {
    setReasonCode("1");
    setRemark("");
    setError(null);
    setBusy(false);
  }

  async function handleSubmit() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await cancelInvoice(invoice.id, reasonCode, remark);
      onCancelled(updated);
      reset();
      onClose();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't cancel this invoice.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({ title: (err as Error).message, items: [] });
      }
    }
  }

  return (
    <Dialog
      open={invoice !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel invoice</DialogTitle>
          <DialogDescription>
            {invoice && (
              <>
                Doc <span className="font-mono">#{invoice.documentNumber}</span>{" "}
                · IRN <span className="font-mono">{invoice.irn.slice(0, 16)}…</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Reason code</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Remark</Label>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Optional context for the cancellation"
              rows={3}
            />
          </div>
          {error && <ErrorCallout title={error.title} items={error.items} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? "Cancelling…" : "Cancel invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
