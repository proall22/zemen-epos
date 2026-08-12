import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCcw,
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
import { ApiError } from "@/lib/api";
import { formatAckDate } from "@/lib/invoice-types";
import { verifyInvoice } from "@/lib/resources";
import {
  isVerifyEnvelope,
  type Invoice,
  type VerifyInvoiceBody,
  type VerifyResponse,
} from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  A: "Accepted",
  C: "Cancelled",
  R: "Rejected",
  P: "Pending",
};

type VerifyState =
  | { kind: "loading" }
  | { kind: "ok"; response: VerifyResponse; at: Date }
  | { kind: "error"; message: string };

export interface VerifyInvoiceSheetProps {
  invoice: Invoice | null;
  onClose: () => void;
}

export function VerifyInvoiceSheet({ invoice, onClose }: VerifyInvoiceSheetProps) {
  const [state, setState] = useState<VerifyState>({ kind: "loading" });

  useEffect(() => {
    if (!invoice) return;
    setState({ kind: "loading" });
    let cancelled = false;
    verifyInvoice(invoice.id)
      .then((response) => {
        if (!cancelled)
          setState({ kind: "ok", response, at: new Date() });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof ApiError
              ? extractMessage(err.body) ?? friendlyTransportError(err.status)
              : "Couldn't reach MOR. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [invoice?.id]);

  return (
    <Sheet
      open={invoice !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        {invoice && (
          <>
            <SheetHeader>
              <div className="flex flex-col gap-1 pr-8">
                <SheetTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-muted-foreground" />
                  Verification
                </SheetTitle>
                <SheetDescription>
                  Doc #{invoice.documentNumber} · IRN{" "}
                  {invoice.irn.slice(0, 12)}…
                </SheetDescription>
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-6">
              {state.kind === "loading" && <LoadingState />}
              {state.kind === "error" && <ErrorState message={state.message} />}
              {state.kind === "ok" && (
                <OkState
                  invoice={invoice}
                  response={state.response}
                  at={state.at}
                />
              )}
            </SheetBody>

            <SheetFooter>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              {state.kind !== "loading" && (
                <Button
                  variant="outline"
                  onClick={() => setState({ kind: "loading" })}
                >
                  <RefreshCcw />
                  Verify again
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
      <RefreshCcw className="size-6 animate-spin" />
      <span>Asking MOR for the latest status…</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-5" />
        <span className="font-medium">Verification didn't go through</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function OkState({
  invoice,
  response,
  at,
}: {
  invoice: Invoice;
  response: VerifyResponse;
  at: Date;
}) {
  const parsed = parseVerify(response);
  const drifted =
    parsed.remoteStatus !== "?" && parsed.remoteStatus !== invoice.eirmsStatus;
  const inAgreement =
    parsed.remoteStatus !== "?" && parsed.remoteStatus === invoice.eirmsStatus;

  return (
    <div className="flex flex-col gap-6">
      <Headline status={parsed} drifted={drifted} agreement={inAgreement} />
      <p className="text-xs text-muted-foreground">
        Checked just now at {at.toLocaleTimeString()}.
      </p>

      {drifted && (
        <DriftBanner
          local={STATUS_LABEL[invoice.eirmsStatus] ?? invoice.eirmsStatus}
          remote={parsed.label}
        />
      )}

      {parsed.kind === "envelope" && parsed.body && (
        <>
          <Separator />
          <ConfirmedFacts
            invoice={invoice}
            body={parsed.body}
          />
        </>
      )}
    </div>
  );
}

function Headline({
  status,
  drifted,
  agreement,
}: {
  status: ReturnType<typeof parseVerify>;
  drifted: boolean;
  agreement: boolean;
}) {
  const tone = drifted
    ? { Icon: AlertTriangle, color: "text-destructive" }
    : agreement
      ? { Icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" }
      : { Icon: HelpCircle, color: "text-muted-foreground" };
  const Icon = tone.Icon;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Icon className={`size-10 ${tone.color}`} />
      <div className="flex flex-col gap-1">
        <span className="text-sm uppercase tracking-wider text-muted-foreground">
          MOR confirms
        </span>
        <span className="text-2xl font-semibold tracking-tight">
          {status.label}
        </span>
      </div>
      <Badge
        variant={
          drifted ? "destructive" : agreement ? "success" : "muted"
        }
      >
        {drifted
          ? "Out of sync with our records"
          : agreement
            ? "In agreement with our records"
            : "MOR didn't return a status"}
      </Badge>
    </div>
  );
}

function DriftBanner({
  local,
  remote,
}: {
  local: string;
  remote: string;
}) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-50/60 p-4 text-sm dark:bg-amber-950/20">
      <p className="font-medium text-amber-800 dark:text-amber-200">
        Heads up
      </p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
        We have this invoice marked as <strong>{local}</strong>, but MOR says
        it's <strong>{remote}</strong>. Someone may have changed it outside
        this system.
      </p>
    </div>
  );
}

function ConfirmedFacts({
  invoice,
  body,
}: {
  invoice: Invoice;
  body: VerifyInvoiceBody;
}) {
  const remoteTotal = body.ValueDetails?.TotalValue ?? null;
  const remoteCurrency = body.ValueDetails?.InvoiceCurrency ?? invoice.currency;
  const remoteDoc = body.DocumentDetails?.DocumentNumber ?? null;
  const remoteCounter = body.SourceSystem?.InvoiceCounter ?? null;
  const irnMatches = body.Irn === invoice.irn;
  const totalMatches =
    remoteTotal !== null && Math.abs(remoteTotal - invoice.totalValue) < 0.01;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        What MOR has on file
      </h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {remoteDoc && (
          <Row label="Document number">
            {remoteDoc}
            {remoteDoc !== invoice.documentNumber && (
              <span className="ml-2 text-xs text-destructive">
                (we have {invoice.documentNumber})
              </span>
            )}
          </Row>
        )}
        {remoteCounter !== null && (
          <Row label="Invoice counter">
            {remoteCounter}
            {remoteCounter !== invoice.invoiceCounter && (
              <span className="ml-2 text-xs text-destructive">
                (we have {invoice.invoiceCounter})
              </span>
            )}
          </Row>
        )}
        {remoteTotal !== null && (
          <Row label="Total">
            {remoteTotal.toFixed(2)} {remoteCurrency}
            {!totalMatches && (
              <span className="ml-2 text-xs text-destructive">
                (we have {invoice.totalValue.toFixed(2)} {invoice.currency})
              </span>
            )}
          </Row>
        )}
        <Row label="IRN match">
          {irnMatches ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓ matches
            </span>
          ) : (
            <span className="text-destructive">✗ does not match</span>
          )}
        </Row>
        {typeof body.SellerDetails?.LegalName === "string" && (
          <Row label="Seller">{body.SellerDetails.LegalName}</Row>
        )}
        {typeof body.BuyerDetails?.LegalName === "string" && (
          <Row label="Buyer">{body.BuyerDetails.LegalName}</Row>
        )}
        {body.DocumentDetails?.Date && (
          <Row label="Date">{formatAckDate(body.DocumentDetails.Date)}</Row>
        )}
      </dl>
    </div>
  );
}

function Row({
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

interface ParsedVerify {
  kind: "envelope" | "flat" | "unknown";
  remoteStatus: string;
  label: string;
  body: VerifyInvoiceBody | null;
}

function parseVerify(response: VerifyResponse): ParsedVerify {
  if (isVerifyEnvelope(response)) {
    const status = response.body?.Status ?? "?";
    return {
      kind: "envelope",
      remoteStatus: status,
      label: STATUS_LABEL[status] ?? status,
      body: response.body,
    };
  }
  if (response.status === "Error" && /cancel/i.test(response.message)) {
    return {
      kind: "flat",
      remoteStatus: "C",
      label: "Cancelled",
      body: null,
    };
  }
  return {
    kind: "unknown",
    remoteStatus: "?",
    label: response.message,
    body: null,
  };
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (Array.isArray(obj.message)) return obj.message.join("; ");
  return null;
}

function friendlyTransportError(status: number): string {
  if (status === 401 || status === 403) return "Authentication with MOR failed.";
  if (status >= 500) return "MOR is unreachable right now. Try again shortly.";
  if (status === 404) return "MOR doesn't recognize this invoice.";
  return "MOR rejected the verification request.";
}
