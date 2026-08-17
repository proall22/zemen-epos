import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import {
  TURNSTILE_ENABLED,
  TurnstileWidget,
} from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();

  if (status === "authed") {
    const target =
      (location.state as { from?: string } | null)?.from ?? "/sale";
    return <Navigate to={target} replace />;
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <BrandSide />
      <FormSide login={login} />
    </div>
  );
}

function BrandSide() {
  const { t } = useTranslation();
  return (
    <aside className="relative hidden overflow-hidden bg-[#111827] text-white lg:flex lg:flex-col">

      <div className="relative z-10 flex flex-1 flex-col justify-between p-12">
        <header className="flex items-center gap-3">
          <ZemenEPosLogo mono className="h-6 w-auto text-white" />
          <span className="text-white/40">·</span>
          <span className="text-sm font-medium tracking-tight">e-invoice</span>
        </header>

        <div className="flex max-w-md flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em]">
            {t("auth.login.brandBadge")}
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {t("auth.login.brandTitleLine1")}
            <br />
            {t("auth.login.brandTitleLine2")}
          </h1>
          <p className="text-base leading-relaxed text-white/80">
            {t("auth.login.brandBody")}
          </p>

          <ul className="flex flex-col gap-3 pt-2 text-sm text-white/85">
            <li className="flex items-start gap-2.5">
              <Workflow className="mt-0.5 size-4 shrink-0 text-white" />
              <span>{t("auth.login.brandBullet1")}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white" />
              <span>{t("auth.login.brandBullet2")}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-white" />
              <span>{t("auth.login.brandBullet3")}</span>
            </li>
          </ul>
        </div>

        <footer className="text-xs text-white/50">
          {t("auth.login.footerCopy", { year: new Date().getFullYear() })}
        </footer>
      </div>
    </aside>
  );
}

function FormSide({
  login,
}: {
  login: (
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError({ title: t("auth.login.credsRequired"), items: [] });
      return;
    }
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError({
        title: t("auth.login.turnstileRequired"),
        items: [],
      });
      return;
    }
    setBusy(true);
    try {
      await login(email, password, turnstileToken ?? undefined);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? t("auth.login.cannotSignIn"),
          items: [],
        });
      } else {
        setError({
          title: t("auth.login.cannotReach"),
          items: [],
        });
      }
    }
  }

  return (
    <main className="flex items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            e-invoice
          </span>
        </div>

        <header className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("auth.login.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("auth.login.subtitle")}
          </p>
        </header>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <TurnstileWidget
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />

          {error && <ErrorCallout title={error.title} items={error.items} />}

          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? t("auth.login.signingIn") : t("auth.login.submit")}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <Link
            to="/forgot-password"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("auth.login.forgot")}
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          {t("auth.login.signupHint")}{" "}
          <Link
            to="/signup"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("auth.login.signupLink")}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
