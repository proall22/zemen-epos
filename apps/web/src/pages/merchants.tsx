import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
  XOctagon,
} from "lucide-react";

import { BranchDetailDrawer } from "@/components/branch-detail-drawer";
import { BranchFormSheet } from "@/components/branch-form-sheet";
import { BranchReadiness } from "@/components/branch-readiness";
import { CertificateSheet } from "@/components/certificate-sheet";
import {
  MerchantConsentPanel,
  SuperAdminConsentPanel,
} from "@/components/consent-panels";
import { ErrorCallout } from "@/components/error-callout";
import { MerchantFormSheet } from "@/components/merchant-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { readApiMessage, readRequestError } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import {
  approveBranch,
  listBranches,
  listMerchants,
  rejectBranch,
  rejectMerchant,
  updateBranch,
  updateMerchant,
} from "@/lib/resources";
import type { Merchant, SafeBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Top-level Phase D admin page. Layout intentionally stacks panels (per the
 *  project UX preference): merchant list on the left, selected merchant's
 *  detail + branches on the right — instead of expanding rows inline. */
export function MerchantsPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const requestedStatus = searchParams.get("status") ?? "all";
  // Seed from ?selected= so returning from the branch wizard reselects the
  // merchant the user was working on.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("selected"),
  );
  const [branches, setBranches] = useState<SafeBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [merchantFormMode, setMerchantFormMode] = useState<
    "create" | "edit" | null
  >(null);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [branchFormMode, setBranchFormMode] = useState<
    "create" | "edit" | null
  >(null);
  const [editingBranch, setEditingBranch] = useState<SafeBranch | null>(null);
  /** Merchant being rejected via the reason sheet, if any. */
  const [rejecting, setRejecting] = useState<Merchant | null>(null);
  /** Branch whose certificate wizard is open, if any. */
  const [certBranch, setCertBranch] = useState<SafeBranch | null>(null);
  const [drawerBranch, setDrawerBranch] = useState<SafeBranch | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    void refreshMerchants();
  }, []);

  useEffect(() => {
    if (selectedId) void refreshBranches(selectedId);
    else setBranches([]);
  }, [selectedId]);

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.id === selectedId) ?? null,
    [merchants, selectedId],
  );
  const visibleMerchants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return merchants.filter((merchant) => {
      const statusMatches =
        requestedStatus === "all" ||
        (requestedStatus === "active" &&
          Boolean(merchant.approvedAt) &&
          merchant.active) ||
        (requestedStatus === "pending" &&
          !merchant.approvedAt &&
          !merchant.rejectedAt) ||
        (requestedStatus === "suspended" &&
          Boolean(merchant.approvedAt) &&
          !merchant.active) ||
        (requestedStatus === "rejected" && Boolean(merchant.rejectedAt));
      if (!statusMatches) return false;
      return (
        !term ||
        merchant.legalName.toLowerCase().includes(term) ||
        merchant.tradeName?.toLowerCase().includes(term) ||
        merchant.tin.toLowerCase().includes(term) ||
        merchant.owner?.email.toLowerCase().includes(term)
      );
    });
  }, [merchants, requestedStatus, search]);

  useEffect(() => {
    setSelectedId((current) =>
      current && visibleMerchants.some((merchant) => merchant.id === current)
        ? current
        : (visibleMerchants[0]?.id ?? null),
    );
  }, [visibleMerchants]);

  async function refreshMerchants() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listMerchants();
      // Pending merchants (awaiting approval) sort to the top so super-admin
      // sees them first; everything else keeps the server's order.
      const sorted = [...rows].sort((a, b) => {
        if (a.approvedAt === null && b.approvedAt !== null) return -1;
        if (b.approvedAt === null && a.approvedAt !== null) return 1;
        return 0;
      });
      setMerchants(sorted);
      // Keep the current selection if it still exists; otherwise fall back to
      // the first row so the right panel always has something to show.
    } catch (e) {
      setError(readRequestError(e, "Unable to load merchant information."));
    } finally {
      setLoading(false);
    }
  }

  async function refreshBranches(merchantId: string) {
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      setBranches(await listBranches(merchantId));
    } catch (e) {
      setBranchesError((e as Error).message);
    } finally {
      setBranchesLoading(false);
    }
  }

  async function toggleMerchantActive(m: Merchant) {
    try {
      const updated = await updateMerchant(m.id, { active: !m.active });
      setMerchants((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch {
      void refreshMerchants();
    }
  }

  async function toggleBranchActive(b: SafeBranch) {
    try {
      const updated = await updateBranch(b.merchantId, b.id, {
        active: !b.active,
      });
      setBranches((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch {
      if (selectedId) void refreshBranches(selectedId);
    }
  }

  async function decideBranch(b: SafeBranch, decision: "approve" | "reject") {
    try {
      const reason =
        decision === "reject"
          ? window.prompt("Reason for rejecting this branch (optional):")
          : null;
      if (decision === "reject" && reason === null) return;
      const updated =
        decision === "approve"
          ? await approveBranch(b.merchantId, b.id)
          : await rejectBranch(b.merchantId, b.id, reason || undefined);
      setBranches((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch (e) {
      setBranchesError(
        readApiMessage((e as ApiError).body) ?? (e as Error).message,
      );
    }
  }

  const canCreateMerchant = can("merchant.create");
  const canEditMerchant = can("merchant.update");
  const canCreateBranch = can("branch.create");
  const canEditBranch = can("branch.update");

  function selectStatus(status: string) {
    const params = new URLSearchParams(searchParams);
    if (status === "all") params.delete("status");
    else params.set("status", status);
    params.delete("selected");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-8 lg:px-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Onboarding
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-sm text-muted-foreground">
            Each merchant gets its own buyer book, inventory, and audit trail.
            Branches under a merchant hold their own EIRMS credentials and POS
            sequence.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshMerchants}
            disabled={loading}
          >
            <RefreshCw />
            Refresh
          </Button>
          {canCreateMerchant && (
            <Button
              onClick={() => {
                setEditingMerchant(null);
                setMerchantFormMode("create");
              }}
              className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
            >
              <Plus />
              Add merchant
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Left — merchant list */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              {visibleMerchants.length} merchant
              {visibleMerchants.length === 1 ? "" : "s"}
            </CardTitle>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, TIN, or owner email"
              aria-label="Search merchants"
              className="mt-3"
            />
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="Merchant status filter"
            >
              {[
                ["all", "All"],
                ["active", "Active"],
                ["pending", "Pending"],
                ["suspended", "Suspended"],
                ["rejected", "Rejected"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={requestedStatus === value ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => selectStatus(value)}
                  aria-pressed={requestedStatus === value}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {error && <p className="px-6 text-sm text-destructive">{error}</p>}
            {loading ? (
              <p className="px-6 text-sm text-muted-foreground">Loading…</p>
            ) : visibleMerchants.length === 0 ? (
              <p className="px-6 text-sm text-muted-foreground">
                No merchants match the current search or status filter.
              </p>
            ) : (
              <ul className="flex flex-col">
                {visibleMerchants.map((m) => {
                  const isSelected = m.id === selectedId;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 border-l-2 px-6 py-3 text-left text-sm transition-colors",
                          isSelected
                            ? "border-l-[#5700FF] bg-accent/60"
                            : "border-l-transparent hover:bg-accent/30",
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium">
                            {m.legalName || "(unnamed)"}
                          </span>
                          <MerchantStatusBadge merchant={m} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          TIN {m.tin}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right — selected merchant detail + branches */}
        <div className="flex flex-col gap-6">
          {selectedMerchant ? (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>{selectedMerchant.legalName}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedMerchant.tradeName ?? "—"} · TIN{" "}
                      {selectedMerchant.tin}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <MerchantStatusBadge merchant={selectedMerchant} />
                    {selectedMerchant.owner && (
                      <EmailVerificationBadge
                        verified={Boolean(
                          selectedMerchant.owner.emailVerifiedAt,
                        )}
                      />
                    )}
                    {(user?.role === "SUPER_ADMIN" || canEditMerchant) && (
                      <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Actions for ${selectedMerchant.legalName}`}
                          >
                            Actions
                            <ChevronDown className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          className="w-56 p-1"
                          role="menu"
                          aria-label="Merchant actions"
                        >
                          {user?.role === "SUPER_ADMIN" && (
                            <ActionMenuItem
                              icon={<Eye />}
                              label="View registration"
                              onSelect={() => {
                                setActionsOpen(false);
                                navigate(
                                  `/super-admin/registrations?merchant=${encodeURIComponent(selectedMerchant.id)}`,
                                );
                              }}
                            />
                          )}
                          {canEditMerchant && (
                            <ActionMenuItem
                              icon={<Pencil />}
                              label="Edit merchant"
                              onSelect={() => {
                                setActionsOpen(false);
                                setEditingMerchant(selectedMerchant);
                                setMerchantFormMode("edit");
                              }}
                            />
                          )}
                          {user?.role === "SUPER_ADMIN" && (
                            <>
                              <ActionMenuItem
                                icon={
                                  selectedMerchant.active ? (
                                    <CircleX />
                                  ) : selectedMerchant.approvedAt === null ? (
                                    <ShieldCheck />
                                  ) : (
                                    <CircleCheck />
                                  )
                                }
                                label={
                                  selectedMerchant.active
                                    ? "Disable merchant"
                                    : selectedMerchant.approvedAt === null
                                      ? "Approve merchant"
                                      : "Enable merchant"
                                }
                                onSelect={() => {
                                  setActionsOpen(false);
                                  void toggleMerchantActive(selectedMerchant);
                                }}
                              />
                              {selectedMerchant.approvedAt === null &&
                                selectedMerchant.rejectedAt === null && (
                                  <ActionMenuItem
                                    destructive
                                    icon={<XOctagon />}
                                    label="Reject merchant"
                                    onSelect={() => {
                                      setActionsOpen(false);
                                      setRejecting(selectedMerchant);
                                    }}
                                  />
                                )}
                            </>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedMerchant.rejectedAt && (
                    <div className="mb-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                      <XOctagon className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">
                          Application rejected
                        </p>
                        <p className="mt-0.5 text-xs text-destructive/80">
                          {selectedMerchant.rejectionReason ||
                            "No reason was recorded."}
                        </p>
                      </div>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                    <Detail label="VAT" value={selectedMerchant.vatNumber} />
                    <Detail label="Email" value={selectedMerchant.email} />
                    <Detail label="Phone" value={selectedMerchant.phone} />
                    <Detail label="Region" value={selectedMerchant.region} />
                    <Detail label="Zone" value={selectedMerchant.zone} />
                    <Detail label="City" value={selectedMerchant.city} />
                    <Detail label="Wereda" value={selectedMerchant.wereda} />
                    <Detail label="Kebele" value={selectedMerchant.kebele} />
                    <Detail
                      label="House #"
                      value={selectedMerchant.houseNumber}
                    />
                  </dl>

                  {user?.role === "SUPER_ADMIN" && (
                    <OwnerBlock merchant={selectedMerchant} />
                  )}
                </CardContent>
              </Card>

              {user?.role === "SUPER_ADMIN" && (
                <SuperAdminConsentPanel
                  merchantId={selectedMerchant.id}
                  merchantName={selectedMerchant.legalName}
                />
              )}
              {user?.role === "MERCHANT_ADMIN" && <MerchantConsentPanel />}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Store className="size-4 text-muted-foreground" />
                    Branches
                    <span className="text-sm font-normal text-muted-foreground">
                      ({branches.length})
                    </span>
                  </CardTitle>
                  {canCreateBranch && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/merchants/${selectedMerchant.id}/branches/new`,
                          {
                            state: { merchantName: selectedMerchant.legalName },
                          },
                        )
                      }
                    >
                      <Plus />
                      Add branch
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {branchesError && (
                    <p className="text-sm text-destructive">
                      Failed to load branches: {branchesError}
                    </p>
                  )}
                  {branchesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : branches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No branches yet. Add one to start issuing invoices for
                      this merchant.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>System #</TableHead>
                          <TableHead>EIRMS creds</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branches.map((b) => (
                          <TableRow
                            key={b.id}
                            className="cursor-pointer hover:bg-accent/40"
                            onClick={() => setDrawerBranch(b)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                <span>{b.name}</span>
                                <BranchReadiness
                                  branch={b}
                                  variant="compact"
                                  className="w-40"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {b.systemNumber || "—"}
                            </TableCell>
                            <TableCell>
                              <CredsBadge branch={b} />
                            </TableCell>
                            <TableCell>
                              {b.rejectedAt ? (
                                <Badge variant="destructive">Rejected</Badge>
                              ) : !b.approvedAt ? (
                                <Badge variant="warning">Pending review</Badge>
                              ) : b.active ? (
                                <Badge variant="success">Active</Badge>
                              ) : (
                                <Badge variant="muted">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className="space-x-1 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canEditBranch && (
                                <>
                                  {user?.role === "SUPER_ADMIN" &&
                                    !b.approvedAt &&
                                    !b.rejectedAt && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            void decideBranch(b, "approve")
                                          }
                                        >
                                          <CircleCheck />
                                          Approve
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            void decideBranch(b, "reject")
                                          }
                                        >
                                          <CircleX />
                                          Reject
                                        </Button>
                                      </>
                                    )}
                                  {b.approvedAt && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCertBranch(b)}
                                    >
                                      <ShieldCheck />
                                      Certificate
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingBranch(b);
                                      setBranchFormMode("edit");
                                    }}
                                  >
                                    <Pencil />
                                    Edit
                                  </Button>
                                  {b.approvedAt && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleBranchActive(b)}
                                    >
                                      {b.active ? <CircleX /> : <CircleCheck />}
                                      {b.active ? "Disable" : "Enable"}
                                    </Button>
                                  )}
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Select a merchant from the list to see its details and branches.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <MerchantFormSheet
        mode={merchantFormMode}
        merchant={editingMerchant}
        onClose={() => {
          setMerchantFormMode(null);
          setEditingMerchant(null);
        }}
        onSaved={(m) => {
          setMerchants((prev) => {
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx === -1) return [m, ...prev];
            const next = [...prev];
            next[idx] = m;
            return next;
          });
          setSelectedId(m.id);
          setMerchantFormMode(null);
          setEditingMerchant(null);
        }}
      />

      <BranchFormSheet
        mode={branchFormMode}
        merchantId={selectedId}
        branch={editingBranch}
        onClose={() => {
          setBranchFormMode(null);
          setEditingBranch(null);
        }}
        onSaved={(b) => {
          setBranches((prev) => {
            const idx = prev.findIndex((x) => x.id === b.id);
            if (idx === -1) return [b, ...prev];
            const next = [...prev];
            next[idx] = b;
            return next;
          });
          setBranchFormMode(null);
          setEditingBranch(null);
        }}
      />

      <RejectMerchantSheet
        merchant={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={(m) => {
          setMerchants((prev) => prev.map((x) => (x.id === m.id ? m : x)));
          setRejecting(null);
        }}
      />

      <CertificateSheet
        open={certBranch !== null}
        merchantId={certBranch?.merchantId ?? null}
        branch={certBranch}
        onClose={() => setCertBranch(null)}
      />

      <BranchDetailDrawer
        branch={drawerBranch}
        onClose={() => setDrawerBranch(null)}
        onEdit={
          canEditBranch
            ? (b) => {
                setEditingBranch(b);
                setBranchFormMode("edit");
              }
            : undefined
        }
        onOpenCertificate={canEditBranch ? (b) => setCertBranch(b) : undefined}
        canTestEirms={canEditBranch}
      />
    </div>
  );
}

/** Captures an optional reason and POSTs the reject. Stays a separate sheet
 *  so the action requires a deliberate confirm — the click on the table is
 *  never the destructive moment. */
function RejectMerchantSheet({
  merchant,
  onClose,
  onRejected,
}: {
  merchant: Merchant | null;
  onClose: () => void;
  onRejected: (m: Merchant) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (merchant) {
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [merchant?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rejectMerchant(
        merchant.id,
        reason.trim() || undefined,
      );
      onRejected(updated);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError(readApiMessage(err.body) ?? "Couldn't reject this merchant.");
      } else {
        setError((err as Error).message);
      }
    }
  }

  return (
    <Sheet
      open={merchant !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2 text-destructive">
              <XOctagon className="size-5" />
              Reject merchant
            </SheetTitle>
            <SheetDescription>
              {merchant
                ? `Reject ${merchant.legalName}'s application. The owner gets an email with your reason.`
                : ""}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form
          id="reject-merchant"
          onSubmit={submit}
          className="contents"
          noValidate
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Reason (optional, shown in the email)
              </Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder='e.g. "TIN does not match Ministry records"'
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Keep it short and customer-readable. They can re-apply after
                fixing the issue.
              </p>
            </div>

            {error && <ErrorCallout title={error} />}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reject-merchant"
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Reject application
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

/** Creator/owner block for the super-admin — surfaces the person behind the
 *  signup (earliest merchant admin) so approve/reject decisions have context. */
function OwnerBlock({ merchant }: { merchant: Merchant }) {
  const owner = merchant.owner;
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  return (
    <div className="mt-5 rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <UserRound className="size-3.5" />
        Account owner
        {typeof merchant.adminCount === "number" && merchant.adminCount > 1 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
            +{merchant.adminCount - 1} more admin
            {merchant.adminCount - 1 > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {owner ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <Detail label="Name" value={owner.name} />
          <div className="flex flex-col">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </dt>
            <dd className="flex items-center gap-1.5">
              <Mail className="size-3 text-muted-foreground" />
              <a
                href={`mailto:${owner.email}`}
                className="text-[#5700FF] hover:underline"
              >
                {owner.email}
              </a>
              <EmailVerificationBadge
                verified={Boolean(owner.emailVerifiedAt)}
              />
            </dd>
          </div>
          <Detail
            label="Account"
            value={owner.active ? "Active" : "Disabled"}
          />
          <Detail label="Signed up" value={fmt(owner.createdAt)} />
          <Detail label="Last login" value={fmt(owner.lastLoginAt)} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No merchant admin on file for this merchant.
        </p>
      )}
    </div>
  );
}

function EmailVerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge className="gap-1 whitespace-nowrap border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CircleCheck className="size-3" /> Verified
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1 whitespace-nowrap">
      <CircleX className="size-3" /> Not verified
    </Badge>
  );
}

function ActionMenuItem({
  icon,
  label,
  destructive = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        destructive &&
          "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10",
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </button>
  );
}

/** Three-state status chip for a merchant row.
 *   - Pending approval (approvedAt is null, regardless of active)
 *   - Active (approved + active)
 *   - Disabled (approved + inactive)
 *  The pending case wins over active because newly-signed-up rows technically
 *  default to active=false anyway; surfacing "Pending" is the meaningful signal. */
function MerchantStatusBadge({ merchant }: { merchant: Merchant }) {
  if (merchant.rejectedAt) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XOctagon className="size-3" /> Rejected
      </Badge>
    );
  }
  if (merchant.approvedAt === null) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-amber-700 dark:text-amber-300"
      >
        <Clock className="size-3" /> Pending approval
      </Badge>
    );
  }
  if (merchant.active) return <Badge variant="success">Active</Badge>;
  return <Badge variant="muted">Disabled</Badge>;
}

/** A single chip summarising whether the branch's three EIRMS credentials are
 *  configured. Stays neutral when all three are set; warns when any are
 *  missing — without ever revealing the values. */
function CredsBadge({ branch }: { branch: SafeBranch }) {
  const set = [
    branch.eirmsClientIdSet,
    branch.eirmsClientSecretSet,
    branch.eirmsApikeySet,
  ].filter(Boolean).length;
  if (set === 3) {
    return (
      <Badge variant="success">
        <KeyRound className="size-3" /> Configured
      </Badge>
    );
  }
  if (set === 0) return <Badge variant="muted">Not configured</Badge>;
  return (
    <Badge
      variant="outline"
      className="gap-1 text-amber-700 dark:text-amber-300"
    >
      <KeyRound className="size-3" /> {set}/3 set
    </Badge>
  );
}
