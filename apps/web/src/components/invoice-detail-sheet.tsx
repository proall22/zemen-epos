import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Ban,
  Banknote,
  CheckCheck,
  Copy,
  FileMinus,
  FilePlus,
  Printer,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { CancelInvoiceDialog } from "@/components/cancel-invoice-dialog";
import { InvoiceChain } from "@/components/invoice-chain";
import { IssueMemoSheet, type MemoType } from "@/components/issue-memo-sheet";
import { PaymentReceiptSheet } from "@/components/payment-receipt-sheet";
import { VerifyInvoiceSheet } from "@/components/verify-invoice-sheet";
import { useAuth } from "@/lib/auth";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAckDate,
  nonTaxableSuffix,
} from "@/lib/invoice-types";
import { findReceiptForInvoice } from "@/lib/resources";
import type { Invoice } from "@/lib/types";
import { formatIssuedAt } from "@/lib/invoice-date";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  A: "Accepted",
  C: "Cancelled",
  R: "Rejected",
  P: "Pending",
};

export interface InvoiceDetailSheetProps {
  invoice: Invoice | null;
  onClose: () => void;
  onUpdated: (invoice: Invoice) => void;
  onPaid: () => void;
}

export function InvoiceDetailSheet({
  invoice,
  onClose,
  onUpdated,
  onPaid,
}: InvoiceDetailSheetProps) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [memoType, setMemoType] = useState<MemoType | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  function handleClose() {
    setCancelOpen(false);
    setVerifyOpen(false);
    setPayOpen(false);
    setMemoType(null);
    setReceiptLoading(false);
    setReceiptError(null);
    onClose();
  }

  async function viewReceipt() {
    if (!invoice) return;
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const receipt = await findReceiptForInvoice(invoice.id);
      if (receipt) navigate(`/receipts/${receipt.id}`);
      else setReceiptError("No receipt found for this invoice.");
    } catch (e) {
      setReceiptError((e as Error).message);
    } finally {
      setReceiptLoading(false);
    }
  }

  return (
    <>
      <Sheet
        open={invoice !== null}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <SheetContent side="right">
          {invoice && (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="flex flex-col gap-1">
                    <SheetTitle>
                      Doc #{invoice.documentNumber}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        · counter {invoice.invoiceCounter}
                      </span>
                    </SheetTitle>
                    <SheetDescription>
                      {invoice.documentType} · {invoice.transactionType} ·{" "}
                      {invoice.natureOfSupplies}
                      {invoice.source === "EXTERNAL" && (
                        <>
                          {" · "}
                          <span className="font-medium text-foreground/80">
                            Imported from MoR
                          </span>
                        </>
                      )}
                    </SheetDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={invoice.status} />
                    {invoice.source === "EXTERNAL" && (
                      <Badge variant="outline" className="text-[10px]">
                        External
                      </Badge>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <SheetBody className="flex flex-col gap-6">
                <Section title="IRN">
                  <div className="flex items-start gap-2">
                    <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                      {invoice.irn}
                    </code>
                    <CopyButton value={invoice.irn} />
                  </div>
                </Section>

                <InvoiceChain
                  invoiceId={invoice.id}
                  onOpen={(otherId) => {
                    navigate(`/invoices?open=${otherId}`);
                    onClose();
                  }}
                />

                <div className="grid grid-cols-[auto_1fr] gap-x-6">
                  <div className="flex flex-col items-center gap-2">
                    <img
                      alt="Invoice QR"
                      src={`data:image/png;base64,${invoice.signedQR}`}
                      className="size-40 rounded-md border bg-white p-2"
                    />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      QR
                    </span>
                  </div>
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                    <DetailRow label="Acknowledged">
                      {formatAckDate(invoice.ackDate)}
                    </DetailRow>
                    <DetailRow label="EIRMS status">
                      <span className="font-medium">
                        {STATUS_LABEL[invoice.eirmsStatus] ?? invoice.eirmsStatus}
                      </span>
                    </DetailRow>
                    <DetailRow label="Cashier">{invoice.cashierName}</DetailRow>
                    <DetailRow label="Salesperson">
                      {invoice.salespersonName}
                    </DetailRow>
                    <DetailRow label="Payment">
                      {invoice.paymentMode} · {invoice.paymentTerm}
                    </DetailRow>
                    <DetailRow label="Issued (MoR)">
                      {formatIssuedAt(invoice)}
                    </DetailRow>
                  </dl>
                </div>

                <Section title="Buyer">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <DetailRow label="Legal name">
                      {invoice.buyer.legalName}
                    </DetailRow>
                    <DetailRow label="TIN">{invoice.buyer.tin}</DetailRow>
                    {invoice.buyer.vatNumber && (
                      <DetailRow label="VAT">
                        {invoice.buyer.vatNumber}
                      </DetailRow>
                    )}
                    {invoice.buyer.email && (
                      <DetailRow label="Email">{invoice.buyer.email}</DetailRow>
                    )}
                    {invoice.buyer.phone && (
                      <DetailRow label="Phone">{invoice.buyer.phone}</DetailRow>
                    )}
                    {(invoice.buyer.city || invoice.buyer.region) && (
                      <DetailRow label="Address">
                        {[
                          invoice.buyer.city,
                          invoice.buyer.zone,
                          invoice.buyer.wereda,
                          invoice.buyer.kebele,
                          invoice.buyer.region,
                          invoice.buyer.country,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </DetailRow>
                    )}
                  </dl>
                </Section>

                <Section title={`Items (${invoice.items.length})`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.lineNumber}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {item.description}
                                {nonTaxableSuffix(item.taxCode)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {item.itemCode}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.unitPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.taxAmount.toFixed(2)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {item.taxCode}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {item.totalAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex flex-col items-end gap-1 text-sm tabular-nums">
                    <Total label="Pre-tax">
                      {invoice.preTaxValue.toFixed(2)} {invoice.currency}
                    </Total>
                    <Total label="Tax">
                      {invoice.taxValue.toFixed(2)} {invoice.currency}
                    </Total>
                    {invoice.withholdValue > 0 && (
                      <Total label="Income withhold">
                        {invoice.withholdValue.toFixed(2)} {invoice.currency}
                      </Total>
                    )}
                    <Total emphasized label="Total">
                      {invoice.totalValue.toFixed(2)} {invoice.currency}
                    </Total>
                  </div>
                </Section>

                {invoice.cancellation && (
                  <Section title="Cancellation">
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                      <DetailRow label="Reason code">
                        {invoice.cancellation.reasonCode}
                      </DetailRow>
                      {invoice.cancellation.remark && (
                        <DetailRow label="Remark">
                          {invoice.cancellation.remark}
                        </DetailRow>
                      )}
                      <DetailRow label="Cancelled at">
                        {new Date(
                          invoice.cancellation.createdAt,
                        ).toLocaleString()}
                      </DetailRow>
                    </dl>
                  </Section>
                )}
              </SheetBody>

              <SheetFooter className="flex-wrap gap-2">
                {receiptError && (
                  <p className="w-full text-xs text-destructive">
                    {receiptError}
                  </p>
                )}
                <Button variant="ghost" onClick={handleClose}>
                  Close
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/invoices/${invoice.id}`}>
                    <Printer /> Print
                  </Link>
                </Button>
                {invoice.paymentStatus === "PAID" && (
                  // CRE/DEB memos can carry a payment receipt too (debit
                  // memos collect an additional amount, credit memos record
                  // the offset). The backend doesn't filter receipts by
                  // documentType, so the affordance is available regardless.
                  <Button
                    variant="outline"
                    onClick={viewReceipt}
                    disabled={receiptLoading}
                  >
                    <ReceiptText />{" "}
                    {receiptLoading ? "Finding…" : "View receipt"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setVerifyOpen(true)}>
                  <ShieldCheck /> Verify
                </Button>
                {invoice.status === "ACCEPTED" && can("invoice.create") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setMemoType("CRE")}
                      title="Credit memo. Backend + MoR enforce whether this specific document may be amended."
                    >
                      <FileMinus /> Credit memo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setMemoType("DEB")}
                      title="Debit memo. Backend + MoR enforce whether this specific document may be amended."
                    >
                      <FilePlus /> Debit memo
                    </Button>
                  </>
                )}
                {invoice.status === "ACCEPTED" && can("receipt.create") && (
                  <Button
                    onClick={() => setPayOpen(true)}
                    className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
                  >
                    <Banknote /> Record payment
                  </Button>
                )}
                {can("invoice.update") && (
                  <Button
                    variant="destructive"
                    onClick={() => setCancelOpen(true)}
                    disabled={invoice.status === "CANCELLED"}
                  >
                    <Ban /> Cancel
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CancelInvoiceDialog
        invoice={cancelOpen ? invoice : null}
        onClose={() => setCancelOpen(false)}
        onCancelled={(updated) => {
          setCancelOpen(false);
          onUpdated(updated);
        }}
      />

      <VerifyInvoiceSheet
        invoice={verifyOpen ? invoice : null}
        onClose={() => setVerifyOpen(false)}
      />

      <PaymentReceiptSheet
        invoice={payOpen ? invoice : null}
        onClose={() => setPayOpen(false)}
        onPaid={() => {
          setPayOpen(false);
          onPaid();
        }}
      />

      <IssueMemoSheet
        type={memoType}
        invoice={memoType ? invoice : null}
        onClose={() => setMemoType(null)}
      />
    </>
  );
}

function StatusBadge({ status }: { status: "ACCEPTED" | "CANCELLED" }) {
  return status === "ACCEPTED" ? (
    <Badge variant="success">Accepted</Badge>
  ) : (
    <Badge variant="destructive">Cancelled</Badge>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {children}
      <Separator />
    </section>
  );
}

function DetailRow({
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

function Total({
  label,
  emphasized,
  children,
}: {
  label: string;
  emphasized?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(emphasized && "text-base")}>
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn(emphasized ? "font-semibold" : "font-medium")}>
        {children}
      </span>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
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
          /* noop */
        }
      }}
    >
      {copied ? <CheckCheck /> : <Copy />}
    </Button>
  );
}
