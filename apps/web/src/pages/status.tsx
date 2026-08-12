import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

import { getSystemStatus } from "@/lib/resources";
import type { ComponentState, StatusReport } from "@/lib/types";

const REFRESH_MS = 30_000;

const STATE_META: Record<
  ComponentState,
  { label: string; dot: string; text: string; Icon: typeof CheckCircle2 }
> = {
  operational: {
    label: "Operational",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    Icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    dot: "bg-amber-500",
    text: "text-amber-700",
    Icon: AlertTriangle,
  },
  down: {
    label: "Outage",
    dot: "bg-red-500",
    text: "text-red-700",
    Icon: XCircle,
  },
};

const OVERALL_HEADLINE: Record<ComponentState, string> = {
  operational: "All systems operational",
  degraded: "Some systems degraded",
  down: "Service disruption",
};

/**
 * Public, login-free SLA status page (route: /status). Polls GET /status every
 * 30s. Shows only customer-facing capabilities — internal infrastructure is
 * never named (the API maps it into these components server-side).
 */
export function StatusPage() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getSystemStatus());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setFetchedAt(new Date());
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const overall = report?.status;
  const overallMeta = overall ? STATE_META[overall] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#5700FF]">Zemen-ePos e-Invoice</p>
            <h1 className="text-2xl font-semibold">Service Status</h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && !report ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-red-800">
            <p className="font-medium">Unable to reach the status service.</p>
            <p className="text-sm">
              The status page itself couldn't load. Please try again shortly.
            </p>
          </div>
        ) : null}

        {overallMeta ? (
          <div
            className={`flex items-center gap-3 rounded-lg border bg-white px-5 py-4 ${
              overall === "operational"
                ? "border-emerald-200"
                : overall === "degraded"
                  ? "border-amber-200"
                  : "border-red-200"
            }`}
          >
            <overallMeta.Icon className={`h-6 w-6 ${overallMeta.text}`} />
            <span className="text-lg font-medium">
              {OVERALL_HEADLINE[overall!]}
            </span>
          </div>
        ) : null}

        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {report?.components.map((c) => {
            const meta = STATE_META[c.state];
            return (
              <div
                key={c.key}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="truncate text-sm text-slate-500">
                    {c.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {typeof c.latencyMs === "number" ? (
                    <span className="text-xs text-slate-400">
                      {c.latencyMs} ms
                    </span>
                  ) : null}
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                  <span className={`text-sm font-medium ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="text-center text-xs text-slate-400">
          {fetchedAt
            ? `Last updated ${fetchedAt.toLocaleTimeString()} · refreshes every 30s`
            : "Loading…"}
        </footer>
      </div>
    </div>
  );
}
