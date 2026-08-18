import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Building2,
  Bell,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Clock,
  Database,
  FileText,
  Key,
  Lock,
  MailCheck,
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
import { readRequestError } from "@/lib/api-errors";
import { getSystemHealthSummary, getSystemSummary } from "@/lib/resources";
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
  const [healthData, setHealthData] = useState<SystemHealthSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(readRequestError(e, "Unable to load dashboard information."));
    } finally {
      setLoading(false);
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
            to="/merchants"
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={data?.merchants.active}
            hint="Approved & enabled"
            tone="emerald"
            to="/merchants?status=active"
          />
          <StatCard
            icon={Clock}
            label="Pending Approval"
            value={data?.merchants.pending}
            hint="Awaiting review"
            tone="amber"
            to="/merchants?status=pending"
          />
          <StatCard
            icon={XCircle}
            label="Suspended"
            value={data?.merchants.suspended}
            hint="Approved but disabled"
            tone="rose"
            to="/merchants?status=suspended"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Store}
            label="Total Branches"
            value={data?.tenants.totalBranches}
            hint={`${data?.tenants.activeBranches ?? 0} active`}
            to="/branch-approvals"
          />
          <StatCard
            icon={Users}
            label="Active Users"
            value={data?.tenants.activeUsers}
            to="/users"
          />
          <StatCard
            icon={XCircle}
            label="Rejected Applications"
            value={data?.merchants.rejected}
            tone="rose"
            to="/merchants?status=rejected"
          />
          <StatCard
            icon={CheckCircle2}
            label="Invoice Success Rate"
            value={
              data
                ? Math.round(
                    (data.documents.invoicesAllTime /
                      Math.max(
                        1,
                        data.documents.invoicesAllTime +
                          data.platformActivity.failedInvoices,
                      )) *
                      100,
                  )
                : undefined
            }
            hint="Percent accepted"
            tone="emerald"
            to="/invoices"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Registration Reviews
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/super-admin/registrations">
              <Bell className="size-4" /> Notifications{" "}
              <Badge variant="warning">
                {data?.registrationReviews.pending ?? 0}
              </Badge>
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            icon={Clock}
            label="Pending"
            value={data?.registrationReviews.pending}
            tone="amber"
            to="/super-admin/registrations?status=pending"
          />
          <StatCard
            icon={MailCheck}
            label="Email Verified"
            value={data?.registrationReviews.emailVerified}
            tone="emerald"
            to="/super-admin/registrations?status=email-verified"
          />
          <StatCard
            icon={CircleX}
            label="Email Not Verified"
            value={data?.registrationReviews.emailNotVerified}
            tone="rose"
            to="/super-admin/registrations?status=email-unverified"
          />
          <StatCard
            icon={CircleCheck}
            label="Documents Approved"
            value={data?.registrationReviews.approved}
            tone="emerald"
            to="/super-admin/registrations?status=approved"
          />
          <StatCard
            icon={XCircle}
            label="Documents Rejected"
            value={data?.registrationReviews.rejected}
            tone="rose"
            to="/super-admin/registrations?status=rejected"
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
            to="/invoices"
          />
          <StatCard
            icon={ReceiptText}
            label="Receipts Today"
            value={data?.platformActivity?.receiptsToday}
            hint="Issued today"
            to="/receipts"
          />
          <StatCard
            icon={AlertTriangle}
            label="Failed Invoices"
            value={data?.platformActivity?.failedInvoices}
            hint="EIRMS errors"
            tone="rose"
            to="/invoices"
          />
          <StatCard
            icon={Clock}
            label="Pending Invoices"
            value={data?.platformActivity?.pendingInvoices}
            hint="Awaiting EIRMS"
            tone="amber"
            to="/invoices"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FileText}
            label="Invoices This Month"
            value={data?.documents.invoicesThisMonth}
            to="/invoices"
          />
          <StatCard
            icon={FileText}
            label="Invoices All-Time"
            value={data?.documents.invoicesAllTime}
            to="/invoices"
          />
          <StatCard
            icon={ReceiptText}
            label="Receipts All-Time"
            value={data?.documents.receiptsAllTime}
            to="/receipts"
          />
          <StatCard
            icon={XCircle}
            label="Cancelled Invoices"
            value={data?.platformActivity?.cancelledInvoices}
            tone="rose"
            to="/invoices"
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
                        <span className="text-sm">{m.ownerName ?? "—"}</span>
                        {m.ownerEmail && (
                          <span className="text-xs text-muted-foreground">
                            {m.ownerEmail}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {m.mainBranch?.name ?? "—"}
                        </span>
                        {(m.mainBranch?.city || m.mainBranch?.region) && (
                          <span className="text-xs text-muted-foreground">
                            {[m.mainBranch.city, m.mainBranch.region]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                        {m.mainBranch && (
                          <Badge variant="warning" className="mt-1 w-fit">
                            Approved with merchant
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        asChild
                      >
                        <Link
                          to={`/super-admin/registrations?merchant=${encodeURIComponent(m.id)}`}
                        >
                          Review registration
                        </Link>
                      </Button>
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
                <li key={log.id} className="flex items-start gap-3 px-6 py-3">
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
                            width: `${
                              maxVolume > 0
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
  to,
}: {
  icon: typeof Building2;
  label: string;
  value: number | undefined;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "rose";
  to?: string;
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
  const card = (
    <Card
      className={cn(
        "h-full transition-[border-color,background-color,box-shadow,transform] duration-150",
        to &&
          "cursor-pointer hover:-translate-y-px hover:border-primary/30 hover:bg-muted/20 hover:shadow-md active:translate-y-0",
      )}
    >
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
            {value === undefined ? (
              <span
                className="block h-7 w-12 animate-pulse rounded bg-muted"
                aria-label="Loading"
              />
            ) : (
              value.toLocaleString()
            )}
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
  return to ? (
    <Link
      to={to}
      aria-label={`View ${label}`}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  ) : (
    card
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
