import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  acceptConsent,
  getConsentDecision,
  rejectConsent,
} from "@/lib/resources";
import type { ConsentDecision } from "@/lib/types";

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return readApiMessage(e.body) ?? fallback;
  return e instanceof Error ? e.message : fallback;
}

const DURATION_OPTIONS = [
  { minutes: 10, labelKey: "10 minutes" },
  { minutes: 30, labelKey: "30 minutes" },
  { minutes: 60, labelKey: "1 hour" },
  { minutes: 180, labelKey: "3 hours" },
  { minutes: 360, labelKey: "6 hours" },
  { minutes: 720, labelKey: "12 hours" },
  { minutes: 1440, labelKey: "24 hours" },
];

type Outcome = "accepted" | "rejected" | null;

export function ConsentDecisionPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConsentDecision(token)
      .then((d) => {
        if (cancelled) return;
        setDecision(d);
        // Default the granted window to what was proposed (the max allowed).
        setGranted(d.proposedMinutes);
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e, "Unable to load this request."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onAccept() {
    if (granted == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptConsent(token, granted);
      setOutcome("accepted");
    } catch (e) {
      setError(messageOf(e, "Could not approve the request."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onReject() {
    setSubmitting(true);
    setError(null);
    try {
      await rejectConsent(token);
      setOutcome("rejected");
    } catch (e) {
      setError(messageOf(e, "Could not decline the request."));
    } finally {
      setSubmitting(false);
    }
  }

  const proposedCap = decision?.proposedMinutes ?? 1440;
  const options = DURATION_OPTIONS.filter((o) => o.minutes <= proposedCap);
  const alreadyDecided =
    decision != null && decision.status !== "PENDING" && outcome == null;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="mb-6">
        <ZemenEPosLogo className="h-6 w-auto text-foreground" />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[#5700FF]" />
            {t("consent.decisionTitle")}
          </CardTitle>
          {decision && (
            <CardDescription>
              {t("consent.decisionSubtitle", {
                requester: decision.requesterEmail,
                merchant: decision.merchantName,
              })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {error && <ErrorCallout title={error} />}

          {outcome === "accepted" && (
            <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-3 text-sm dark:bg-emerald-950/30">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>{t("consent.decisionAccepted")}</p>
            </div>
          )}
          {outcome === "rejected" && (
            <div className="flex items-start gap-3 rounded-md border border-muted px-3 py-3 text-sm">
              <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p>{t("consent.decisionRejected")}</p>
            </div>
          )}

          {alreadyDecided && (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-3 text-sm dark:bg-amber-950/30">
              <XCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p>{t("consent.decisionDecided")}</p>
            </div>
          )}

          {decision && !outcome && !alreadyDecided && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("consent.decisionScopes")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {decision.scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                    >
                      {t(`consent.scope${s}`)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("consent.decisionGrantFor")}</Label>
                <Select
                  value={granted != null ? String(granted) : ""}
                  onValueChange={(v) => setGranted(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.minutes} value={String(o.minutes)}>
                        {o.labelKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReject}
                  disabled={submitting}
                >
                  {t("consent.decisionReject")}
                </Button>
                <Button type="button" onClick={onAccept} disabled={submitting}>
                  {t("consent.decisionAccept")}
                </Button>
              </div>
            </>
          )}

          {(outcome || alreadyDecided) && (
            <div className="flex justify-end pt-1">
              <Button asChild variant="outline">
                <Link to="/">Done</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
