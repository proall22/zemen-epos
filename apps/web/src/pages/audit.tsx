import { useEffect, useState } from "react";

import { AuditDetailSheet } from "@/components/audit-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { listAuditLogs, type AuditQuery } from "@/lib/resources";
import type { AuditDirection, AuditLog } from "@/lib/types";

const PAGE_SIZE = 50;
type DirectionFilter = "ALL" | AuditDirection;

export function AuditPage() {
  const { can, availableBranches } = useAuth();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [branchId, setBranchId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const allowed = can("audit.view");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query: AuditQuery = { limit: PAGE_SIZE, offset };
    if (direction !== "ALL") query.direction = direction;
    if (branchId !== "ALL") query.branchId = branchId;
    if (appliedSearch.trim()) query.q = appliedSearch.trim();
    listAuditLogs(query)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(readRequestError(e, "Unable to load audit activity.")),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [allowed, direction, branchId, offset, appliedSearch]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted-foreground">
          You don't have access to the audit log.
        </p>
      </div>
    );
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Zemen-ePos · Admin
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every internal action (INBOUND) and EIRMS exchange (OUTBOUND), with
          who triggered it. Click a row for the full detail.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle>
            {total} event{total === 1 ? "" : "s"}
          </CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Direction
              </Label>
              <Select
                value={direction}
                onValueChange={(v) => {
                  setDirection(v as DirectionFilter);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="INBOUND">Inbound</SelectItem>
                  <SelectItem value="OUTBOUND">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {availableBranches.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Branch
                </Label>
                <Select
                  value={branchId}
                  onValueChange={(v) => {
                    setBranchId(v);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All branches</SelectItem>
                    {availableBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.tradeName ?? b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                setOffset(0);
                setAppliedSearch(search);
              }}
            >
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Search
              </Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Action, actor email, entity id…"
                className="w-64"
              />
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching events.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={() => setDetailId(log.id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.direction === "OUTBOUND"
                              ? "secondary"
                              : "default"
                          }
                        >
                          {log.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.action}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.actorEmail ?? (
                          <span className="text-muted-foreground">system</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {log.entityType ?? "—"}
                        {log.entityId ? (
                          <span className="opacity-60">
                            {" "}
                            ·{" "}
                            {log.entityId.length > 12
                              ? `${log.entityId.slice(0, 12)}…`
                              : log.entityId}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={log.success ? "success" : "destructive"}
                        >
                          {log.statusCode ?? (log.success ? "OK" : "ERR")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AuditDetailSheet id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
