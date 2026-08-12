import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCheck,
  CheckCircle2,
  Copy,
  Printer,
  RefreshCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { ErrorCallout } from "@/components/error-callout";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { createReceipt } from "@/lib/resources";
import type { Invoice, Receipt } from "@/lib/types";

type PaymentField =
  | "chequeNumber"
  | "cpoNumber"
  | "documentNumber"
  | "accountNumber"
  | "transactionNumber"
  | "paymentServiceProvider";

interface PaymentMethodSpec {
  value: string;
  label: string;
  fields: PaymentField[];
}

const PAYMENT_METHODS: PaymentMethodSpec[] = [
  { value: "CASH", label: "Cash", fields: [] },
  { value: "CHEQUE", label: "Cheque", fields: ["chequeNumber"] },
  {
    value: "CPO",
    label: "CPO (Cashier's payment order)",
    fields: ["cpoNumber", "paymentServiceProvider"],
  },
  {
    value: "SWIFT",
    label: "SWIFT",
    fields: ["transactionNumber", "accountNumber", "paymentServiceProvider"],
  },
  {
    value: "CARD",
    label: "Card",
    fields: ["transactionNumber", "paymentServiceProvider"],
  },
  {
    value: "WIRE",
    label: "Wire transfer",
    fields: ["transactionNumber", "accountNumber", "paymentServiceProvider"],
  },
  {
    value: "BANK_TRANSFER",
    label: "Bank transfer",
    fields: ["accountNumber", "transactionNumber", "paymentServiceProvider"],
  },
  {
    value: "LETTER_OF_CREDIT",
    label: "Letter of credit",
    fields: ["documentNumber", "paymentServiceProvider"],
  },
];

const PAYMENT_CLASSIFICATIONS: { value: "CASH" | "ADVANCE" | "CREDIT"; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "ADVANCE", label: "Advance" },
  { value: "CREDIT", label: "Credit" },
];

const FIELD_LABELS: Record<PaymentField, string> = {
  chequeNumber: "Cheque number",
  cpoNumber: "CPO number",
  documentNumber: "Document number",
  accountNumber: "Account number",
  transactionNumber: "Transaction number",
  paymentServiceProvider: "Provider",
};

type State =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "success"; receipt: Receipt }
  | { kind: "error"; title: string; items: string[] };

export interface PaymentReceiptSheetProps {
  invoice: Invoice | null;
  onClose: () => void;
  /** Called after a successful payment with the persisted receipt. */
  onPaid: (receipt?: Receipt) => void;
}

export function PaymentReceiptSheet({
  invoice,
  onClose,
  onPaid,
}: PaymentReceiptSheetProps) {
  const due = invoice
    ? Math.max(0, invoice.totalValue - invoice.paidAmount)
    : 0;

  const [state, setState] = useState<State>({ kind: "form" });
  const [manualReceiptNumber, setManualReceiptNumber] = useState("");
  const [reason, setReason] = useState("");
  const [collectedAmount, setCollectedAmount] = useState(due.toFixed(2));
  const [paymentMode, setPaymentMode] = useState<"CASH" | "ADVANCE" | "CREDIT">(
    "CASH",
  );
  const [modeOfPayment, setModeOfPayment] = useState("CASH");
  const [collectorName, setCollectorName] = useState("");
  const [methodFields, setMethodFields] = useState<
    Partial<Record<PaymentField, string>>
  >({});

  const activeMethod =
    PAYMENT_METHODS.find((m) => m.value === modeOfPayment) ?? PAYMENT_METHODS[0];

  function setField(key: PaymentField, value: string) {
    setMethodFields((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setState({ kind: "form" });
    setManualReceiptNumber("");
    setReason("");
    setCollectedAmount(due.toFixed(2));
    setPaymentMode("CASH");
    setModeOfPayment("CASH");
    setCollectorName("");
    setMethodFields({});
  }

  function handleClose() {
    if (state.kind === "success") onPaid(state.receipt);
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    if (!collectorName.trim()) {
      setState({
        kind: "error",
        title: "Please add a collector name.",
        items: [],
      });
      return;
    }
    const amount = Number(collectedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setState({
        kind: "error",
        title: "Enter a valid collected amount.",
        items: [],
      });
      return;
    }
    // Overpayment guard — pre-empt the equivalent server-side check so the
    // cashier sees a fast, contextual error instead of a network round-trip
    // followed by a 409. The 0.01 epsilon matches the server's PAID-flip
    // tolerance so an exact-due payment never trips this check.
    if (amount > due + 0.01) {
      setState({
        kind: "error",
        title: `Collected amount exceeds the remaining due of ${due.toFixed(2)} ${invoice.currency}.`,
        items: [],
      });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const receipt = await createReceipt({
        manualReceiptNumber: manualReceiptNumber || undefined,
        reason: reason || undefined,
        collectedAmount: amount,
        receiptCurrency: invoice.currency,
        invoices: [
          {
            invoiceId: invoice.id,
            paymentCoverage: amount >= due ? "FULL" : "PARTIAL",
            invoicePaidAmount: amount,
            totalAmount: invoice.totalValue,
            remainingAmount: amount >= due ? null : due - amount,
          },
        ],
        transactionDetails: {
          paymentMode,
          modeOfPayment,
          collectorName: collectorName.trim(),
          // Only fields the active method allows are forwarded.
          ...Object.fromEntries(
            activeMethod.fields
              .map((f) => [f, methodFields[f]?.trim() || undefined] as const)
              .filter(([, v]) => v !== undefined),
          ),
        },
      });
      setState({ kind: "success", receipt });
    } catch (err) {
      if (err instanceof ApiError) {
        const items = readUserMessages(err.body);
        const title =
          readApiMessage(err.body) ??
          friendlyTransport(err.status);
        setState({ kind: "error", title, items });
      } else {
        setState({
          kind: "error",
          title: "Something went wrong. Please try again.",
          items: [],
        });
      }
    }
  }

  return (
    <Sheet
      open={invoice !== null}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        {invoice && (
          <>
            <SheetHeader>
              <div className="flex flex-col gap-1 pr-8">
                <SheetTitle className="flex items-center gap-2">
                  <Banknote className="size-5 text-muted-foreground" />
                  Record payment
                </SheetTitle>
                <SheetDescription>
                  Doc #{invoice.documentNumber} ·{" "}
                  {invoice.buyer.legalName}
                </SheetDescription>
              </div>
            </SheetHeader>

            {state.kind === "success" ? (
              <SuccessView
                receipt={state.receipt}
                invoice={invoice}
                onDone={handleClose}
              />
            ) : (
              <>
                <SheetBody className="flex flex-col gap-5">
                  <DueSummary invoice={invoice} due={due} />

                  <form
                    id="record-payment-form"
                    onSubmit={submit}
                    className="flex flex-col gap-4"
                    noValidate
                  >
                    <Field label="Collected amount *">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={collectedAmount}
                          onChange={(e) => setCollectedAmount(e.target.value)}
                          required
                        />
                        <span className="text-sm text-muted-foreground">
                          {invoice.currency}
                        </span>
                      </div>
                      {Number(collectedAmount) < due && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          This will be recorded as a partial payment.
                        </span>
                      )}
                    </Field>

                    <Field label="Payment type *">
                      <Select
                        value={paymentMode}
                        onValueChange={(v) =>
                          setPaymentMode(v as "CASH" | "ADVANCE" | "CREDIT")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_CLASSIFICATIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Payment method *">
                      <Select
                        value={modeOfPayment}
                        onValueChange={setModeOfPayment}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Collector name *">
                      <Input
                        value={collectorName}
                        onChange={(e) => setCollectorName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        required
                      />
                    </Field>

                    {activeMethod.fields.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {activeMethod.fields.map((field) => (
                          <Field key={field} label={FIELD_LABELS[field]}>
                            <Input
                              value={methodFields[field] ?? ""}
                              onChange={(e) =>
                                setField(field, e.target.value)
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    )}

                    <Separator />

                    <Field label="Manual receipt #">
                      <Input
                        value={manualReceiptNumber}
                        onChange={(e) =>
                          setManualReceiptNumber(e.target.value)
                        }
                        placeholder="From your physical receipt book"
                      />
                    </Field>

                    <Field label="Reason / note">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional"
                        rows={2}
                      />
                    </Field>

                    {state.kind === "error" && (
                      <ErrorCallout title={state.title} items={state.items} />
                    )}
                  </form>
                </SheetBody>

                <SheetFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                    disabled={state.kind === "submitting"}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="record-payment-form"
                    disabled={state.kind === "submitting"}
                  >
                    {state.kind === "submitting" ? (
                      <RefreshCcw className="animate-spin" />
                    ) : (
                      <Banknote />
                    )}
                    Record payment
                  </Button>
                </SheetFooter>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DueSummary({
  invoice,
  due,
}: {
  invoice: Invoice;
  due: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Amount due
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {due.toFixed(2)} {invoice.currency}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className="text-muted-foreground">
            Total {invoice.totalValue.toFixed(2)} {invoice.currency}
          </span>
          {invoice.paidAmount > 0 && (
            <span className="text-muted-foreground">
              Paid {invoice.paidAmount.toFixed(2)} {invoice.currency}
            </span>
          )}
          <PaymentStatusBadge status={invoice.paymentStatus} />
        </div>
      </div>
    </div>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: "UNPAID" | "PARTIAL" | "PAID";
}) {
  if (status === "PAID")
    return <Badge variant="success">Paid in full</Badge>;
  if (status === "PARTIAL") return <Badge variant="muted">Partial</Badge>;
  return <Badge variant="outline">Unpaid</Badge>;
}

/**
 * Post-issuance view shown after MOR accepts the receipt. Modelled on the
 * invoice success card: surfaces the receipt counter as a badge, amount as
 * the primary number, RRN and the settled-invoice IRN as copyable fields,
 * QR alongside, and the same action affordances available on the receipt
 * detail (print POS receipt, open detail, jump to the list).
 */
function SuccessView({
  receipt,
  invoice,
  onDone,
}: {
  receipt: Receipt;
  invoice: Invoice;
  onDone: () => void;
}) {
  return (
    <>
      <SheetBody className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-50/60 px-4 py-3 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Payment recorded with MOR
              </span>
              <span className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Receipt persisted &amp; queued for buyer notification.
              </span>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            #{receipt.receiptCounter}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Collected
              </span>
              <span className="text-3xl font-semibold tabular-nums">
                {receipt.collectedAmount.toFixed(2)} {receipt.receiptCurrency}
              </span>
            </div>

            {receipt.rrn && (
              <CopyableField label="RRN" value={receipt.rrn} />
            )}

            <CopyableField label="Invoice IRN" value={invoice.irn} />

            <Separator />

            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Receipt #</dt>
              <dd className="font-mono text-xs">{receipt.receiptNumber}</dd>
              <dt className="text-muted-foreground">Method</dt>
              <dd>{receipt.modeOfPayment ?? "—"}</dd>
              <dt className="text-muted-foreground">Collector</dt>
              <dd>{receipt.collectorName ?? "—"}</dd>
            </dl>
          </div>

          {receipt.signedQR && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                QR
              </span>
              <img
                alt="Receipt QR"
                src={`data:image/png;base64,${receipt.signedQR}`}
                className="size-36 rounded-md border bg-white p-2"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <Button variant="outline" asChild onClick={onDone}>
            <Link to={`/receipts/${receipt.id}`}>
              <Printer /> Open / print POS receipt
            </Link>
          </Button>
          <Button variant="ghost" asChild onClick={onDone}>
            <Link to="/receipts">View all receipts →</Link>
          </Button>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button onClick={onDone}>Done</Button>
      </SheetFooter>
    </>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
          {value}
        </code>
        <SmallCopyButton value={value} />
      </div>
    </div>
  );
}

function SmallCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard denied (insecure context, etc.) — silent */
        }
      }}
    >
      {copied ? (
        <CheckCheck className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function friendlyTransport(status: number): string {
  if (status === 401 || status === 403) return "Authentication with MOR failed.";
  if (status >= 500) return "MOR is unreachable right now. Try again shortly.";
  return "MOR rejected the payment.";
}
