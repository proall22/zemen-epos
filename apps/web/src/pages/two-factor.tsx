import { useEffect, useState } from "react";
import { Loader2, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorCallout } from "@/components/error-callout";
import { OtpInput } from "@/components/otp-input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { clearPendingAuth, readPendingAuth } from "@/lib/pending-auth";
import {
  getTwoFactorOptions,
  sendTwoFactor,
  verifyTwoFactor,
} from "@/lib/resources";
import { AuthCard } from "./verify-email";

type Method = "email" | "phone";
export function TwoFactorPage() {
  const pending = readPendingAuth();
  const navigate = useNavigate();
  const { completeAuthentication } = useAuth();
  const [options, setOptions] = useState<{
    email: string;
    phone: string | null;
    phoneAvailable: boolean;
  } | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (pending?.step === "two-factor")
      getTwoFactorOptions(pending.pendingToken)
        .then(setOptions)
        .catch(() =>
          setError("This sign-in step has expired. Please sign in again."),
        );
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(
      () => setCooldown((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);
  if (!pending || pending.step !== "two-factor")
    return <Navigate to="/login" replace />;
  async function choose(next: Method) {
    setBusy(true);
    setError(null);
    try {
      await sendTwoFactor(pending!.pendingToken, next);
      setMethod(next);
      setOtp("");
      setCooldown(60);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (readApiMessage(e.body) ?? "Could not send the code.")
          : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!method || otp.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const session = await verifyTwoFactor(pending!.pendingToken, method, otp);
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
  return (
    <AuthCard
      icon={<ShieldCheck className="size-6" />}
      title="Verify your identity"
      subtitle={
        method ? (
          <>
            Enter the code sent to{" "}
            {method === "email" ? options?.email : options?.phone}.
          </>
        ) : (
          "Choose where to receive your verification code."
        )
      }
    >
      {!method ? (
        <div className="grid gap-3">
          <button
            type="button"
            className="flex items-center gap-4 rounded-lg border p-4 text-left outline-none hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => choose("email")}
            disabled={busy}
          >
            <Mail className="size-6 text-primary" />
            <span>
              <strong className="block">Email</strong>
              <span className="text-sm text-muted-foreground">
                {options?.email ?? "Loading…"}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-center gap-4 rounded-lg border p-4 text-left outline-none hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => choose("phone")}
            disabled={busy || !options?.phoneAvailable}
          >
            <Smartphone className="size-6 text-primary" />
            <span>
              <strong className="block">Phone</strong>
              <span className="text-sm text-muted-foreground">
                {options?.phone ?? "Phone verification is unavailable"}
              </span>
            </span>
          </button>
        </div>
      ) : (
        <>
          <OtpInput value={otp} onChange={setOtp} disabled={busy} />
          <Button onClick={verify} disabled={busy || otp.length !== 6}>
            {busy && <Loader2 className="animate-spin" />}Continue
          </Button>
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setMethod(null)}
              disabled={busy}
            >
              Change method
            </Button>
            <Button
              variant="ghost"
              onClick={() => choose(method)}
              disabled={busy || cooldown > 0}
            >
              {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        </>
      )}
      {error && <ErrorCallout title={error} items={[]} />}
    </AuthCard>
  );
}
