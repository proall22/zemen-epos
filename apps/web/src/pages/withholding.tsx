import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Percent, Plus, RefreshCw } from "lucide-react";

import {
  DocumentFilterBar,
  PageFooter,
} from "@/components/document-filter-bar";
import { ReceiptDetailSheet } from "@/components/receipt-detail-sheet";
import { ScopeToggle, useListScope } from "@/components/scope-toggle";
import { WithholdingFormSheet } from "@/components/withholding-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { formatReceiptIssuedAt } from "@/lib/invoice-date";
import {
  getNextWithholdSequence,
  getWithholdingRegister,
  type DocumentFilters,
  type NextWithholdSequence,
} from "@/lib/resources";
import type { Receipt } from "@/lib/types";

export function WithholdingPage() {
  const { can } = useAuth();
  const canCreate = can("withholding.create");

  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [next, setNext] = useState<NextWithholdSequence | null>(null);
  const [filing, setFiling] = useState(false);
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [withheldTotal, setWithheldTotal] = useState(0);
  const [preTaxTotal, setPreTaxTotal] = useState(0);
  const [scope, setScope] = useListScope("eirms:list-scope:withholding");

  useEffect(() => {
    void refresh();
    if (canCreate) void refreshNext();
  }, [canCreate, scope, filters]);

  async function refresh() {
    setLoading(true);
    setRefreshError(null);
    try {
      const page = await getWithholdingRegister({ ...filters, scope });
      setReceipts(page.items);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      setWithheldTotal(page.withheldTotal);
      setPreTaxTotal(page.preTaxTotal);
    } catch (e) {
      setRefreshError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshNext() {
    try {
      setNext(await getNextWithholdSequence());
    } catch {
      setNext(null);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    const page = await getWithholdingRegister({
      ...filters,
      scope,
      cursor: nextCursor,
    });
    setReceipts((prev) => [...prev, ...page.items]);
    setNextCursor(page.nextCursor);
  }

  const active = useMemo(
    () => receipts.find((r) => r.id === activeId) ?? null,
    [receipts, activeId],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <WithholdingFormSheet
        open={filing}
        next={next}
        onClose={() => setFiling(false)}
        onFiled={() => {
          setFiling(false);
          void refresh();
          void refreshNext();
        }}
      />

      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Withholding
          </span>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Percent className="size-6 text-[#5700FF]" />
            Withholding
          </h1>
          <p className="text-sm text-muted-foreground">
            Tax withheld on supplier invoices, filed with MOR. Rate is fixed at
            3% of the pre-tax amount.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle scope={scope} onChange={setScope} />
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw />
            Refresh
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setFiling(true)}>
              <Plus />
              File withholding receipt
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>{t("withholding.register.title")}</CardTitle>
          <div className="grid grid-cols-3 gap-2 text-center">
            <RegisterStat
              label={t("withholding.register.entries")}
              value={String(total)}
            />
            <RegisterStat
              label={t("withholding.register.preTaxTotal")}
              value={preTaxTotal.toFixed(2)}
            />
            <RegisterStat
              label={t("withholding.register.withheldTotal")}
              value={withheldTotal.toFixed(2)}
            />
          </div>
          <DocumentFilterBar
            value={filters}
            onChange={setFilters}
            searchPlaceholder={t("filters.searchWithholding")}
          />
        </CardHeader>
        <CardContent>
          {refreshError && (
            <p className="text-sm text-destructive">
              Failed to load: {refreshError}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No withholding receipts match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filed</TableHead>
                  <TableHead>Counter</TableHead>
                  <TableHead>Supplier IRN</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Pre-tax</TableHead>
                  <TableHead className="text-right">Withheld</TableHead>
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
                    <TableCell className="font-mono text-xs">
                      WTH{String(r.receiptCounter).padStart(6, "0")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.externalInvoiceIrn
                        ? `${r.externalInvoiceIrn.slice(0, 18)}…`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{r.withholdType ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.withholdPreTax?.toFixed(2) ?? "—"}{" "}
                      {r.receiptCurrency}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.withholdAmount?.toFixed(2) ?? "—"}{" "}
                      {r.receiptCurrency}
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

      <ReceiptDetailSheet receipt={active} onClose={() => setActiveId(null)} />
    </div>
  );
}

function RegisterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
