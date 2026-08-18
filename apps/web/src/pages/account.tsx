import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  Loader2,
  Save,
  Users,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import {
  createMerchantExport,
  downloadMerchantExport,
  getMerchant,
  listMerchantExports,
  getRegistrationStatus,
  replaceRegistrationDocument,
  updateMerchant,
} from "@/lib/resources";
import type {
  Merchant,
  MerchantExport,
  MerchantExportStatus,
  RegistrationReview,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<MerchantExportStatus, string> = {
  PENDING: "Queued",
  PROCESSING: "Preparing",
  READY: "Ready",
  FAILED: "Failed",
  EXPIRED: "Expired",
};

export function AccountPage() {
  const { user, merchant: ctxMerchant } = useAuth();
  const merchantId = ctxMerchant?.id ?? user?.merchantId ?? null;

  if (!user || !merchantId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <ErrorCallout
          title="No merchant is associated with this account."
          items={["Super-admins manage merchants from the /merchants page."]}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account & settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Your merchant profile, team links, and full data export.
        </p>
      </header>

      <RegistrationStatusSection merchantId={merchantId} />
      <MerchantSection merchantId={merchantId} />
      <ExportSection merchantId={merchantId} />
      <TeamLinks merchantId={merchantId} />
    </div>
  );
}

function RegistrationStatusSection({ merchantId }: { merchantId: string }) {
  const [status, setStatus] = useState<RegistrationReview | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void getRegistrationStatus(merchantId)
      .then(setStatus)
      .catch(() => undefined);
  }, [merchantId]);
  if (!status) return null;
  const approved = status.document.status === "APPROVED";
  const rejected = status.document.status === "REJECTED";
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Registration status</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Email verification
          </p>
          {status.applicant.emailVerifiedAt ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 size-3" /> Verified
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 size-3" /> Not verified
            </Badge>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Legal document</p>
          <Badge
            variant={
              approved ? "success" : rejected ? "destructive" : "warning"
            }
          >
            {approved ? (
              <CheckCircle2 className="mr-1 size-3" />
            ) : rejected ? (
              <AlertTriangle className="mr-1 size-3" />
            ) : (
              <Clock className="mr-1 size-3" />
            )}
            {approved ? "Approved" : rejected ? "Rejected" : "Under review"}
          </Badge>
        </div>
      </div>
      {status.document.rejectionReason && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <strong>Reason:</strong> {status.document.rejectionReason}
        </div>
      )}
      {rejected && (
        <div className="mt-4">
          <Label htmlFor="replacement-document">
            Upload a corrected document
          </Label>
          <Input
            id="replacement-document"
            className="mt-2"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                setStatus(await replaceRegistrationDocument(merchantId, file));
              } finally {
                setUploading(false);
              }
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, JPEG, or PNG. Maximum 5 MB.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Merchant profile editor — inline patch on PATCH /merchants/:id
// ---------------------------------------------------------------------------

interface ProfileForm {
  legalName: string;
  tradeName: string;
  tin: string;
  email: string;
  phone: string;
  vatNumber: string;
  city: string;
  region: string;
  zone: string;
  wereda: string;
  kebele: string;
  houseNumber: string;
}

function emptyForm(): ProfileForm {
  return {
    legalName: "",
    tradeName: "",
    tin: "",
    email: "",
    phone: "",
    vatNumber: "",
    city: "",
    region: "",
    zone: "",
    wereda: "",
    kebele: "",
    houseNumber: "",
  };
}

function fromMerchant(m: Merchant): ProfileForm {
  return {
    legalName: m.legalName ?? "",
    tradeName: m.tradeName ?? "",
    tin: m.tin ?? "",
    email: m.email ?? "",
    phone: m.phone ?? "",
    vatNumber: m.vatNumber ?? "",
    city: m.city ?? "",
    region: m.region ?? "",
    zone: m.zone ?? "",
    wereda: m.wereda ?? "",
    kebele: m.kebele ?? "",
    houseNumber: m.houseNumber ?? "",
  };
}

function MerchantSection({ merchantId }: { merchantId: string }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );

  useEffect(() => {
    void getMerchant(merchantId)
      .then((m) => {
        setMerchant(m);
        setForm(fromMerchant(m));
      })
      .catch(() => undefined);
  }, [merchantId]);

  function patch<K extends keyof ProfileForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const updated = await updateMerchant(merchantId, {
        legalName: form.legalName.trim(),
        tradeName: form.tradeName.trim() || undefined,
        tin: form.tin.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        vatNumber: form.vatNumber.trim() || undefined,
        city: form.city.trim() || undefined,
        region: form.region.trim() || undefined,
        zone: form.zone.trim() || undefined,
        wereda: form.wereda.trim() || undefined,
        kebele: form.kebele.trim() || undefined,
        houseNumber: form.houseNumber.trim() || undefined,
      });
      setMerchant(updated);
      setForm(fromMerchant(updated));
      setSaved(true);
    } catch (err) {
      setError({
        title:
          err instanceof ApiError
            ? (readApiMessage(err.body) ?? "Couldn't save your changes.")
            : "Couldn't reach the server.",
        items: [],
      });
    } finally {
      setBusy(false);
    }
  }

  if (!merchant) {
    return <SkeletonSection title="Merchant profile" />;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
      <SectionHeader
        title="Merchant profile"
        description="The legal record we send to MoR on every invoice. Changes apply immediately."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Legal name"
          value={form.legalName}
          onChange={(v) => patch("legalName", v)}
        />
        <Field
          label="Trade name"
          value={form.tradeName}
          onChange={(v) => patch("tradeName", v)}
        />
        <Field label="TIN" value={form.tin} onChange={(v) => patch("tin", v)} />
        <Field
          label="VAT number"
          value={form.vatNumber}
          onChange={(v) => patch("vatNumber", v)}
        />
        <Field
          label="Email"
          value={form.email}
          onChange={(v) => patch("email", v)}
        />
        <Field
          label="Phone"
          value={form.phone}
          onChange={(v) => patch("phone", v)}
        />
        <Field
          label="City"
          value={form.city}
          onChange={(v) => patch("city", v)}
        />
        <Field
          label="Region"
          value={form.region}
          onChange={(v) => patch("region", v)}
        />
        <Field
          label="Zone"
          value={form.zone}
          onChange={(v) => patch("zone", v)}
        />
        <Field
          label="Wereda"
          value={form.wereda}
          onChange={(v) => patch("wereda", v)}
        />
        <Field
          label="Kebele"
          value={form.kebele}
          onChange={(v) => patch("kebele", v)}
        />
        <Field
          label="House number"
          value={form.houseNumber}
          onChange={(v) => patch("houseNumber", v)}
        />
      </div>

      {error && <ErrorCallout title={error.title} items={error.items} />}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" />
            Saved
          </span>
        )}
        <Button
          type="button"
          onClick={save}
          disabled={busy}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data export — request + list past bundles + download
// ---------------------------------------------------------------------------

function ExportSection({ merchantId }: { merchantId: string }) {
  const [exports, setExports] = useState<MerchantExport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadBundle(exportId: string) {
    setError(null);
    setDownloadingId(exportId);
    try {
      await downloadMerchantExport(merchantId, exportId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (readApiMessage(err.body) ??
              "Couldn't download the export. It may have expired.")
          : "Couldn't reach the server.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function load() {
    try {
      const rows = await listMerchantExports(merchantId);
      setExports(rows);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (readApiMessage(err.body) ?? "Couldn't load your exports.")
          : "Couldn't reach the server.",
      );
    }
  }

  useEffect(() => {
    void load();
    // Re-poll every 15s while there's an in-progress bundle so the UI flips
    // to "Ready" without a manual refresh.
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  async function request() {
    setError(null);
    setBusy(true);
    try {
      await createMerchantExport(merchantId);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (readApiMessage(err.body) ?? "Couldn't queue the export.")
          : "Couldn't reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
      <SectionHeader
        title="Export your data"
        description="Bundle every invoice, receipt, inventory item, buyer, and audit log we hold for your merchant — JSON for everything, plus PDFs for invoices and receipts. Bundles are kept for 7 days."
        icon={<FileArchive className="size-4 text-muted-foreground" />}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          The export runs in the background. We'll email you when it's ready to
          download.
        </p>
        <Button
          type="button"
          onClick={request}
          disabled={busy}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileArchive className="size-4" />
          )}
          {busy ? "Queuing…" : "Request export"}
        </Button>
      </div>

      {error && <ErrorCallout title={error} items={[]} />}

      {exports !== null && exports.length === 0 ? (
        <p className="rounded-md border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No exports yet — click "Request export" to generate your first bundle.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {(exports ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3">
              <ExportStatusBadge status={row.status} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">
                  {new Date(row.requestedAt).toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.invoiceCount} invoices · {row.receiptCount} receipts ·{" "}
                  {row.inventoryCount} items · {row.buyerCount} buyers
                  {row.fileBytes ? ` · ${humanBytes(row.fileBytes)}` : ""}
                </span>
              </div>
              {row.status === "READY" && (
                <button
                  type="button"
                  onClick={() => void downloadBundle(row.id)}
                  disabled={downloadingId === row.id}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  {downloadingId === row.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {downloadingId === row.id ? "Downloading…" : "Download"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExportStatusBadge({ status }: { status: MerchantExportStatus }) {
  const tone =
    status === "READY"
      ? "bg-emerald-100 text-emerald-800"
      : status === "FAILED"
        ? "bg-red-100 text-red-800"
        : status === "EXPIRED"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-100 text-amber-800";
  const Icon =
    status === "READY"
      ? CheckCircle2
      : status === "FAILED"
        ? AlertTriangle
        : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      <Icon className="size-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Outbound links to existing surfaces
// ---------------------------------------------------------------------------

function TeamLinks({ merchantId }: { merchantId: string }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Link
        to="/users"
        className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40"
      >
        <Users className="size-5 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Team</span>
          <span className="text-xs text-muted-foreground">
            Invite cashiers, accountants, and support users.
          </span>
        </div>
      </Link>
      <Link
        to={`/merchants/${merchantId}`}
        className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40"
      >
        <FileArchive className="size-5 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            Branches & EIRMS credentials
          </span>
          <span className="text-xs text-muted-foreground">
            Manage branches and rotate per-branch credentials.
          </span>
        </div>
      </Link>
    </section>
  );
}

function SectionHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="flex flex-col">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SkeletonSection({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm">
      <SectionHeader title={title} description="Loading…" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    </section>
  );
}
