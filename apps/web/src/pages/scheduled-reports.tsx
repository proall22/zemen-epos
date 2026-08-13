import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { ScheduledReportFormSheet } from "@/components/scheduled-report-form-sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  deleteScheduledReport,
  listScheduledReportRuns,
  listScheduledReports,
  reportLimits,
  runScheduledReportNow,
  updateScheduledReport,
  type ReportLimits,
  type ScheduledReport,
  type ScheduledReportRun,
} from "@/lib/resources";
import { describeSchedule, formatInZone } from "@/lib/schedule-preview";
import { cn } from "@/lib/utils";

const DEFAULT_LIMITS: ReportLimits = { maxRecipients: 20, maxPerMerchant: 10 };

export function ScheduledReportsPage() {
  const { merchant, can } = useAuth();
  const merchantId = merchant?.id ?? "";
  const manage = can("report.manage");

  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [limits, setLimits] = useState<ReportLimits>(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{
    mode: "create" | "edit";
    report: ScheduledReport | null;
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Platform administrators have no tenant until they enter an approved
    // consent session. Never leave the page in a permanent loading state.
    if (!merchantId) {
      setReports([]);
      setLoading(false);
      setError("Select a merchant through an approved consent session to view its scheduled reports.");
      return;
    }
    setLoading(true);
    try {
      const [list, lim] = await Promise.all([
        listScheduledReports(merchantId),
        reportLimits().catch(() => DEFAULT_LIMITS),
      ]);
      setReports(list);
      setLimits(lim);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const atCap = reports.length >= limits.maxPerMerchant;

  async function togglePaused(r: ScheduledReport) {
    const saved = await updateScheduledReport(merchantId, r.id, {
      active: !r.active,
    });
    setReports((prev) => prev.map((x) => (x.id === r.id ? saved : x)));
  }

  async function remove(r: ScheduledReport) {
    if (!window.confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    await deleteScheduledReport(merchantId, r.id);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
  }

  async function runNow(r: ScheduledReport) {
    await runScheduledReportNow(merchantId, r.id);
    setNotice(
      `"${r.name}" will run within the next minute, covering everything since its last report.`,
    );
    window.setTimeout(() => setNotice(null), 6000);
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Recurring summaries emailed to you and your team. Each one covers
            only what hasn't been sent yet.
          </p>
        </div>
        {manage && (
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={() => setSheet({ mode: "create", report: null })}
              disabled={atCap}
              title={
                atCap
                  ? `Limit of ${limits.maxPerMerchant} reports reached`
                  : undefined
              }
            >
              <Plus className="size-4" />
              New report
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {reports.length} of {limits.maxPerMerchant} reports
            </span>
          </div>
        )}
      </header>

      {error && <ErrorCallout title="Couldn't load reports." items={[error]} />}
      {notice && (
        <div className="rounded-md border border-[#5700FF]/30 bg-[#5700FF]/5 px-4 py-2.5 text-sm">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : reports.length === 0 ? (
        <EmptyState
          canCreate={manage}
          onCreate={() => setSheet({ mode: "create", report: null })}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              merchantId={merchantId}
              manage={manage}
              expanded={expanded === r.id}
              onToggleExpand={() =>
                setExpanded((prev) => (prev === r.id ? null : r.id))
              }
              onEdit={() => setSheet({ mode: "edit", report: r })}
              onPause={() => void togglePaused(r)}
              onDelete={() => void remove(r)}
              onRunNow={() => void runNow(r)}
            />
          ))}
        </div>
      )}

      <ScheduledReportFormSheet
        mode={sheet?.mode ?? null}
        report={sheet?.report ?? null}
        merchantId={merchantId}
        limits={limits}
        atCap={atCap}
        onClose={() => setSheet(null)}
        onSaved={(saved) => {
          setReports((prev) => {
            const exists = prev.some((x) => x.id === saved.id);
            return exists
              ? prev.map((x) => (x.id === saved.id ? saved : x))
              : [saved, ...prev];
          });
          setSheet(null);
        }}
      />
    </div>
  );
}

function ReportCard({
  report,
  merchantId,
  manage,
  expanded,
  onToggleExpand,
  onEdit,
  onPause,
  onDelete,
  onRunNow,
}: {
  report: ScheduledReport;
  merchantId: string;
  manage: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onPause: () => void;
  onDelete: () => void;
  onRunNow: () => void;
}) {
  const [runs, setRuns] = useState<ScheduledReportRun[] | null>(null);

  useEffect(() => {
    if (!expanded || runs) return;
    void listScheduledReportRuns(merchantId, report.id)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [expanded, merchantId, report.id, runs]);

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{report.name}</span>
              {!report.active && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Paused
                </span>
              )}
              {report.consecutiveFailures > 0 && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
                  {report.consecutiveFailures} failed
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {describeSchedule(report)} ·{" "}
              {report.branchScope === "MERCHANT_WIDE"
                ? "All branches"
                : "One branch"}{" "}
              · {report.sections.map(titleCase).join(" + ")}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="size-3" />
              {report.recipients.length} recipient
              {report.recipients.length === 1 ? "" : "s"}
              {report.active && (
                <>
                  {" · next "}
                  {formatInZone(new Date(report.nextRunAt), report.timezone)}
                </>
              )}
            </p>
          </div>
        </button>

        {manage && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={onRunNow}
              disabled={!report.active}
              title="Send everything since the last report"
            >
              <Send className="size-3.5" />
              Run now
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onPause}
              aria-label={report.active ? "Pause" : "Resume"}
            >
              {report.active ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              aria-label="Delete"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3">
          <RunHistory runs={runs} timezone={report.timezone} />
        </div>
      )}
    </div>
  );
}

/** Skipped windows are shown, not hidden: seeing "nothing happened, 22:00 to
 *  06:00" is what tells the reader the timeline has no hole in it. */
function RunHistory({
  runs,
  timezone,
}: {
  runs: ScheduledReportRun[] | null;
  timezone: string;
}) {
  if (runs === null) {
    return <p className="text-xs text-muted-foreground">Loading history…</p>;
  }
  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No runs yet. The first report will cover everything since this
        subscription was created.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1.5 font-medium">Window</th>
            <th className="py-1.5 font-medium">Result</th>
            <th className="py-1.5 font-medium">Contents</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t">
              <td className="py-1.5 pr-3">
                {formatInZone(new Date(run.windowStart), timezone)} →{" "}
                {formatInZone(new Date(run.windowEnd), timezone)}
              </td>
              <td className="py-1.5 pr-3">
                <StatusPill status={run.status} error={run.errorMessage} />
              </td>
              <td className="py-1.5 text-muted-foreground">
                {run.status === "SKIPPED_EMPTY"
                  ? "No activity — carried into the next report"
                  : summarise(run)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function summarise(run: ScheduledReportRun): string {
  const bits: string[] = [];
  if (run.invoiceCount) bits.push(`${run.invoiceCount} invoices`);
  if (run.cancellationCount) bits.push(`${run.cancellationCount} cancelled`);
  if (run.receiptCount) bits.push(`${run.receiptCount} receipts`);
  if (run.movementCount) bits.push(`${run.movementCount} movements`);
  return bits.length ? bits.join(" · ") : "—";
}

function StatusPill({
  status,
  error,
}: {
  status: ScheduledReportRun["status"];
  error: string | null;
}) {
  const tone =
    status === "SENT"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "FAILED"
        ? "bg-destructive/10 text-destructive"
        : status === "SKIPPED_EMPTY"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const label =
    status === "SKIPPED_EMPTY"
      ? "Skipped"
      : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", tone)}
      title={error ?? undefined}
    >
      {label}
    </span>
  );
}

function EmptyState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
        <CalendarClock className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">No reports yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Set one up and we'll email your sales and stock activity on a
          schedule — only what's happened since the last one.
        </p>
      </div>
      {canCreate && (
        <Button onClick={onCreate} variant="outline" size="sm">
          <Plus className="size-4" />
          New report
        </Button>
      )}
    </div>
  );
}

const titleCase = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
