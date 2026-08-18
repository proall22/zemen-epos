import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { BranchLocationPicker } from "@/components/branch-location-picker";
import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import {
  signupMerchantWithGoogle,
  type SignupMerchantInput,
} from "@/lib/resources";
import { GOOGLE_ENROLLMENT_KEY } from "@/pages/google-oauth-callback";
import { cn } from "@/lib/utils";
import { savePendingAuth } from "@/lib/pending-auth";
import type { PendingAuthResponse } from "@/lib/types";
import {
  TURNSTILE_ENABLED,
  TurnstileWidget,
} from "@/components/turnstile-widget";

/**
 * Public merchant self-signup page (Phase G + H).
 *
 * Multi-step wizard with a breadcrumb-style stepper at the top so the form
 * fits in the viewport and the user can jump back to fix a previous step.
 * Submits the same payload shape as the original single-page form — the
 * split is purely a UX concern.
 */
export function SignupPage() {
  const { status, signup, completeAuthentication } = useAuth();
  const navigate = useNavigate();
  const googleToken = sessionStorage.getItem(GOOGLE_ENROLLMENT_KEY);
  const googleProfile = googleToken ? readGoogleProfile(googleToken) : null;

  if (status === "authed") {
    return <Navigate to="/merchants" replace />;
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <AuthBrandPanel registration />
      <FormSide
        signup={signup}
        googleToken={googleProfile ? googleToken : null}
        googleProfile={googleProfile}
        completeAuthentication={completeAuthentication}
        onDone={(pending) => {
          savePendingAuth(pending);
          navigate("/verify-email");
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard plumbing
// ---------------------------------------------------------------------------

/** Order matters — drives the stepper + the next/back semantics. */
const STEPS = ["business", "address", "branch", "owner"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  business: "Business",
  address: "Address",
  branch: "Branch",
  owner: "Owner",
};

/** Single flat state — easier to reason about than a nested per-step shape,
 *  and lets earlier steps stay populated when the user jumps back. */
interface FormState {
  legalName: string;
  tradeName: string;
  tin: string;
  email: string;
  phone: string;
  vatNumber: string;
  city: string;
  region: string;
  zone: string;
  wereda: string;
  kebele: string;
  houseNumber: string;
  branchName: string;
  branchLocation: { latitude: number; longitude: number } | null;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPasswordConfirm: string;
  legalDocument: File | null;
}

function blank(): FormState {
  return {
    legalName: "",
    tradeName: "",
    tin: "",
    email: "",
    phone: "",
    vatNumber: "",
    city: "",
    region: "",
    zone: "",
    wereda: "",
    kebele: "",
    houseNumber: "",
    branchName: "Main",
    branchLocation: null,
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    ownerPasswordConfirm: "",
    legalDocument: null,
  };
}

/** Per-step required-field validation. Returns an error message or null. */
function validateStep(
  step: Step,
  form: FormState,
  googleMode = false,
): string | null {
  switch (step) {
    case "business":
      if (!form.legalName.trim()) return "Legal name is required.";
      if (form.legalName.trim().length < 3)
        return "Legal name must be at least 3 characters.";
      if (form.legalName.trim().length > 200)
        return "Legal name cannot exceed 200 characters.";
      if (!form.tin.trim()) return "TIN is required.";
      if (!/^\d{10}$/.test(form.tin.trim()))
        return "TIN must contain exactly 10 digits.";
      if (
        form.email.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      )
        return "Enter a valid business email address.";
      if (
        form.phone.trim() &&
        !/^\+?[0-9][0-9 ()-]{6,28}$/.test(form.phone.trim())
      )
        return "Enter a valid phone number.";
      return null;
    case "address":
      // Entirely optional.
      return null;
    case "branch":
      if (form.branchName.trim() && form.branchName.trim().length < 3)
        return "Branch name must be at least 3 characters.";
      return null;
    case "owner":
      if (!form.ownerEmail.trim()) return "Owner email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim()))
        return "Enter a valid owner email address.";
      if (form.ownerName.trim() && form.ownerName.trim().length < 2)
        return "Owner name must be at least 2 characters.";
      if (!googleMode) {
        if (!form.ownerPassword) return "Password is required.";
        if (form.ownerPassword.length < 8)
          return "Password must be at least 8 characters.";
        if (form.ownerPassword !== form.ownerPasswordConfirm)
          return "Passwords do not match.";
      }
      if (!form.legalDocument) return "A legal document is required.";
      if (form.legalDocument.size > 5 * 1024 * 1024)
        return "Legal document must be no larger than 5 MB.";
      if (
        !["application/pdf", "image/jpeg", "image/png"].includes(
          form.legalDocument.type,
        )
      )
        return "Choose a PDF, JPEG, or PNG legal document.";
      return null;
  }
}

function FormSide({
  signup,
  googleToken,
  googleProfile,
  completeAuthentication,
  onDone,
}: {
  signup: (input: SignupMerchantInput) => Promise<PendingAuthResponse>;
  googleToken: string | null;
  googleProfile: { email: string; name: string } | null;
  completeAuthentication: (
    result: import("@/lib/types").LoginResponse,
  ) => Promise<void>;
  onDone: (pending: PendingAuthResponse) => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    ...blank(),
    ownerEmail: googleProfile?.email ?? "",
    ownerName: googleProfile?.name ?? "",
  }));
  const [stepIdx, setStepIdx] = useState(0);
  // Tracks the furthest step the user has reached so we can let them jump
  // back to any visited step without unblocking arbitrary forward jumps.
  const [maxReached, setMaxReached] = useState(0);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function goNext() {
    const err = validateStep(step, form, Boolean(googleToken));
    if (err) {
      setError({ title: err, items: [] });
      return;
    }
    setError(null);
    const next = Math.min(stepIdx + 1, STEPS.length - 1);
    setStepIdx(next);
    setMaxReached((m) => Math.max(m, next));
  }

  function goBack() {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
  }

  /** Stepper click: forward only to a step we've already reached. */
  function jumpTo(targetIdx: number) {
    if (targetIdx > maxReached) return;
    setError(null);
    setStepIdx(targetIdx);
  }

  async function handleSubmit() {
    // Final-step validation covers the owner block; earlier blocks were
    // gated on Next, but we re-check the cheap required fields in case the
    // user mutated state and skipped via back+forward.
    for (const s of STEPS) {
      const err = validateStep(s, form, Boolean(googleToken));
      if (err) {
        const idx = STEPS.indexOf(s);
        setStepIdx(idx);
        setError({ title: err, items: [] });
        return;
      }
    }
    if (!googleToken && TURNSTILE_ENABLED && !turnstileToken) {
      setError({
        title: "Please complete the verification challenge before submitting.",
        items: [],
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const common = {
        merchant: {
          legalName: form.legalName.trim(),
          tradeName: form.tradeName.trim() || undefined,
          tin: form.tin.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          vatNumber: form.vatNumber.trim() || undefined,
          city: form.city.trim() || undefined,
          region: form.region.trim() || undefined,
          zone: form.zone.trim() || undefined,
          wereda: form.wereda.trim() || undefined,
          kebele: form.kebele.trim() || undefined,
          houseNumber: form.houseNumber.trim() || undefined,
        },
        branch: {
          name: form.branchName.trim() || "Main",
          latitude: form.branchLocation?.latitude,
          longitude: form.branchLocation?.longitude,
        },
        legalDocument: form.legalDocument!,
      };
      if (googleToken) {
        const session = await signupMerchantWithGoogle({
          ...common,
          googleToken,
        });
        sessionStorage.removeItem(GOOGLE_ENROLLMENT_KEY);
        await completeAuthentication(session);
        window.location.assign("/dashboard");
      } else {
        const pending = await signup({
          ...common,
          owner: {
            email: form.ownerEmail.trim(),
            password: form.ownerPassword,
            name: form.ownerName.trim() || undefined,
          },
          turnstileToken: turnstileToken ?? undefined,
        });
        onDone(pending);
      }
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Unable to create the account.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({
          title: "Unable to connect. Check your connection and try again.",
          items: [],
        });
      }
    }
  }

  return (
    <main className="flex min-h-svh items-start justify-center bg-background px-4 py-8 sm:px-6 sm:py-10 lg:min-h-0">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs text-muted-foreground">Zemen ePOS</span>
        </div>

        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your Zemen ePOS account
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "business" &&
              "Enter the registered details for your business."}
            {step === "address" &&
              "Add the address shown on your business records. These fields are optional."}
            {step === "branch" && "Set up the first branch for this account."}
            {step === "owner" &&
              "Create the account owner login and submit the registration document."}
          </p>
        </header>

        {!googleToken && stepIdx === 0 && (
          <div className="space-y-3">
            <GoogleAuthButton intent="signup" />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or register with email</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}
        {googleToken && (
          <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Google verified <strong>{googleProfile?.email}</strong>. Complete
            the business details and legal-document submission below.
          </div>
        )}

        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (isLast) void handleSubmit();
            else goNext();
          }}
          noValidate
        >
          <Stepper
            currentIdx={stepIdx}
            maxReached={maxReached}
            onJump={jumpTo}
          />

          {step === "business" && (
            <Card>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="business-legal-name" label="Legal name *" span={2}>
                  <Input
                    id="business-legal-name"
                    autoComplete="organization"
                    value={form.legalName}
                    onChange={(e) => update("legalName", e.target.value)}
                    minLength={3}
                    maxLength={200}
                    autoFocus
                    required
                  />
                </Field>
                <Field id="business-trade-name" label="Trade name">
                  <Input
                    id="business-trade-name"
                    value={form.tradeName}
                    onChange={(e) => update("tradeName", e.target.value)}
                  />
                </Field>
                <Field id="business-tin" label="TIN *">
                  <Input
                    id="business-tin"
                    value={form.tin}
                    onChange={(e) =>
                      update(
                        "tin",
                        e.target.value.replace(/\D/g, "").slice(0, 10),
                      )
                    }
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </Field>
                <Field id="business-vat" label="VAT number">
                  <Input
                    id="business-vat"
                    value={form.vatNumber}
                    onChange={(e) => update("vatNumber", e.target.value)}
                  />
                </Field>
                <Field id="business-email" label="Business email">
                  <Input
                    id="business-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </Field>
                <Field id="business-phone" label="Business phone" span={2}>
                  <Input
                    id="business-phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
          )}

          {step === "address" && (
            <Card>
              <p className="mb-3 text-xs text-muted-foreground">
                You can update these details later in merchant settings.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="address-region" label="Region">
                  <Input
                    id="address-region"
                    autoComplete="address-level1"
                    value={form.region}
                    onChange={(e) => update("region", e.target.value)}
                  />
                </Field>
                <Field id="address-zone" label="Zone">
                  <Input
                    id="address-zone"
                    autoComplete="address-level2"
                    value={form.zone}
                    onChange={(e) => update("zone", e.target.value)}
                  />
                </Field>
                <Field id="address-city" label="City">
                  <Input
                    id="address-city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </Field>
                <Field id="address-wereda" label="Wereda">
                  <Input
                    id="address-wereda"
                    value={form.wereda}
                    onChange={(e) => update("wereda", e.target.value)}
                  />
                </Field>
                <Field id="address-kebele" label="Kebele">
                  <Input
                    id="address-kebele"
                    value={form.kebele}
                    onChange={(e) => update("kebele", e.target.value)}
                  />
                </Field>
                <Field id="address-house" label="House number">
                  <Input
                    id="address-house"
                    autoComplete="address-line1"
                    value={form.houseNumber}
                    onChange={(e) => update("houseNumber", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
          )}

          {step === "branch" && (
            <Card>
              <div className="flex flex-col gap-4">
                <Field id="branch-name" label="Branch name">
                  <Input
                    id="branch-name"
                    value={form.branchName}
                    onChange={(e) => update("branchName", e.target.value)}
                    minLength={3}
                    maxLength={120}
                    placeholder="Main"
                  />
                  <p className="text-xs text-muted-foreground">
                    Additional branches can be added after sign-in.
                  </p>
                </Field>
                <div
                  className="flex flex-col gap-2"
                  role="group"
                  aria-labelledby="branch-location-label"
                >
                  <Label id="branch-location-label" className="text-sm">
                    Location pin
                  </Label>
                  <BranchLocationPicker
                    value={form.branchLocation}
                    onChange={(next) => update("branchLocation", next)}
                  />
                </div>
              </div>
            </Card>
          )}

          {step === "owner" && (
            <Card>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="owner-name" label="Full name" span={2}>
                  <Input
                    id="owner-name"
                    autoComplete="name"
                    value={form.ownerName}
                    onChange={(e) => update("ownerName", e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field id="owner-email" label="Email address *" span={2}>
                  <Input
                    id="owner-email"
                    type="email"
                    autoComplete="email"
                    value={form.ownerEmail}
                    onChange={(e) => update("ownerEmail", e.target.value)}
                    maxLength={254}
                    required
                    readOnly={Boolean(googleToken)}
                  />
                </Field>
                {!googleToken && (
                  <Field id="owner-password" label="Password *" span={2}>
                    <Input
                      id="owner-password"
                      type="password"
                      autoComplete="new-password"
                      value={form.ownerPassword}
                      onChange={(e) => update("ownerPassword", e.target.value)}
                      minLength={8}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Use at least 8 characters.
                    </p>
                  </Field>
                )}
                {!googleToken && (
                  <Field
                    id="owner-password-confirm"
                    label="Confirm password *"
                    span={2}
                  >
                    <Input
                      id="owner-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={form.ownerPasswordConfirm}
                      onChange={(e) =>
                        update("ownerPasswordConfirm", e.target.value)
                      }
                      minLength={8}
                      required
                    />
                  </Field>
                )}
                <Field
                  id="legal-document"
                  label="Legal registration document *"
                  span={2}
                >
                  <Input
                    id="legal-document"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    required
                    onChange={(e) =>
                      update("legalDocument", e.target.files?.[0] ?? null)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF, JPEG, or PNG. Maximum 5 MB. The document is stored
                    privately for review.
                  </p>
                </Field>
              </div>
            </Card>
          )}

          {isLast && !googleToken && (
            <TurnstileWidget
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />
          )}

          {error && <ErrorCallout title={error.title} items={error.items} />}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={stepIdx === 0 || busy}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {isLast ? (
              <Button
                type="submit"
                disabled={busy}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Creating account…" : "Create account"}
              </Button>
            ) : (
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
        <p className="border-t pt-5 text-center text-xs text-muted-foreground lg:hidden">
          E-invoicing, quietly handled.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  currentIdx,
  maxReached,
  onJump,
}: {
  currentIdx: number;
  maxReached: number;
  onJump: (idx: number) => void;
}) {
  return (
    <ol className="flex w-full items-center gap-1">
      {STEPS.map((s, i) => {
        const state =
          i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming";
        const reachable = i <= maxReached;
        return (
          <li
            key={s}
            className={cn(
              "flex flex-1 items-center gap-2",
              i > 0 && "before:mx-1 before:h-px before:flex-1 before:bg-border",
              i > 0 && state !== "upcoming" && "before:bg-primary/40",
            )}
          >
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!reachable}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
                reachable ? "hover:bg-accent/50" : "cursor-default opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  state === "current" &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  state === "done" && "bg-primary/10 text-primary",
                  state === "upcoming" &&
                    "border border-border bg-background text-muted-foreground",
                )}
              >
                {state === "done" ? <CheckCircle2 className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  state === "current"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Small UI bits
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  children,
  span,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", span === 2 && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** The token is decoded only to prefill the UI. The API independently verifies
 * its signature, expiry, purpose, Google subject, and email before creating an
 * account, so these browser-visible claims are never trusted for authorization. */
function readGoogleProfile(
  token: string,
): { email: string; name: string } | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    if (
      payload.purpose !== "google-merchant-enrollment" ||
      typeof payload.email !== "string"
    )
      return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}
