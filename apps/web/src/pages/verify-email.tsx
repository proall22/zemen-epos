import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { OtpInput } from "@/components/otp-input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { clearPendingAuth, readPendingAuth } from "@/lib/pending-auth";
import { resendEmailVerification, verifyEmail } from "@/lib/resources";

export function VerifyEmailPage() {
  const pending = readPendingAuth();
  const navigate = useNavigate();
  const { completeAuthentication } = useAuth();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [error, setError] = useState<string | null>(() =>
    pending?.deliveryFailed
      ? "The first code could not be sent. Select Resend code to try again."
      : null,
  );
  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(
      () => setCooldown((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);
  if (!pending || pending.step !== "email-verification")
    return <Navigate to="/login" replace />;
  async function verify() {
    if (otp.length !== 6) return setError("Enter the complete six-digit code.");
    setBusy(true);
    setError(null);
    try {
      const session = await verifyEmail(pending!.pendingToken, otp);
      await completeAuthentication(session);
      clearPendingAuth();
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (readApiMessage(e.body) ?? "Verification failed.")
          : "Could not reach the server.",
      );
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await resendEmailVerification(pending!.pendingToken);
      setCooldown(60);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (readApiMessage(e.body) ?? "Could not resend the code.")
          : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard
      icon={<MailCheck className="size-6" />}
      title="Verify your email"
      subtitle={
        <>
          We've sent a verification code to <strong>{pending.email}</strong>.{" "}
          Enter the code below to continue.
        </>
      }
    >
      <OtpInput value={otp} onChange={setOtp} disabled={busy} />
      {error && <ErrorCallout title={error} items={[]} />}
      <Button onClick={verify} disabled={busy || otp.length !== 6}>
        {busy && <Loader2 className="animate-spin" />}Verify email
      </Button>
      <Button variant="ghost" onClick={resend} disabled={busy || cooldown > 0}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
    </AuthCard>
  );
}

export function AuthCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/20 px-4 py-8 sm:py-10">
      <section className="w-full max-w-md rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        <ZemenEPosLogo className="mb-6 h-8 w-auto" />
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {subtitle}
        </p>
        <div className="mt-7 flex flex-col gap-4">{children}</div>
        <p className="mt-6 border-t pt-5 text-center text-xs text-muted-foreground">
          E-invoicing, quietly handled.
        </p>
      </section>
    </main>
  );
}
