import { useEffect, useState } from "react";
import { Percent } from "lucide-react";

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
import {
  createHarmonizationCode,
  updateHarmonizationCode,
} from "@/lib/resources";
import type { HarmonizationCode } from "@/lib/types";

type Mode = "create" | "edit";

export interface HarmonizationFormSheetProps {
  mode: Mode | null;
  code: HarmonizationCode | null;
  onClose: () => void;
  onSaved: (c: HarmonizationCode) => void;
}

interface FormState {
  code: string;
  description: string;
  exciseRate: string;
  active: boolean;
}

const BLANK: FormState = {
  code: "",
  description: "",
  exciseRate: "0",
  active: true,
};

export function HarmonizationFormSheet({
  mode,
  code,
  onClose,
  onSaved,
}: HarmonizationFormSheetProps) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "edit" && code) {
      setForm({
        code: code.code,
        description: code.description ?? "",
        exciseRate: String(code.exciseRate),
        active: code.active,
      });
    } else if (mode === "create") {
      setForm(BLANK);
    }
    setError(null);
    setBusy(false);
  }, [mode, code?.id]);

  const open = mode !== null;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const hs = form.code.trim();
    if (!hs) {
      setError({ title: "A harmonization code is required.", items: [] });
      return;
    }
    const rate = Number(form.exciseRate);
    if (!Number.isFinite(rate) || rate < 0) {
      setError({ title: "Excise % must be zero or greater.", items: [] });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code: hs,
        description: form.description.trim() || undefined,
        exciseRate: rate,
        active: form.active,
      };
      const saved =
        mode === "edit" && code
          ? await updateHarmonizationCode(code.id, payload)
          : await createHarmonizationCode(payload);
      onSaved(saved);
    } catch (err) {
      const fallback =
        mode === "edit"
          ? "Couldn't save your changes."
          : "Couldn't add this harmonization code.";
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
              <Percent className="size-5 text-muted-foreground" />
              {mode === "edit"
                ? "Edit harmonization code"
                : "Add harmonization code"}
            </SheetTitle>
            <SheetDescription>
              A reference entry pairing an HS code with its excise rate.
              Inventory items pick from this list instead of typing both by
              hand. Editing a rate here only affects items saved afterwards —
              invoices already registered keep the rate they were filed with.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form
          id="harmonization-form"
          onSubmit={submit}
          className="contents"
          noValidate
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Harmonization code *">
                <Input
                  required
                  value={form.code}
                  onChange={(e) => update("code", e.target.value)}
                  placeholder="2203.00.00"
                  className="font-mono"
                />
              </Field>
              <Field label="Excise % *">
                <Input
                  required
                  type="number"
                  step="any"
                  min="0"
                  value={form.exciseRate}
                  onChange={(e) => update("exciseRate", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Description" spanFull>
                <Input
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Beer made from malt"
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
            <Button type="submit" form="harmonization-form" disabled={busy}>
              {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Add code"}
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
    <div
      className={`flex flex-col gap-1.5 ${spanFull ? "col-span-2" : ""}`.trim()}
    >
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
