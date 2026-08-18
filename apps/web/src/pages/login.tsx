import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { GoogleAuthButton } from "@/components/google-auth-button";
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
import { savePendingAuth } from "@/lib/pending-auth";
import type { PendingAuthResponse } from "@/lib/types";

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
      <AuthBrandPanel />
      <FormSide login={login} />
    </div>
  );
}

function FormSide({
  login,
}: {
  login: (
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<PendingAuthResponse>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
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
      const pending = await login(email, password, turnstileToken ?? undefined);
      savePendingAuth(pending);
      navigate(
        pending.step === "email-verification" ? "/verify-email" : "/auth",
      );
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
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 sm:px-6 lg:min-h-0 lg:py-12">
      <div className="flex w-full max-w-sm flex-col gap-7">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs text-muted-foreground">Zemen ePOS</span>
        </div>

        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("auth.login.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.login.subtitle")}
          </p>
        </header>

        <GoogleAuthButton intent="login" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or sign in with email</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        {new URLSearchParams(location.search).get("google") === "failed" && (
          <ErrorCallout title="Google sign-in could not be completed. Try again." />
        )}

        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-email">{t("auth.login.email")}</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">{t("auth.login.password")}</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <TurnstileWidget
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />

          {error && (
            <ErrorCallout
              id="login-error"
              title={error.title}
              items={error.items}
            />
          )}

          <Button type="submit" disabled={busy} className="mt-2">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? t("auth.login.signingIn") : t("auth.login.submit")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            to="/forgot-password"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("auth.login.forgot")}
          </Link>
        </p>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.login.signupHint")}{" "}
          <Link
            to="/signup"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("auth.login.signupLink")}
          </Link>
        </p>
        <p className="border-t pt-5 text-center text-xs text-muted-foreground lg:hidden">
          E-invoicing, quietly handled.
        </p>
      </div>
    </main>
  );
}
