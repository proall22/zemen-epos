import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { resetPasswordRequest } from "@/lib/resources";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  const tokenMissing = !token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError({
        title: "Password must be at least 8 characters.",
        items: [],
      });
      return;
    }
    if (password !== confirm) {
      setError({ title: "Passwords don't match.", items: [] });
      return;
    }
    setBusy(true);
    try {
      await resetPasswordRequest(token, password);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2_500);
    } catch (err) {
      setBusy(false);
      setError({
        title:
          err instanceof ApiError
            ? (readApiMessage(err.body) ??
              "This reset link is no longer valid.")
            : "Couldn't reach the server. Check your connection.",
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

        {tokenMissing ? (
          <ErrorCallout
            title="This link is missing the reset token. Request a new one."
            items={[]}
          />
        ) : done ? (
          <section className="flex flex-col items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
            <CheckCircle2 className="size-6" />
            <p className="font-medium">Your password has been updated.</p>
            <p>Redirecting you to sign in…</p>
          </section>
        ) : (
          <>
            <header className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-semibold tracking-tight">
                Choose a new password
              </h2>
              <p className="text-sm text-muted-foreground">
                At least 8 characters. Every device that's currently signed in
                will be signed out.
              </p>
            </header>

            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && (
                <ErrorCallout title={error.title} items={error.items} />
              )}

              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? "Updating…" : "Update password"}
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
