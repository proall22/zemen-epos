import { useEffect, useState } from "react";
import { KeyRound, Loader2, Store } from "lucide-react";

import { BranchLocationPicker } from "@/components/branch-location-picker";
import { BranchReadiness } from "@/components/branch-readiness";
import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createBranch, updateBranch } from "@/lib/resources";
import type { SafeBranch } from "@/lib/types";

type Mode = "create" | "edit";

export interface BranchFormSheetProps {
  mode: Mode | null;
  merchantId: string | null;
  branch: SafeBranch | null;
  onClose: () => void;
  onSaved: (b: SafeBranch) => void;
}

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
  stockPolicy: "ALLOW_NEGATIVE" | "BLOCK_ON_EMPTY";
  eirmsClientId: string;
  eirmsClientSecret: string;
  eirmsApikey: string;
  location: { latitude: number; longitude: number } | null;
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
    stockPolicy: "ALLOW_NEGATIVE",
    eirmsClientId: "",
    eirmsClientSecret: "",
    eirmsApikey: "",
    location: null,
  };
}

function fromBranch(b: SafeBranch): FormState {
  // Credential fields stay blank on edit — sending them empty means "don't
  // change". A user who wants to rotate types a new value.
  return {
    name: b.name,
    systemNumber: b.systemNumber,
    city: b.city ?? "",
    region: b.region ?? "",
    zone: b.zone ?? "",
    wereda: b.wereda ?? "",
    kebele: b.kebele ?? "",
    houseNumber: b.houseNumber ?? "",
    subTin: b.subTin ?? "",
    tradeName: b.tradeName ?? "",
    vatNumber: b.vatNumber ?? "",
    country: b.country ?? "",
    stockPolicy: b.stockPolicy,
    eirmsClientId: "",
    eirmsClientSecret: "",
    eirmsApikey: "",
    location:
      b.latitude !== null && b.longitude !== null
        ? { latitude: b.latitude, longitude: b.longitude }
        : null,
  };
}

export function BranchFormSheet({
  mode,
  merchantId,
  branch,
  onClose,
  onSaved,
}: BranchFormSheetProps) {
  const [form, setForm] = useState<FormState>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  useEffect(() => {
    if (mode === "edit" && branch) setForm(fromBranch(branch));
    else if (mode === "create") setForm(blank());
    setError(null);
    setBusy(false);
  }, [mode, branch?.id]);

  const open = mode !== null && merchantId !== null;

  function update<K extends keyof FormState>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchantId) return;
    setError(null);
    setBusy(true);
    const orNull = (v: string) => (v.trim() ? v.trim() : null);
    const orUndef = (v: string) => (v.trim() ? v.trim() : undefined);
    const payload = {
      name: form.name.trim(),
      systemNumber: mode === "edit" ? orNull(form.systemNumber) : orUndef(form.systemNumber),
      city: mode === "edit" ? orNull(form.city) : orUndef(form.city),
      region: mode === "edit" ? orNull(form.region) : orUndef(form.region),
      zone: mode === "edit" ? orNull(form.zone) : orUndef(form.zone),
      wereda: mode === "edit" ? orNull(form.wereda) : orUndef(form.wereda),
      kebele: mode === "edit" ? orNull(form.kebele) : orUndef(form.kebele),
      houseNumber: mode === "edit" ? orNull(form.houseNumber) : orUndef(form.houseNumber),
      subTin: mode === "edit" ? orNull(form.subTin) : orUndef(form.subTin),
      tradeName: mode === "edit" ? orNull(form.tradeName) : orUndef(form.tradeName),
      vatNumber: mode === "edit" ? orNull(form.vatNumber) : orUndef(form.vatNumber),
      country: mode === "edit" ? orNull(form.country) : orUndef(form.country),
      stockPolicy: form.stockPolicy,
      // Credentials: blank means "leave alone" even on edit — user only rotates
      // by typing a new value.
      eirmsClientId: orUndef(form.eirmsClientId),
      eirmsClientSecret: orUndef(form.eirmsClientSecret),
      eirmsApikey: orUndef(form.eirmsApikey),
      // On create, omit nulls (server defaults to null anyway). On edit, a
      // null means "clear" — distinct from undefined which means "leave
      // unchanged"; we always send the value on edit so the user's
      // intentional clear via the picker takes effect.
      ...(mode === "edit"
        ? {
            latitude: form.location?.latitude ?? null,
            longitude: form.location?.longitude ?? null,
          }
        : form.location
          ? {
              latitude: form.location.latitude,
              longitude: form.location.longitude,
            }
          : {}),
    };
    try {
      const saved =
        mode === "edit" && branch
          ? await updateBranch(merchantId, branch.id, payload)
          : await createBranch(merchantId, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't save this branch.",
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
              <Store className="size-5 text-muted-foreground" />
              {mode === "create" ? "Add branch" : "Edit branch"}
            </SheetTitle>
            <SheetDescription>
              {mode === "create"
                ? "Branches get their own EIRMS sequence + system number."
                : `Editing ${branch?.name ?? ""}`}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form id="branch-form" onSubmit={submit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-4">
            {mode === "edit" && branch && (
              <BranchReadiness branch={branch} variant="full" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *">
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </Field>
              <Field label="System number">
                <Input
                  value={form.systemNumber}
                  onChange={(e) => update("systemNumber", e.target.value)}
                  placeholder="Set when MOR assigns one"
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

            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tax identity
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Tax identity for this location. Used on its tax documents.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sub-TIN">
                  <Input
                    value={form.subTin}
                    onChange={(e) => update("subTin", e.target.value)}
                    placeholder="Per-establishment tax id"
                  />
                </Field>
                <Field label="Trade name">
                  <Input
                    value={form.tradeName}
                    onChange={(e) => update("tradeName", e.target.value)}
                    placeholder="If different from the business"
                  />
                </Field>
                <Field label="VAT registration #">
                  <Input
                    value={form.vatNumber}
                    onChange={(e) => update("vatNumber", e.target.value)}
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                    placeholder="ET"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sales policy
              </p>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#5700FF]"
                  checked={form.stockPolicy === "BLOCK_ON_EMPTY"}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      stockPolicy: e.target.checked
                        ? "BLOCK_ON_EMPTY"
                        : "ALLOW_NEGATIVE",
                    }))
                  }
                />
                <span>
                  <span className="block font-medium">
                    Block sale when out of stock
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Cashiers at this branch cannot ring up items with a
                    tracked on-hand of zero. Untracked items stay sellable.
                  </span>
                </span>
              </label>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Location pin
              </p>
              <BranchLocationPicker
                value={form.location}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, location: next }))
                }
              />
            </div>

            <div className="border-t pt-4">
              <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <KeyRound className="size-3.5" />
                EIRMS credentials
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                {mode === "edit"
                  ? "Leave blank to keep current values. Typing a new value rotates that field."
                  : "Optional at create — set them later when MOR provisions the branch."}
              </p>
              <div className="flex flex-col gap-3">
                <Field
                  label={
                    mode === "edit" && branch?.eirmsClientIdSet
                      ? "Client ID (configured — type to rotate)"
                      : "Client ID"
                  }
                >
                  <Input
                    value={form.eirmsClientId}
                    onChange={(e) => update("eirmsClientId", e.target.value)}
                    placeholder={
                      mode === "edit" && branch?.eirmsClientIdSet
                        ? "Leave blank to keep"
                        : ""
                    }
                  />
                </Field>
                <Field
                  label={
                    mode === "edit" && branch?.eirmsClientSecretSet
                      ? "Client secret (configured — type to rotate)"
                      : "Client secret"
                  }
                >
                  <Input
                    type="password"
                    value={form.eirmsClientSecret}
                    onChange={(e) =>
                      update("eirmsClientSecret", e.target.value)
                    }
                    placeholder={
                      mode === "edit" && branch?.eirmsClientSecretSet
                        ? "Leave blank to keep"
                        : ""
                    }
                    autoComplete="new-password"
                  />
                </Field>
                <Field
                  label={
                    mode === "edit" && branch?.eirmsApikeySet
                      ? "API key (configured — type to rotate)"
                      : "API key"
                  }
                >
                  <Input
                    type="password"
                    value={form.eirmsApikey}
                    onChange={(e) => update("eirmsApikey", e.target.value)}
                    placeholder={
                      mode === "edit" && branch?.eirmsApikeySet
                        ? "Leave blank to keep"
                        : ""
                    }
                    autoComplete="new-password"
                  />
                </Field>
              </div>
            </div>

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="branch-form" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "create" ? "Add branch" : "Save changes"}
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
