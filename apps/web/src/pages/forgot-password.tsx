import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";

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
import { forgotPasswordRequest } from "@/lib/resources";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError({ title: "Please enter your email.", items: [] });
      return;
    }
    if (TURNSTILE_ENABLED && !token) {
      setError({
        title: "Please complete the verification challenge.",
        items: [],
      });
      return;
    }
    setBusy(true);
    try {
      await forgotPasswordRequest(email.trim(), token ?? undefined);
      setSent(true);
    } catch (err) {
      setBusy(false);
      setError({
        title:
          err instanceof ApiError
            ? (readApiMessage(err.body) ??
              "Unable to process the request. Try again.")
            : "Unable to connect. Check your connection and try again.",
        items: [],
      });
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            e-invoice
          </span>
        </div>

        {sent ? (
          <section className="flex flex-col items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
            <MailCheck className="size-6" />
            <p className="font-medium">Check your inbox.</p>
            <p>
              If an account exists for that email, we just sent a link to reset
              the password. The link expires in 30 minutes.
            </p>
          </section>
        ) : (
          <>
            <header className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">
                Forgot your password?
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter the email you signed in with and we'll send you a link to
                choose a new password.
              </p>
            </header>

            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@e-pay.et"
                  required
                />
              </div>

              <TurnstileWidget
                onVerify={setToken}
                onExpire={() => setToken(null)}
              />

              {error && (
                <ErrorCallout title={error.title} items={error.items} />
              )}

              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <Link
            to="/login"
            className="font-medium text-[#5700FF] underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
