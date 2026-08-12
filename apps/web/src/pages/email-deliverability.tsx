import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import {
  listEmailDomains,
  listEmailEvents,
  type EmailDomainRow,
  type EmailEventRow,
} from "@/lib/resources";

const STATUS_OPTIONS = [
  "ALL",
  "SENT",
  "DELIVERED",
  "OPENED",
  "BOUNCED",
  "COMPLAINED",
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "DELIVERED":
    case "OPENED":
      return "default";
    case "BOUNCED":
    case "COMPLAINED":
      return "destructive";
    case "SENT":
      return "secondary";
    default:
      return "outline";
  }
}

function bounceRateTone(rate: number): string {
  if (rate >= 0.05) return "text-destructive";
  if (rate >= 0.02) return "text-amber-600";
  return "text-muted-foreground";
}

export function EmailDeliverabilityPage() {
  const { can } = useAuth();
  const allowed = can("deliverability.view");

  const [domains, setDomains] = useState<EmailDomainRow[]>([]);
  const [events, setEvents] = useState<EmailEventRow[]>([]);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [domainFilter, setDomainFilter] = useState("");
  const [appliedDomain, setAppliedDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query: { domain?: string; status?: string } = {};
    if (appliedDomain.trim()) query.domain = appliedDomain.trim();
    if (status !== "ALL") query.status = status;
    Promise.all([listEmailDomains(), listEmailEvents(query)])
      .then(([d, e]) => {
        if (cancelled) return;
        setDomains(d);
        setEvents(e);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [allowed, status, appliedDomain]);

  const totals = useMemo(() => {
    return domains.reduce(
      (acc, d) => {
        acc.sent += d.sent;
        acc.delivered += d.delivered;
        acc.bounced += d.bounced;
        acc.complained += d.complained;
        return acc;
      },
      { sent: 0, delivered: 0, bounced: 0, complained: 0 },
    );
  }, [domains]);

  const overallBounce = totals.sent ? totals.bounced / totals.sent : 0;
  const overallDelivered = totals.sent ? totals.delivered / totals.sent : 0;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted-foreground">
          You don't have access to email deliverability.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Email deliverability</h1>
        <p className="text-sm text-muted-foreground">
          Last 30 days of outbound activity, grouped by recipient domain.
          Consumer providers (gmail, yahoo, outlook…) are labelled so
          corporate-inbox regressions stay visible.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
              Sent
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {totals.sent.toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {totals.delivered.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {pct(overallDelivered)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
              Bounced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-semibold ${bounceRateTone(overallBounce)}`}
            >
              {totals.bounced.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {pct(overallBounce)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
              Complaints
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {totals.complained.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <div>
                <CardTitle className="text-[15px]">By domain</CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Bounced</TableHead>
                <TableHead className="text-right">Complaints</TableHead>
                <TableHead className="text-right">Bounce rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No email activity in the last 30 days.
                  </TableCell>
                </TableRow>
              ) : (
                domains.map((d) => (
                  <TableRow
                    key={d.domain}
                    className="cursor-pointer"
                    onClick={() => {
                      setDomainFilter(d.domain);
                      setAppliedDomain(d.domain);
                    }}
                  >
                    <TableCell className="font-mono text-xs">{d.domain}</TableCell>
                    <TableCell>
                      <Badge
                        variant={d.kind === "corporate" ? "default" : "outline"}
                      >
                        {d.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {d.sent.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.delivered.toLocaleString()}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({pct(d.deliverabilityRate)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {d.bounced.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.complained.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${bounceRateTone(d.bounceRate)}`}
                    >
                      {pct(d.bounceRate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <CardTitle>Recent events</CardTitle>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedDomain(domainFilter);
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="domain-filter" className="text-xs">
                Domain
              </Label>
              <Input
                id="domain-filter"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                placeholder="e.g. e-pay.et"
                className="h-9 w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as StatusFilter)}
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "ALL" ? "Any status" : s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
            {(appliedDomain || status !== "ALL") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDomainFilter("");
                  setAppliedDomain("");
                  setStatus("ALL");
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error && (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Nothing matches these filters yet.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(e.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.recipient}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.recipientDomain}
                    </TableCell>
                    <TableCell className="max-w-[24rem] truncate text-sm">
                      {e.subject ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(e.status)}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate text-xs text-muted-foreground">
                      {e.bounceReason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
