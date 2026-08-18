import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  listUsers,
  unlockUser,
  updateUser,
} from "@/lib/resources";
import { ROLE_LABELS, type ManagedUser, type SafeBranch } from "@/lib/types";

/** Pure helper: is the user currently locked out? */
function isLocked(u: ManagedUser): boolean {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

export function UsersPage() {
  const { can, user: actor, merchant } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [branchesById, setBranchesById] = useState<Map<string, SafeBranch>>(
    new Map(),
  );

  useEffect(() => {
    void refresh();
  }, []);

  // Resolve cashier branch ids to a name. SUPER_ADMIN (no merchantId) skips
  // this — they manage branches from the merchants admin page.
  useEffect(() => {
    const merchantId = actor?.merchantId ?? merchant?.id ?? null;
    if (!merchantId) return;
    void listBranches(merchantId)
      .then((rows) => setBranchesById(new Map(rows.map((b) => [b.id, b]))))
      .catch(() => undefined);
  }, [actor?.merchantId, merchant?.id]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError(readRequestError(e, "Unable to load user information."));
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    try {
      const updated = await updateUser(user.id, { active: !user.active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      // surface via list refresh
      void refresh();
    }
  }

  async function unlock(user: ManagedUser) {
    try {
      const updated = await unlockUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      void refresh();
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
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
          <p className="text-[13px] text-muted-foreground">
            Manage who can sign in and what each person can do. Roles bundle
            permissions for invoices, receipts, inventory, and access itself.
          </p>
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
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                <Users className="size-3.5" />
              </span>
              <div>
                <CardTitle className="text-[15px]">
                  {users.length} user{users.length === 1 ? "" : "s"}
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
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
                            : "Any"}
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
        onSaved={(u) => {
          setUsers((prev) => {
            const existing = prev.findIndex((x) => x.id === u.id);
            if (existing === -1) return [u, ...prev];
            const next = [...prev];
            next[existing] = u;
            return next;
          });
          setFormMode(null);
          setEditing(null);
        }}
      />
    </div>
  );
}
