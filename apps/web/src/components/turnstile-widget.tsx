import { useEffect, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

/** Cloudflare Turnstile widget. Renders nothing when VITE_TURNSTILE_SITE_KEY
 *  is unset — local dev / disabled-server configurations stay clean. */
export function TurnstileWidget({
  onVerify,
  onExpire,
  className,
}: TurnstileWidgetProps) {
  const ref = useRef<TurnstileInstance | null>(null);

  useEffect(() => () => ref.current?.remove(), []);

  if (!SITE_KEY) return null;

  return (
    <div className={className}>
      <Turnstile
        ref={ref}
        siteKey={SITE_KEY}
        options={{ theme: "auto", appearance: "always" }}
        onSuccess={onVerify}
        onExpire={() => {
          onExpire?.();
        }}
      />
    </div>
  );
}

export const TURNSTILE_ENABLED = Boolean(SITE_KEY);
