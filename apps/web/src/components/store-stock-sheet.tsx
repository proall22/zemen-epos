import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Search } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
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
import { listStoreStock, recordStockCount } from "@/lib/resources";
import type { Store, StoreStockRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface StoreStockSheetProps {
  store: Store | null;
  onClose: () => void;
}

/** What a single store is holding. `available` is on-hand minus live POS cart
 *  holds, so it answers "what could a cashier actually ring up right now". */
export function StoreStockSheet({ store, onClose }: StoreStockSheetProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StoreStockRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [countValue, setCountValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function submitCount(itemId: string) {
    if (!store) return;
    const counted = Number(countValue);
    if (!Number.isFinite(counted) || counted < 0) return;
    setBusy(true);
    setError(null);
    try {
      await recordStockCount(itemId, { storeId: store.id, counted });
      setCountingId(null);
      setCountValue("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!store) return;
    setSearch("");
  }, [store?.id]);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      void listStoreStock(store.id, search)
        .then((r) => {
          if (!cancelled) setRows(r);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [store?.id, search, reloadKey]);

  const totals = useMemo(
    () => ({
      lines: rows.length,
      units: rows.reduce((s, r) => s + r.quantity, 0),
      reserved: rows.reduce((s, r) => s + r.reserved, 0),
    }),
    [rows],
  );

  return (
    <Sheet open={store !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Boxes className="size-5 text-muted-foreground" />
              {store?.name}
              <span className="font-mono text-xs text-muted-foreground">
                {store?.code}
              </span>
            </SheetTitle>
            <SheetDescription>
              {t("stores.stock.subtitle")}
            </SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("stores.stock.searchPlaceholder")}
              className="pl-9"
            />
          </div>

          {error && <ErrorCallout title={error} items={[]} />}

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t("stores.stock.distinctItems")} value={totals.lines} />
            <Stat label={t("stores.stock.unitsOnHand")} value={totals.units} />
            <Stat label={t("stores.stock.reserved")} value={totals.reserved} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stores.stock.item")}</TableHead>
                <TableHead className="text-right">
                  {t("stores.stock.onHand")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stores.stock.reserved")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stores.stock.available")}
                </TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {search
                      ? t("stores.stock.noMatch")
                      : t("stores.stock.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const low =
                    r.lowStockThreshold != null &&
                    r.quantity <= r.lowStockThreshold;
                  return (
                    <TableRow key={r.inventoryItemId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.description}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {r.code} · {r.unit}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={cn(
                            r.quantity <= 0 && "text-destructive font-semibold",
                          )}
                        >
                          {r.quantity}
                        </span>
                        {low && r.quantity > 0 && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-amber-500/50 text-amber-600"
                          >
                            {t("stores.stock.low")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.reserved || "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.available}
                      </TableCell>
                      <TableCell className="text-right">
                        {countingId === r.inventoryItemId ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              autoFocus
                              type="number"
                              min="0"
                              value={countValue}
                              onChange={(e) => setCountValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  void submitCount(r.inventoryItemId);
                                if (e.key === "Escape") setCountingId(null);
                              }}
                              className="h-8 w-20"
                              placeholder="0"
                            />
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void submitCount(r.inventoryItemId)}
                            >
                              {t("common.save")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant={r.quantity < 0 ? "destructive" : "ghost"}
                            onClick={() => {
                              setCountingId(r.inventoryItemId);
                              setCountValue("");
                            }}
                          >
                            {t("stores.stock.count")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
