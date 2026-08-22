import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  Loader2,
  MailCheck,
  MailX,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { readRequestError } from "@/lib/api-errors";
import {
  listRegistrationReviews,
  openRegistrationDocument,
  rejectMerchant,
  updateMerchant,
} from "@/lib/resources";
import type { LegalDocumentStatus, RegistrationReview } from "@/lib/types";
import { TABLE_PAGE_SIZE, TablePagination } from "@/components/table-pagination";

export function RegistrationReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMerchantId = searchParams.get("merchant");
  type ReviewFilter =
    | LegalDocumentStatus
    | "EMAIL_VERIFIED"
    | "EMAIL_UNVERIFIED";
  const [rows, setRows] = useState<RegistrationReview[]>([]);
  const [filter, setFilter] = useState<ReviewFilter | undefined>(() => {
    if (requestedMerchantId) return undefined;
    const requested = searchParams
      .get("status")
      ?.toUpperCase()
      .replace(/-/g, "_");
    return [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "EMAIL_VERIFIED",
      "EMAIL_UNVERIFIED",
    ].includes(requested ?? "")
      ? (requested as ReviewFilter)
      : "PENDING";
  });
  const [selected, setSelected] = useState<RegistrationReview | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [page, setPage] = useState(1);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await listRegistrationReviews(
          filter === "PENDING" || filter === "APPROVED" || filter === "REJECTED"
            ? filter
            : undefined,
        ),
      );
    } catch (e) {
      setError(readRequestError(e, "Unable to load registration requests."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void refresh(), [filter]);
  useEffect(() => {
    if (!requestedMerchantId || selected) return;
    const requested = rows.find(
      (row) => row.merchantId === requestedMerchantId,
    );
    if (requested) void review(requested);
  }, [requestedMerchantId, rows, selected]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function review(row: RegistrationReview) {
    setSelected(row);
    setRejectionReason("");
    setPreviewUrl(null);
    try {
      const { blob } = await openRegistrationDocument(row.merchantId);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(
        readRequestError(e, "Unable to open the registration document."),
      );
    }
  }

  async function approve() {
    if (
      !selected ||
      !window.confirm(
        "Approve this legal registration document and activate the registration?",
      )
    )
      return;
    setBusy(true);
    try {
      await updateMerchant(selected.merchantId, { active: true });
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(readRequestError(e, "We couldn't approve this registration."));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected || !rejectionReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setBusy(true);
    try {
      await rejectMerchant(selected.merchantId, rejectionReason.trim());
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(readRequestError(e, "We couldn't reject this registration."));
    } finally {
      setBusy(false);
    }
  }

  const pending = useMemo(
    () => rows.filter((r) => r.document.status === "PENDING").length,
    [rows],
  );
  const visibleRows = useMemo(() => {
    if (filter === "EMAIL_VERIFIED")
      return rows.filter((row) => Boolean(row.applicant.emailVerifiedAt));
    if (filter === "EMAIL_UNVERIFIED")
      return rows.filter((row) => !row.applicant.emailVerifiedAt);
    return rows;
  }, [filter, rows]);

  function selectFilter(next: ReviewFilter) {
    setFilter(next);
    setSelected(null);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    params.delete("merchant");
    params.set("status", next.toLowerCase().replace(/_/g, "-"));
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Super Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Registration Requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Review applicant verification and registration documents.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="size-5 text-primary" /> Requests
            <Badge variant="warning">{pending} pending</Badge>
          </CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            {(
              [
                ["PENDING", "Pending"],
                ["APPROVED", "Approved"],
                ["REJECTED", "Rejected"],
                ["EMAIL_VERIFIED", "Email verified"],
                ["EMAIL_UNVERIFIED", "Email not verified"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => selectFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && <ErrorCallout title={error} items={[]} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Email status</TableHead>
                <TableHead>Document</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE).map((row) => (
                <TableRow key={row.document.id}>
                  <TableCell>
                    <strong className="block">
                      {row.applicant.name ?? row.merchantName}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {row.applicant.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.applicant.phone ?? row.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(row.registeredAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <VerificationBadge
                      verified={Boolean(row.applicant.emailVerifiedAt)}
                    />
                  </TableCell>
                  <TableCell>
                    <DocumentBadge status={row.document.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void review(row)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && visibleRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No registration requests match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {!loading && <TablePagination page={page} pageCount={Math.ceil(visibleRows.length / TABLE_PAGE_SIZE)} total={visibleRows.length} shown={visibleRows.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE).length} onPage={setPage} />}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Registration Document Review</DialogTitle>
                <DialogDescription>
                  {selected.merchantName} · TIN {selected.tin}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <Info
                  label="Applicant"
                  value={selected.applicant.name ?? "—"}
                />
                <Info label="Email" value={selected.applicant.email} />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Email status
                  </p>
                  <VerificationBadge
                    verified={Boolean(selected.applicant.emailVerifiedAt)}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Phone status
                  </p>
                  <VerificationBadge
                    verified={Boolean(selected.applicant.phoneVerifiedAt)}
                    label="phone"
                  />
                </div>
                <Info
                  label="Uploaded"
                  value={new Date(
                    selected.document.uploadedAt,
                  ).toLocaleString()}
                />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Review status
                  </p>
                  <DocumentBadge status={selected.document.status} />
                </div>
                {selected.document.reviewer && (
                  <Info
                    label="Reviewed by"
                    value={
                      selected.document.reviewer.name ??
                      selected.document.reviewer.email
                    }
                  />
                )}
                {selected.document.reviewedAt && (
                  <Info
                    label="Reviewed at"
                    value={new Date(
                      selected.document.reviewedAt,
                    ).toLocaleString()}
                  />
                )}
              </div>
              <div className="min-h-64 overflow-hidden rounded-xl border bg-muted/30">
                {!previewUrl ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="animate-spin text-muted-foreground" />
                  </div>
                ) : selected.document.mediaType === "application/pdf" ? (
                  <iframe
                    title="Legal registration document"
                    src={previewUrl}
                    className="h-[430px] w-full"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Legal registration document preview"
                    className="max-h-[430px] w-full object-contain"
                  />
                )}
              </div>
              {previewUrl && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(previewUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink /> Open document
                </Button>
              )}
              {selected.document.status === "PENDING" && (
                <div>
                  <label
                    htmlFor="rejection-reason"
                    className="mb-2 block text-sm font-medium"
                  >
                    Rejection reason
                  </label>
                  <Textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    maxLength={500}
                    placeholder="Required when rejecting…"
                  />
                </div>
              )}
              {selected.document.rejectionReason && (
                <ErrorCallout
                  title="Rejection reason"
                  items={[selected.document.rejectionReason]}
                />
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
                {selected.document.status === "PENDING" && (
                  <>
                    <Button
                      variant="destructive"
                      disabled={busy || !rejectionReason.trim()}
                      onClick={() => void reject()}
                    >
                      Reject
                    </Button>
                    <Button disabled={busy} onClick={() => void approve()}>
                      Approve
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VerificationBadge({
  verified,
  label = "email",
}: {
  verified: boolean;
  label?: string;
}) {
  return verified ? (
    <Badge variant="success">
      <MailCheck className="mr-1 size-3" /> Verified {label}
    </Badge>
  ) : (
    <Badge variant="destructive">
      <MailX className="mr-1 size-3" /> Not verified
    </Badge>
  );
}

function DocumentBadge({ status }: { status: LegalDocumentStatus }) {
  if (status === "APPROVED")
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 size-3" /> Approved
      </Badge>
    );
  if (status === "REJECTED")
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 size-3" /> Rejected
      </Badge>
    );
  return (
    <Badge variant="warning">
      <Clock3 className="mr-1 size-3" /> Pending review
    </Badge>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
