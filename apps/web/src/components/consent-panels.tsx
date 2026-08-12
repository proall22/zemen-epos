import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, LogIn, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import {
  listGrantsForMerchant,
  listMyConsentGrants,
  requestConsent,
  revokeConsent,
} from "@/lib/resources";
import type { ConsentGrant, ConsentScope, ConsentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_SCOPES: ConsentScope[] = [
  "DASHBOARD",
  "INVOICES",
  "RECEIPTS",
  "INVENTORY",
  "INVENTORY_EDIT",
  "USERS_EDIT",
];

const DURATIONS = [
  { minutes: 10, label: "10 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return readApiMessage(e.body) ?? fallback;
  return e instanceof Error ? e.message : fallback;
}

function isLive(g: ConsentGrant): boolean {
  return (
    g.status === "ACCEPTED" &&
    g.expiresAt != null &&
    new Date(g.expiresAt).getTime() > Date.now()
  );
}

function StatusBadge({ status }: { status: ConsentStatus }) {
  const { t } = useTranslation();
  const map: Record<ConsentStatus, { key: string; className: string }> = {
    PENDING: { key: "consent.pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
    ACCEPTED: { key: "consent.active", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
    EXPIRED: { key: "consent.expired", className: "bg-muted text-muted-foreground" },
    REJECTED: { key: "consent.rejected", className: "bg-muted text-muted-foreground" },
    REVOKED: { key: "consent.revoked", className: "bg-muted text-muted-foreground" },
  };
  const cfg = map[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", cfg.className)}>
      {t(cfg.key)}
    </span>
  );
}

function ScopeChips({ scopes }: { scopes: ConsentScope[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((s) => (
        <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t(`consent.scope${s}`)}
        </span>
      ))}
    </div>
  );
}

// ===========================================================================
// Super-admin: request access to a merchant + enter/exit an active grant
// ===========================================================================

export function SuperAdminConsentPanel({
  merchantId,
  merchantName,
}: {
  merchantId: string;
  merchantName: string;
}) {
  const { t } = useTranslation();
  const { consentSession, enterMerchant, exitMerchant } = useAuth();
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listMyConsentGrants();
      setGrants(all.filter((g) => g.merchantId === merchantId));
      setError(null);
    } catch (e) {
      setError(messageOf(e, "Couldn't load access requests."));
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inThisMerchant = consentSession?.merchantId === merchantId;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {t("consent.accessSectionTitle")}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <KeyRound className="size-4" />
          {t("consent.requestTitle")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("consent.accessSectionEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={g.status} />
                    {isLive(g) && g.expiresAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("consent.bannerExpiresIn")}{" "}
                        {new Date(g.expiresAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <ScopeChips scopes={g.scopes} />
                </div>
                {isLive(g) &&
                  (inThisMerchant ? (
                    <Button variant="outline" size="sm" onClick={exitMerchant}>
                      <LogOut className="size-4" />
                      {t("consent.exit")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        enterMerchant({
                          merchantId,
                          merchantName,
                          scopes: g.scopes,
                          expiresAt: g.expiresAt!,
                        })
                      }
                    >
                      <LogIn className="size-4" />
                      {t("consent.enter")}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <RequestAccessDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        merchantId={merchantId}
        merchantName={merchantName}
        onSent={() => void refresh()}
      />
    </Card>
  );
}

function RequestAccessDialog({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  merchantName: string;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const [scopes, setScopes] = useState<ConsentScope[]>(["DASHBOARD"]);
  const [minutes, setMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function toggle(scope: ConsentScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function submit() {
    if (scopes.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestConsent({ merchantId, scopes, proposedMinutes: minutes });
      setSent(true);
      onSent();
    } catch (e) {
      setError(messageOf(e, "Couldn't send the request."));
    } finally {
      setSubmitting(false);
    }
  }

  // Reset transient state whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setSent(false);
      setError(null);
      setScopes(["DASHBOARD"]);
      setMinutes(60);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("consent.requestTitle")}</DialogTitle>
          <DialogDescription>
            {t("consent.requestSubtitle", { merchant: merchantName })}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-3 text-sm dark:bg-emerald-950/30">
            {t("consent.requestSent")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("consent.scopesLabel")}</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map((s) => {
                  const active = scopes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggle(s)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-[#5700FF] bg-[#5700FF]/10 text-[#5700FF]"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t(`consent.scope${s}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("consent.durationLabel")}</Label>
              <Select
                value={String(minutes)}
                onValueChange={(v) => setMinutes(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.minutes} value={String(d.minutes)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting || scopes.length === 0}
            >
              {submitting ? t("consent.requestSending") : t("consent.requestSubmit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Merchant admin: who has platform access to my merchant + revoke
// ===========================================================================

export function MerchantConsentPanel() {
  const { t } = useTranslation();
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGrants(await listGrantsForMerchant());
      setError(null);
    } catch (e) {
      setError(messageOf(e, "Couldn't load access grants."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await revokeConsent(id);
      await refresh();
    } catch (e) {
      setError(messageOf(e, "Couldn't revoke access."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {t("consent.grantedTitle")}
        </CardTitle>
        <CardDescription>{t("consent.decisionTitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("consent.grantedEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grants.map((g) => {
              const canRevoke =
                g.status === "ACCEPTED" || g.status === "PENDING";
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={g.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {t("consent.grantedBy", {
                          date: new Date(g.createdAt).toLocaleDateString(),
                        })}
                      </span>
                    </div>
                    <ScopeChips scopes={g.scopes} />
                  </div>
                  {canRevoke && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void revoke(g.id)}
                      disabled={busyId === g.id}
                    >
                      {t("consent.revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
