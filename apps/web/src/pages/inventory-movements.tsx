import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, History, RefreshCw } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { listStockMovements, listStores } from "@/lib/resources";
import type {
  StockMovementReason,
  StockMovementRow,
  Store,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "__all__";

const REASONS: StockMovementReason[] = [
  "SALE",
  "RESTOCK",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "ADJUSTMENT",
  "DAMAGE",
  "EXPIRY",
  "THEFT",
  "INTERNAL_USE",
  "SUPERSEDE",
];

/** One display row: either a single movement, or a transfer's OUT+IN folded
 *  into one "from → to" line. */
type LogRow =
  | { kind: "single"; row: StockMovementRow }
  | {
      kind: "transfer";
      id: string;
      at: string;
      itemCode: string;
      itemDescription: string;
      quantity: number;
      fromStore: string | null;
      toStore: string | null;
      actorEmail: string | null;
      note: string | null;
    };

/** Fold TRANSFER_OUT/TRANSFER_IN sharing a transferId into one row. Rows
 *  predating the transferId column stay unpaired rather than being guessed at. */
function fold(rows: StockMovementRow[]): LogRow[] {
  const byTransfer = new Map<string, StockMovementRow[]>();
  for (const r of rows) {
    if (!r.transferId) continue;
    const list = byTransfer.get(r.transferId) ?? [];
    list.push(r);
    byTransfer.set(r.transferId, list);
  }
  const consumed = new Set<string>();
  const out: LogRow[] = [];
  for (const r of rows) {
    if (consumed.has(r.id)) continue;
    const pair = r.transferId ? byTransfer.get(r.transferId) : undefined;
    if (pair && pair.length === 2) {
      pair.forEach((p) => consumed.add(p.id));
      const from = pair.find((p) => p.delta < 0);
      const to = pair.find((p) => p.delta > 0);
      out.push({
        kind: "transfer",
        id: r.transferId!,
        at: r.createdAt,
        itemCode: r.itemCode,
        itemDescription: r.itemDescription,
        quantity: Math.abs(r.delta),
        fromStore: from?.storeName ?? null,
        toStore: to?.storeName ?? null,
        actorEmail: r.actorEmail,
        note: r.note,
      });
      continue;
    }
    out.push({ kind: "single", row: r });
  }
  return out;
}

export function InventoryMovementsPage() {
  const { t, i18n } = useTranslation();
  const { branch } = useAuth();
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>(ALL);
  const [reason, setReason] = useState<string>(ALL);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listStores().then(setStores).catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setCursor(null);
  }, [storeId, reason]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listStockMovements({
      storeId: storeId === ALL ? undefined : storeId,
      reason: reason === ALL ? undefined : (reason as StockMovementReason),
      cursor: cursor ?? undefined,
    })
      .then((page) => {
        if (cancelled) return;
        // Appending only when paging keeps "load more" additive without
        // duplicating rows after a filter change resets the cursor.
        setRows((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, reason, cursor]);

  const folded = useMemo(() => fold(rows), [rows]);
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "am" ? "am-ET" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("movements.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("movements.subtitle", {
              branch: branch?.tradeName ?? branch?.name ?? "",
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(null)}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-1.5 size-4", loading && "animate-spin")} />
          {t("common.refresh")}
        </Button>
      </header>

      {error && <ErrorCallout title={error} items={[]} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-muted-foreground" />
            {t("movements.cardTitle")}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("movements.allStores")}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("movements.allReasons")}</SelectItem>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`movements.reason.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("movements.columns.when")}</TableHead>
                <TableHead>{t("movements.columns.item")}</TableHead>
                <TableHead>{t("movements.columns.what")}</TableHead>
                <TableHead className="text-right">
                  {t("movements.columns.change")}
                </TableHead>
                <TableHead>{t("movements.columns.by")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folded.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("movements.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                folded.map((r) =>
                  r.kind === "transfer" ? (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmt.format(new Date(r.at))}
                      </TableCell>
                      <TableCell>
                        <ItemCell
                          code={r.itemCode}
                          description={r.itemDescription}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm">
                            <Badge variant="outline">
                              {t("movements.reason.TRANSFER")}
                            </Badge>
                            {r.fromStore}
                            <ArrowRight className="size-3 text-muted-foreground" />
                            {r.toStore}
                          </span>
                          {r.note && (
                            <span className="text-xs text-muted-foreground">
                              {r.note}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.quantity}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.actorEmail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={r.row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmt.format(new Date(r.row.createdAt))}
                      </TableCell>
                      <TableCell>
                        <ItemCell
                          code={r.row.itemCode}
                          description={r.row.itemDescription}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm">
                            <Badge variant="outline">
                              {t(`movements.reason.${r.row.reason}`)}
                            </Badge>
                            {r.row.storeName}
                          </span>
                          {r.row.note && (
                            <span className="text-xs text-muted-foreground">
                              {r.row.note}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          r.row.delta < 0 ? "text-destructive" : "text-emerald-600",
                        )}
                      >
                        {r.row.delta > 0 ? `+${r.row.delta}` : r.row.delta}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.row.actorEmail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>

          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setCursor(nextCursor)}
              >
                {t("movements.loadMore")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemCell({
  code,
  description,
}: {
  code: string;
  description: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{description}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
    </div>
  );
}
