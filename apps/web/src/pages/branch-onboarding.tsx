import { useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
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
import { createBranch } from "@/lib/resources";
import { cn } from "@/lib/utils";

/**
 * Full-page branch onboarding wizard, launched from the merchants admin page.
 *
 * Mirrors the merchant self-signup wizard (a breadcrumb stepper + flat form
 * state) so adding a location feels like a guided flow rather than one long
 * dense form. Copy stays plain — this is for shop owners, not accountants —
 * so no INSA/EIRMS jargon leaks into the labels.
 */
export function BranchOnboardingPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { merchantId } = useParams<{ merchantId: string }>();

  // Passed from the merchants page so we can name the business in the header
  // without a round-trip; falls back to a generic label on direct navigation.
  const merchantName =
    (location.state as { merchantName?: string } | null)?.merchantName ?? null;

  if (!merchantId || !can("branch.create")) {
    return <Navigate to="/merchants" replace />;
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <BrandSide merchantName={merchantName} />
      <FormSide
        merchantId={merchantId}
        onDone={() => navigate(`/merchants?selected=${merchantId}`)}
        onCancel={() => navigate(`/merchants?selected=${merchantId}`)}
      />
    </div>
  );
}

function BrandSide({ merchantName }: { merchantName: string | null }) {
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
            <MapPin className="size-3" />
            New location
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Add a new
            <br />
            location.
          </h1>
          <p className="text-base leading-relaxed text-white/80">
            {merchantName
              ? `Set up a new shop or branch for ${merchantName}. `
              : "Set up a new shop or branch. "}
            We'll walk you through it a step at a time — nothing here is
            permanent, you can change it later.
          </p>

          <ul className="flex flex-col gap-3 pt-2 text-sm text-white/85">
            <li className="flex items-start gap-2.5">
              <Store className="mt-0.5 size-4 shrink-0 text-white" />
              <span>Give your location a name and address.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-white" />
              <span>Drop a pin so customers know where to find you.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-white" />
              <span>
                Connect it to the tax system now, or skip and do it later.
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
const STEPS = ["basics", "address", "tax", "location", "connect"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  basics: "Location",
  address: "Address",
  tax: "Tax details",
  location: "Map pin",
  connect: "Tax system",
};

/** Single flat state — lets earlier steps stay populated on back-navigation. */
interface FormState {
  name: string;
  systemNumber: string;
  city: string;
  region: string;
  zone: string;
  wereda: string;
  kebele: string;
  houseNumber: string;
  subTin: string;
  tradeName: string;
  vatNumber: string;
  country: string;
  clientId: string;
  clientSecret: string;
  apikey: string;
  pin: { latitude: number; longitude: number } | null;
}

function blank(): FormState {
  return {
    name: "",
    systemNumber: "",
    city: "",
    region: "",
    zone: "",
    wereda: "",
    kebele: "",
    houseNumber: "",
    subTin: "",
    tradeName: "",
    vatNumber: "",
    country: "",
    clientId: "",
    clientSecret: "",
    apikey: "",
    pin: null,
  };
}

/** Per-step required-field validation. Returns an error message or null. */
function validateStep(step: Step, form: FormState): string | null {
  switch (step) {
    case "basics":
      if (!form.name.trim()) return "Please give this location a name.";
      if (form.name.trim().length < 3)
        return "Location name must be at least 3 characters.";
      if (form.name.trim().length > 120)
        return "Location name cannot exceed 120 characters.";
      if (form.systemNumber.trim().length > 40)
        return "Shop / register number cannot exceed 40 characters.";
      if (
        form.systemNumber.trim() &&
        !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(form.systemNumber.trim())
      )
        return "Shop / register number can use letters, numbers, dot, slash, dash, and underscore only.";
      return null;
    case "tax": {
      const country = form.country.trim();
      if (country && !/^[A-Z]{2,3}$/.test(country))
        return "Country must be an uppercase code such as ET.";
      return null;
    }
    case "connect": {
      const credentials = [form.clientId, form.clientSecret, form.apikey].map((v) => v.trim());
      const supplied = credentials.filter(Boolean).length;
      if (supplied > 0 && supplied < 3)
        return "Enter Client ID, Client secret, and API key together, or leave all three blank.";
      if (credentials[0] && credentials[0].length < 3)
        return "Client ID must be at least 3 characters.";
      if (credentials[1] && credentials[1].length < 8)
        return "Client secret must be at least 8 characters.";
      if (credentials[2] && credentials[2].length < 8)
        return "API key must be at least 8 characters.";
      return null;
    }
    default:
      return null;
  }
}

function FormSide({
  merchantId,
  onDone,
  onCancel,
}: {
  merchantId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
  const [stepIdx, setStepIdx] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [busy, setBusy] = useState(false);
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
    for (const candidate of STEPS) {
      const validationError = validateStep(candidate, form);
      if (validationError) {
        setStepIdx(STEPS.indexOf(candidate));
        setError({ title: validationError, items: [] });
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await createBranch(merchantId, {
        name: form.name.trim(),
        systemNumber: form.systemNumber.trim() || undefined,
        city: form.city.trim() || undefined,
        region: form.region.trim() || undefined,
        zone: form.zone.trim() || undefined,
        wereda: form.wereda.trim() || undefined,
        kebele: form.kebele.trim() || undefined,
        houseNumber: form.houseNumber.trim() || undefined,
        subTin: form.subTin.trim() || undefined,
        tradeName: form.tradeName.trim() || undefined,
        vatNumber: form.vatNumber.trim() || undefined,
        country: form.country.trim() || undefined,
        eirmsClientId: form.clientId.trim() || undefined,
        eirmsClientSecret: form.clientSecret.trim() || undefined,
        eirmsApikey: form.apikey.trim() || undefined,
        ...(form.pin
          ? { latitude: form.pin.latitude, longitude: form.pin.longitude }
          : {}),
      });
      onDone();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't add this location.",
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
    <main className="flex items-start justify-center bg-[#f7f5ff] px-6 py-10 dark:bg-[#111827]">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <ZemenEPosLogo className="h-6 w-auto text-foreground" />
          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            e-invoice
          </span>
        </div>

        <header className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Add a location
          </h2>
          <p className="text-sm text-muted-foreground">
            {step === "basics" &&
              "What's this shop or branch called? A name is all we need to start."}
            {step === "address" &&
              "Where is this location? Optional, but it shows up on your receipts."}
            {step === "tax" &&
              "Tax details for this specific location. All optional — fill in what you have."}
            {step === "location" &&
              "Drop a pin on the map so customers can find this location."}
            {step === "connect" &&
              "Connect this location to the government invoicing system. You can also skip this and do it later."}
          </p>
        </header>

        <Stepper currentIdx={stepIdx} maxReached={maxReached} onJump={jumpTo} />

        {step === "basics" && (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location name *" span={2}>
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Bole Shop"
                  autoFocus
                  required
                  minLength={3}
                  maxLength={120}
                />
              </Field>
              <Field label="Shop / register number" span={2}>
                <Input
                  value={form.systemNumber}
                  onChange={(e) => update("systemNumber", e.target.value)}
                  placeholder="Leave blank if you don't have one yet"
                  maxLength={40}
                />
                <p className="text-xs text-muted-foreground">
                  The number for this till or register. You can add it later if
                  you don't have it now.
                </p>
              </Field>
            </div>
          </Card>
        )}

        {step === "address" && (
          <Card>
            <p className="mb-3 text-xs text-muted-foreground">
              All optional — you can fill these in later.
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

        {step === "tax" && (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location tax ID (sub-TIN)" span={2}>
                <Input
                  value={form.subTin}
                  onChange={(e) => update("subTin", e.target.value)}
                  placeholder="Tax ID issued for this location"
                />
                <p className="text-xs text-muted-foreground">
                  If this location has its own tax ID separate from the
                  business, enter it here.
                </p>
              </Field>
              <Field label="Trade name for this location" span={2}>
                <Input
                  value={form.tradeName}
                  onChange={(e) => update("tradeName", e.target.value)}
                  placeholder="Optional"
                />
                <p className="text-xs text-muted-foreground">
                  Only if this location trades under a different name than your
                  main business.
                </p>
              </Field>
              <Field label="VAT number">
                <Input
                  value={form.vatNumber}
                  onChange={(e) => update("vatNumber", e.target.value)}
                />
              </Field>
              <Field label="Country">
                <Input
                  value={form.country}
                  onChange={(e) => update("country", e.target.value.toUpperCase())}
                  placeholder="ET"
                  minLength={2}
                  maxLength={3}
                />
              </Field>
            </div>
          </Card>
        )}

        {step === "location" && (
          <Card>
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Location pin
              </Label>
              <BranchLocationPicker
                value={form.pin}
                onChange={(next) => update("pin", next)}
              />
            </div>
          </Card>
        )}

        {step === "connect" && (
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-md border border-[#5700FF]/20 bg-[#5700FF]/5 px-3 py-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#5700FF]" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    Connect to the government invoicing system
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These three keys let this location report sales
                    automatically. Get them from your account on the Ministry
                    of Revenue portal at{" "}
                    <a
                      href="https://portal.mor.gov.et"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#5700FF] underline-offset-2 hover:underline"
                    >
                      portal.mor.gov.et
                    </a>
                    . No keys yet? Skip this — you can add them anytime.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Client ID">
                  <Input
                    value={form.clientId}
                    onChange={(e) => update("clientId", e.target.value)}
                    autoComplete="off"
                    minLength={3}
                    maxLength={500}
                  />
                </Field>
                <Field label="Client secret">
                  <Input
                    type="password"
                    value={form.clientSecret}
                    onChange={(e) => update("clientSecret", e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={2000}
                  />
                </Field>
                <Field label="API key">
                  <Input
                    type="password"
                    value={form.apikey}
                    onChange={(e) => update("apikey", e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={2000}
                  />
                </Field>
              </div>
            </div>
          </Card>
        )}

        {error && <ErrorCallout title={error.title} items={error.items} />}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={stepIdx === 0 ? onCancel : goBack}
            disabled={busy}
          >
            {stepIdx === 0 ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft className="size-4" />
                Back
              </>
            )}
          </Button>
          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Adding location…" : "Add location"}
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
          Changed your mind?{" "}
          <Link
            to="/merchants"
            className="font-medium text-[#5700FF] underline-offset-2 hover:underline"
          >
            Back to merchants
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
                reachable ? "hover:bg-accent/50" : "cursor-default opacity-60",
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
