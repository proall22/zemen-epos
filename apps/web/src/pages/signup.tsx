import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { BranchLocationPicker } from "@/components/branch-location-picker";
import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import type { SignupMerchantInput } from "@/lib/resources";
import { cn } from "@/lib/utils";
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
  const { status, signup } = useAuth();
  const navigate = useNavigate();

  if (status === "authed") {
    return <Navigate to="/merchants" replace />;
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <BrandSide />
      <FormSide signup={signup} onDone={() => navigate("/merchants")} />
    </div>
  );
}

function BrandSide() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#5700FF] text-white lg:flex lg:flex-col">
      <div
        aria-hidden
        className="absolute -right-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-fuchsia-400/30 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]"
      />

      <div className="relative z-10 flex flex-1 flex-col justify-between p-12">
        <header className="flex items-center gap-3">
          <ZemenEPosLogo mono className="h-6 w-auto text-white" />
          <span className="text-white/40">·</span>
          <span className="text-sm font-medium tracking-tight">e-invoice</span>
        </header>

        <div className="flex max-w-md flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em]">
            <Sparkles className="size-3" />
            Self-onboarding
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Bring your business
            <br />
            online.
          </h1>
          <p className="text-base leading-relaxed text-white/80">
            Register your merchant in minutes. We'll set up your account
            pending verification — once approved, you can issue MOR-compliant
            invoices from any branch.
          </p>

          <ul className="flex flex-col gap-3 pt-2 text-sm text-white/85">
            <li className="flex items-start gap-2.5">
              <Workflow className="mt-0.5 size-4 shrink-0 text-white" />
              <span>
                One account. Add branches, cashiers, and inventory after.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white" />
              <span>
                EIRMS credentials stay with you — paste them on your branch
                when MOR issues them.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-white" />
              <span>
                No back-and-forth — admin approval is the last step.
              </span>
            </li>
          </ul>
        </div>

        <footer className="text-xs text-white/50">
          &copy; {new Date().getFullYear()} Zemen-ePos Financial Services
        </footer>
      </div>
    </aside>
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
  };
}

/** Per-step required-field validation. Returns an error message or null. */
function validateStep(step: Step, form: FormState): string | null {
  switch (step) {
    case "business":
      if (!form.legalName.trim()) return "Legal name is required.";
      if (!form.tin.trim()) return "TIN is required.";
      return null;
    case "address":
      // Entirely optional.
      return null;
    case "branch":
      // Name optional too — defaults to "Main" at submit time.
      return null;
    case "owner":
      if (!form.ownerEmail.trim()) return "Owner email is required.";
      if (!form.ownerPassword) return "Password is required.";
      if (form.ownerPassword.length < 8)
        return "Password must be at least 8 characters.";
      return null;
  }
}

function FormSide({
  signup,
  onDone,
}: {
  signup: (input: SignupMerchantInput) => Promise<void>;
  onDone: () => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
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
    const err = validateStep(step, form);
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
      const err = validateStep(s, form);
      if (err) {
        const idx = STEPS.indexOf(s);
        setStepIdx(idx);
        setError({ title: err, items: [] });
        return;
      }
    }
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError({
        title: "Please complete the verification challenge before submitting.",
        items: [],
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup({
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
        owner: {
          email: form.ownerEmail.trim(),
          password: form.ownerPassword,
          name: form.ownerName.trim() || undefined,
        },
        turnstileToken: turnstileToken ?? undefined,
      });
      onDone();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't create your account.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({
          title: "Couldn't reach the server. Check your connection.",
          items: [],
        });
      }
    }
  }

  return (
    <main className="flex items-start justify-center bg-background px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            e-invoice
          </span>
        </div>

        <header className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Create your merchant account
          </h2>
          <p className="text-sm text-muted-foreground">
            {step === "business" &&
              "Tell us about your business — the legal name and TIN MOR will see."}
            {step === "address" &&
              "Where is your business registered? Optional, but helps populate your invoices."}
            {step === "branch" &&
              "Your first branch. Drop a pin so customers know where to find you."}
            {step === "owner" &&
              "Create the owner login. You'll be the merchant admin and can invite more users after."}
          </p>
        </header>

        <Stepper currentIdx={stepIdx} maxReached={maxReached} onJump={jumpTo} />

        {step === "business" && (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Legal name *" span={2}>
                <Input
                  value={form.legalName}
                  onChange={(e) => update("legalName", e.target.value)}
                  autoFocus
                  required
                />
              </Field>
              <Field label="Trade name">
                <Input
                  value={form.tradeName}
                  onChange={(e) => update("tradeName", e.target.value)}
                />
              </Field>
              <Field label="TIN *">
                <Input
                  value={form.tin}
                  onChange={(e) => update("tin", e.target.value)}
                  required
                />
              </Field>
              <Field label="VAT number">
                <Input
                  value={form.vatNumber}
                  onChange={(e) => update("vatNumber", e.target.value)}
                />
              </Field>
              <Field label="Business email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
              <Field label="Business phone" span={2}>
                <Input
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
              All optional — you can fill these in later from your merchant
              settings.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Region">
                <Input
                  value={form.region}
                  onChange={(e) => update("region", e.target.value)}
                />
              </Field>
              <Field label="Zone">
                <Input
                  value={form.zone}
                  onChange={(e) => update("zone", e.target.value)}
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                />
              </Field>
              <Field label="Wereda">
                <Input
                  value={form.wereda}
                  onChange={(e) => update("wereda", e.target.value)}
                />
              </Field>
              <Field label="Kebele">
                <Input
                  value={form.kebele}
                  onChange={(e) => update("kebele", e.target.value)}
                />
              </Field>
              <Field label="House #">
                <Input
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
              <Field label="Branch name">
                <Input
                  value={form.branchName}
                  onChange={(e) => update("branchName", e.target.value)}
                  placeholder="Main"
                />
                <p className="text-xs text-muted-foreground">
                  You can add more branches and paste EIRMS credentials after
                  sign-in.
                </p>
              </Field>
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" span={2}>
                <Input
                  value={form.ownerName}
                  onChange={(e) => update("ownerName", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Email *" span={2}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.ownerEmail}
                  onChange={(e) => update("ownerEmail", e.target.value)}
                  required
                />
              </Field>
              <Field label="Password * (min 8)" span={2}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.ownerPassword}
                  onChange={(e) => update("ownerPassword", e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
            </div>
          </Card>
        )}

        {isLast && (
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
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Creating account…" : "Create account"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already onboarded?{" "}
          <Link
            to="/login"
            className="font-medium text-[#5700FF] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
          .
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
              i > 0 && state !== "upcoming" && "before:bg-[#5700FF]/40",
            )}
          >
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!reachable}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
                reachable
                  ? "hover:bg-accent/50"
                  : "cursor-default opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  state === "current" &&
                    "bg-[#5700FF] text-white ring-4 ring-[#5700FF]/15",
                  state === "done" && "bg-[#5700FF]/10 text-[#5700FF]",
                  state === "upcoming" &&
                    "border border-border bg-background text-muted-foreground",
                )}
              >
                {state === "done" ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  i + 1
                )}
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
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", span === 2 && "col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
