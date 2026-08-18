import { cn } from "@/lib/utils";

/** Unified Zemen ePOS brand mark. It is SVG-based so it remains sharp in the
 * application shell, authentication screens, printed documents, and email. */
export function ZemenEPosLogo({
  className,
  mono = false,
  markOnly = false,
}: {
  className?: string;
  /** Renders a neutral one-colour treatment for dark or print surfaces. */
  mono?: boolean;
  /** Compact symbol used when navigation is collapsed. */
  markOnly?: boolean;
}) {
  const accent = mono ? "currentColor" : "#5700FF";
  return (
    <svg
      viewBox={markOnly ? "0 0 40 40" : "0 0 190 40"}
      role="img"
      aria-label="Zemen ePOS"
      className={cn("block", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="10" fill={accent} />
      <path
        d="M10.5 10.5h20v5.1L18.2 27h12.3v4.5h-21v-5.1l12.4-11.3H10.5v-4.6Z"
        fill={mono ? "#111827" : "white"}
      />
      <path d="M27.5 8.5h4v4h-4z" fill={mono ? "#111827" : "#BDA7FF"} />

      {!markOnly && (
        <>
          <text
            x="51"
            y="24.5"
            fill="currentColor"
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontSize="21"
            fontWeight="720"
            letterSpacing="-0.65"
          >
            Zemen
          </text>
          <text
            x="116"
            y="24.5"
            fill={accent}
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontSize="17"
            fontWeight="750"
            letterSpacing="-0.35"
          >
            ePOS
          </text>
          <text
            x="52"
            y="35"
            fill="currentColor"
            opacity="0.55"
            fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontSize="6.2"
            fontWeight="650"
            letterSpacing="1.45"
          >
            BUSINESS SYSTEMS
          </text>
        </>
      )}
    </svg>
  );
}

export default ZemenEPosLogo;
