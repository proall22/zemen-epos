import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorCallout } from "@/components/error-callout";
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
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { createPurchase, listStores } from "@/lib/resources";
import type {
  InventoryItem,
  SafeBranch,
  StockPurchase,
  Store,
  Vendor,
} from "@/lib/types";

interface LineDraft {
  key: string; // stable react key
  inventoryItemId: string;
  storeId: string;
  quantity: string;
  unitCost: string;
}

function newLine(defaultItemId?: string, defaultStoreId?: string): LineDraft {
  return {
    key: crypto.randomUUID(),
    inventoryItemId: defaultItemId ?? "",
    storeId: defaultStoreId ?? "",
    quantity: "",
    unitCost: "",
  };
}

export interface PurchaseFormSheetProps {
  open: boolean;
  branches: SafeBranch[];
  vendors: Vendor[];
  items: InventoryItem[];
  /** Prefill (from the "Restock" row button) so the sheet opens with one
   *  line already populated for the item the cashier clicked. */
  presetItemId?: string;
  onClose: () => void;
  onSaved: (purchase: StockPurchase) => void;
}

export function PurchaseFormSheet({
  open,
  branches,
  vendors,
  items,
  presetItemId,
  onClose,
  onSaved,
}: PurchaseFormSheetProps) {
  // Default to the branch we're acting as, not the merchant's first branch —
  // those differ for anyone who has switched branches, and the store list is
  // branch-scoped server-side, so a mismatch yields an empty store dropdown.
  const { branch: activeBranch } = useAuth();
  const defaultBranchId =
    branches.find((b) => b.id === activeBranch?.id)?.id ?? branches[0]?.id ?? "";
  const [branchId, setBranchId] = useState<string>(defaultBranchId);
  const [vendorId, setVendorId] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().slice(0, 16),
  );
  const [note, setNote] = useState<string>("");
  const [lines, setLines] = useState<LineDraft[]>([newLine(presetItemId)]);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const [storesInBranch, setStoresInBranch] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const defaultStoreId = useMemo(() => {
    const sales = storesInBranch.find((s) => s.isSalesFloor);
    return sales?.id ?? storesInBranch[0]?.id ?? "";
  }, [storesInBranch]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i] as const)),
    [items],
  );

  // Reset on open only. Keeping the branch/store defaults out of the deps is
  // what makes the Branch select usable — they derive from `branchId`, so
  // including them made picking a branch re-run this and snap it back.
  useEffect(() => {
    if (!open) return;
    setBranchId(defaultBranchId);
    setVendorId("");
    setReference("");
    setPurchaseDate(new Date().toISOString().slice(0, 16));
    setNote("");
    setLines([newLine(presetItemId)]);
    setError(null);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetItemId]);

  // Stores are branch-scoped server-side, so refetch whenever the chosen
  // branch changes rather than filtering a merchant-wide prop.
  useEffect(() => {
    if (!open || !branchId) {
      setStoresInBranch([]);
      return;
    }
    let cancelled = false;
    setStoresLoading(true);
    listStores(false, branchId)
      .then((rows) => {
        if (!cancelled) setStoresInBranch(rows.filter((s) => s.active));
      })
      .catch(() => {
        if (!cancelled) setStoresInBranch([]);
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  // Re-point every line at the new branch's default store. Lines whose store
  // no longer exists in this branch would otherwise fail validation silently.
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) =>
        storesInBranch.some((s) => s.id === l.storeId)
          ? l
          : { ...l, storeId: defaultStoreId },
      ),
    );
  }, [storesInBranch, defaultStoreId]);

  const total = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const c = Number(l.unitCost) || 0;
      s += q * c;
    }
    return Math.round(s * 100) / 100;
  }, [lines]);

  function addLine() {
    setLines((prev) => [...prev, newLine(undefined, defaultStoreId)]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateLine<K extends keyof LineDraft>(
    idx: number,
    key: K,
    value: LineDraft[K],
  ) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problems: string[] = [];
    if (!items.length)
      problems.push("No inventory items exist yet. Create an item under Inventory before recording a purchase.");
    if (!branchId) problems.push("Pick a branch.");
    if (!purchaseDate) problems.push("Set the purchase date.");
    if (!lines.length) problems.push("Add at least one line.");
    const cleaned = lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      storeId: l.storeId,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost),
    }));
    for (const [i, l] of cleaned.entries()) {
      if (!l.inventoryItemId) problems.push(`Line ${i + 1}: pick an item.`);
      if (!l.storeId) problems.push(`Line ${i + 1}: pick a receiving store.`);
      if (!Number.isFinite(l.quantity) || l.quantity <= 0)
        problems.push(`Line ${i + 1}: quantity must be > 0.`);
      if (!Number.isFinite(l.unitCost) || l.unitCost < 0)
        problems.push(`Line ${i + 1}: unit cost must be 0 or more.`);
    }
    if (problems.length) {
      setError({ title: "Please complete every line.", items: problems });
      return;
    }
    setBusy(true);
    try {
      const saved = await createPurchase({
        branchId,
        vendorId: vendorId || undefined,
        reference: reference.trim() || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        note: note.trim() || undefined,
        items: cleaned,
      });
      onSaved(saved);
    } catch (err) {
      const fallback = "Couldn't record this purchase.";
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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <PackagePlus className="size-5 text-muted-foreground" />
              New purchase
            </SheetTitle>
            <SheetDescription>
              Record a goods-received event — increments per-store stock,
              writes RESTOCK ledger rows, and recomputes each item's
              running average cost.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form id="purchase-form" onSubmit={submit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch *">
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Vendor">
                <Select
                  value={vendorId || "__NONE__"}
                  onValueChange={(v) => setVendorId(v === "__NONE__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cash / one-off" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">
                      Cash purchase (no vendor)
                    </SelectItem>
                    {vendors
                      .filter((v) => v.active)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reference">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="PO / invoice / delivery note"
                />
              </Field>
              <Field label="Received at *">
                <Input
                  type="datetime-local"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </Field>
              <Field label="Note" spanFull>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Optional — e.g. condition of the delivery."
                />
              </Field>
            </div>

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Items received
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={addLine}>
                  <Plus className="size-4" />
                  Add line
                </Button>
              </div>
              {lines.map((line, idx) => {
                const item = itemsById.get(line.inventoryItemId);
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-12 items-end gap-2 rounded-md border bg-background p-2"
                  >
                    <div className="col-span-5 flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Item
                      </Label>
                      <Select
                        // undefined (not a sentinel) so the placeholder shows:
                        // Radix renders nothing for a value with no matching item.
                        value={line.inventoryItemId || undefined}
                        onValueChange={(v) =>
                          updateLine(idx, "inventoryItemId", v)
                        }
                        disabled={items.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              items.length === 0
                                ? "No inventory items available"
                                : "Pick an item"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item && (
                        <span className="text-[10px] text-muted-foreground">
                          {item.code} · {item.unit} · sell @ {item.unitPrice}
                        </span>
                      )}
                    </div>
                    <div className="col-span-3 flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Store
                      </Label>
                      <Select
                        value={line.storeId || undefined}
                        onValueChange={(v) => updateLine(idx, "storeId", v)}
                        disabled={storesLoading || storesInBranch.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              storesLoading ? "Loading…" : "Pick a store"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {storesInBranch.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Qty
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Unit cost
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => updateLine(idx, "unitCost", e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="col-span-12 -mt-3 self-end justify-self-end"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">
                  {total.toFixed(2)} ETB
                </span>
              </div>
            </div>

            {!storesLoading && branchId && storesInBranch.length === 0 && (
              <ErrorCallout
                title="This branch has no active stores."
                items={[
                  "Stock has to land somewhere — create a store for this branch under Inventory → Stores, then record the purchase.",
                ]}
              />
            )}

            {items.length === 0 && (
              <ErrorCallout
                title="Create an inventory item first."
                items={[
                  "A vendor identifies who supplied the goods; it does not create the products. Open Inventory, add the product, then return here and select it on the purchase line.",
                ]}
              />
            )}
            {items.length === 0 && (
              <Button asChild type="button" variant="outline">
                <Link to="/inventory" onClick={onClose}>
                  Go to Inventory
                </Link>
              </Button>
            )}

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="purchase-form"
              disabled={busy || items.length === 0}
            >
              {busy ? "Saving…" : "Record purchase"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  spanFull,
  children,
}: {
  label: string;
  spanFull?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${spanFull ? "col-span-2" : ""}`.trim()}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
