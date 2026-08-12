import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageOff, Plus, Search, X, Sparkles, Package } from "lucide-react";

import { InventoryFormSheet } from "@/components/inventory-form-sheet";
import { PrintLabelsDialog } from "@/components/print-labels-dialog";
import { StoreTransferSheet } from "@/components/store-transfer-sheet";
import { UpcBarcode } from "@/components/upc-barcode";
import { WriteOffDialog } from "@/components/writeoff-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { adjustStock, listInventory, listStores } from "@/lib/resources";
import { nonTaxableSuffix } from "@/lib/invoice-types";
import type { InventoryItem, Store } from "@/lib/types";

export function InventoryPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canCreate = can("inventory.create");
  const canUpdate = can("inventory.update");
  const canWriteOff = can("writeoff.create");
  const canTransfer = can("store.update");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [writeOffItem, setWriteOffItem] = useState<InventoryItem | null>(null);
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);

  // Debounce the search so we're not firing on every keystroke — 250ms is
  // just under a fast typist's rhythm and keeps the UI responsive.
  useEffect(() => {
    const handle = setTimeout(() => void refresh(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  // Stores are needed for the write-off / transfer store pickers; load once
  // and cache. Both features gate on their own permission, so fetch when
  // either is available.
  useEffect(() => {
    if (!canWriteOff && !canTransfer) return;
    void listStores().then(setStores).catch(() => setStores([]));
  }, [canWriteOff, canTransfer]);

  async function refresh(q = search) {
    setLoading(true);
    try {
      setItems(await listInventory(q));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingItem(item);
    setSheetMode("edit");
  }

  function closeSheet() {
    setSheetMode(null);
    setEditingItem(null);
  }

  function onSaved(saved: InventoryItem) {
    // Replace-in-place on edit; prepend on create so the new row is visible
    // without waiting for the list refetch. The refresh call keeps the list
    // aligned with the server (order, superseded rows, etc.).
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    closeSheet();
    void refresh();
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            Zemen-ePos · Inventory
          </p>
          <h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <Package className="size-4" />
            </span>
            {t("inventory.header.title")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t("inventory.header.subtitle")}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setSheetMode("create")}>
            <Plus />
            {t("inventory.addItem")}
          </Button>
        )}
      </header>


      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <div>
                <CardTitle className="text-[15px]">{`${t("nav.inventory")} (${items.length})`}</CardTitle>
                <CardDescription className="text-xs">{t("inventory.search")}</CardDescription>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("inventory.search")}
                className="pl-9 pr-8"
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label={t("common.close")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <PrintLabelsDialog items={items} />
          </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("inventory.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>{t("inventory.columns.item")}</TableHead>
                  <TableHead>{t("inventory.columns.sku")}</TableHead>
                  <TableHead>{t("inventory.columns.code")}</TableHead>
                  <TableHead>{t("inventory.columns.barcode")}</TableHead>
                  <TableHead className="text-right">
                    {t("inventory.columns.price")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("inventory.columns.tax")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("inventory.columns.stock")}
                  </TableHead>
                  {canUpdate && (
                    <TableHead className="text-right">
                      {t("common.actions")}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Thumbnail src={item.imageUrl} alt={item.description} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {item.description}
                          {nonTaxableSuffix(item.taxCode)}
                        </span>
                        {item.longDescription && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {item.longDescription}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.code}
                    </TableCell>
                    <TableCell>
                      {item.upc ? (
                        <div className="flex flex-col gap-0.5">
                          <UpcBarcode
                            value={item.upc}
                            height={22}
                            showText={false}
                            className="h-6 w-24"
                          />
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {item.upc}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.unitPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.taxRate.toFixed(0)}% {item.taxCode}
                    </TableCell>
                    <TableCell className="text-right">
                      <StockCell item={item} />
                    </TableCell>
                    {canUpdate && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.trackStock && (
                            <RestockButton
                              item={item}
                              stores={stores}
                              onDone={refresh}
                            />
                          )}
                          {canTransfer &&
                            item.trackStock &&
                            stores.filter((s) => s.active).length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setTransferItem(item)}
                              >
                                {t("inventory.actions.move")}
                              </Button>
                            )}
                          {canWriteOff && item.trackStock && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setWriteOffItem(item)}
                            >
                              {t("inventory.actions.writeOff")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(item)}
                          >
                            {t("common.edit")}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InventoryFormSheet
        mode={sheetMode}
        item={editingItem}
        onClose={closeSheet}
        onSaved={onSaved}
      />
      <WriteOffDialog
        item={writeOffItem}
        stores={stores}
        onClose={() => setWriteOffItem(null)}
        onSaved={(saved) => {
          setWriteOffItem(null);
          onSaved(saved);
        }}
      />
      <StoreTransferSheet
        item={transferItem}
        stores={stores}
        onClose={() => setTransferItem(null)}
        onSaved={() => {
          setTransferItem(null);
          void refresh();
        }}
      />
    </div>
  );
}

function StockCell({ item }: { item: InventoryItem }) {
  const { t } = useTranslation();
  if (!item.trackStock) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const qty = item.onHand ?? item.totalOnHand;
  const sellable = item.sellable;
  // A negative branch total is corrupt data, not an empty shelf: one store
  // has gone below zero and is cancelling out stock that physically exists.
  // Netting it into a plain "Out" hides the problem — say so instead.
  const corrupt = qty < 0 || (sellable !== null && sellable < 0);
  const out = !corrupt && qty <= 0;
  const low =
    !out &&
    !corrupt &&
    item.lowStockThreshold != null &&
    qty <= item.lowStockThreshold;
  // "0 Out" reads as "we have none" when other branches may be holding plenty.
  const elsewhere = item.onHand !== null && item.totalOnHand !== item.onHand;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <span className={cn("tabular-nums", corrupt && "text-destructive")}>
          {qty}
        </span>
        {corrupt ? (
          <Badge variant="destructive" title={t("inventory.stockCell.negativeHint")}>
            {t("inventory.stockCell.negative")}
          </Badge>
        ) : out ? (
          <Badge variant="destructive">{t("inventory.stockCell.out")}</Badge>
        ) : low ? (
          <Badge variant="muted">{t("inventory.stockCell.low")}</Badge>
        ) : null}
      </div>
      {corrupt ? (
        <span className="text-[10px] text-destructive">
          {t("inventory.stockCell.negativeHint")}
        </span>
      ) : (
        elsewhere && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {t("inventory.stockCell.acrossBranches", {
              total: item.totalOnHand,
            })}
          </span>
        )
      )}
    </div>
  );
}

function RestockButton({
  item,
  stores,
  onDone,
}: {
  item: InventoryItem;
  stores: Store[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [storeId, setStoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // `stores` is already the active branch's; let the user pick which one the
  // adjustment lands in.
  const branchStores = stores.filter((s) => s.active);

  // Default to the sales-floor / default store when the picker opens.
  useEffect(() => {
    if (!open || branchStores.length === 0) return;
    const preferred =
      branchStores.find((s) => s.isSalesFloor) ??
      branchStores.find((s) => s.isDefault) ??
      branchStores[0];
    setStoreId((cur) =>
      cur && branchStores.some((s) => s.id === cur) ? cur : preferred.id,
    );
  }, [open, branchStores]);

  async function apply() {
    const d = Number(delta);
    if (!delta.trim() || Number.isNaN(d) || d === 0) {
      setErr(t("inventory.restock.deltaRequired"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adjustStock(item.id, {
        delta: d,
        reason: d > 0 ? "RESTOCK" : "ADJUSTMENT",
        note: note.trim() || undefined,
        storeId: branchStores.length > 0 ? storeId || undefined : undefined,
      });
      setOpen(false);
      setDelta("");
      setNote("");
      onDone();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? (readApiMessage(e.body) ?? e.message)
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {t("inventory.restock.buttonLabel")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("inventory.restock.adjustStock")}
          </span>
          <p className="text-xs text-muted-foreground">
            {t("inventory.restock.onHand", {
              qty: item.trackStock
                ? (item.onHand ?? 0)
                : t("inventory.restock.notTrackedYet"),
            })}
          </p>
          {branchStores.length > 1 && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={t("inventory.restock.storeLabel")} />
              </SelectTrigger>
              <SelectContent>
                {branchStores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="number"
            step="any"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder={t("inventory.restock.deltaPlaceholder")}
            className="h-8"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("inventory.restock.notePlaceholder")}
            className="h-8"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Button type="button" size="sm" onClick={apply} disabled={busy}>
            {busy
              ? t("inventory.restock.applying")
              : t("inventory.restock.apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="size-10 rounded-md border object-cover"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
