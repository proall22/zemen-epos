import { useEffect, useState } from "react";
import { Truck } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { createVendor, updateVendor } from "@/lib/resources";
import type { Vendor } from "@/lib/types";

type Mode = "create" | "edit";

export interface VendorFormSheetProps {
  mode: Mode | null;
  vendor: Vendor | null;
  onClose: () => void;
  onSaved: (v: Vendor) => void;
}

interface FormState {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  tin: string;
  notes: string;
  active: boolean;
}

const BLANK: FormState = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  tin: "",
  notes: "",
  active: true,
};

function fromVendor(v: Vendor): FormState {
  return {
    name: v.name,
    contactName: v.contactName ?? "",
    email: v.email ?? "",
    phone: v.phone ?? "",
    tin: v.tin ?? "",
    notes: v.notes ?? "",
    active: v.active,
  };
}

export function VendorFormSheet({
  mode,
  vendor,
  onClose,
  onSaved,
}: VendorFormSheetProps) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "edit" && vendor) setForm(fromVendor(vendor));
    else if (mode === "create") setForm(BLANK);
    setError(null);
    setBusy(false);
  }, [mode, vendor?.id]);

  const open = mode !== null;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name) {
      setError({ title: "Vendor name is required.", items: [] });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name,
        contactName: form.contactName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        tin: form.tin.trim() || undefined,
        notes: form.notes.trim() || undefined,
        active: form.active,
      };
      const saved =
        mode === "edit" && vendor
          ? await updateVendor(vendor.id, payload)
          : await createVendor(payload);
      onSaved(saved);
    } catch (err) {
      const fallback =
        mode === "edit" ? "Couldn't save your changes." : "Couldn't add this vendor.";
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? fallback,
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
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Truck className="size-5 text-muted-foreground" />
              {mode === "edit" ? "Edit vendor" : "Add vendor"}
            </SheetTitle>
            <SheetDescription>
              Suppliers you procure from — kept separate from the withholding
              "supplier" concept, which is the counterparty on an outgoing
              withhold receipt.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form id="vendor-form" onSubmit={submit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *" spanFull>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Addis Foods PLC"
                />
              </Field>
              <Field label="Contact person">
                <Input
                  value={form.contactName}
                  onChange={(e) => update("contactName", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="TIN">
                <Input
                  value={form.tin}
                  onChange={(e) => update("tin", e.target.value)}
                  placeholder="Optional"
                  className="font-mono"
                />
              </Field>
              <Field label="Notes" spanFull>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={2}
                  placeholder="Payment terms, delivery cadence, etc."
                />
              </Field>
            </div>

            {mode === "edit" && (
              <label className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => update("active", e.target.checked)}
                  className="size-4 accent-[#5700FF]"
                />
                <span className="font-medium">Active</span>
              </label>
            )}

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="vendor-form" disabled={busy}>
              {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Add vendor"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  spanFull,
  children,
}: {
  label: string;
  spanFull?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${spanFull ? "col-span-2" : ""}`.trim()}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
