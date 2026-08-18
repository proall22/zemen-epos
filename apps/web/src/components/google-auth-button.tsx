import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

export function GoogleAuthButton({
  intent,
  className,
}: {
  intent: "login" | "signup";
  className?: string;
}) {
  return (
    <a
      href={`${API_BASE}/auth/google/start?intent=${intent}`}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-3 rounded-[12px] border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.32 2.98-7.39Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.6A10 10 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.4 13.89A6 6 0 0 1 6.08 12c0-.66.11-1.3.32-1.89v-2.6H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.49l3.35-2.6Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.35 2.6C7.19 7.74 9.4 5.98 12 5.98Z"
        />
      </svg>
      Continue with Google
    </a>
  );
}
