import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { UpcBarcode } from "@/components/upc-barcode";
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
import {
  createInventoryItem,
  listHarmonizationCodes,
  supersedeInventoryItem,
  updateInventoryItem,
} from "@/lib/resources";
import {
  DEFAULT_TAX_CODE,
  TAX_CODES,
  normalizeTaxCode,
} from "@/lib/tax-codes";
import type {
  HarmonizationCode,
  InventoryItem,
} from "@/lib/types";

// Same trick for "no harmonization code".
const NO_HS_CODE = "__none__";

type Mode = "create" | "edit";

export interface InventoryFormSheetProps {
  mode: Mode | null;
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}

interface FormState {
  code: string;
  sku: string;
  upc: string;
  description: string;
  longDescription: string;
  imageUrl: string;
  unit: string;
  unitPrice: string;
  /** The rate is never entered by hand — it follows from the code, both here
   *  and on the server. */
  taxCode: string;
  /** Both are set together by picking a harmonization code; "" = none. */
  harmonizationCode: string;
  exciseRate: string;
  nature: "goods" | "service";
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string;
}

function blank(): FormState {
  return {
    code: "",
    sku: "",
    upc: "",
    description: "",
    longDescription: "",
    imageUrl: "",
    unit: "PCS",
    unitPrice: "",
    taxCode: DEFAULT_TAX_CODE,
    harmonizationCode: "",
    exciseRate: "",
    nature: "goods",
    trackStock: false,
    stockQuantity: "",
    lowStockThreshold: "",
  };
}

function fromItem(item: InventoryItem): FormState {
  return {
    code: item.code,
    sku: item.sku ?? "",
    upc: item.upc ?? "",
    description: item.description,
    longDescription: item.longDescription ?? "",
    imageUrl: item.imageUrl ?? "",
    unit: item.unit,
    unitPrice: String(item.unitPrice),
    taxCode: normalizeTaxCode(item.taxCode),
    harmonizationCode: item.harmonizationCode ?? "",
    exciseRate: item.exciseRate != null ? String(item.exciseRate) : "",
    nature: item.nature,
    trackStock: item.trackStock,
    stockQuantity: "",
    lowStockThreshold:
      item.lowStockThreshold != null ? String(item.lowStockThreshold) : "",
  };
}

/**
 * Right-side sheet for adding or editing an inventory item. Mirrors the
 * pattern used by BranchFormSheet / MerchantFormSheet so the merchant admin
 * views feel consistent. All form state lives inside this component — the
 * parent hands us a mode + optional item and gets `onSaved(item)` when the
 * server accepts.
 */
export function InventoryFormSheet({
  mode,
  item,
  onClose,
  onSaved,
}: InventoryFormSheetProps) {
  const { branch: activeBranch } = useAuth();
  const [form, setForm] = useState<FormState>(blank);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hsCodes, setHsCodes] = useState<HarmonizationCode[]>([]);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // On-hand quantity is only editable at create-time or when supersede-ing
  // an existing item (which effectively creates a new row).
  const qtyEditable = mode !== "edit" || saveAsNew;

  useEffect(() => {
    if (mode === "edit" && item) {
      setForm(fromItem(item));
      setShowAdvanced(
        Boolean(
          item.longDescription ||
            item.imageUrl ||
            item.harmonizationCode ||
            item.exciseRate != null,
        ) ||
          item.unit !== "PCS" ||
          item.trackStock,
      );
    } else if (mode === "create") {
      setForm(blank());
      // Default new items to the branch the user is currently acting in, so a
      // store keeper working within a branch gets branch-scoped items (with
      // stores) by default. Falls back to merchant-wide.
      setShowAdvanced(false);
    }
    setSaveAsNew(false);
    setError(null);
    setBusy(false);
  }, [mode, item?.id, activeBranch?.id]);

  useEffect(() => {
    if (mode === null) return;
    void listHarmonizationCodes()
      .then(setHsCodes)
      .catch(() => setHsCodes([]));
  }, [mode]);

  // An item can hold a code that has since been deactivated or removed from the
  // table. Keep it in the list so opening the item doesn't silently clear it.
  const hsOptions = useMemo(() => {
    const current = form.harmonizationCode.trim();
    if (!current || hsCodes.some((h) => h.code === current)) return hsCodes;
    return [
      ...hsCodes,
      {
        code: current,
        exciseRate: Number(form.exciseRate) || 0,
      } as HarmonizationCode,
    ];
  }, [hsCodes, form.harmonizationCode, form.exciseRate]);

  const open = mode !== null;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  /** Picking a code copies its rate onto the item. The item keeps its own copy
   *  so a later edit to the harmonization table never rewrites history. */
  function selectHarmonizationCode(code: string) {
    if (code === NO_HS_CODE) {
      setForm((prev) => ({ ...prev, harmonizationCode: "", exciseRate: "" }));
      return;
    }
    const hs = hsOptions.find((h) => h.code === code);
    setForm((prev) => ({
      ...prev,
      harmonizationCode: code,
      exciseRate: hs ? String(hs.exciseRate) : "",
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const code = form.code.trim();
    const description = form.description.trim();
    const priceText = form.unitPrice.trim();
    const unitPrice = Number(priceText);
    const problems: string[] = [];
    if (!code) problems.push("Item code is required.");
    if (!description) problems.push("Title is required.");
    if (!priceText || Number.isNaN(unitPrice) || unitPrice < 0)
      problems.push("Enter a unit price of 0 or more.");
    if (saveAsNew && item && code === item.code)
      problems.push("Give the new SKU a different item code.");
    if (problems.length > 0) {
      setError({
        title: "Please complete the required fields.",
        items: problems,
      });
      return;
    }

    setBusy(true);
    try {
      const trackStock = form.trackStock;
      const includeQty = qtyEditable && trackStock;
      const payload = {
        code,
        sku: form.sku.trim() || undefined,
        upc: form.upc.trim() || undefined,
        description,
        longDescription: form.longDescription.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        unit: form.unit || "PCS",
        unitPrice,
        // taxRate is intentionally absent — the server derives it from taxCode.
        taxCode: form.taxCode || DEFAULT_TAX_CODE,
        harmonizationCode: form.harmonizationCode.trim() || undefined,
        exciseRate:
          form.exciseRate.trim() !== ""
            ? Number(form.exciseRate) || 0
            : undefined,
        nature: form.nature,
        trackStock,
        stockQuantity:
          includeQty && form.stockQuantity.trim() !== ""
            ? Number(form.stockQuantity)
            : includeQty
              ? 0
              : undefined,
        lowStockThreshold:
          trackStock && form.lowStockThreshold.trim() !== ""
            ? Number(form.lowStockThreshold)
            : undefined,
      };
      const saved =
        mode === "edit" && item
          ? saveAsNew
            ? await supersedeInventoryItem(item.id, payload)
            : await updateInventoryItem(item.id, payload)
          : await createInventoryItem(payload);
      onSaved(saved);
    } catch (err) {
      const fallback =
        mode === "edit"
          ? "Couldn't save your changes."
          : "Couldn't add this item.";
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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Package className="size-5 text-muted-foreground" />
              {mode === "edit" ? "Edit item" : "Add item"}
            </SheetTitle>
            <SheetDescription>
              Code and title are required. The rest sharpens the POS + shelf
              experience.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form
          id="inventory-form"
          onSubmit={submit}
          className="contents"
          noValidate
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code *">
                <Input
                  required
                  value={form.code}
                  onChange={(e) => update("code", e.target.value)}
                  placeholder="ITM-001"
                />
              </Field>
              <Field label="SKU">
                <Input
                  value={form.sku}
                  onChange={(e) => update("sku", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Title *" spanFull>
                <Input
                  required
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Coca-Cola 500ml"
                />
              </Field>
              <Field label="UPC / barcode" spanFull>
                <Input
                  value={form.upc}
                  onChange={(e) => update("upc", e.target.value)}
                  placeholder="Scan or type barcode"
                  inputMode="numeric"
                  className="font-mono"
                />
                {form.upc.trim() && (
                  <div className="mt-1 inline-flex w-fit rounded border bg-white px-2 py-1">
                    <UpcBarcode
                      value={form.upc}
                      height={28}
                      showText={false}
                      className="h-7"
                    />
                  </div>
                )}
              </Field>
              <Field label="Availability" spanFull>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  This item is part of your merchant-wide catalogue — every
                  branch can sell it. Stock is counted per store, so each
                  branch keeps its own quantity.
                </p>
              </Field>
              <Field label="Unit price *">
                <Input
                  required
                  type="number"
                  step="any"
                  min="0"
                  value={form.unitPrice}
                  onChange={(e) => update("unitPrice", e.target.value)}
                />
              </Field>
              <Field label="Tax *">
                <Select
                  value={form.taxCode}
                  onValueChange={(v) => update("taxCode", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_CODES.map((tc) => (
                      <SelectItem key={tc.code} value={tc.code}>
                        {tc.code} — {tc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type *">
                <Select
                  value={form.nature}
                  onValueChange={(v) =>
                    update("nature", v as "goods" | "service")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">Goods</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((v) => !v)}
                className="px-0"
              >
                {showAdvanced ? "Hide" : "More"} options
              </Button>
            </div>

            {showAdvanced && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Unit">
                    <Input
                      value={form.unit}
                      onChange={(e) => update("unit", e.target.value)}
                    />
                  </Field>
                  <Field label="Harmonization code">
                    <Select
                      value={form.harmonizationCode || NO_HS_CODE}
                      onValueChange={selectHarmonizationCode}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_HS_CODE}>None</SelectItem>
                        {hsOptions.map((hs) => (
                          <SelectItem key={hs.code} value={hs.code}>
                            {hs.code} ({hs.exciseRate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.harmonizationCode
                        ? `Excise ${form.exciseRate || 0}% of unit price, from the harmonization table.`
                        : "Excise applies only to items with a harmonization code."}
                    </p>
                  </Field>
                </div>
                <Field label="Image URL">
                  <Input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => update("imageUrl", e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Long description">
                  <Textarea
                    value={form.longDescription}
                    onChange={(e) => update("longDescription", e.target.value)}
                    rows={2}
                    placeholder="Optional. Shown in the item details."
                  />
                </Field>

                <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={form.trackStock}
                      onChange={(e) => update("trackStock", e.target.checked)}
                      className="size-4 accent-[#5700FF]"
                    />
                    Track stock for this item
                  </label>
                  {form.trackStock && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="On hand">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          disabled={!qtyEditable}
                          value={form.stockQuantity}
                          onChange={(e) =>
                            update("stockQuantity", e.target.value)
                          }
                          placeholder="0"
                        />
                        {!qtyEditable && (
                          <span className="text-[11px] text-muted-foreground">
                            Use the row's "Stock" action to change on-hand.
                          </span>
                        )}
                      </Field>
                      <Field label="Low-stock alert at">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={form.lowStockThreshold}
                          onChange={(e) =>
                            update("lowStockThreshold", e.target.value)
                          }
                          placeholder="e.g. 5"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === "edit" && (
              <label className="flex items-center gap-2 rounded-md border border-dashed bg-muted/10 p-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saveAsNew}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setSaveAsNew(v);
                    if (v && item)
                      setForm((f) => ({
                        ...f,
                        code:
                          f.code === item.code ? `${item.code}-v2` : f.code,
                      }));
                  }}
                  className="size-3.5 accent-[#5700FF]"
                />
                Save as new SKU (keeps history — supersedes this one)
              </label>
            )}

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="inventory-form" disabled={busy}>
              {busy
                ? "Saving…"
                : mode === "edit"
                  ? saveAsNew
                    ? "Create new SKU"
                    : "Save changes"
                  : "Add item"}
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
    <div
      className={`flex flex-col gap-1.5 ${spanFull ? "col-span-2" : ""}`.trim()}
    >
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
