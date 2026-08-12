import { useEffect, useState } from "react";
import { Warehouse } from "lucide-react";

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
import { useAuth } from "@/lib/auth";
import { createStore, updateStore } from "@/lib/resources";
import type { SafeBranch, Store } from "@/lib/types";

type Mode = "create" | "edit";

export interface StoreFormSheetProps {
  mode: Mode | null;
  store: Store | null;
  branches: SafeBranch[];
  onClose: () => void;
  onSaved: (store: Store) => void;
}

interface FormState {
  name: string;
  code: string;
  branchId: string;
  isSalesFloor: boolean;
  active: boolean;
}

function blank(defaultBranchId: string): FormState {
  return {
    name: "",
    code: "",
    branchId: defaultBranchId,
    isSalesFloor: false,
    active: true,
  };
}

function fromStore(store: Store): FormState {
  return {
    name: store.name,
    code: store.code,
    branchId: store.branchId,
    isSalesFloor: store.isSalesFloor,
    active: store.active,
  };
}

export function StoreFormSheet({
  mode,
  store,
  branches,
  onClose,
  onSaved,
}: StoreFormSheetProps) {
  const { branch: activeBranch } = useAuth();
  const defaultBranchId =
    branches.find((b) => b.id === activeBranch?.id)?.id ?? branches[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(blank(defaultBranchId));
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "edit" && store) setForm(fromStore(store));
    else if (mode === "create") setForm(blank(defaultBranchId));
    setError(null);
    setBusy(false);
  }, [mode, store?.id, defaultBranchId]);

  const open = mode !== null;

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const problems: string[] = [];
    if (!name) problems.push("Name is required.");
    if (!code) problems.push("Code is required.");
    if (!/^[A-Z0-9_-]+$/.test(code))
      problems.push("Code must be uppercase letters, digits, underscore or hyphen.");
    if (mode === "create" && !form.branchId)
      problems.push("Pick the branch this store belongs to.");
    if (problems.length) {
      setError({ title: "Please complete the required fields.", items: problems });
      return;
    }
    setBusy(true);
    try {
      const saved =
        mode === "edit" && store
          ? await updateStore(store.id, {
              name,
              code,
              isSalesFloor: form.isSalesFloor,
              active: form.active,
            })
          : await createStore({
              name,
              code,
              branchId: form.branchId,
              isSalesFloor: form.isSalesFloor,
              active: form.active,
            });
      onSaved(saved);
    } catch (err) {
      const fallback =
        mode === "edit" ? "Couldn't save your changes." : "Couldn't add this store.";
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
              <Warehouse className="size-5 text-muted-foreground" />
              {mode === "edit" ? "Edit store" : "Add store"}
            </SheetTitle>
            <SheetDescription>
              Stores are named locations inside a branch — front shelf, back
              room, cold storage. Stock is tracked per store; the sale path
              draws from whichever store is flagged as sales floor.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form id="store-form" onSubmit={submit} className="contents" noValidate>
          <SheetBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *" spanFull>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Cold Storage"
                />
              </Field>
              <Field label="Code *">
                <Input
                  required
                  value={form.code}
                  onChange={(e) => update("code", e.target.value.toUpperCase())}
                  placeholder="COLD"
                  className="font-mono"
                />
              </Field>
              {mode === "create" && (
                <Field label="Branch *">
                  <Select
                    value={form.branchId}
                    onValueChange={(v) => update("branchId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
              <input
                type="checkbox"
                checked={form.isSalesFloor}
                onChange={(e) => update("isSalesFloor", e.target.checked)}
                className="mt-0.5 size-4 accent-[#5700FF]"
              />
              <span>
                <span className="font-medium">Sales floor</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  The POS sale path decrements from this store. Only one per
                  branch should be flagged — turning it on here demotes the
                  current holder in the same transaction.
                </span>
              </span>
            </label>

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
            <Button type="submit" form="store-form" disabled={busy}>
              {busy
                ? "Saving…"
                : mode === "edit"
                  ? "Save changes"
                  : "Add store"}
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
