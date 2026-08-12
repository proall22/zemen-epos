import { useCallback, useEffect, useState } from "react";
import { Building2, Store } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type ListScope = "branch" | "merchant";

/**
 * "This branch / All branches" pill. MERCHANT_ADMIN only — hidden for cashiers
 * and accountants (they operate on their active branch only). Selection persists
 * in localStorage per view so the user's pick sticks across visits.
 */
export function useListScope(storageKey: string): [
  ListScope,
  (scope: ListScope) => void,
] {
  const { user } = useAuth();
  const isAdmin = user?.role === "MERCHANT_ADMIN";
  const [scope, setScopeState] = useState<ListScope>("branch");

  useEffect(() => {
    if (!isAdmin) {
      setScopeState("branch");
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "merchant" || stored === "branch") setScopeState(stored);
    } catch {
      /* noop */
    }
  }, [isAdmin, storageKey]);

  const setScope = useCallback(
    (next: ListScope) => {
      setScopeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* noop */
      }
    },
    [storageKey],
  );

  return [scope, setScope];
}

export function ScopeToggle({
  scope,
  onChange,
  className,
}: {
  scope: ListScope;
  onChange: (s: ListScope) => void;
  className?: string;
}) {
  const { user, branch } = useAuth();
  if (user?.role !== "MERCHANT_ADMIN") return null;
  const branchLabel = branch?.tradeName ?? branch?.name ?? "This branch";
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-md border bg-background text-xs",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange("branch")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
          scope === "branch"
            ? "bg-[#5700FF] text-white"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Store className="size-3.5" />
        {branchLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("merchant")}
        className={cn(
          "flex items-center gap-1.5 border-l px-3 py-1.5 transition-colors",
          scope === "merchant"
            ? "bg-[#5700FF] text-white"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Building2 className="size-3.5" />
        All branches
      </button>
    </div>
  );
}
