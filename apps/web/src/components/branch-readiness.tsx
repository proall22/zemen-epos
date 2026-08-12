import { AlertTriangle, Check, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AvailableBranch, SafeBranch } from "@/lib/types";

export interface ReadinessCheckpoint {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
  /** Blockers genuinely stop the branch transacting. Everything else is a
   *  profile field the merchant record backfills (see the API's
   *  BRANCH_IDENTITY_SELECT — branch values are a preference, not a
   *  requirement), so listing them as blockers told branches with hundreds of
   *  invoices that they couldn't issue any. */
  required: boolean;
}

export function branchReadiness(
  branch: (SafeBranch | AvailableBranch) & {
    hasCreds?: boolean;
    hasCert?: boolean;
  },
): ReadinessCheckpoint[] {
  const hasCreds =
    "hasCreds" in branch && typeof branch.hasCreds === "boolean"
      ? branch.hasCreds
      : Boolean(
          branch.eirmsClientIdSet &&
            branch.eirmsClientSecretSet &&
            branch.eirmsApikeySet,
        );
  // Undefined means the caller's shape can't report it — treat as unknown and
  // don't accuse the branch of missing a certificate it may well have.
  const certKnown =
    "hasCert" in branch && typeof branch.hasCert === "boolean";
  const hasCert = certKnown ? Boolean(branch.hasCert) : true;

  return [
    {
      id: "identity",
      label: "Branch identity",
      ok: Boolean(branch.name?.trim() && branch.systemNumber?.trim()),
      hint: "Name + MOR system number",
      required: true,
    },
    {
      id: "creds",
      label: "EIRMS credentials",
      ok: hasCreds,
      hint: "Client id, client secret, apikey",
      required: true,
    },
    {
      id: "cert",
      label: "INSA certificate",
      ok: hasCert,
      hint: "Signing key + issued PEM",
      required: true,
    },
    {
      id: "address",
      label: "Branch address",
      ok: Boolean(branch.city?.trim() && branch.region?.trim()),
      hint: "Falls back to the merchant address",
      required: false,
    },
    {
      id: "tax",
      label: "Sub-TIN",
      ok: Boolean(branch.subTin?.trim()),
      hint: "Only needed on the INSA certificate request",
      required: false,
    },
  ];
}

export interface BranchReadinessProps {
  branch: (SafeBranch | AvailableBranch) & {
    hasCreds?: boolean;
    hasCert?: boolean;
  };
  variant?: "full" | "compact";
  className?: string;
}

export function BranchReadiness({
  branch,
  variant = "full",
  className,
}: BranchReadinessProps) {
  const checks = branchReadiness(branch);
  const required = checks.filter((c) => c.required);
  // Progress tracks what actually gates transacting; optional fields would
  // otherwise hold a fully-operational branch at 3/5 forever.
  const done = required.filter((c) => c.ok).length;
  const total = required.length;
  const percent = Math.round((done / total) * 100);
  const blockers = required.filter((c) => !c.ok);
  const suggestions = checks.filter((c) => !c.required && !c.ok);
  const ready = blockers.length === 0;

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              ready ? "bg-emerald-500" : "bg-yellow-500",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            ready ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          {done}/{total}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border p-3",
        ready
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-yellow-500/40 bg-yellow-500/5",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {ready ? (
          <Check className="size-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="size-4 text-yellow-600" />
        )}
        <p className="text-sm font-semibold">
          {ready ? "This branch is ready" : "Onboarding incomplete"}
        </p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all",
            ready ? "bg-emerald-500" : "bg-yellow-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {ready ? (
        <p className="text-xs text-muted-foreground">
          This branch can issue invoices and receipts.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-yellow-800 dark:text-yellow-200">
            The following {blockers.length === 1 ? "step is" : "steps are"} still
            preventing this branch from acting on EIRMS:
          </p>
          <ul className="flex flex-col gap-1">
            {blockers.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-1.5 text-xs text-yellow-900 dark:text-yellow-100"
              >
                <CircleAlert className="mt-0.5 size-3 shrink-0 text-yellow-600" />
                <span>
                  <span className="font-medium">{b.label}</span>
                  {b.hint && (
                    <span className="text-muted-foreground"> — {b.hint}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {suggestions.length > 0 && (
        <div
          className={cn(
            "flex flex-col gap-1 text-xs text-muted-foreground",
            ready ? "mt-2" : "mt-3 border-t border-yellow-500/20 pt-2",
          )}
        >
          <span className="font-medium">Optional — not required to trade:</span>
          {suggestions.map((s) => (
            <span key={s.id}>
              {s.label}
              {s.hint && ` — ${s.hint}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
