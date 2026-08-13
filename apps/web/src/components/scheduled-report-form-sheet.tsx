import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, X } from "lucide-react";

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
import { useAuth } from "@/lib/auth";
import {
  createScheduledReport,
  updateScheduledReport,
  type ReportLimits,
  type ReportSection,
  type ScheduledReport,
  type ScheduledReportInput,
} from "@/lib/resources";
import { formatInZone, nextRunPreview } from "@/lib/schedule-preview";
import { cn } from "@/lib/utils";

type Mode = "create" | "edit";

const INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24];
const ZONES = [
  "Africa/Addis_Ababa",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "UTC",
];

interface FormState {
  name: string;
  kind: "INTERVAL_HOURS" | "DAILY_AT";
  intervalHours: number;
  dailyAt: string;
  timezone: string;
  allBranches: boolean;
  branchId: string;
  sections: ReportSection[];
  recipients: string[];
  language: string;
  active: boolean;
}

const BLANK: FormState = {
  name: "",
  kind: "DAILY_AT",
  intervalHours: 6,
  dailyAt: "18:00",
  timezone: "Africa/Addis_Ababa",
  allBranches: true,
  branchId: "",
  sections: ["SALES"],
  recipients: [],
  language: "en",
  active: true,
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface ScheduledReportFormSheetProps {
  mode: Mode | null;
  report: ScheduledReport | null;
  merchantId: string;
  limits: ReportLimits;
  atCap: boolean;
  onClose: () => void;
  onSaved: (r: ScheduledReport) => void;
}

export function ScheduledReportFormSheet({
  mode,
  report,
  merchantId,
  limits,
  atCap,
  onClose,
  onSaved,
}: ScheduledReportFormSheetProps) {
  const { availableBranches, user } = useAuth();
  const isBranchAdmin = user?.role === "BRANCH_ADMIN";
  const [form, setForm] = useState<FormState>(BLANK);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "edit" && report) {
      setForm({
        name: report.name,
        kind: report.scheduleKind,
        intervalHours: report.intervalHours ?? 6,
        dailyAt: fromMinutes(report.dailyAtMinute ?? 1080),
        timezone: report.timezone,
        allBranches: report.branchScope === "MERCHANT_WIDE",
        branchId: report.branchId ?? "",
        sections: report.sections,
        recipients: report.recipients,
        language: report.language,
        active: report.active,
      });
    } else if (mode === "create") {
      setForm({
        ...BLANK,
        allBranches: !isBranchAdmin,
        branchId: isBranchAdmin ? (availableBranches[0]?.id ?? "") : "",
        recipients: user?.email ? [user.email.toLowerCase()] : [],
      });
    }
    setDraft("");
    setError(null);
    setBusy(false);
  }, [mode, report?.id, isBranchAdmin, availableBranches]);

  const open = mode !== null;

  const next = useMemo(
    () =>
      nextRunPreview({
        scheduleKind: form.kind,
        intervalHours: form.intervalHours,
        dailyAtMinute: toMinutes(form.dailyAt),
        timezone: form.timezone,
      }),
    [form.kind, form.intervalHours, form.dailyAt, form.timezone],
  );

  const merchantDomain = user?.email?.split("@")[1]?.toLowerCase() ?? "";
  const isExternal = (email: string) =>
    merchantDomain !== "" && !email.endsWith(`@${merchantDomain}`);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function addRecipient() {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (form.recipients.includes(value)) {
      setDraft("");
      return;
    }
    if (form.recipients.length >= limits.maxRecipients) return;
    set("recipients", [...form.recipients, value]);
    setDraft("");
  }

  function toggleSection(s: ReportSection) {
    set(
      "sections",
      form.sections.includes(s)
        ? form.sections.filter((x) => x !== s)
        : [...form.sections, s],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError({ title: "Give this report a name.", items: [] });
      return;
    }
    if (form.sections.length === 0) {
      setError({ title: "Pick at least one section to include.", items: [] });
      return;
    }
    if (form.recipients.length === 0) {
      setError({ title: "Add at least one recipient.", items: [] });
      return;
    }
    if (!form.allBranches && !form.branchId) {
      setError({ title: "Choose which branch this report covers.", items: [] });
      return;
    }

    const payload: ScheduledReportInput = {
      name: form.name.trim(),
      scheduleKind: form.kind,
      ...(form.kind === "INTERVAL_HOURS"
        ? { intervalHours: form.intervalHours }
        : { dailyAtMinute: toMinutes(form.dailyAt) }),
      timezone: form.timezone,
      branchScope: form.allBranches ? "MERCHANT_WIDE" : "SINGLE_BRANCH",
      ...(form.allBranches ? {} : { branchId: form.branchId }),
      sections: form.sections,
      recipients: form.recipients,
      language: form.language,
      active: form.active,
    };

    setBusy(true);
    try {
      const saved =
        mode === "edit" && report
          ? await updateScheduledReport(merchantId, report.id, payload)
          : await createScheduledReport(merchantId, payload);
      onSaved(saved);
    } catch (err) {
      const fallback =
        mode === "edit"
          ? "Couldn't save your changes."
          : "Couldn't create this report.";
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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-muted-foreground" />
              {mode === "edit" ? "Edit report" : "New scheduled report"}
            </SheetTitle>
            <SheetDescription>
              {mode === "edit"
                ? "Changes take effect from the next run. Already-sent data is never re-sent."
                : "Reports cover everything from now on — creating one doesn't send your history."}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="flex flex-col gap-6">
            {error && <ErrorCallout title={error.title} items={error.items} />}
            {mode === "create" && atCap && (
              <ErrorCallout
                title={`This merchant already has ${limits.maxPerMerchant} of ${limits.maxPerMerchant} reports.`}
                items={["Delete or pause one before adding another."]}
              />
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="report-name">Name</Label>
              <Input
                id="report-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Daily sales summary"
              />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">How often</legend>
              <div className="flex gap-2">
                <ChoiceButton
                  active={form.kind === "DAILY_AT"}
                  onClick={() => set("kind", "DAILY_AT")}
                  label="Daily at"
                />
                <ChoiceButton
                  active={form.kind === "INTERVAL_HOURS"}
                  onClick={() => set("kind", "INTERVAL_HOURS")}
                  label="Every N hours"
                />
              </div>

              {form.kind === "DAILY_AT" ? (
                <Input
                  type="time"
                  value={form.dailyAt}
                  onChange={(e) => set("dailyAt", e.target.value)}
                  className="w-36"
                />
              ) : (
                <select
                  value={form.intervalHours}
                  onChange={(e) => set("intervalHours", Number(e.target.value))}
                  className="h-9 w-44 rounded-md border bg-background px-2 text-sm"
                >
                  {INTERVALS.map((h) => (
                    <option key={h} value={h}>
                      {h === 1 ? "Every hour" : `Every ${h} hours`}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="report-tz">Timezone</Label>
                <select
                  id="report-tz"
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              {next && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Next report:{" "}
                  <span className="font-medium text-foreground">
                    {formatInZone(next, form.timezone)}
                  </span>
                </p>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">Covering</legend>
              <div className="flex gap-2">
                <ChoiceButton
                  active={form.allBranches}
                  onClick={() => set("allBranches", true)}
                  label="All branches"
                  disabled={isBranchAdmin}
                />
                <ChoiceButton
                  active={!form.allBranches}
                  onClick={() => set("allBranches", false)}
                  label="One branch"
                />
              </div>
              {!form.allBranches && (
                <select
                  value={form.branchId}
                  onChange={(e) => set("branchId", e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  disabled={isBranchAdmin}
                >
                  <option value="">Select a branch…</option>
                  {availableBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Include</legend>
              <CheckRow
                checked={form.sections.includes("SALES")}
                onChange={() => toggleSection("SALES")}
                label="Sales"
                hint="Invoices issued, cancelled and paid; receipts filed"
              />
              <CheckRow
                checked={form.sections.includes("INVENTORY")}
                onChange={() => toggleSection("INVENTORY")}
                label="Inventory"
                hint="Stock movements per store, by reason"
              />
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="flex items-center justify-between text-sm font-medium">
                <span>Recipients</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {form.recipients.length} / {limits.maxRecipients}
                </span>
              </legend>

              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map((r) => (
                  <span
                    key={r}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      isExternal(r)
                        ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        : "bg-muted/50",
                    )}
                  >
                    {isExternal(r) && <AlertTriangle className="size-3" />}
                    {r}
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "recipients",
                          form.recipients.filter((x) => x !== r),
                        )
                      }
                      aria-label={`Remove ${r}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                  placeholder="name@example.com"
                  disabled={form.recipients.length >= limits.maxRecipients}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRecipient}
                  disabled={form.recipients.length >= limits.maxRecipients}
                >
                  Add
                </Button>
              </div>
              {form.recipients.some(isExternal) && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Highlighted addresses are outside your organisation. They will
                  receive your sales and stock figures.
                </p>
              )}
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor="report-lang">Language</Label>
              <select
                id="report-lang"
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
                className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
              >
                <option value="en">English</option>
                <option value="am">አማርኛ</option>
              </select>
            </div>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (mode === "create" && atCap)}
            >
              {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create report"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ChoiceButton({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-transparent bg-accent text-accent-foreground shadow-xs"
          : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      {label}
    </button>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border p-3 hover:bg-accent/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
