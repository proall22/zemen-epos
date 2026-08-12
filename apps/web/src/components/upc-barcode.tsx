import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

import { cn } from "@/lib/utils";

export interface UpcBarcodeProps {
  /** The number to encode. If it looks like a UPC-A / EAN-8 / EAN-13, we
   *  pick the matching symbology so the printed digits reproduce cleanly; any
   *  other input falls back to CODE128, which encodes arbitrary text. */
  value: string | null | undefined;
  /** Rendered bar height in px. Default 40 keeps the row inline. */
  height?: number;
  /** When true, render digits under the bars (default). Turn off for compact
   *  in-row previews. */
  showText?: boolean;
  className?: string;
}

/**
 * Renders a barcode SVG for a UPC/EAN/CODE128 value. jsbarcode mutates an
 * existing SVG element in place, so we render one and hand it the ref on
 * mount / value change.
 */
export function UpcBarcode({
  value,
  height = 40,
  showText = true,
  className,
}: UpcBarcodeProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const cleaned = (value ?? "").trim();
    if (!cleaned) {
      // Wipe any prior barcode so a cleared value doesn't leave a stale one.
      el.replaceChildren();
      return;
    }
    try {
      JsBarcode(el, cleaned, {
        format: pickFormat(cleaned),
        height,
        width: 1.6,
        margin: 0,
        displayValue: showText,
        fontSize: 12,
        background: "transparent",
      });
    } catch {
      // Invalid input for the chosen format — fall back to CODE128, which
      // accepts anything printable.
      try {
        JsBarcode(el, cleaned, {
          format: "CODE128",
          height,
          width: 1.6,
          margin: 0,
          displayValue: showText,
          fontSize: 12,
          background: "transparent",
        });
      } catch {
        el.replaceChildren();
      }
    }
  }, [value, height, showText]);

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={value ? `Barcode ${value}` : "No barcode"}
      className={cn("block", className)}
    />
  );
}

/** Choose a symbology based on digit count so common retail barcodes look
 *  right. Anything non-numeric or off-length falls to CODE128 downstream. */
function pickFormat(v: string): string {
  if (/^\d{8}$/.test(v)) return "EAN8";
  if (/^\d{12}$/.test(v)) return "UPC";
  if (/^\d{13}$/.test(v)) return "EAN13";
  return "CODE128";
}
