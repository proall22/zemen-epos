import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCheck,
  Copy,
  FileMinus,
  FilePlus,
  Loader2,
  Plus,
  X,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ApiError, api } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { isPlaceholderTin, nonTaxableSuffix } from "@/lib/invoice-types";
import type { Invoice } from "@/lib/types";

export type MemoType = "CRE" | "DEB";

const MEMO_LABEL: Record<
  MemoType,
  { title: string; verb: string; icon: typeof FileMinus }
> = {
  CRE: { title: "Credit memo", verb: "credit", icon: FileMinus },
  DEB: { title: "Debit memo", verb: "debit", icon: FilePlus },
};

interface MemoLine {
  sourceId: string; // original invoice line this came from
  /** Original LineNumber from the invoice we're amending. MoR requires that
   *  a memo's changed line carries the **same** LineNumber as the
   *  corresponding line on the original invoice — sequential 1,2,3… on the
   *  memo would silently break MoR-side reconciliation. */
  lineNumber: number;
  itemCode: string;
  description: string;
  unit: string;
  /** Correction quantity to send to MoR. Zero = this line isn't part of the
   *  memo. For a return of N units, this is N. For a per-unit price fix on
   *  M units, this is M. */
  quantity: number;
  /** Correction unit price. For a return, this is the original unit price
   *  (use the "Use original price" shortcut). For a price fix, this is the
   *  per-unit *difference*, not the corrected-to price. */
  unitPrice: number;
  discount: number;
  taxCode: string;
  taxRate: number; // derived from original line: taxAmount / preTaxValue
  /** Ad-valorem excise rate carried from the original invoice's rawRequest
   *  so the memo bill excise on the corrected portion matches MoR's
   *  registry (which is what the original invoice was validated against). */
  exciseRate: number;
  /** Carried from the original invoice's rawRequest so a memo with excise
   *  can name the same HC MoR already recorded. */
  harmonizationCode: string | null;
  inventoryItemId: string | null;
  /** Original invoice values retained for the "Orig" reference chip and the
   *  "Use original price" shortcut. Never sent to MoR. */
  originalQuantity: number;
  originalUnitPrice: number;
  /** True once the cashier has clicked "+ Add to memo" on this line. Lines
   *  that stay `false` (or are added and then removed) are collapsed to a
   *  one-row chip and never flow into the outbound payload. */
  included: boolean;
}

export interface IssueMemoSheetProps {
  type: MemoType | null;
  invoice: Invoice | null;
  onClose: () => void;
}

export function IssueMemoSheet({ type, invoice, onClose }: IssueMemoSheetProps) {
  const navigate = useNavigate();
  const [lines, setLines] = useState<MemoLine[]>([]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  useEffect(() => {
    if (!invoice) return;
    // Recover HarmonizationCode + excise rate MoR recorded on each original
    // line so the memo re-applies the same rate on any correction. Reading
    // rate from rawRequest (not from the item's current setting) means the
    // memo agrees with the invoice it amends even if the catalog changed.
    const hcByLine = new Map<number, string>();
    const exciseRateByLine = new Map<number, number>();
    for (const l of invoice.rawRequest?.ItemList ?? []) {
      const ln = Number(l.LineNumber);
      if (!Number.isFinite(ln)) continue;
      const hc = typeof l.HarmonizationCode === "string" ? l.HarmonizationCode.trim() : "";
      if (hc) hcByLine.set(ln, hc);
      const origExcise = Number(l.ExciseTaxValue) || 0;
      const origQty = Number(l.Quantity) || 0;
      const origUnitPrice = Number(l.UnitPrice) || 0;
      if (origExcise > 0 && origQty > 0 && origUnitPrice > 0) {
        exciseRateByLine.set(ln, (origExcise / (origQty * origUnitPrice)) * 100);
      }
    }
    // Correction-only memos: every line starts at zero on the memo side.
    // The cashier enters the DIFFERENCE — how many units to correct and at
    // what per-unit amount — for the line(s) that need adjustment. Untouched
    // lines are dropped from the payload entirely.
    setLines(
      invoice.items.map((line) => ({
        sourceId: line.id,
        lineNumber: line.lineNumber,
        itemCode: line.itemCode,
        description: line.description,
        unit: line.unit,
        quantity: 0,
        unitPrice: 0,
        discount: 0,
        taxCode: line.taxCode,
        taxRate:
          line.preTaxValue > 0 ? (line.taxAmount / line.preTaxValue) * 100 : 0,
        exciseRate: exciseRateByLine.get(line.lineNumber) ?? 0,
        harmonizationCode: hcByLine.get(line.lineNumber) ?? null,
        inventoryItemId: line.inventoryItemId,
        originalQuantity: line.quantity,
        originalUnitPrice: line.unitPrice,
        included: false,
      })),
    );
    setReason("");
    setError(null);
  }, [invoice?.id]);

  function isChanged(line: MemoLine): boolean {
    // A line lands in the outbound ItemList only when the cashier has (a)
    // clicked "+ Add to memo" AND (b) entered a non-zero correction. Rule
    // (b) drops accidental empty additions on the floor so MoR never sees
    // a 0/0/0 line — those trigger a "Calculation accuracy error" upstream.
    if (!line.included) return false;
    return line.quantity > 0 || line.discount > 0;
  }

  function includeLine(idx: number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, included: true } : l)),
    );
  }

  function excludeLine(idx: number) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              included: false,
              quantity: 0,
              unitPrice: 0,
              discount: 0,
            }
          : l,
      ),
    );
  }

  const changedLines = useMemo(() => lines.filter(isChanged), [lines, invoice?.id]);
  const changedCount = changedLines.length;

  // ValueDetails must match the ItemList we send. The API filters CRE/DEB
  // ItemLists to changed lines only (per MoR — see LLD §5.4.4), so the SPA
  // sums those same lines into ValueDetails. Otherwise MoR rejects with a
  // "Calculation accuracy error" because expected (recomputed from the
  // filtered ItemList) doesn't match received.
  const totals = useMemo(() => {
    let preTax = 0;
    let tax = 0;
    let discount = 0;
    let excise = 0;
    for (const line of changedLines) {
      const sub = line.quantity * line.unitPrice;
      const taxable = Math.max(0, sub - line.discount);
      const lineExcise = sub * (line.exciseRate / 100);
      preTax += taxable;
      discount += line.discount;
      excise += lineExcise;
      // MoR includes excise in the taxable base.
      tax += (taxable + lineExcise) * (line.taxRate / 100);
    }
    return {
      preTax: round2(preTax),
      tax: round2(tax),
      discount: round2(discount),
      excise: round2(excise),
      total: round2(preTax + tax + excise),
    };
  }, [changedLines]);

  // Diff-only memos: the ValueDetails carry the correction amount itself.
  // Rules:
  //   • Total > 0 (both CRE and DEB) — a zero-value memo is a no-op.
  //   • CRE ≤ original.totalValue (envelope) — refund can't exceed billed.
  //   • CRE per line ≤ original line total — catches "return 15 of 10"
  //     where the envelope passes because the cashier touched only one
  //     line of several.
  // DEB has no upper bound (an additional charge can be any positive
  // amount). MoR is the authority on anything stricter.
  const amountRuleError = useMemo(() => {
    if (!type || !invoice || changedLines.length === 0) return null;
    if (totals.total <= 0) {
      return `${type === "CRE" ? "Credit" : "Debit"} memo total must be greater than zero — enter the correction quantity and unit price on the affected line(s).`;
    }
    if (type === "CRE") {
      if (totals.total > invoice.totalValue) {
        return `Credit memo total (${totals.total.toFixed(2)} ${invoice.currency}) exceeds the original invoice total (${invoice.totalValue.toFixed(2)} ${invoice.currency}). A CRE refunds against what was charged — double-check the qty × unit price.`;
      }
      for (const line of changedLines) {
        const sub = line.quantity * line.unitPrice;
        const taxable = Math.max(0, sub - line.discount);
        const lineExcise = sub * (line.exciseRate / 100);
        const taxAmt = (taxable + lineExcise) * (line.taxRate / 100) + lineExcise;
        const lineTotal = taxable + taxAmt;
        const orig = invoice.items.find((it) => it.id === line.sourceId);
        if (!orig) continue;
        if (lineTotal > orig.totalAmount) {
          return `Line ${line.lineNumber} correction (${lineTotal.toFixed(2)} ${invoice.currency}) exceeds the original line total (${orig.totalAmount.toFixed(2)} ${invoice.currency}). A CRE can't refund more than was billed on that line.`;
        }
      }
    }
    return null;
  }, [type, invoice, totals.total, changedLines]);

  function setLine(index: number, patch: Partial<MemoLine>) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  }

  async function submit() {
    if (!invoice || !type) return;
    if (changedCount === 0) {
      setError({
        title:
          'Add at least one line to the memo ("+ Add to memo") and enter its correction quantity and unit price.',
        items: [],
      });
      return;
    }
    if (amountRuleError) {
      setError({ title: amountRuleError, items: [] });
      return;
    }
    const missingHc = changedLines.filter(
      (l) => l.exciseRate > 0 && !l.harmonizationCode,
    );
    if (missingHc.length > 0) {
      setError({
        title: "Harmonization code missing on excise line.",
        items: missingHc.map(
          (l) =>
            `Line ${l.lineNumber} (${l.description}) — the original invoice didn't record a harmonization code, so an excise correction can't be issued from this UI.`,
        ),
      });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // The cashier's edits cover the whole document, but per MoR the memo
      // ItemList should carry only the lines that actually changed — and each
      // changed line must retain its **original** LineNumber so MoR can
      // reconcile against the invoice it amends. The backend filters by the
      // `changed` flag before forwarding to EIRMS; this map keeps the
      // bookkeeping straight.
      const itemList = lines.map((line) => {
        const sub = line.quantity * line.unitPrice;
        const preTax = Math.max(0, sub - line.discount);
        const lineExcise = round2(sub * (line.exciseRate / 100));
        // MoR's line TaxAmount is total tax on the line — VAT on the
        // extended (PreTax + Excise) base + the excise itself. Then
        // TotalLineAmount = PreTax + TaxAmount.
        const lineVat = (preTax + lineExcise) * (line.taxRate / 100);
        const taxAmt = round2(lineVat + lineExcise);
        return {
          LineNumber: line.lineNumber,
          ItemCode: line.itemCode,
          ProductDescription: line.description,
          NatureOfSupplies: invoice.natureOfSupplies as "goods" | "service",
          Unit: line.unit,
          Quantity: line.quantity,
          UnitPrice: line.unitPrice,
          Discount: round2(line.discount),
          ExciseTaxValue: lineExcise,
          TaxCode: line.taxCode,
          TaxAmount: taxAmt,
          PreTaxValue: round2(preTax),
          TotalLineAmount: round2(preTax + taxAmt),
          HarmonizationCode: line.harmonizationCode ?? null,
          inventoryItemId: line.inventoryItemId ?? undefined,
          changed: isChanged(line),
        };
      });

      // MoR enforces a strict equality check on the memo's BuyerDetails
      // against the original invoice (error 7030: "Buyer phone does not
      // match", and similar field-named variants). Re-deriving the buyer
      // from the stored `Buyer` row at memo time risks drift — the server's
      // `normaliseBuyerForMor` default-injects `IdType: 'NID'`, skips empty
      // strings, and the JSON key order would differ from the original.
      // So when the original's request body is on hand (it is, for every
      // invoice persisted post-rawRequest support), forward those bytes
      // verbatim. Fall back to the re-derived shape only for legacy rows
      // where rawRequest is null.
      const storedBuyer = invoice.rawRequest?.BuyerDetails ?? null;
      const buyerDetails: Record<string, unknown> = storedBuyer
        ? { ...storedBuyer }
        : (() => {
            // Walk-in originals carry the local "WALKIN" sentinel as their
            // TIN — strip it before forwarding so MOR doesn't try to look
            // it up. Real TINs flow through unchanged.
            const buyerTin = isPlaceholderTin(invoice.buyer.tin)
              ? undefined
              : invoice.buyer.tin;
            return {
              Tin: buyerTin,
              LegalName: invoice.buyer.legalName,
              Email: invoice.buyer.email ?? undefined,
              Phone: invoice.buyer.phone ?? undefined,
              VatNumber: invoice.buyer.vatNumber ?? undefined,
              HouseNumber: invoice.buyer.houseNumber ?? undefined,
              IdType: invoice.buyer.idType ?? undefined,
              IdNumber: invoice.buyer.idNumber ?? undefined,
              Region: invoice.buyer.region ?? undefined,
              Country: invoice.buyer.country ?? undefined,
              Zone: invoice.buyer.zone ?? undefined,
              Kebele: invoice.buyer.kebele ?? undefined,
              Wereda: invoice.buyer.wereda ?? undefined,
              City: invoice.buyer.city ?? undefined,
            };
          })();
      const payload = {
        TransactionType: invoice.transactionType,
        BuyerDetails: buyerDetails,
        DocumentDetails: {
          DocumentNumber: "",
          Date: nowEirmsDate(),
          Type: type,
          // EIRMS schema requires Reason on credit/debit notes; falls back to a
          // generic phrase so the call doesn't bounce when the cashier skipped
          // the optional note.
          Reason:
            reason.trim() ||
            (type === "CRE"
              ? "Credit issued against original invoice"
              : "Debit issued against original invoice"),
        },
        ItemList: itemList,
        PaymentDetails: {
          Mode: invoice.paymentMode,
          PaymentTerm: invoice.paymentTerm,
        },
        ReferenceDetails: {
          PreviousIrn: "",
          RelatedDocument: invoice.irn,
        },
        ValueDetails: {
          Discount: totals.discount > 0 ? totals.discount : null,
          ExciseValue: totals.excise,
          TaxValue: round2(
            itemList
              .filter((l) => l.changed)
              .reduce((s, l) => s + l.TaxAmount, 0),
          ),
          IncomeWithholdValue: 0,
          TransactionWithholdValue: 0,
          TotalValue: totals.total,
          InvoiceCurrency: invoice.currency,
        },
        SourceSystem: {
          CashierName: invoice.cashierName,
          SalesPersonName: invoice.salespersonName,
          InvoiceCounter: 1, // backend overrides
        },
      };

      const created = await api<Invoice>("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onClose();
      navigate(`/invoices/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title:
            readApiMessage(err.body) ??
            `Couldn't issue this ${MEMO_LABEL[type].title.toLowerCase()}.`,
          items: readUserMessages(err.body),
        });
      } else {
        setError({
          title: "Couldn't reach the server. Please try again.",
          items: [],
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!type) return null;
  const meta = MEMO_LABEL[type];
  const Icon = meta.icon;

  return (
    <Sheet
      open={invoice !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-xl">
        {invoice && (
          <>
            <SheetHeader>
              <div className="flex flex-col gap-1 pr-8">
                <SheetTitle className="flex items-center gap-2">
                  <Icon className="size-5 text-muted-foreground" />
                  Issue {meta.title.toLowerCase()}
                </SheetTitle>
                <SheetDescription>
                  Against doc{" "}
                  <span className="font-mono">#{invoice.documentNumber}</span>
                  {" · "}
                  {invoice.buyer.legalName}
                </SheetDescription>
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-5">
              {/* Surface the parent invoice's IRN so the cashier can
               *  confirm — and copy for support — exactly which MoR
               *  document this memo is being issued against. */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Related invoice IRN
                </span>
                <div className="flex items-start gap-2">
                  <code className="flex-1 break-all rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs">
                    {invoice.irn}
                  </code>
                  <CopyButton value={invoice.irn} />
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                <p>
                  Click <span className="font-semibold text-foreground">"+ Add to memo"</span> on the line(s) needing a correction, then enter <span className="font-semibold text-foreground">only the difference</span> — the qty × unit price sent to MoR is the correction amount, not the corrected-to values.
                </p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>
                    Return of 1 defective item (originally 10 × 100 ETB) → Qty <span className="font-mono">1</span>, Unit price <span className="font-mono">100</span>.
                  </li>
                  <li>
                    Over-charged 2 items by 10 ETB each → Qty <span className="font-mono">2</span>, Unit price <span className="font-mono">10</span>.
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Items ({changedCount} in memo)
                </Label>
                {lines.map((line, idx) => {
                  const sub = line.quantity * line.unitPrice;
                  const taxable = Math.max(0, sub - line.discount);
                  const lineExcise = sub * (line.exciseRate / 100);
                  const taxAmt = (taxable + lineExcise) * (line.taxRate / 100) + lineExcise;
                  const lineTotal = taxable + taxAmt;
                  const contributes = isChanged(line);

                  if (!line.included) {
                    return (
                      <div
                        key={line.sourceId}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {line.description}
                            {nonTaxableSuffix(line.taxCode)}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {line.itemCode}
                            <span className="ml-2 text-[11px]">
                              Orig{" "}
                              <span className="tabular-nums">
                                {line.originalQuantity}
                              </span>{" "}
                              ×{" "}
                              <span className="tabular-nums">
                                {line.originalUnitPrice.toFixed(2)}
                              </span>{" "}
                              {invoice.currency}
                            </span>
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => includeLine(idx)}
                          className="shrink-0"
                        >
                          <Plus /> Add to memo
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={line.sourceId}
                      className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {line.description}
                            {nonTaxableSuffix(line.taxCode)}
                            {contributes && (
                              <Badge variant="default">Correcting</Badge>
                            )}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {line.itemCode}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Orig{" "}
                            <span className="font-mono tabular-nums">
                              {line.originalQuantity}
                            </span>{" "}
                            ×{" "}
                            <span className="font-mono tabular-nums">
                              {line.originalUnitPrice.toFixed(2)}
                            </span>{" "}
                            {invoice.currency}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => excludeLine(idx)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Remove line from memo"
                        >
                          <X />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Qty
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={line.quantity || ""}
                            onChange={(e) =>
                              setLine(idx, {
                                quantity: Number(e.target.value) || 0,
                              })
                            }
                            className="h-8"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Unit price</span>
                            <button
                              type="button"
                              onClick={() =>
                                setLine(idx, {
                                  unitPrice: line.originalUnitPrice,
                                })
                              }
                              className="text-[9px] font-medium uppercase tracking-wider text-[#5700FF] hover:underline"
                            >
                              Use orig
                            </button>
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={line.unitPrice || ""}
                            onChange={(e) =>
                              setLine(idx, {
                                unitPrice: Number(e.target.value) || 0,
                              })
                            }
                            className="h-8"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Discount
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={line.discount || ""}
                            onChange={(e) =>
                              setLine(idx, {
                                discount: Number(e.target.value) || 0,
                              })
                            }
                            className="h-8"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end text-xs">
                        <span className="text-muted-foreground">
                          Correction{" "}
                        </span>
                        <span className="ml-1 font-medium tabular-nums">
                          {lineTotal.toFixed(2)} {invoice.currency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Reason / note
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Optional. Why are you ${meta.verb}ing this invoice?`}
                  rows={2}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 text-sm tabular-nums">
                <Row label="Correction subtotal">
                  {totals.preTax.toFixed(2)} {invoice.currency}
                </Row>
                {totals.discount > 0 && (
                  <Row label="Discount">
                    −{totals.discount.toFixed(2)} {invoice.currency}
                  </Row>
                )}
                <Row label="Tax">
                  {totals.tax.toFixed(2)} {invoice.currency}
                </Row>
                <Row label={`${type === "CRE" ? "Credit" : "Debit"} total`} emphasized>
                  {totals.total.toFixed(2)} {invoice.currency}
                </Row>
                <Row label="Original invoice (reference)">
                  {invoice.totalValue.toFixed(2)} {invoice.currency}
                </Row>
              </div>

              {amountRuleError && (
                <p className="text-sm text-destructive">{amountRuleError}</p>
              )}

              {error && <ErrorCallout title={error.title} items={error.items} />}
            </SheetBody>

            <SheetFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={
                  submitting ||
                  changedCount === 0 ||
                  amountRuleError !== null
                }
                className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Icon />}
                Issue {meta.title.toLowerCase()}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  emphasized,
  children,
}: {
  label: string;
  emphasized?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        emphasized
          ? "flex items-baseline justify-between border-t pt-1 text-base"
          : "flex items-baseline justify-between"
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasized ? "font-semibold" : "font-medium"}>
        {children}
      </span>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nowEirmsDate(): string {
  // EIRMS expects DD-MM-YYYYTHH:mm:ss; the backend re-stamps memos in UTC, so
  // this is just a placeholder the server overrides.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Local copy-to-clipboard button — mirrors the pattern used in
 *  invoice-detail-sheet, receipt-detail-sheet, and invoice-result. */
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
          /* clipboard denied (insecure context) — silent */
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
