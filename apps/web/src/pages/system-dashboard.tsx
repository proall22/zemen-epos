import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Clock,
  Database,
  FileText,
  Key,
  Lock,
  ReceiptText,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  Store,
  Users,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSystemHealthSummary,
  getSystemSummary,
  rejectMerchant,
  updateMerchant,
} from "@/lib/resources";
import type { SystemHealthSummary, SystemSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Platform-wide dashboard for the SUPER_ADMIN. Shows:
 * 1. Merchant KPI cards (total / active / pending / rejected)
 * 2. Platform activity (invoices today, receipts today, failed, pending, cancelled)
 * 3. Merchant Approval Queue — pending registrations with Approve / Reject actions
 * 4. Infrastructure Health + Security & Queue
 * 5. Recent Audit Activity
 * 6. Top Merchants by volume leaderboard
 */
export function SystemDashboardPage() {
  const [data, setData] = useState<SystemSummary | null>(null);
  const [healthData, setHealthData] = useState<SystemHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [summary, health] = await Promise.all([
        getSystemSummary(),
        getSystemHealthSummary(),
      ]);
      setData(summary);
      setHealthData(health);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(merchantId: string) {
    setApproving(merchantId);
    try {
      await updateMerchant(merchantId, { active: true });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setApproving(null);
    }
  }

  async function handleReject(merchantId: string) {
    const reason = prompt("Rejection reason (optional):");
    if (reason === null) return; // User cancelled
    setRejecting(merchantId);
    try {
      await rejectMerchant(merchantId, reason || undefined);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRejecting(null);
    }
  }

  const maxVolume =
    data?.topMerchants.reduce((m, r) => Math.max(m, r.invoiceCount), 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Platform
          </span>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ShieldCheck className="size-6 text-primary" />
            System Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide activity across every merchant. Business detail for a
            specific merchant stays private until they grant you access.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </header>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* ── Section 1: Merchant KPI Cards ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Merchant Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Building2}
            label="Total Merchants"
            value={data?.merchants.total}
            hint="All registered"
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={data?.merchants.active}
            hint="Approved & enabled"
            tone="emerald"
          />
          <StatCard
            icon={Clock}
            label="Pending Approval"
            value={data?.merchants.pending}
            hint="Awaiting review"
            tone="amber"
          />
          <StatCard
            icon={XCircle}
            label="Suspended"
            value={data?.merchants.suspended}
            hint="Approved but disabled"
            tone="rose"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Store} label="Total Branches" value={data?.tenants.totalBranches} hint={`${data?.tenants.activeBranches ?? 0} active`} />
          <StatCard icon={Users} label="Active Users" value={data?.tenants.activeUsers} />
          <StatCard icon={XCircle} label="Rejected Applications" value={data?.merchants.rejected} tone="rose" />
          <StatCard
            icon={CheckCircle2}
            label="Invoice Success Rate"
            value={data ? Math.round((data.documents.invoicesAllTime / Math.max(1, data.documents.invoicesAllTime + data.platformActivity.failedInvoices)) * 100) : undefined}
            hint="Percent accepted"
            tone="emerald"
          />
        </div>
      </section>

      {/* ── Section 2: Platform Activity ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform Activity
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FileText}
            label="Invoices Today"
            value={data?.documents.invoicesToday}
            hint="Accepted by EIRMS"
          />
          <StatCard
            icon={ReceiptText}
            label="Receipts Today"
            value={data?.platformActivity?.receiptsToday}
            hint="Issued today"
          />
          <StatCard
            icon={AlertTriangle}
            label="Failed Invoices"
            value={data?.platformActivity?.failedInvoices}
            hint="EIRMS errors"
            tone="rose"
          />
          <StatCard
            icon={Clock}
            label="Pending Invoices"
            value={data?.platformActivity?.pendingInvoices}
            hint="Awaiting EIRMS"
            tone="amber"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FileText}
            label="Invoices This Month"
            value={data?.documents.invoicesThisMonth}
          />
          <StatCard
            icon={FileText}
            label="Invoices All-Time"
            value={data?.documents.invoicesAllTime}
          />
          <StatCard
            icon={ReceiptText}
            label="Receipts All-Time"
            value={data?.documents.receiptsAllTime}
          />
          <StatCard
            icon={XCircle}
            label="Cancelled Invoices"
            value={data?.platformActivity?.cancelledInvoices}
            tone="rose"
          />
        </div>
      </section>

      {/* ── Section 3: Merchant Approval Queue ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Clock className="size-4 text-amber-500" />
              Merchant Approval Queue
            </CardTitle>
            <CardDescription>
              Pending merchant registrations. Review each application before
              approving or rejecting.
            </CardDescription>
          </div>
          {data && data.merchants.pending > 0 && (
            <Badge variant="warning" className="tabular-nums">
              {data.merchants.pending} pending
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!data || data.pendingMerchantList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CircleCheck className="size-8 text-emerald-500" />
              <p className="text-sm font-medium text-muted-foreground">
                No pending registrations
              </p>
              <p className="text-xs text-muted-foreground">
                All merchant applications have been reviewed.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Main branch</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendingMerchantList.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{m.legalName}</span>
                        {m.email && (
                          <span className="text-xs text-muted-foreground">
                            {m.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {m.tin}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {m.ownerName ?? "—"}
                        </span>
                        {m.ownerEmail && (
                          <span className="text-xs text-muted-foreground">
                            {m.ownerEmail}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{m.mainBranch?.name ?? "—"}</span>
                        {(m.mainBranch?.city || m.mainBranch?.region) && (
                          <span className="text-xs text-muted-foreground">
                            {[m.mainBranch.city, m.mainBranch.region].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {m.mainBranch && <Badge variant="warning" className="mt-1 w-fit">Approved with merchant</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-muted-foreground/30 text-xs"
                          asChild
                        >
                          <Link to={`/merchants?selected=${m.id}`}>
                            Review
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                          disabled={approving === m.id}
                          onClick={() => void handleApprove(m.id)}
                        >
                          <CircleCheck className="mr-1 size-3" />
                          {approving === m.id ? "Approving…" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          disabled={rejecting === m.id}
                          onClick={() => void handleReject(m.id)}
                        >
                          <CircleX className="mr-1 size-3" />
                          {rejecting === m.id ? "Rejecting…" : "Reject"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to="/merchants">View All Merchants</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: System Health + Security & Queue ── */}
      {healthData && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Infrastructure
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <Activity className="size-4 text-primary" />
                  Infrastructure Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <HealthStatusItem
                    label="PostgreSQL"
                    status={healthData.checks.db.status}
                    icon={Database}
                    latency={healthData.checks.db.latencyMs}
                  />
                  <HealthStatusItem
                    label="Redis Cache"
                    status={healthData.checks.redis.status}
                    icon={Server}
                    latency={healthData.checks.redis.latencyMs}
                  />
                  <HealthStatusItem
                    label="Vault KMS"
                    status={healthData.checks.vault.status}
                    icon={Key}
                    latency={healthData.checks.vault.latencyMs}
                  />
                  <HealthStatusItem
                    label="EIRMS API"
                    status={healthData.checks.eirms.status}
                    icon={Activity}
                    latency={healthData.checks.eirms.latencyMs}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <ShieldCheck className="size-4 text-primary" />
                  Security &amp; Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Lock className="size-3.5" /> Security
                    </span>
                    <div className="flex justify-between items-end mt-1">
                      <div className="flex flex-col">
                        <span className="text-xl font-semibold">
                          {healthData.security.failedLogins}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Failed Logins
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "text-xl font-semibold",
                            healthData.security.lockedAccounts > 0
                              ? "text-destructive"
                              : "text-foreground",
                          )}
                        >
                          {healthData.security.lockedAccounts}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Locked Users
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Activity className="size-3.5" /> Queue Worker
                    </span>
                    <div className="flex justify-between items-end mt-1">
                      <div className="flex flex-col">
                        <span className="text-xl font-semibold">
                          {healthData.queue.pending}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Pending Jobs
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "text-xl font-semibold",
                            healthData.queue.failed > 0
                              ? "text-amber-600"
                              : "text-foreground",
                          )}
                        >
                          {healthData.queue.failed}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Failed Jobs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/audit">
                      <ScrollText className="mr-1.5 size-3.5" />
                      View Audit Logs
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ── Section 5: Recent Audit Activity ── */}
      {data?.recentAuditLogs && data.recentAuditLogs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <ScrollText className="size-4 text-primary" />
                Recent Platform Activity
              </CardTitle>
              <CardDescription>
                Last 8 platform-wide events from the audit log.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/audit">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {data.recentAuditLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start gap-3 px-6 py-3"
                >
                  <div
                    className={cn(
                      "mt-0.5 size-2 rounded-full shrink-0",
                      log.success ? "bg-emerald-500" : "bg-destructive",
                    )}
                  />
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {log.summary ?? log.action}
                    </p>
                    {log.actorEmail && (
                      <p className="text-xs text-muted-foreground">
                        by {log.actorEmail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {new Date(log.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Section 6: Top Merchants by Volume ── */}
      <Card>
        <CardHeader>
          <CardTitle>Top Merchants by Volume</CardTitle>
          <CardDescription>
            Ranked by accepted-invoice count. No revenue or buyer detail is
            shown — request consent to view a merchant's books.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.topMerchants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="w-1/3">Volume</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.topMerchants.map((m, i) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{m.legalName}</TableCell>
                    <TableCell>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${maxVolume > 0
                              ? Math.max(
                                4,
                                (m.invoiceCount / maxVolume) * 100,
                              )
                              : 0
                              }%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.invoiceCount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Building2;
  label: string;
  value: number | undefined;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    default: "text-blue-800 dark:text-blue-300",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  const bgClass = {
    default: "bg-blue-50 dark:bg-blue-950/40",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    rose: "bg-rose-50 dark:bg-rose-950/30",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-lg",
            bgClass,
          )}
        >
          <Icon className={`size-5 ${toneClass}`} />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold tabular-nums">
            {value === undefined ? "—" : value.toLocaleString()}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          {hint && (
            <span className="text-[10px] text-muted-foreground/70">{hint}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthStatusItem({
  label,
  status,
  icon: Icon,
  latency,
}: {
  label: string;
  status: "ok" | "down" | "skipped";
  icon: React.ElementType;
  latency?: number;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md border bg-muted/10">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {latency !== undefined && (
          <span className="text-xs text-muted-foreground font-mono">
            {latency}ms
          </span>
        )}
        {status === "ok" && (
          <Badge variant="success" className="h-5 px-1.5 text-[10px]">
            OK
          </Badge>
        )}
        {status === "down" && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            DOWN
          </Badge>
        )}
        {status === "skipped" && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            SKIP
          </Badge>
        )}
      </div>
    </div>
  );
}
