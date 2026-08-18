import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleCheck,
  CircleX,
  RefreshCw,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveBranch,
  listPendingBranchReviews,
  rejectBranch,
} from "@/lib/resources";
import { readRequestError } from "@/lib/api-errors";
import type { PendingBranchReview } from "@/lib/types";

/** Global review surface for additional branches created by approved merchants. */
export function BranchApprovalsPage() {
  const [rows, setRows] = useState<PendingBranchReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listPendingBranchReviews());
      setError(null);
    } catch (err) {
      setError(readRequestError(err, "Unable to load branch approvals."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function decide(
    row: PendingBranchReview,
    decision: "approve" | "reject",
  ) {
    if (
      decision === "approve" &&
      !window.confirm(`Approve the ${row.name} branch?`)
    )
      return;
    const reason =
      decision === "reject"
        ? window.prompt("Enter the rejection reason:")
        : undefined;
    if (decision === "reject" && reason === null) return;
    if (decision === "reject" && !reason?.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setBusyId(row.id);
    try {
      if (decision === "approve") await approveBranch(row.merchantId, row.id);
      else await rejectBranch(row.merchantId, row.id, reason?.trim());
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(readRequestError(err, "We couldn't complete this action."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Building2 className="size-5 text-primary" />
            Branch approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review additional branches submitted by approved merchants.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>
      {error && <ErrorCallout title={error} items={[]} />}
      <Card>
        <CardHeader>
          <CardTitle>Pending branches</CardTitle>
          <CardDescription>
            The merchant's original main branch is approved with merchant
            registration. Later branches appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <span>No branches awaiting review.</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.merchantName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        TIN {row.merchantTin}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{row.name}</div>
                      <Badge variant="warning">Pending</Badge>
                    </TableCell>
                    <TableCell>
                      {[row.city, row.region].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {new Date(row.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, "approve")}
                        >
                          <CircleCheck />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, "reject")}
                        >
                          <CircleX />
                          Reject
                        </Button>
                      </div>
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
