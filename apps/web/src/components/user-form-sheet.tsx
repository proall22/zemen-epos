import { useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

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
import { createUser, listBranches, updateUser } from "@/lib/resources";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  type AssignableRole,
  type ManagedUser,
  type SafeBranch,
} from "@/lib/types";

type Mode = "create" | "edit";

export interface UserFormSheetProps {
  mode: Mode | null;
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: (user: ManagedUser) => void;
}

export function UserFormSheet({
  mode,
  user,
  onClose,
  onSaved,
}: UserFormSheetProps) {
  const { user: actor, merchant } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AssignableRole>("CASHIER");
  const [password, setPassword] = useState("");
  // Grant set + pinned default. MERCHANT_ADMIN ignores both — the backend
  // grants them implicit access to every branch.
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [pinnedBranchId, setPinnedBranchId] = useState<string | "">("");
  const [branches, setBranches] = useState<SafeBranch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  // Load the merchant's branches the first time the sheet opens. The picker
  // is only meaningful for users inside a merchant — SUPER_ADMIN sees the
  // dropdown empty + disabled (they should use the merchants admin page).
  useEffect(() => {
    if (mode === null) return;
    const merchantId = user?.merchantId ?? actor?.merchantId ?? merchant?.id;
    if (!merchantId) return;
    void listBranches(merchantId)
      .then((rows) => setBranches(rows))
      .catch(() => setBranches([]));
  }, [mode, user?.merchantId, actor?.merchantId, merchant?.id]);

  useEffect(() => {
    if (mode === "edit" && user) {
      setEmail(user.email);
      setName(user.name ?? "");
      const r = (user.role === "SUPER_ADMIN" || user.role === "ADMIN"
        ? "CASHIER"
        : user.role) as AssignableRole;
      setRole(r);
      setPassword("");
      setBranchIds(user.branchIds ?? []);
      setPinnedBranchId(user.branchId ?? "");
    } else if (mode === "create") {
      setEmail("");
      setName("");
      setRole("CASHIER");
      setPassword("");
      setBranchIds([]);
      setPinnedBranchId("");
    }
    setError(null);
    setBusy(false);
  }, [mode, user?.id]);

  const open = mode !== null;

  const visibleBranches = useMemo(() => {
    const active = branches.filter((b) => b.active);
    const grantedInactive = branches.filter(
      (b) => !b.active && branchIds.includes(b.id),
    );
    return [...active, ...grantedInactive];
  }, [branches, branchIds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const isMerchantAdmin = role === "MERCHANT_ADMIN";
    // MERCHANT_ADMIN — grants inferred by role; skip grant validation.
    if (!isMerchantAdmin && branchIds.length === 0) {
      setError({
        title: "Grant at least one branch this user can act as.",
        items: [
          "Every non-admin user needs at least one branch grant. Add branches under Merchants → Branches first if there are none.",
        ],
      });
      return;
    }
    if (role === "BRANCH_ADMIN" && branchIds.length !== 1) {
      setError({
        title: "Assign exactly one branch to a branch administrator.",
        items: ["Branch administrators are deliberately restricted to one operational branch."],
      });
      return;
    }
    setBusy(true);
    const effectiveBranchIds = isMerchantAdmin ? [] : branchIds;
    const activeGrantedIds = branchIds.filter(
      (id) => branches.find((b) => b.id === id)?.active,
    );
    const effectivePinned = isMerchantAdmin
      ? pinnedBranchId || null
      : pinnedBranchId && activeGrantedIds.includes(pinnedBranchId)
        ? pinnedBranchId
        : (activeGrantedIds[0] ?? null);
    try {
      if (mode === "create") {
        const created = await createUser({
          email: email.trim(),
          name: name.trim() || undefined,
          role,
          password,
          branchIds: effectiveBranchIds,
          branchId: effectivePinned,
        });
        onSaved(created);
      } else if (mode === "edit" && user) {
        const updated = await updateUser(user.id, {
          name: name.trim() || undefined,
          role,
          password: password ? password : undefined,
          branchIds: effectiveBranchIds,
          branchId: effectivePinned,
        });
        onSaved(updated);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't save this user.",
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
              <UserPlus className="size-5 text-muted-foreground" />
              {mode === "create" ? "Add user" : "Edit user"}
            </SheetTitle>
            <SheetDescription>
              {mode === "create"
                ? "Pick a role to bundle the right permissions."
                : `Editing ${user?.email ?? ""}`}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form
          id="user-form"
          onSubmit={submit}
          className="contents"
          noValidate
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === "edit"}
                required
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Display name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as AssignableRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="flex flex-col gap-2">
              <Label>Branch access</Label>
              {role === "MERCHANT_ADMIN" ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Merchant admins have implicit access to every branch under
                  the merchant. Grants are ignored.
                </p>
              ) : visibleBranches.length === 0 ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  This merchant has no active branches yet. Add one under
                  Merchants → Branches first.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {role === "BRANCH_ADMIN"
                      ? "Pick the single branch this administrator manages."
                      : "Pick every branch this user may act as. The user switches"}
                    {role !== "BRANCH_ADMIN" && " between them from the top-left branch switcher. Marking one as the pinned default auto-selects it on login."}
                  </p>
                  <div className="flex flex-col divide-y overflow-hidden rounded-md border text-sm">
                    {visibleBranches.map((b) => {
                      const selected = branchIds.includes(b.id);
                      const isPinned =
                        selected && pinnedBranchId === b.id;
                      return (
                        <div
                          key={b.id}
                          className="flex items-center gap-3 px-3 py-2"
                        >
                          <label className="flex flex-1 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const nextSelected = e.target.checked;
                                setBranchIds((prev) => {
                                  if (nextSelected) {
                                    return prev.includes(b.id)
                                      ? prev
                                      : [...prev, b.id];
                                  }
                                  return prev.filter((x) => x !== b.id);
                                });
                                if (!nextSelected && pinnedBranchId === b.id) {
                                  setPinnedBranchId("");
                                }
                              }}
                              className="mt-0.5 size-4 accent-[#5700FF]"
                            />
                            <span className="flex flex-col leading-tight">
                              <span className="font-medium">
                                {b.name}
                                {b.tradeName && b.tradeName !== b.name
                                  ? ` · ${b.tradeName}`
                                  : ""}
                                {!b.active && (
                                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground">
                                    Disabled
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {b.subTin
                                  ? `Sub-TIN ${b.subTin}`
                                  : b.systemNumber
                                    ? `SYS ${b.systemNumber}`
                                    : ""}
                              </span>
                            </span>
                          </label>
                          {selected && b.active && (
                            <button
                              type="button"
                              onClick={() => setPinnedBranchId(b.id)}
                              className={
                                isPinned
                                  ? "rounded-full bg-[#5700FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white"
                                  : "rounded-full border border-input px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground hover:border-[#5700FF]/40 hover:text-foreground"
                              }
                              aria-pressed={isPinned}
                            >
                              {isPinned ? "Pinned" : "Pin as default"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label>
                {mode === "create" ? "Password *" : "Reset password"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "edit" ? "Leave blank to keep current" : "Min 8 chars"
                }
                autoComplete="new-password"
                minLength={mode === "create" ? 8 : undefined}
                required={mode === "create"}
              />
            </div>

            {error && <ErrorCallout title={error.title} items={error.items} />}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {mode === "create" ? "Add user" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
