import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { listHarmonizationCodes } from "@/lib/resources";
import { DEFAULT_TAX_CODE, TAX_CODES, taxRateForCode } from "@/lib/tax-codes";
import type { HarmonizationCode, InventoryItem } from "@/lib/types";

/** Synthetic-id prefix marking an item that lives only in the cart and is
 *  not backed by a row in the inventory table. The sale-submit path checks
 *  this prefix to decide whether to attach an inventoryItemId. */
export const ADHOC_ID_PREFIX = "adhoc:";

/** Sentinel sent to MoR for off-catalog lines. MoR requires an ItemCode on
 *  every line; this is the documented placeholder we use. */
export const ADHOC_ITEM_CODE = "ADHOC";

// Sentinel Select value for "no harmonization code" — Radix can't use "".
const NO_HS_CODE = "__none__";

export interface AddAdHocLineDialogProps {
  onAdd: (item: InventoryItem) => void;
  /** Lock the new line's nature when the cart already has goods or
   *  services — MoR doesn't allow mixed invoices. */
  forcedNature: InventoryItem["nature"] | null;
}

export function AddAdHocLineDialog({ onAdd, forcedNature }: AddAdHocLineDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [unitPrice, setUnitPrice] = useState("");
  const [nature, setNature] = useState<InventoryItem["nature"]>(
    forcedNature ?? "goods",
  );
  const [taxCode, setTaxCode] = useState(DEFAULT_TAX_CODE);
  const [harmonizationCode, setHarmonizationCode] = useState("");
  const [exciseRate, setExciseRate] = useState("");
  const [hsCodes, setHsCodes] = useState<HarmonizationCode[]>([]);

  const disabled = !description.trim() || !unitPrice || Number(unitPrice) <= 0;

  useEffect(() => {
    if (!open) return;
    void listHarmonizationCodes()
      .then(setHsCodes)
      .catch(() => setHsCodes([]));
  }, [open]);

  function reset() {
    setDescription("");
    setUnit("PCS");
    setUnitPrice("");
    setNature(forcedNature ?? "goods");
    setTaxCode(DEFAULT_TAX_CODE);
    setHarmonizationCode("");
    setExciseRate("");
  }

  /** Picking a code carries its excise rate onto the line. */
  function selectHarmonizationCode(code: string) {
    if (code === NO_HS_CODE) {
      setHarmonizationCode("");
      setExciseRate("");
      return;
    }
    setHarmonizationCode(code);
    const hs = hsCodes.find((h) => h.code === code);
    setExciseRate(hs ? String(hs.exciseRate) : "");
  }

  function handleAdd() {
    const item: InventoryItem = {
      id: `${ADHOC_ID_PREFIX}${crypto.randomUUID()}`,
      code: ADHOC_ITEM_CODE,
      sku: null,
      upc: null,
      description: description.trim(),
      longDescription: null,
      imageUrl: null,
      unit: unit.trim() || "PCS",
      unitPrice: Number(unitPrice),
      taxCode,
      taxRate: taxRateForCode(taxCode),
      harmonizationCode: harmonizationCode.trim() || null,
      exciseRate: exciseRate.trim() ? Number(exciseRate) || 0 : null,
      nature,
      active: true,
      trackStock: false,
      onHand: null,
      totalOnHand: 0,
      sellable: null,
      lowStockThreshold: null,
      predecessorId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAdd(item);
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <PlusCircle className="size-4" />
          Custom line
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom line</DialogTitle>
          <DialogDescription>
            For one-off sales that aren't in your inventory. Stock isn't tracked
            for these lines; everything else (tax, totals, MoR submission)
            behaves identically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <Field label="Description" htmlFor="adhoc-desc">
            <Input
              id="adhoc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you selling?"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit price (ETB)" htmlFor="adhoc-price">
              <Input
                id="adhoc-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </Field>
            <Field label="Unit" htmlFor="adhoc-unit">
              <Input
                id="adhoc-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="PCS"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax" htmlFor="adhoc-tax">
              <Select value={taxCode} onValueChange={setTaxCode}>
                <SelectTrigger id="adhoc-tax">
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
            <Field label="Nature" htmlFor="adhoc-nature">
              <Select
                value={nature}
                onValueChange={(v) => setNature(v as InventoryItem["nature"])}
                disabled={forcedNature !== null}
              >
                <SelectTrigger id="adhoc-nature">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="goods">Goods</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Harmonization code" htmlFor="adhoc-hc">
            <Select
              value={harmonizationCode || NO_HS_CODE}
              onValueChange={selectHarmonizationCode}
            >
              <SelectTrigger id="adhoc-hc">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_HS_CODE}>None</SelectItem>
                {hsCodes.map((hs) => (
                  <SelectItem key={hs.code} value={hs.code}>
                    {hs.code} ({hs.exciseRate}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {harmonizationCode
                ? `Excise ${exciseRate || 0}% of unit price.`
                : "Excise applies only to lines with a harmonization code."}
            </p>
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={disabled} onClick={handleAdd}>
            Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
