import { useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Tag } from "lucide-react";

import { UpcBarcode } from "@/components/upc-barcode";
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
import type { InventoryItem } from "@/lib/types";

export interface PrintLabelsDialogProps {
  items: InventoryItem[];
  /** The selected item id, when the caller wants to prefill just one. */
  focusItemId?: string | null;
}

/**
 * Prints a sheet of barcode labels for shelf-tagging. Merchant chooses which
 * items and how many copies per item; hitting Print sends only the label grid
 * to the printer (the rest of the page is hidden via a print stylesheet).
 */
export function PrintLabelsDialog({
  items,
  focusItemId,
}: PrintLabelsDialogProps) {
  const [open, setOpen] = useState(false);
  const [copiesById, setCopiesById] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Kept purely for scrollIntoView-style access if we ever need it — printing
  // opens a dedicated window so we don't clash with the app's layout.
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  // Only items with something to render as a barcode.
  const printable = useMemo(
    () => items.filter((i) => (i.upc ?? i.sku ?? i.code)?.trim()),
    [items],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    // Preselect the focused item on open; otherwise start empty.
    setSelected(new Set(focusItemId ? [focusItemId] : []));
    setCopiesById({});
  }

  const rendered = useMemo(() => {
    const out: InventoryItem[] = [];
    for (const item of printable) {
      if (!selected.has(item.id)) continue;
      const n = copiesById[item.id] ?? 1;
      for (let i = 0; i < n; i++) out.push(item);
    }
    return out;
  }, [printable, selected, copiesById]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Tag className="size-4" />
          Print labels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Print barcode labels</DialogTitle>
          <DialogDescription>
            Pick items and set how many labels per item. Hit Print to send the
            grid straight to your printer — everything outside the grid is
            hidden on the print stylesheet.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto rounded border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs">
              <tr>
                <th className="w-10 p-2"></th>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">Barcode</th>
                <th className="w-20 p-2 text-right">Copies</th>
              </tr>
            </thead>
            <tbody>
              {printable.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    No items have a UPC, SKU, or code to print.
                  </td>
                </tr>
              ) : (
                printable.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2 align-middle">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#5700FF]"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <div className="font-medium">{item.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.code}
                      </div>
                    </td>
                    <td className="p-2 align-middle font-mono text-xs">
                      {item.upc ?? item.sku ?? item.code}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        disabled={!selected.has(item.id)}
                        value={copiesById[item.id] ?? 1}
                        onChange={(e) =>
                          setCopiesById((prev) => ({
                            ...prev,
                            [item.id]: Math.max(
                              1,
                              Math.min(999, Number(e.target.value) || 1),
                            ),
                          }))
                        }
                        className="h-8 w-16 text-right"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rendered.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">
              Preview ({rendered.length} label{rendered.length === 1 ? "" : "s"})
            </Label>
            <div
              ref={printAreaRef}
              className="mt-2 max-h-64 overflow-y-auto rounded border bg-white p-3 print:max-h-none print:overflow-visible print:border-0 print:p-0"
            >
              <div className="grid grid-cols-3 gap-3">
                {rendered.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="flex flex-col items-center gap-1 rounded border border-dashed p-2 text-black break-inside-avoid"
                  >
                    <span className="line-clamp-2 text-center text-[10px] font-medium leading-tight">
                      {item.description}
                    </span>
                    <UpcBarcode
                      value={item.upc ?? item.sku ?? item.code}
                      height={32}
                      showText={false}
                      className="w-full"
                    />
                    <span className="font-mono text-[10px]">
                      {item.upc ?? item.sku ?? item.code}
                    </span>
                    <span className="text-[10px] tabular-nums">
                      {item.unitPrice.toFixed(2)} ETB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={printAreaRef} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            onClick={() => printLabels(rendered)}
            disabled={rendered.length === 0}
          >
            <Printer className="size-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Open a dedicated print window and populate it via `createElement` so the
 * browser prints only the labels — not the whole app. Barcode SVGs are
 * generated here (jsbarcode is already bundled) and adopted into the print
 * window as SVG DOM nodes, so the print window never has to load an external
 * script and we never touch `innerHTML` / `document.write`.
 */
function printLabels(items: InventoryItem[]): void {
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return;
  const doc = win.document;

  // Blank the auto-generated <html> so we own the tree.
  doc.title = "Barcode labels";
  const style = doc.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 12px; font-family: system-ui, sans-serif; color: #111; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .label {
      border: 1px dashed #999; padding: 6px; display: flex; flex-direction: column;
      align-items: center; gap: 2px; break-inside: avoid;
    }
    .title {
      font-size: 10px; text-align: center;
      display: -webkit-box; -webkit-box-orient: vertical;
      -webkit-line-clamp: 2; overflow: hidden;
    }
    .mono { font-family: ui-monospace, monospace; font-size: 10px; }
    svg { display: block; }
    @media print { body { margin: 8px; } }
  `;
  doc.head.appendChild(style);

  const grid = doc.createElement("div");
  grid.className = "grid";
  doc.body.appendChild(grid);

  for (const item of items) {
    const value = (item.upc ?? item.sku ?? item.code ?? "").trim();

    const label = doc.createElement("div");
    label.className = "label";

    const title = doc.createElement("div");
    title.className = "title";
    title.textContent = item.description;
    label.appendChild(title);

    const svg = buildBarcodeSvg(doc, value);
    if (svg) label.appendChild(svg);

    const code = doc.createElement("div");
    code.className = "mono";
    code.textContent = value;
    label.appendChild(code);

    const price = doc.createElement("div");
    price.className = "mono";
    price.textContent = `${item.unitPrice.toFixed(2)} ETB`;
    label.appendChild(price);

    grid.appendChild(label);
  }

  // Print once the layout is ready. Give the new window one frame to lay
  // out the SVGs so no size-zero labels sneak through.
  win.setTimeout(() => {
    win.focus();
    win.print();
  }, 100);
}

/** Generate a jsbarcode SVG in the *parent* document (where jsbarcode is
 *  loaded), then import the node into the target document so it can be
 *  appended there without touching innerHTML. */
function buildBarcodeSvg(
  targetDoc: Document,
  value: string,
): SVGElement | null {
  if (!value) return null;
  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  ) as SVGElement;
  const format = /^\d{8}$/.test(value)
    ? "EAN8"
    : /^\d{12}$/.test(value)
      ? "UPC"
      : /^\d{13}$/.test(value)
        ? "EAN13"
        : "CODE128";
  try {
    JsBarcode(svg, value, {
      format,
      height: 40,
      width: 1.6,
      margin: 0,
      fontSize: 10,
      displayValue: false,
    });
  } catch {
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        height: 40,
        width: 1.6,
        margin: 0,
        fontSize: 10,
        displayValue: false,
      });
    } catch {
      return null;
    }
  }
  return targetDoc.importNode(svg, true) as SVGElement;
}
