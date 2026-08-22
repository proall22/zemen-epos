import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CircleCheck,
  CircleX,
  LockOpen,
  Pencil,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import { UserFormSheet } from "@/components/user-form-sheet";
import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { readRequestError } from "@/lib/api-errors";
import {
  listBranches,
  listMerchants,
  listUsers,
  unlockUser,
  updateUser,
} from "@/lib/resources";
import { ROLE_LABELS, type ManagedUser, type Merchant, type SafeBranch, type UserRole } from "@/lib/types";

const PAGE_SIZE = 25;

/** Pure helper: is the user currently locked out? */
function isLocked(u: ManagedUser): boolean {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

export function UsersPage() {
  const { can, user: actor, merchant } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [role, setRole] = useState<UserRole | "ALL">("ALL");
  const requestedStatus = searchParams.get("status");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "DISABLED">(
    requestedStatus === "ACTIVE" || requestedStatus === "DISABLED" ? requestedStatus : "ALL",
  );
  const [merchantId, setMerchantId] = useState("ALL");
  const [branchId, setBranchId] = useState("ALL");
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [filterBranches, setFilterBranches] = useState<SafeBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [branchesById, setBranchesById] = useState<Map<string, SafeBranch>>(
    new Map(),
  );

  useEffect(() => { void refresh(); }, [offset, appliedSearch, role, status, merchantId, branchId]);

  useEffect(() => {
    if (actor?.role === "SUPER_ADMIN") void listMerchants().then(setMerchants).catch(() => undefined);
  }, [actor?.role]);

  // Resolve cashier branch ids to a name. SUPER_ADMIN (no merchantId) skips
  // this — they manage branches from the merchants admin page.
  useEffect(() => {
    const selected = actor?.role === "SUPER_ADMIN"
      ? (merchantId === "ALL" ? null : merchantId)
      : actor?.merchantId ?? merchant?.id ?? null;
    if (!selected) { setFilterBranches([]); setBranchesById(new Map()); return; }
    void listBranches(selected)
      .then((rows) => { setFilterBranches(rows); setBranchesById(new Map(rows.map((b) => [b.id, b]))); })
      .catch(() => undefined);
  }, [actor?.role, actor?.merchantId, merchant?.id, merchantId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await listUsers({
        limit: PAGE_SIZE, offset,
        q: appliedSearch.trim() || undefined,
        role: role === "ALL" ? undefined : role,
        active: status === "ALL" ? undefined : status === "ACTIVE",
        merchantId: merchantId === "ALL" ? undefined : merchantId,
        branchId: branchId === "ALL" ? undefined : branchId,
      });
      setUsers(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(readRequestError(e, "Unable to load user information."));
    } finally {
      setLoading(false);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function toggleActive(user: ManagedUser) {
    try {
      await updateUser(user.id, { active: !user.active });
      await refresh();
    } catch {
      // surface via list refresh
      void refresh();
    }
  }

  async function unlock(user: ManagedUser) {
    try {
      await unlockUser(user.id);
      await refresh();
    } catch {
      void refresh();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-8 lg:px-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            Zemen-ePos · Access
          </p>
          <h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            Users
          </h1>
          <p className="text-[13px] text-muted-foreground">Manage user access, roles, branch assignments, and account status.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw />
            Refresh
          </Button>
          {can("user.create") && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormMode("create");
              }}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              <UserPlus />
              Add user
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader className="gap-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                <Users className="size-3.5" />
              </span>
              <div>
                <CardTitle className="text-[15px]">
                  {total} user{total === 1 ? "" : "s"}
                </CardTitle>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {actor?.role === "SUPER_ADMIN" && (
              <Filter label="Merchant">
                <Select value={merchantId} onValueChange={(v) => { setMerchantId(v); setBranchId("ALL"); setOffset(0); }}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All merchants</SelectItem>
                    {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.legalName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Filter>
            )}
            {filterBranches.length > 0 && (
              <Filter label="Branch">
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); setOffset(0); }}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All branches</SelectItem>
                    {filterBranches.map((b) => <SelectItem key={b.id} value={b.id}>{b.tradeName ?? b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Filter>
            )}
            <Filter label="Role">
              <Select value={role} onValueChange={(v) => { setRole(v as UserRole | "ALL"); setOffset(0); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  {Object.entries(ROLE_LABELS).filter(([key]) => key !== "ADMIN").map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Filter>
            <Filter label="Status">
              <Select value={status} onValueChange={(v) => {
                const nextStatus = v as typeof status;
                setStatus(nextStatus);
                setOffset(0);
                const next = new URLSearchParams(searchParams);
                if (nextStatus === "ALL") next.delete("status"); else next.set("status", nextStatus);
                setSearchParams(next, { replace: true });
              }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="DISABLED">Disabled</SelectItem></SelectContent>
              </Select>
            </Filter>
            <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setAppliedSearch(search); }}>
              <Filter label="Search"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email or name…" className="w-56" /></Filter>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <ErrorCallout
              title="We couldn't load the user list."
              items={[error, "Check your connection, then select Refresh to try again."]}
            />
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching users.</p>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSuperAdmin = u.role === "SUPER_ADMIN";
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>{u.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={isSuperAdmin ? "default" : "secondary"}>
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {isSuperAdmin
                          ? "—"
                          : u.branchId
                            ? (branchesById.get(u.branchId)?.name ?? u.branchId)
                            : u.role === "MERCHANT_ADMIN"
                              ? "All merchant branches"
                              : "No branch assigned"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="muted">Disabled</Badge>
                          )}
                          {isLocked(u) && (
                            <Badge
                              variant="destructive"
                              className="gap-1"
                              title={`Locked until ${new Date(u.lockedUntil!).toLocaleString()} after ${u.failedLoginCount} failed attempts.`}
                            >
                              <ShieldAlert className="size-3" />
                              Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {can("user.update") && !isSuperAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(u);
                                setFormMode("edit");
                              }}
                            >
                              <Pencil />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(u)}
                            >
                              {u.active ? <CircleX /> : <CircleCheck />}
                              {u.active ? "Disable" : "Enable"}
                            </Button>
                            {isLocked(u) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
                                onClick={() => unlock(u)}
                              >
                                <LockOpen />
                                Unlock
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <UserFormSheet
        mode={formMode}
        user={editing}
        onClose={() => {
          setFormMode(null);
          setEditing(null);
        }}
        onSaved={() => {
          void refresh();
          setFormMode(null);
          setEditing(null);
        }}
      />
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
