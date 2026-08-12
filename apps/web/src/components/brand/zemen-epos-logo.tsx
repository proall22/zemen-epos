import { cn } from "@/lib/utils";

/** Zemen-ePos wordmark. Styling is intentionally local to keep it consistent. */
export function ZemenEPosLogo({
  className,
  mono = false,
}: {
  className?: string;
  /** When true, the complete wordmark inherits the surrounding text color. */
  mono?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 135 32"
      overflow="visible"
      role="img"
      aria-label=""
      className={cn("block", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The 42px Z rises above the 32px viewBox at this shared baseline.
          Allowing SVG overflow keeps the full glyph visible without changing
          its established size, baseline, or the wordmark's aspect ratio. */}
      <text
        x="0"
        y="24"
        fontFamily="'Noto Serif Display SemiCondensed', 'Noto Serif Display', 'Times New Roman', serif"
        letterSpacing="-0.3px"
      >
        <tspan
          fill={mono ? "currentColor" : "#5700FF"}
          fontSize="42px"
          fontWeight="900"
        >
          Z
        </tspan>
        <tspan fill="currentColor" fontSize="23px" fontWeight="700">
          emen
        </tspan>
      </text>
    </svg>
  );
}

export default ZemenEPosLogo;
