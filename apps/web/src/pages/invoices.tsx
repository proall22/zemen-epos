import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { CloudUpload, Eye, FileSearch, FileText, RefreshCw, Trash2 } from "lucide-react";

import { CheckExternalInvoiceDialog } from "@/components/check-external-invoice-dialog";
import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InvoiceDetailSheet } from "@/components/invoice-detail-sheet";
import { ScopeToggle, useListScope } from "@/components/scope-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import {
  deleteInvoiceDraft,
  listInvoiceDrafts,
  getInvoice,
  listInvoices,
  type DocumentFilters,
  syncInvoiceDraft,
} from "@/lib/resources";
import {
  DocumentFilterBar,
  PageFooter,
} from "@/components/document-filter-bar";
import { DRAFTS_ENABLED } from "@/lib/feature-flags";
import type { Invoice, InvoiceDraft } from "@/lib/types";
import { formatIssuedAt } from "@/lib/invoice-date";

export function InvoicesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canSync = can("invoice.create");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftActionId, setDraftActionId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [scope, setScope] = useListScope("eirms:list-scope:invoices");
  const [filters, setFilters] = useState<DocumentFilters>(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    return status ? { status } : {};
  });
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    void refresh();
  }, [scope, filters]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
    // If the requested invoice isn't in the current list (e.g. it's a memo
    // under a different scope), fetch it directly and stitch into state so
    // the detail sheet can render.
    if (invoices.some((inv) => inv.id === openId)) {
      setActiveId(openId);
      return;
    }
    void getInvoice(openId)
      .then((fetched) => {
        setInvoices((prev) =>
          prev.some((x) => x.id === fetched.id) ? prev : [fetched, ...prev],
        );
        setActiveId(openId);
      })
      .catch((e: Error) => setError(e.message));
  }, [searchParams, invoices]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [page, dr] = await Promise.all([
        listInvoices({ ...filters, scope }),
        canSync && DRAFTS_ENABLED ? listInvoiceDrafts() : Promise.resolve([]),
      ]);
      setInvoices(page.items);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      setDrafts(dr);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /** Appends rather than replaces — "load more" must not lose what's shown. */
  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await listInvoices({ ...filters, scope, cursor: nextCursor });
      setInvoices((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function replaceInvoice(updated: Invoice) {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv)),
    );
  }

  async function onSync(id: string) {
    setDraftActionId(id);
    setDraftError(null);
    try {
      const created = await syncInvoiceDraft(id);
      // Move the draft → invoices list locally so the table updates
      // before the next refresh.
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setInvoices((prev) => [created, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) {
        setDraftError(
          readApiMessage(err.body) ??
            "Couldn't sync this draft — MOR may still be unreachable.",
        );
      } else {
        setDraftError("Couldn't reach the server.");
      }
      // Re-fetch the draft row so its updated status (SYNC_FAILED + lastError)
      // shows up in the list.
      void refresh();
    } finally {
      setDraftActionId(null);
    }
  }

  async function onDelete(id: string) {
    if (
      !window.confirm(
        "Discard this draft? It will not be sent to MOR.",
      )
    ) {
      return;
    }
    setDraftActionId(id);
    setDraftError(null);
    try {
      await deleteInvoiceDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      if (err instanceof ApiError) {
        setDraftError(
          readApiMessage(err.body) ?? "Couldn't discard this draft.",
        );
      } else {
        setDraftError("Couldn't reach the server.");
      }
    } finally {
      setDraftActionId(null);
    }
  }

  const active = invoices.find((inv) => inv.id === activeId) ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            EIRMS&times;Zemen-ePos · Invoices
          </p>
          <h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            {t("invoices.header.title")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t("invoices.header.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle scope={scope} onChange={setScope} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCheckOpen(true)}
          >
            <FileSearch />
            {t("invoices.checkInvoice")}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw />
            {t("common.refresh")}
          </Button>
        </div>
      </header>

      {DRAFTS_ENABLED && drafts.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-amber-900 dark:text-amber-200">
                {t("invoices.drafts.pending", { count: drafts.length })}
              </CardTitle>
              <span className="text-xs text-amber-800/80 dark:text-amber-200/70">
                {t("invoices.drafts.explainer")}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {draftError && (
              <ErrorCallout title={draftError} items={[]} />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices.columns.saved")}</TableHead>
                  <TableHead>{t("invoices.columns.provisional")}</TableHead>
                  <TableHead>{t("invoices.columns.type")}</TableHead>
                  <TableHead>{t("invoices.columns.buyer")}</TableHead>
                  <TableHead className="text-right">
                    {t("invoices.columns.total")}
                  </TableHead>
                  <TableHead>{t("invoices.columns.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">
                      {new Date(d.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      #{d.provisionalDocumentNumber}
                    </TableCell>
                    <TableCell>
                      <DocTypeBadge type={d.documentType} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{d.buyerLegalName}</span>
                        {d.buyerTin && (
                          <span className="text-xs text-muted-foreground">
                            TIN {d.buyerTin}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.totalValue.toFixed(2)} {d.currency}
                    </TableCell>
                    <TableCell>
                      <DraftStatusBadge
                        status={d.status}
                        attempts={d.attempts}
                        lastError={d.lastError}
                      />
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      {canSync && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSync(d.id)}
                          disabled={
                            draftActionId === d.id || d.status === "SYNCING"
                          }
                        >
                          <CloudUpload />
                          {d.status === "SYNC_FAILED"
                            ? t("invoices.drafts.retrySync")
                            : t("invoices.drafts.sync")}
                        </Button>
                      )}
                      {canSync && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(d.id)}
                          disabled={draftActionId === d.id}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                <FileText className="size-3.5" />
              </span>
              <div>
                <CardTitle className="text-[15px]">{t("invoices.count", { count: total })}</CardTitle>
              </div>
            </div>
          </div>
          <DocumentFilterBar
            value={filters}
            onChange={setFilters}
            searchPlaceholder={t("filters.searchInvoices")}
            statuses={[
              { value: "PAID", label: t("invoices.paymentStatus.PAID") },
              { value: "PARTIAL", label: t("invoices.paymentStatus.PARTIAL") },
              { value: "UNPAID", label: t("invoices.paymentStatus.UNPAID") },
              { value: "CANCELLED", label: t("invoices.status.CANCELLED") },
            ]}
          />
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive">
              {t("invoices.failedToLoad", { error })}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("invoices.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices.columns.created")}</TableHead>
                  <TableHead>{t("invoices.columns.docNumber")}</TableHead>
                  <TableHead>{t("invoices.columns.type")}</TableHead>
                  <TableHead>{t("invoices.columns.irn")}</TableHead>
                  <TableHead>{t("invoices.columns.buyer")}</TableHead>
                  <TableHead className="text-right">
                    {t("invoices.columns.total")}
                  </TableHead>
                  <TableHead>{t("invoices.columns.status")}</TableHead>
                  <TableHead>{t("invoices.columns.payment")}</TableHead>
                  <TableHead className="text-right">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => setActiveId(inv.id)}
                  >
                    <TableCell className="text-sm" title="Time MoR acknowledged the invoice">
                      {formatIssuedAt(inv)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <div className="flex items-center gap-2">
                        <span>{inv.documentNumber}</span>
                        {inv.source === "EXTERNAL" && (
                          // Quick provenance hint so the user can tell that
                          // this row came in via the receipts/IRN dialog
                          // (verified by MoR) and was not registered here.
                          <Badge variant="outline" className="text-[10px]">
                            External
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DocTypeBadge type={inv.documentType} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {inv.irn.slice(0, 16)}…
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {inv.buyer.legalName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          TIN {inv.buyer.tin}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {inv.totalValue.toFixed(2)} {inv.currency}
                    </TableCell>
                    <TableCell>
                      {inv.status === "ACCEPTED" ? (
                        <Badge variant="success">Accepted</Badge>
                      ) : (
                        <Badge variant="destructive">Cancelled</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <PaymentBadge status={inv.paymentStatus} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveId(inv.id)}
                      >
                        <Eye />
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
                  <PageFooter
            shown={invoices.length}
            total={total}
            hasMore={Boolean(nextCursor)}
            loading={loading}
            onMore={loadMore}
          />
        </CardContent>
      </Card>

      <InvoiceDetailSheet
        invoice={active}
        onClose={() => setActiveId(null)}
        onUpdated={replaceInvoice}
        onPaid={() => void refresh()}
      />

      <CheckExternalInvoiceDialog
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        onImported={(invoice) => {
          // Surface the freshly-imported invoice immediately, then open it.
          setInvoices((prev) =>
            prev.some((i) => i.id === invoice.id)
              ? prev.map((i) => (i.id === invoice.id ? invoice : i))
              : [invoice, ...prev],
          );
          setActiveId(invoice.id);
        }}
      />
    </div>
  );
}

function PaymentBadge({
  status,
}: {
  status: "UNPAID" | "PARTIAL" | "PAID";
}) {
  if (status === "PAID") return <Badge variant="success">Paid</Badge>;
  if (status === "PARTIAL") return <Badge variant="muted">Partial</Badge>;
  return <Badge variant="outline">Unpaid</Badge>;
}

/** Visual pill for the doc type column. Solid badge for the common INV
 *  case, distinct variants for credit (CRE) and debit (DEB) memos so the
 *  cashier can pick them out of a long list. */
function DocTypeBadge({ type }: { type: string }) {
  if (type === "CRE") return <Badge variant="destructive">CRE</Badge>;
  if (type === "DEB") return <Badge variant="muted">DEB</Badge>;
  return <Badge variant="outline">INV</Badge>;
}

/** Draft-row status pill — PENDING is neutral, SYNCING shows a spinner-
 *  ish tone, SYNC_FAILED is destructive with a hover tooltip carrying
 *  the last MoR error (truncated server-side to 500 chars). */
function DraftStatusBadge({
  status,
  attempts,
  lastError,
}: {
  status: "PENDING" | "SYNCING" | "SYNC_FAILED";
  attempts: number;
  lastError: string | null;
}) {
  if (status === "PENDING") {
    return <Badge variant="outline">Pending sync</Badge>;
  }
  if (status === "SYNCING") {
    return <Badge variant="muted">Syncing…</Badge>;
  }
  return (
    <Badge
      variant="destructive"
      title={lastError ?? undefined}
      className="cursor-help"
    >
      Failed ({attempts}× tried)
    </Badge>
  );
}
