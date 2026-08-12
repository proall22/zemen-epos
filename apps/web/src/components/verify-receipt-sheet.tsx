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
import { verifyReceipt } from "@/lib/resources";
import { isVerifyEnvelope, type Receipt, type VerifyResponse } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  A: "Accepted",
  C: "Cancelled",
  R: "Rejected",
  P: "Pending",
};

type State =
  | { kind: "loading" }
  | { kind: "ok"; response: VerifyResponse; at: Date }
  | { kind: "error"; message: string };

export interface VerifyReceiptSheetProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export function VerifyReceiptSheet({ receipt, onClose }: VerifyReceiptSheetProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!receipt) return;
    setState({ kind: "loading" });
    let cancelled = false;
    verifyReceipt(receipt.id)
      .then((response) => {
        if (!cancelled) setState({ kind: "ok", response, at: new Date() });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof ApiError
              ? (extractMessage(err.body) ?? friendlyTransport(err.status))
              : "Couldn't reach MOR. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [receipt?.id]);

  return (
    <Sheet
      open={receipt !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        {receipt && (
          <>
            <SheetHeader>
              <div className="flex flex-col gap-1 pr-8">
                <SheetTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-muted-foreground" />
                  Verification
                </SheetTitle>
                <SheetDescription>
                  Receipt #{receipt.receiptCounter}
                  {receipt.rrn ? ` · RRN ${receipt.rrn}` : ""}
                </SheetDescription>
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-6">
              {state.kind === "loading" && <LoadingState />}
              {state.kind === "error" && <ErrorState message={state.message} />}
              {state.kind === "ok" && (
                <OkState receipt={receipt} response={state.response} at={state.at} />
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
                  <RefreshCcw /> Verify again
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
  receipt,
  response,
  at,
}: {
  receipt: Receipt;
  response: VerifyResponse;
  at: Date;
}) {
  const parsed = parseVerify(response);
  const drifted =
    parsed.remoteStatus !== "?" &&
    receipt.eirmsStatus != null &&
    parsed.remoteStatus !== receipt.eirmsStatus;
  const agreement =
    parsed.remoteStatus !== "?" && parsed.remoteStatus === receipt.eirmsStatus;
  const tone = drifted
    ? { Icon: AlertTriangle, color: "text-destructive" }
    : agreement
      ? { Icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" }
      : { Icon: HelpCircle, color: "text-muted-foreground" };
  const Icon = tone.Icon;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Icon className={`size-10 ${tone.color}`} />
        <div className="flex flex-col gap-1">
          <span className="text-sm uppercase tracking-wider text-muted-foreground">
            MOR confirms
          </span>
          <span className="text-2xl font-semibold tracking-tight">
            {parsed.label}
          </span>
        </div>
        <Badge variant={drifted ? "destructive" : agreement ? "success" : "muted"}>
          {drifted
            ? "Out of sync with our records"
            : agreement
              ? "In agreement with our records"
              : "Checked against MOR"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Checked just now at {at.toLocaleTimeString()}.
      </p>

      {parsed.facts.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              What MOR has on file
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              {parsed.facts.map(([label, value]) => (
                <Row key={label} label={label}>
                  {value}
                </Row>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

interface ParsedVerify {
  remoteStatus: string;
  label: string;
  facts: Array<[string, string]>;
}

function parseVerify(response: VerifyResponse): ParsedVerify {
  if (isVerifyEnvelope(response)) {
    const body = (response.body ?? {}) as Record<string, unknown>;
    const status = pickStr(body.Status) ?? "?";
    const facts: Array<[string, string]> = [];
    const num = pickStr(body.ReceiptNumber) ?? pickStr(body.ReceiptNo);
    if (num) facts.push(["Receipt number", num]);
    const rrn = pickStr(body.RRN) ?? pickStr(body.Rrn);
    if (rrn) facts.push(["RRN", rrn]);
    const collected = body.CollectedAmount ?? body.TotalAmount;
    if (typeof collected === "number")
      facts.push(["Collected", collected.toFixed(2)]);
    const seller = pickStr(body.SellerTIN) ?? pickStr(body.SellerTin);
    if (seller) facts.push(["Seller TIN", seller]);
    return {
      remoteStatus: status,
      label: STATUS_LABEL[status] ?? (status === "?" ? response.message : status),
      facts,
    };
  }
  if (response.status === "Error" && /cancel/i.test(response.message)) {
    return { remoteStatus: "C", label: "Cancelled", facts: [] };
  }
  return { remoteStatus: "?", label: response.message, facts: [] };
}

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  if (Array.isArray(obj.message)) return obj.message.join("; ");
  return null;
}

function friendlyTransport(status: number): string {
  if (status === 401 || status === 403) return "Authentication with MOR failed.";
  if (status >= 500) return "MOR is unreachable right now. Try again shortly.";
  if (status === 404) return "MOR doesn't recognize this receipt.";
  if (status === 409) return "This receipt has no MoR reference to verify.";
  return "MOR rejected the verification request.";
}
