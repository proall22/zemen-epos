/**
 * Diagonal, tiled "VOID" watermark laid over a cancelled invoice document.
 * Rendered inside a `relative` article; sits above the content (pointer-events
 * disabled) at low opacity so the invoice stays readable. Uses text (not a
 * background image) plus print-color-adjust so it survives browser print/PDF.
 */
export function VoidWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 flex flex-wrap content-center items-center justify-center gap-x-12 gap-y-20 overflow-hidden"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="-rotate-[35deg] select-none text-6xl font-black uppercase tracking-[0.2em] text-red-600/20"
        >
          VOID
        </span>
      ))}
    </div>
  );
}
