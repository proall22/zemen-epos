import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Percent } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import {
  calculateWithholding,
  createWithholdReceipt,
  lookupExternalInvoice,
  type NextWithholdSequence,
  type WithholdingCalculation,
} from "@/lib/resources";
import { isVerifyEnvelope } from "@/lib/types";

/** Trims and keeps only non-empty keys, or null when nothing is set — lets us
 *  omit the supplier block entirely rather than sending a shell of blanks. */
function pickNonEmpty<T extends Record<string, string>>(
  input: T,
): Partial<T> | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const trimmed = v.trim();
    if (trimmed) out[k] = trimmed;
  }
  return Object.keys(out).length > 0 ? (out as Partial<T>) : null;
}

export interface WithholdingFormSheetProps {
  open: boolean;
  /** Shown as "next counter" so the filer knows which number they're taking. */
  next: NextWithholdSequence | null;
  onClose: () => void;
  onFiled: () => void;
}

export function WithholdingFormSheet({
  open,
  next,
  onClose,
  onFiled,
}: WithholdingFormSheetProps) {
  const [invoiceIrn, setInvoiceIrn] = useState("");
  const [type, setType] = useState<"TWTH" | "IWTH">("TWTH");
  const [nature, setNature] = useState<"goods" | "service">("goods");
  const [preTax, setPreTax] = useState("");
  const [withholdAmount, setWithholdAmount] = useState("");
  const [calculation, setCalculation] = useState<WithholdingCalculation | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  // Supplier identity — auto-filled from MoR /v1/verify when the IRN resolves,
  // sourced from the invoice's SellerDetails (they issued what we're paying).
  // Every field stays editable; the lookup is a convenience, not a gate.
  const [supplier, setSupplier] = useState({
    legalName: "",
    tin: "",
    subTin: "",
    vatNumber: "",
    phone: "",
    email: "",
    city: "",
    zone: "",
    wereda: "",
    kebele: "",
  });
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "loaded" | "notfound"
  >("idle");
  const lastLookedUp = useRef<string | null>(null);

  function setSup<K extends keyof typeof supplier>(k: K, v: string) {
    setSupplier((prev) => ({ ...prev, [k]: v }));
  }

  function reset() {
    setInvoiceIrn("");
    setType("TWTH");
    setNature("goods");
    setPreTax("");
    setWithholdAmount("");
    setCalculation(null);
    setReason("");
    setError(null);
    setSupplier({
      legalName: "",
      tin: "",
      subTin: "",
      vatNumber: "",
      phone: "",
      email: "",
      city: "",
      zone: "",
      wereda: "",
      kebele: "",
    });
    setLookupState("idle");
    lastLookedUp.current = null;
  }

  useEffect(() => {
    if (open) reset();
  }, [open]);

  // Preview with the same trusted global configuration used during filing.
  useEffect(() => {
    const pre = Number(preTax);
    if (!Number.isFinite(pre) || pre <= 0) {
      setWithholdAmount("");
      setCalculation(null);
      return;
    }
    const handle = setTimeout(() => {
      void calculateWithholding(pre, nature)
        .then((result) => {
          setCalculation(result);
          setWithholdAmount(result.withholdingAmount.toFixed(2));
        })
        .catch(() => {
          setCalculation(null);
          setWithholdAmount("");
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [preTax, nature]);

  // Debounced IRN → supplier + pre-tax from MoR.
  useEffect(() => {
    const irn = invoiceIrn.trim();
    if (irn.length < 20) {
      setLookupState("idle");
      return;
    }
    if (lastLookedUp.current === irn) return;
    const handle = setTimeout(async () => {
      lastLookedUp.current = irn;
      setLookupState("loading");
      try {
        const resp = await lookupExternalInvoice(irn);
        if (!isVerifyEnvelope(resp) || !resp.body) {
          setLookupState("notfound");
          return;
        }
        const s = (resp.body.SellerDetails ?? {}) as Record<string, unknown>;
        const str = (v: unknown) =>
          typeof v === "string" || typeof v === "number" ? String(v) : "";
        setSupplier({
          legalName: str(s.LegalName),
          tin: str(s.Tin),
          subTin: str(s.SubTin),
          vatNumber: str(s.VatNumber),
          phone: str(s.Phone),
          email: str(s.Email),
          city: str(s.City),
          zone: str(s.Zone),
          wereda: str(s.Wereda),
          kebele: str(s.Kebele),
        });
        // Pre-tax = Total − Tax − Excise. Only stamp when the filer hasn't
        // typed one, so a manual entry is never overwritten.
        const v = resp.body.ValueDetails;
        if (v && !preTax) {
          const pre = v.TotalValue - v.TaxValue - v.ExciseValue;
          if (Number.isFinite(pre) && pre > 0) setPreTax(pre.toFixed(2));
        }
        setLookupState("loaded");
      } catch {
        setLookupState("notfound");
      }
    }, 500);
    return () => clearTimeout(handle);
    // preTax excluded on purpose — the lookup reacts to the IRN only, and the
    // prefill above is already guarded by an emptiness check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceIrn]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invoiceIrn.trim()) {
      setError({
        title: "Paste the supplier invoice IRN to continue.",
        items: [],
      });
      return;
    }
    const preNum = Number(preTax);
    const amtNum = Number(withholdAmount);
    if (!Number.isFinite(preNum) || preNum <= 0) {
      setError({ title: "Enter a valid pre-tax amount.", items: [] });
      return;
    }
    if (!calculation?.applicable || !Number.isFinite(amtNum) || amtNum <= 0) {
      setError({
        title: `Withholding applies only above the configured ${nature} threshold.`,
        items: [],
      });
      return;
    }
    setSubmitting(true);
    try {
      const party = pickNonEmpty(supplier);
      await createWithholdReceipt({
        reason: reason.trim() || undefined,
        invoiceDetail: { invoiceIrn: invoiceIrn.trim(), currency: "ETB" },
        withholdDetail: {
          type,
          nature,
          rate: calculation.rate,
          preTaxAmount: preNum,
          withholdingAmount: amtNum,
        },
        ...(party ? { supplier: party } : {}),
      });
      onFiled();
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title:
            readApiMessage(err.body) ?? "Couldn't file this withhold receipt.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({
          title: "Couldn't reach the server. Please try again.",
          items: [],
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Percent className="size-5 text-muted-foreground" />
              File withholding receipt
            </SheetTitle>
            <SheetDescription>
              Paste the supplier's invoice IRN — we'll look it up at MoR and
              fill in what we can. Withholding is computed from the current
              system configuration.
            </SheetDescription>
            {next && (
              <span className="mt-1 w-fit rounded-md border border-dashed bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
                Next counter{" "}
                <span className="ml-1 font-mono font-medium text-foreground">
                  {next.receiptCounterFormatted}
                </span>
              </span>
            )}
          </div>
        </SheetHeader>

        <form
          id="withhold-form"
          onSubmit={submit}
          className="contents"
          noValidate
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="flex flex-wrap items-center gap-1.5">
                Supplier invoice IRN *
                {lookupState === "loading" && (
                  <Tag tone="muted">
                    <Loader2 className="size-3 animate-spin" /> Checking MoR…
                  </Tag>
                )}
                {lookupState === "loaded" && (
                  <Tag tone="ok">
                    <CheckCircle2 className="size-3" /> Loaded from MoR
                  </Tag>
                )}
                {lookupState === "notfound" && (
                  <Tag tone="warn">Not found at MoR — fill in manually</Tag>
                )}
              </Label>
              <Textarea
                value={invoiceIrn}
                onChange={(e) => setInvoiceIrn(e.target.value)}
                placeholder="test-ad6205eb…7c3cda108452c6e3eda8120"
                rows={2}
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Withholding type *">
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as "TWTH" | "IWTH")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TWTH">TWTH — Transaction</SelectItem>
                    <SelectItem value="IWTH">IWTH — Income</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Supply nature *">
                <Select
                  value={nature}
                  onValueChange={(value) =>
                    setNature(value as "goods" | "service")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">Goods</SelectItem>
                    <SelectItem value="service">Services</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pre-tax amount *">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={preTax}
                  onChange={(e) => setPreTax(e.target.value)}
                  placeholder="40000"
                  required
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  Withhold amount *
                  {calculation && (
                    <Tag tone={calculation.applicable ? "muted" : "warn"}>
                      {calculation.rate}% · threshold {calculation.threshold}
                    </Tag>
                  )}
                </Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={withholdAmount}
                  readOnly
                  required
                />
              </div>
            </div>

            <fieldset className="flex flex-col gap-3 rounded-md border border-dashed p-3">
              <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Supplier details
              </legend>
              <p className="-mt-1 text-[11px] text-muted-foreground">
                These print on the receipt's "To" block. Fill in what you can —
                the source invoice lives on the supplier's system, not ours.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Legal name">
                  <Input
                    value={supplier.legalName}
                    onChange={(e) => setSup("legalName", e.target.value)}
                    placeholder="Arifpay Financial Technologies"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={supplier.phone}
                    onChange={(e) => setSup("phone", e.target.value)}
                    placeholder="+251 91 071 0569"
                  />
                </Field>
                <Field label="TIN">
                  <Input
                    value={supplier.tin}
                    onChange={(e) => setSup("tin", e.target.value)}
                    placeholder="0076035434"
                  />
                </Field>
                <Field label="Sub-TIN">
                  <Input
                    value={supplier.subTin}
                    onChange={(e) => setSup("subTin", e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="VAT Reg. No">
                  <Input
                    value={supplier.vatNumber}
                    onChange={(e) => setSup("vatNumber", e.target.value)}
                    placeholder="43256663343256663322"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={supplier.email}
                    onChange={(e) => setSup("email", e.target.value)}
                    placeholder="ap@example.et"
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="City">
                  <Input
                    value={supplier.city}
                    onChange={(e) => setSup("city", e.target.value)}
                    placeholder="Addis Ababa"
                  />
                </Field>
                <Field label="Zone / Sub city">
                  <Input
                    value={supplier.zone}
                    onChange={(e) => setSup("zone", e.target.value)}
                    placeholder="Bole"
                  />
                </Field>
                <Field label="Woreda">
                  <Input
                    value={supplier.wereda}
                    onChange={(e) => setSup("wereda", e.target.value)}
                    placeholder="03"
                  />
                </Field>
                <Field label="Kebele">
                  <Input
                    value={supplier.kebele}
                    onChange={(e) => setSup("kebele", e.target.value)}
                    placeholder="01"
                  />
                </Field>
              </div>
            </fieldset>

            <Field label="Reason / note">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </Field>

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="withhold-form" disabled={submitting}>
              {submitting ? "Filing…" : "File with MOR"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "muted" | "ok" | "warn";
  children: React.ReactNode;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[9px] font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
