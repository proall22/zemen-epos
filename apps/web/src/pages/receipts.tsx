import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Banknote,
  Eye,
  Percent,
  Printer,
  ReceiptText,
  RefreshCw,
} from "lucide-react";

import { FindInvoiceByIrnDialog } from "@/components/find-invoice-by-irn-dialog";
import { PaymentReceiptSheet } from "@/components/payment-receipt-sheet";
import { ReceiptDetailSheet } from "@/components/receipt-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { getReceipt, listReceipts, type DocumentFilters } from "@/lib/resources";
import { ScopeToggle, useListScope } from "@/components/scope-toggle";
import {
  DocumentFilterBar,
  PageFooter,
} from "@/components/document-filter-bar";
import type { Invoice, Receipt } from "@/lib/types";
import { formatReceiptIssuedAt } from "@/lib/invoice-date";

export function ReceiptsPage() {
  const { can } = useAuth();
  const canRecord = can("receipt.create");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Two-stage flow for the "record payment by IRN" action:
  //   1) `findOpen` shows the IRN dialog
  //   2) once resolved, `payingInvoice` is set, which opens the standard
  //      PaymentReceiptSheet — same UI as the invoice-detail entry point.
  const { t } = useTranslation();
  const [findOpen, setFindOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [scope, setScope] = useListScope("eirms:list-scope:receipts");
  // Receipts have no payment status of their own; the meaningful axis is
  // sales vs withholding, so the status control drives `kind`.
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
    if (receipts.some((receipt) => receipt.id === openId)) {
      setActiveId(openId);
      return;
    }
    void getReceipt(openId)
      .then((receipt) => {
        setReceipts((current) => current.some((item) => item.id === receipt.id) ? current : [receipt, ...current]);
        setActiveId(receipt.id);
      })
      .catch((error: Error) => setError(error.message));
  }, [searchParams, receipts, setSearchParams]);

  useEffect(() => {
    void refresh();
  }, [scope, filters]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const page = await listReceipts({ ...filters, scope });
      setReceipts(page.items);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await listReceipts({ ...filters, scope, cursor: nextCursor });
      setReceipts((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const active = receipts.find((r) => r.id === activeId) ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Receipts
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Payment receipts
          </h1>
          <p className="text-sm text-muted-foreground">
            Receipts filed with MOR. Click a row for the full details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle scope={scope} onChange={setScope} />
          {canRecord && (
            <Button size="sm" onClick={() => setFindOpen(true)}>
              <Banknote />
              Record payment
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>
            {total} receipt{total === 1 ? "" : "s"}
          </CardTitle>
          <DocumentFilterBar
            value={{ ...filters, status: filters.kind }}
            onChange={(next) =>
              setFilters({
                ...next,
                status: undefined,
                kind: next.status as "SALES" | "WITHHOLD" | undefined,
              })
            }
            searchPlaceholder={t("filters.searchReceipts")}
            statusLabel={t("filters.kind")}
            statuses={[
              { value: "SALES", label: t("filters.kindSales") },
              { value: "WITHHOLD", label: t("filters.kindWithhold") },
            ]}
          />
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive">Failed to load: {error}</p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No receipts yet. Open an invoice and tap{" "}
              <span className="font-medium">Record payment</span> to file one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead>Collected by</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setActiveId(r.id)}
                  >
                    <TableCell className="text-sm" title="Time the receipt was filed with MoR">
                      {formatReceiptIssuedAt(r)}
                    </TableCell>
                    <TableCell>
                      {r.kind === "WITHHOLD" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Percent className="size-3.5 text-muted-foreground" />
                          Withhold
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <ReceiptText className="size-3.5 text-muted-foreground" />
                          Sales
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">
                          {r.receiptNumber.slice(0, 12)}…
                        </span>
                        {r.manualReceiptNumber && (
                          <span className="text-xs text-muted-foreground">
                            Manual #{r.manualReceiptNumber}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {r.invoices.map((line) => (
                          <span key={line.id} className="text-sm">
                            <Link
                              to={`/invoices/${line.invoice.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-primary hover:underline"
                            >
                              #{line.invoice.documentNumber}
                            </Link>{" "}
                            ·{" "}
                            <span className="text-muted-foreground">
                              {line.invoice.buyer.legalName}
                            </span>
                            {line.paymentCoverage === "PARTIAL" && (
                              <Badge variant="muted" className="ml-2">
                                Partial
                              </Badge>
                            )}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{r.collectorName ?? "—"}</TableCell>
                    <TableCell>{r.modeOfPayment ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.collectedAmount.toFixed(2)} {r.receiptCurrency}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveId(r.id)}
                      >
                        <Eye />
                        Details
                      </Button>
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to={`/receipts/${r.id}`}>
                          <Printer />
                          Receipt
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
                  <PageFooter
            shown={receipts.length}
            total={total}
            hasMore={Boolean(nextCursor)}
            loading={loading}
            onMore={loadMore}
          />
        </CardContent>
      </Card>

      <ReceiptDetailSheet
        receipt={active}
        onClose={() => setActiveId(null)}
      />

      <FindInvoiceByIrnDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onFound={(invoice) => {
          // Close the lookup dialog and immediately open the standard
          // payment-receipt sheet against the resolved invoice. The sheet
          // will refuse a cancelled / fully-paid invoice itself, so we
          // don't pre-validate here.
          setFindOpen(false);
          setPayingInvoice(invoice);
        }}
      />

      <PaymentReceiptSheet
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onPaid={() => {
          // Refresh so the freshly-filed receipt shows up at the top of the
          // list. `onPaid` fires only on close-after-success, so this is
          // also the right place to clear the sheet state.
          setPayingInvoice(null);
          void refresh();
        }}
      />
    </div>
  );
}
