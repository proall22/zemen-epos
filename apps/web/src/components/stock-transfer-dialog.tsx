import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, Check, Search } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { listInventory, transferStock } from "@/lib/resources";
import type { InventoryItem, SafeBranch, Store } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface StockTransferDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  stores: Store[];
  branches: SafeBranch[];
}

/**
 * Store-first stock transfer for warehouse staff: pick a source store, a
 * destination store in the same branch, a tracked item, and a quantity. Unlike
 * the per-item "Move" button on the inventory list, this is always available on
 * the Stores page and doesn't require the item to be branch-scoped.
 */
export function StockTransferDialog({
  open,
  onClose,
  onSaved,
  stores,
  branches,
}: StockTransferDialogProps) {
  const { t } = useTranslation();
  const branchName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of branches) m.set(b.id, b.name);
    return m;
  }, [branches]);

  const activeStores = useMemo(
    () => stores.filter((s) => s.active),
    [stores],
  );

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [itemId, setItemId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // Load the tracked catalog once when the dialog opens — only tracked items
  // have per-store quantities, so untracked items aren't offered.
  useEffect(() => {
    if (!open) return;
    setFromStoreId("");
    setToStoreId("");
    setItemId("");
    setItemSearch("");
    setQuantity("");
    setNote("");
    setError(null);
    setBusy(false);
    void listInventory()
      .then((rows) => setItems(rows.filter((i) => i.trackStock)))
      .catch(() => setItems([]));
  }, [open]);

  const fromStore = activeStores.find((s) => s.id === fromStoreId) ?? null;

  // Destinations must be a different active store in the same branch.
  const toOptions = useMemo(
    () =>
      fromStore
        ? activeStores.filter(
            (s) => s.branchId === fromStore.branchId && s.id !== fromStore.id,
          )
        : [],
    [activeStores, fromStore],
  );

  // Reset a destination that no longer belongs to the chosen source's branch.
  useEffect(() => {
    if (toStoreId && !toOptions.some((s) => s.id === toStoreId)) {
      setToStoreId("");
    }
  }, [toOptions, toStoreId]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const base = q
      ? items.filter(
          (i) =>
            i.description.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q) ||
            (i.sku?.toLowerCase().includes(q) ?? false),
        )
      : items;
    return base.slice(0, 50);
  }, [items, itemSearch]);

  const selectedItem = items.find((i) => i.id === itemId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = Number(quantity);
    const problems: string[] = [];
    if (!fromStoreId) problems.push(t("stores.transfer.sourceRequired"));
    if (!toStoreId) problems.push(t("stores.transfer.destinationRequired"));
    if (!itemId) problems.push(t("stores.transfer.itemRequired"));
    if (!Number.isFinite(q) || q <= 0)
      problems.push(t("stores.transfer.quantityRequired"));
    if (problems.length) {
      setError({ title: t("stores.transfer.problemsTitle"), items: problems });
      return;
    }
    setBusy(true);
    try {
      await transferStock({
        fromStoreId,
        toStoreId,
        inventoryItemId: itemId,
        quantity: q,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      const fallback = t("stores.transfer.transferError");
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? fallback,
          items: readUserMessages(err.body),
        });
      } else {
        setError({ title: (err as Error).message, items: [] });
      }
    } finally {
      setBusy(false);
    }
  }

  const storeLabel = (s: Store) =>
    `${s.name} · ${branchName.get(s.branchId) ?? s.branchId}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5 text-muted-foreground" />
            {t("stores.transfer.title")}
          </DialogTitle>
          <DialogDescription>
            {t("stores.transfer.dialogSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <form id="stock-transfer-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("stores.transfer.from")}</Label>
              <Select value={fromStoreId} onValueChange={setFromStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("stores.transfer.source")} />
                </SelectTrigger>
                <SelectContent>
                  {activeStores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {storeLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("stores.transfer.to")}</Label>
              <Select
                value={toStoreId}
                onValueChange={setToStoreId}
                disabled={!fromStore}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("stores.transfer.destination")} />
                </SelectTrigger>
                <SelectContent>
                  {toOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fromStore && toOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("stores.transfer.needSecondStore")}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("stores.transfer.item")}</Label>
            {selectedItem ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-medium">
                    {selectedItem.description}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {selectedItem.code}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setItemId("");
                    setItemSearch("");
                  }}
                >
                  {t("common.edit")}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder={t("stores.transfer.searchItems")}
                    className="pl-9"
                  />
                </div>
                <div className="flex max-h-44 flex-col divide-y overflow-y-auto rounded-md border text-sm">
                  {filteredItems.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      {t("stores.transfer.noItems")}
                    </p>
                  ) : (
                    filteredItems.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setItemId(i.id)}
                        className={cn(
                          "flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent",
                        )}
                      >
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-medium">
                            {i.description}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {i.code}
                          </span>
                        </span>
                        {itemId === i.id && (
                          <Check className="size-4 text-[#5700FF]" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("stores.transfer.quantity")}</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("stores.transfer.note")}</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("stores.transfer.notePlaceholder")}
            />
          </div>

          {error && <ErrorCallout title={error.title} items={error.items} />}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("stores.transfer.cancel")}
          </Button>
          <Button type="submit" form="stock-transfer-form" disabled={busy}>
            {busy ? t("stores.transfer.moving") : t("stores.transfer.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
