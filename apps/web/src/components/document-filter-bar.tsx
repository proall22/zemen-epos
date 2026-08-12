import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentFilters } from "@/lib/resources";
import { cn } from "@/lib/utils";

/** Radix Select can't hold "" as a value, so "any" needs a token. */
const ANY = "__any__";

export interface StatusOption {
  value: string;
  label: string;
}

export interface DocumentFilterBarProps {
  value: DocumentFilters;
  onChange: (next: DocumentFilters) => void;
  /** Omit to hide the status control entirely (receipts have no status). */
  statuses?: StatusOption[];
  statusLabel?: string;
  searchPlaceholder: string;
  className?: string;
}

/**
 * One filter control set for every document list. Shared on purpose: invoices,
 * receipts and the withholding register are read by the same people on the
 * same day, and three different filter idioms is three things to learn.
 *
 * Changing any control resets pagination — keeping a cursor across a filter
 * change pages into a result set that no longer exists.
 */
export function DocumentFilterBar({
  value,
  onChange,
  statuses,
  statusLabel,
  searchPlaceholder,
  className,
}: DocumentFilterBarProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value.q ?? "");

  // Debounce typing so each keystroke isn't a request.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((value.q ?? "") !== text) {
        onChange({ ...value, q: text || undefined, cursor: undefined });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [text]);

  // Keep the box in step when the parent clears filters.
  useEffect(() => {
    setText(value.q ?? "");
  }, [value.q]);

  function set(patch: Partial<DocumentFilters>) {
    onChange({ ...value, ...patch, cursor: undefined });
  }

  const active =
    Boolean(value.from) ||
    Boolean(value.to) ||
    Boolean(value.q) ||
    Boolean(value.status);

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="relative min-w-[16rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-9"
        />
      </div>

      <Field label={t("filters.from")}>
        <Input
          type="date"
          value={value.from ?? ""}
          max={value.to || undefined}
          onChange={(e) => set({ from: e.target.value || undefined })}
          className="h-9 w-[9.5rem]"
        />
      </Field>

      <Field label={t("filters.to")}>
        <Input
          type="date"
          value={value.to ?? ""}
          min={value.from || undefined}
          onChange={(e) => set({ to: e.target.value || undefined })}
          className="h-9 w-[9.5rem]"
        />
      </Field>

      {statuses && statuses.length > 0 && (
        <Field label={statusLabel ?? t("filters.status")}>
          <Select
            value={value.status ?? ANY}
            onValueChange={(v) => set({ status: v === ANY ? undefined : v })}
          >
            <SelectTrigger className="h-9 w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filters.any")}</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setText("");
            onChange({ scope: value.scope, limit: value.limit });
          }}
        >
          <X className="mr-1 size-4" />
          {t("filters.clear")}
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Footer for a paged list: "showing N of M" plus Load more. */
export function PageFooter({
  shown,
  total,
  hasMore,
  loading,
  onMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading?: boolean;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {t("filters.showing", { shown, total })}
      </span>
      {hasMore && (
        <Button variant="outline" size="sm" disabled={loading} onClick={onMore}>
          {t("filters.loadMore")}
        </Button>
      )}
    </div>
  );
}
