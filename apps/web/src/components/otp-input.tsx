import { useRef } from "react";
import { Input } from "@/components/ui/input";

export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  function setDigit(index: number, raw: string) {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) {
      const next = digits.slice();
      next[index] = "";
      onChange(next.join(""));
      return;
    }
    const next = digits.slice();
    incoming
      .slice(0, 6 - index)
      .split("")
      .forEach((digit, offset) => {
        next[index + offset] = digit;
      });
    onChange(next.join("").slice(0, 6));
    refs.current[Math.min(index + incoming.length, 5)]?.focus();
  }
  return (
    <div
      className="grid w-full grid-cols-6 gap-1.5 sm:gap-2"
      role="group"
      aria-label="Six-digit verification code"
    >
      {digits.map((digit, i) => (
        <Input
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          className="h-12 min-w-0 px-0 text-center text-lg font-semibold sm:h-14"
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digit && i > 0)
              refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft")
              refs.current[Math.max(0, i - 1)]?.focus();
            if (e.key === "ArrowRight")
              refs.current[Math.min(5, i + 1)]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, 6);
            if (pasted) {
              e.preventDefault();
              onChange(pasted);
              refs.current[Math.min(pasted.length, 5)]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}
