import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

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
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { createMerchant, updateMerchant } from "@/lib/resources";
import type { Merchant } from "@/lib/types";

type Mode = "create" | "edit";

export interface MerchantFormSheetProps {
  mode: Mode | null;
  merchant: Merchant | null;
  onClose: () => void;
  onSaved: (m: Merchant) => void;
}

/** Form-state shape mirrors {@link MerchantInput} with everything as a string
 *  (so unfilled fields stay controlled inputs). Trimmed and converted at submit. */
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
  defaultLanguage: string;
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
    defaultLanguage: "en",
  };
}

function fromMerchant(m: Merchant): FormState {
  return {
    legalName: m.legalName,
    tradeName: m.tradeName ?? "",
    tin: m.tin,
    email: m.email ?? "",
    phone: m.phone ?? "",
    vatNumber: m.vatNumber ?? "",
    city: m.city ?? "",
    region: m.region ?? "",
    zone: m.zone ?? "",
    wereda: m.wereda ?? "",
    kebele: m.kebele ?? "",
    houseNumber: m.houseNumber ?? "",
    defaultLanguage: m.defaultLanguage ?? "en",
  };
}

export function MerchantFormSheet({
  mode,
  merchant,
  onClose,
  onSaved,
}: MerchantFormSheetProps) {
  const [form, setForm] = useState<FormState>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  useEffect(() => {
    if (mode === "edit" && merchant) setForm(fromMerchant(merchant));
    else if (mode === "create") setForm(blank());
    setError(null);
    setBusy(false);
  }, [mode, merchant?.id]);

  const open = mode !== null;

  function update<K extends keyof FormState>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const orNull = (v: string) => (v.trim() ? v.trim() : null);
    const orUndef = (v: string) => (v.trim() ? v.trim() : undefined);
    const payload = {
      legalName: form.legalName.trim(),
      tin: form.tin.trim(),
      tradeName: mode === "edit" ? orNull(form.tradeName) : orUndef(form.tradeName),
      email: mode === "edit" ? orNull(form.email) : orUndef(form.email),
      phone: mode === "edit" ? orNull(form.phone) : orUndef(form.phone),
      vatNumber: mode === "edit" ? orNull(form.vatNumber) : orUndef(form.vatNumber),
      city: mode === "edit" ? orNull(form.city) : orUndef(form.city),
      region: mode === "edit" ? orNull(form.region) : orUndef(form.region),
      zone: mode === "edit" ? orNull(form.zone) : orUndef(form.zone),
      wereda: mode === "edit" ? orNull(form.wereda) : orUndef(form.wereda),
      kebele: mode === "edit" ? orNull(form.kebele) : orUndef(form.kebele),
      houseNumber: mode === "edit" ? orNull(form.houseNumber) : orUndef(form.houseNumber),
      defaultLanguage: form.defaultLanguage,
    };
    try {
      const saved =
        mode === "edit" && merchant
          ? await updateMerchant(merchant.id, payload)
          : await createMerchant(payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't save this merchant.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({ title: (err as Error).message, items: [] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-muted-foreground" />
              {mode === "create" ? "Onboard merchant" : "Edit merchant"}
            </SheetTitle>
            <SheetDescription>
              {mode === "create"
                ? "Create a new merchant. You'll add branches and EIRMS credentials after."
                : `Editing ${merchant?.legalName ?? ""}`}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form id="merchant-form" onSubmit={submit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Legal name *">
                <Input
                  value={form.legalName}
                  onChange={(e) => update("legalName", e.target.value)}
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
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </Field>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Address
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
            </div>

            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Notifications
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Fallback language for buyer emails + SMS when the buyer
                  hasn't chosen one themselves.
                </span>
              </div>
              <Field label="Default language">
                <Select
                  value={form.defaultLanguage}
                  onValueChange={(v) => update("defaultLanguage", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="am">አማርኛ (Amharic)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="merchant-form" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "Create merchant" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
