import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  ChevronsUpDown,
  KeyRound,
  Loader2,
  ShieldCheck,
  Store,
  TriangleAlert,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import type { AvailableBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Top-left branch switcher. Sits under the brand mark in the sidebar and
 * behaves like an org picker: the current branch is always visible; clicking
 * opens a card grid of every branch the caller may act as. Cards badge
 * cred + cert readiness so the merchant admin sees at a glance which
 * branches are actually invoicing-ready.
 *
 * Non-ready branches (missing creds or cert) are still selectable — MoR
 * writes will refuse them clearly at the write path, but reads work.
 */
export function BranchSwitcherCard() {
  const {
    branch: activeBranch,
    availableBranches,
    selectBranch,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  if (!user?.merchantId) return null;

  const active = activeBranch;
  const empty = availableBranches.length === 0;
  const isMerchantAdmin = user.role === "MERCHANT_ADMIN";
  const readyBranches = availableBranches.filter(
    (b) => b.hasCreds && b.hasCert,
  );
  const noneReady =
    !empty && readyBranches.length === 0;

  async function pick(b: AvailableBranch) {
    const ready = b.hasCreds && b.hasCert;
    if (!ready) {
      // Non-ready + admin → route to the wizard for that branch.
      if (isMerchantAdmin) {
        navigate(`/merchants?selected=${b.merchantId}&branch=${b.id}`);
        setOpen(false);
      }
      return;
    }
    if (b.id === active?.id) {
      setOpen(false);
      return;
    }
    setSwitchingTo(b.id);
    setSwitchError(null);
    try {
      await selectBranch(b.id);
      setOpen(false);
    } catch {
      setSwitchError("Couldn't switch branch. Check your connection.");
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
          aria-label="Change branch"
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md border",
              active ? "bg-[#5700FF]/10 text-[#5700FF]" : "text-muted-foreground",
            )}
          >
            <Store className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Acting as
            </span>
            <span className="truncate text-sm font-semibold">
              {empty
                ? "No branch access"
                : (active?.tradeName ?? active?.name ?? "Pick a branch")}
            </span>
            {active?.subTin && (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                Sub-TIN {active.subTin}
              </span>
            )}
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={12}
        className="w-[420px] p-0"
      >
        <div className="border-b bg-muted/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Switch branch
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All actions — invoices, receipts, withholding — will be attributed
            to the branch you pick.
          </p>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {switchError && (
            <div className="mx-1 mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <p>{switchError}</p>
            </div>
          )}
          {empty ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Your account has no branch access yet. Ask a merchant admin to
              grant you at least one branch.
            </p>
          ) : (
            <>
              {noneReady && (
                <div className="mx-1 mb-2 flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2.5 text-xs text-yellow-800 dark:text-yellow-200">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    {isMerchantAdmin
                      ? "None of your branches are fully onboarded yet. Open a branch below to finish setup — you'll need EIRMS credentials and an INSA certificate for each."
                      : "None of your branches are ready to invoice. Ask a merchant admin to finish EIRMS onboarding for you."}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {availableBranches.map((b) => (
                  <BranchCard
                    key={b.id}
                    branch={b}
                    active={b.id === active?.id}
                    loading={switchingTo === b.id}
                    isAdmin={isMerchantAdmin}
                    onPick={() => pick(b)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BranchCard({
  branch,
  active,
  loading,
  isAdmin,
  onPick,
}: {
  branch: AvailableBranch;
  active: boolean;
  loading: boolean;
  isAdmin: boolean;
  onPick: () => void;
}) {
  const ready = branch.hasCreds && branch.hasCert;
  const missing: string[] = [];
  if (!branch.hasCreds) missing.push("EIRMS credentials");
  if (!branch.hasCert) missing.push("INSA certificate");
  const blockedTitle = ready
    ? undefined
    : isAdmin
      ? `Missing: ${missing.join(" + ")}. Click to finish setup.`
      : `Missing: ${missing.join(" + ")}. Ask merchant admin to finish onboarding.`;
  const clickable = ready || isAdmin;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!clickable}
      title={blockedTitle}
      aria-disabled={!clickable}
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
        active
          ? "border-[#5700FF]/60 bg-[#5700FF]/5"
          : ready
            ? "border-input hover:border-[#5700FF]/40 hover:bg-accent/40"
            : isAdmin
              ? "border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/70"
              : "cursor-not-allowed border-input bg-muted/30 opacity-70",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <Store className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{branch.name}</span>
          {branch.tradeName && branch.tradeName !== branch.name && (
            <span className="truncate text-xs text-muted-foreground">
              · {branch.tradeName}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          {branch.subTin && <span>Sub-TIN {branch.subTin}</span>}
          {branch.systemNumber && <span>SYS {branch.systemNumber}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ReadinessPill
            ok={branch.hasCreds}
            label="EIRMS creds"
            icon={<KeyRound className="size-3" />}
          />
          <ReadinessPill
            ok={branch.hasCert}
            label="INSA cert"
            icon={<ShieldCheck className="size-3" />}
          />
          {ready ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              <BadgeCheck className="size-3" />
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-200">
              <TriangleAlert className="size-3" />
              {isAdmin ? "Finish setup" : "Not ready"}
            </span>
          )}
        </div>
      </div>
      <div className="flex size-6 shrink-0 items-center justify-center">
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : active ? (
          <Check className="size-4 text-[#5700FF]" />
        ) : null}
      </div>
    </button>
  );
}

function ReadinessPill({
  ok,
  label,
  icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest",
        ok
          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
          : "border-yellow-500/40 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300",
      )}
      title={ok ? undefined : `${label} not configured for this branch`}
    >
      {ok ? icon : <TriangleAlert className="size-3" />}
      {label}
    </span>
  );
}
