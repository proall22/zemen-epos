import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Search,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { importInvoiceByIrn, lookupExternalInvoice } from "@/lib/resources";
import {
  isVerifyEnvelope,
  type Invoice,
  type VerifyResponse,
} from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  A: "Accepted",
  C: "Cancelled",
  R: "Rejected",
  P: "Pending",
};

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; response: VerifyResponse }
  | { kind: "importing" }
  | { kind: "error"; message: string };

export interface CheckExternalInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the list can refresh. */
  onImported: (invoice: Invoice) => void;
}

export function CheckExternalInvoiceDialog({
  open,
  onClose,
  onImported,
}: CheckExternalInvoiceDialogProps) {
  const { can } = useAuth();
  const [irn, setIrn] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  function reset() {
    setIrn("");
    setState({ kind: "idle" });
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      onClose();
    }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const value = irn.trim();
    if (!value) return;
    setState({ kind: "checking" });
    try {
      const response = await lookupExternalInvoice(value);
      setState({ kind: "result", response });
    } catch (err) {
      setState({ kind: "error", message: friendly(err) });
    }
  }

  async function doImport() {
    const value = irn.trim();
    setState({ kind: "importing" });
    try {
      const invoice = await importInvoiceByIrn(value);
      onImported(invoice);
      reset();
      onClose();
    } catch (err) {
      setState({ kind: "error", message: friendly(err) });
    }
  }

  const details =
    state.kind === "result" ? parseLookup(state.response) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check an invoice</DialogTitle>
          <DialogDescription>
            Look up any invoice by its IRN against MoR. Nothing is saved unless
            you choose to import it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={check} className="flex flex-col gap-3">
          <Label htmlFor="external-irn">Invoice IRN</Label>
          <div className="flex items-center gap-2">
            <Input
              id="external-irn"
              value={irn}
              onChange={(e) => setIrn(e.target.value)}
              placeholder="Paste the IRN from a printed invoice"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!irn.trim() || state.kind === "checking"}
            >
              <Search /> Check
            </Button>
          </div>
        </form>

        {state.kind === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        )}

        {details && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {details.active ? (
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="size-5 text-destructive" />
                )}
                <span className="font-medium">MoR: {details.statusLabel}</span>
                {!details.active && (
                  <Badge variant="destructive" className="text-[10px]">
                    Not importable
                  </Badge>
                )}
              </div>
              {details.facts.length > 0 && (
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                  {details.facts.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!details.facts.length && (
                <p className="text-sm text-muted-foreground">
                  {details.message ??
                    "MoR didn't return any details for this IRN."}
                </p>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          {details?.active && can("invoice.create") && (
            <Button
              onClick={doImport}
              disabled={state.kind === "importing"}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              <Download /> {state.kind === "importing" ? "Importing…" : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LookupDetails {
  active: boolean;
  statusLabel: string;
  facts: Array<[string, string]>;
  message?: string;
}

function parseLookup(response: VerifyResponse): LookupDetails {
  if (!isVerifyEnvelope(response)) {
    // Flat shape — typically a cancelled/non-active document.
    return {
      active: false,
      statusLabel: response.status || "Unknown",
      facts: [],
      message: response.message,
    };
  }
  const body = response.body;
  if (!body) {
    return { active: false, statusLabel: response.message, facts: [] };
  }
  const status = body.Status ?? "?";
  const active = status === "A";
  const facts: Array<[string, string]> = [];
  if (body.DocumentDetails?.DocumentNumber)
    facts.push(["Document #", body.DocumentDetails.DocumentNumber]);
  const seller = pickName(body.SellerDetails);
  if (seller) facts.push(["Seller", seller]);
  const buyer = pickName(body.BuyerDetails);
  if (buyer) facts.push(["Buyer", buyer]);
  if (body.ValueDetails?.TotalValue != null)
    facts.push([
      "Total",
      `${body.ValueDetails.TotalValue.toFixed(2)} ${body.ValueDetails.InvoiceCurrency ?? ""}`.trim(),
    ]);
  if (body.DocumentDetails?.Date)
    facts.push(["Date", body.DocumentDetails.Date]);
  return {
    active,
    statusLabel: STATUS_LABEL[status] ?? status,
    facts,
  };
}

function pickName(obj: Record<string, unknown> | undefined): string | null {
  if (!obj) return null;
  const name = obj.LegalName;
  return typeof name === "string" && name.trim() ? name : null;
}

function friendly(err: unknown): string {
  if (err instanceof ApiError) {
    return (
      readApiMessage(err.body) ??
      (err.status === 404
        ? "MoR couldn't find an invoice with that IRN (or it isn't accessible to this account)."
        : err.status >= 500
          ? "MoR is unreachable right now. Try again shortly."
          : "MoR rejected the lookup.")
    );
  }
  return "Something went wrong. Please try again.";
}
