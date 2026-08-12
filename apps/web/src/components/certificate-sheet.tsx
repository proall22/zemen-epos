import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import {
  downloadCertificateCsr,
  downloadCertificateDocx,
  getCertificateStatus,
  markCertificateSubmitted,
  updateCertificateForm,
  uploadCertificatePem,
} from "@/lib/resources";
import type { CertificateStatus, SafeBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CertificateSheetProps {
  merchantId: string | null;
  branch: SafeBranch | null;
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

interface FormState {
  contactFullName: string;
  contactJobTitle: string;
  contactEmail: string;
  contactPhone: string;
  reason: string;
}

/** Merchant-admin wizard for the INSA certificate onboarding flow. The steps
 *  are progressive but not linear — a merchant can bounce back to fill in
 *  form fields while INSA is still processing the request. Fetches
 *  authoritative state on every open + after each mutation so the UI never
 *  falls out of sync with what's in Vault. */
export function CertificateSheet({
  merchantId,
  branch,
  open,
  onClose,
  onCompleted,
}: CertificateSheetProps) {
  const [status, setStatus] = useState<CertificateStatus | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [pem, setPem] = useState("");
  const [byoKey, setByoKey] = useState("");
  const [byoMode, setByoMode] = useState(false);
  const [busy, setBusy] = useState<"" | "form" | "submit" | "upload">("");
  const [downloading, setDownloading] = useState<"csr" | "docx" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const pemFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !merchantId || !branch) return;
    void refresh();
  }, [open, merchantId, branch?.id]);

  async function refresh() {
    if (!merchantId || !branch) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getCertificateStatus(merchantId, branch.id);
      setStatus(next);
      setForm({
        contactFullName: next.form.contactFullName ?? "",
        contactJobTitle: next.form.contactJobTitle ?? "",
        contactEmail: next.form.contactEmail ?? "",
        contactPhone: next.form.contactPhone ?? "",
        reason: next.form.reason ?? "",
      });
    } catch (err) {
      surfaceError(err, "Couldn't load certificate status.");
    } finally {
      setLoading(false);
    }
  }

  function surfaceError(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      setError({
        title: readApiMessage(err.body) ?? fallback,
        items: readUserMessages(err.body),
      });
    } else {
      setError({ title: (err as Error).message || fallback, items: [] });
    }
  }

  async function saveForm() {
    if (!merchantId || !branch) return;
    setBusy("form");
    setError(null);
    setNotice(null);
    try {
      const next = await updateCertificateForm(merchantId, branch.id, {
        contactFullName: form.contactFullName.trim() || undefined,
        contactJobTitle: form.contactJobTitle.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        reason: form.reason.trim() || undefined,
      });
      setStatus(next);
      setNotice("Form details saved.");
    } catch (err) {
      surfaceError(err, "Couldn't save the form details.");
    } finally {
      setBusy("");
    }
  }

  async function download(kind: "csr" | "docx") {
    if (!merchantId || !branch) return;
    setDownloading(kind);
    setError(null);
    try {
      if (kind === "csr") {
        await downloadCertificateCsr(merchantId, branch.id);
      } else {
        await downloadCertificateDocx(merchantId, branch.id);
      }
    } catch (err) {
      surfaceError(err, "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function submit() {
    if (!merchantId || !branch) return;
    setBusy("submit");
    setError(null);
    setNotice(null);
    try {
      const next = await markCertificateSubmitted(merchantId, branch.id);
      setStatus(next);
      setNotice("Marked as submitted. Waiting for the .pem from INSA.");
    } catch (err) {
      surfaceError(err, "Couldn't mark as submitted.");
    } finally {
      setBusy("");
    }
  }

  async function upload() {
    if (!merchantId || !branch) return;
    if (!pem.trim()) {
      setError({
        title: "Paste or upload the .pem before submitting.",
        items: [],
      });
      return;
    }
    setBusy("upload");
    setError(null);
    setNotice(null);
    try {
      const next = await uploadCertificatePem(merchantId, branch.id, {
        certPem: pem.trim(),
        privateKeyPem: byoMode ? byoKey.trim() || undefined : undefined,
      });
      setStatus(next);
      setPem("");
      setByoKey("");
      setNotice(
        `Certificate accepted. Expires ${
          next.cert.notAfter
            ? new Date(next.cert.notAfter).toLocaleDateString()
            : "—"
        }.`,
      );
      onCompleted?.();
    } catch (err) {
      surfaceError(err, "Certificate rejected. Check the file and try again.");
    } finally {
      setBusy("");
    }
  }

  async function pemFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPem(text);
    // Reset the input so the same file can be re-selected after clearing.
    if (pemFileRef.current) pemFileRef.current.value = "";
  }

  const mailtoHref = useMemo(() => {
    if (!status) return "";
    const subject = "Certificate request for E-Invoice";
    const body = [
      "Dear Admin,",
      "",
      "This is a test certificate request for E-Invoice.",
      "",
      "Please find attached:",
      "",
      "1. Request Form",
      "2. CSR File",
    ].join("\n");
    return `mailto:${encodeURIComponent(status.submissionEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [status]);

  const canEditForm = !status?.submittedAt;
  const canSubmit = !!status?.hasCsr && !status?.submittedAt;
  const canUpload = !!status?.hasPrivateKey || byoMode;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-muted-foreground" />
              Certificate setup — {branch?.name ?? ""}
            </SheetTitle>
            <SheetDescription>
              Get an INSA-issued .pem provisioned for this branch so it can
              sign every request to MoR.
            </SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-5">
          {loading && !status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : status ? (
            <>
              <StatusPanel status={status} />

              {status.hasCert ? (
                <IssuedPanel status={status} />
              ) : (
                <>
                  <Step
                    number={1}
                    icon={<FileText className="size-4" />}
                    title="Contact + reason"
                    caption="Contact person filled into the request form. INSA reaches out at this email if anything's unclear."
                    done={
                      !!status.form.contactFullName &&
                      !!status.form.contactEmail
                    }
                    locked={!canEditForm}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Full name">
                        <Input
                          value={form.contactFullName}
                          disabled={!canEditForm}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              contactFullName: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Job title">
                        <Input
                          value={form.contactJobTitle}
                          disabled={!canEditForm}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              contactJobTitle: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Email">
                        <Input
                          type="email"
                          value={form.contactEmail}
                          disabled={!canEditForm}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              contactEmail: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Phone">
                        <Input
                          value={form.contactPhone}
                          disabled={!canEditForm}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              contactPhone: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Reason for certificate request">
                      <Textarea
                        rows={3}
                        value={form.reason}
                        disabled={!canEditForm}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, reason: e.target.value }))
                        }
                        placeholder="e.g. Integration with EIRMS for e-invoicing."
                      />
                    </Field>
                    {canEditForm && (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={saveForm}
                          disabled={busy === "form"}
                        >
                          {busy === "form" && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Save details
                        </Button>
                      </div>
                    )}
                  </Step>

                  <Step
                    number={2}
                    icon={<Download className="size-4" />}
                    title="Download the CSR + request form"
                    caption="Two files — request.csr (auto-generated) and CERTIFICATE REQUEST FORM.docx (rebuilt from your form details every download)."
                    done={!!status.hasCsr}
                  >
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => download("csr")}
                        disabled={downloading !== null || !status.hasCsr}
                      >
                        {downloading === "csr" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                        request.csr
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => download("docx")}
                        disabled={downloading !== null}
                      >
                        {downloading === "docx" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                        CERTIFICATE REQUEST FORM.docx
                      </Button>
                    </div>
                  </Step>

                  <Step
                    number={3}
                    icon={<Mail className="size-4" />}
                    title="Email both files to INSA"
                    caption={`Attach the two files to a new message to ${status.submissionEmail}. The button below drafts one in your mail app.`}
                    done={!!status.submittedAt}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="outline">
                        <a href={mailtoHref}>
                          <Mail className="size-4" />
                          Take to email
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          navigator.clipboard.writeText(status.submissionEmail)
                        }
                      >
                        <Copy className="size-4" />
                        Copy address
                      </Button>
                      {canSubmit ? (
                        <Button
                          type="button"
                          onClick={submit}
                          disabled={busy === "submit"}
                        >
                          {busy === "submit" && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          I've sent the email
                        </Button>
                      ) : status.submittedAt ? (
                        <Badge variant="muted">
                          Marked sent{" "}
                          {new Date(status.submittedAt).toLocaleDateString()}
                        </Badge>
                      ) : null}
                    </div>
                  </Step>

                  <Step
                    number={4}
                    icon={<Upload className="size-4" />}
                    title="Upload the issued .pem"
                    caption="INSA emails back a .pem file — usually within a day or two. Paste its contents or select the file to upload. We verify it matches your CSR before storing."
                  >
                    <div className="flex flex-col gap-2">
                      <input
                        ref={pemFileRef}
                        type="file"
                        accept=".pem,.crt,application/x-x509-ca-cert,application/x-pem-file"
                        className="hidden"
                        onChange={pemFileChange}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => pemFileRef.current?.click()}
                        >
                          Select .pem file
                        </Button>
                        {pem && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setPem("")}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <Textarea
                        rows={5}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----"
                        value={pem}
                        onChange={(e) => setPem(e.target.value)}
                        className="font-mono text-xs"
                      />

                      <div className="rounded border border-yellow-300/60 bg-yellow-50 p-3 dark:border-yellow-500/30 dark:bg-yellow-500/10">
                        <label className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={byoMode}
                            onChange={(e) => setByoMode(e.target.checked)}
                          />
                          <span>
                            <span className="flex items-center gap-1 font-semibold">
                              <AlertTriangle className="size-3.5 text-yellow-600" />
                              I already have a private key (not advised)
                            </span>
                            <span className="text-muted-foreground">
                              Only use this if INSA issued the cert against a
                              key you generated outside EIRMS. This replaces
                              the key stored here.
                            </span>
                          </span>
                        </label>
                        {byoMode && (
                          <Textarea
                            rows={4}
                            placeholder="-----BEGIN PRIVATE KEY-----&#10;…&#10;-----END PRIVATE KEY-----"
                            value={byoKey}
                            onChange={(e) => setByoKey(e.target.value)}
                            className="mt-2 font-mono text-xs"
                          />
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={upload}
                          disabled={busy === "upload" || !canUpload}
                        >
                          {busy === "upload" && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Upload and verify
                        </Button>
                      </div>
                    </div>
                  </Step>
                </>
              )}
            </>
          ) : null}

          {notice && (
            <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> {notice}
            </p>
          )}
          {error && <ErrorCallout title={error.title} items={error.items} />}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function blank(): FormState {
  return {
    contactFullName: "",
    contactJobTitle: "",
    contactEmail: "",
    contactPhone: "",
    reason: "",
  };
}

function StatusPanel({ status }: { status: CertificateStatus }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pill on={status.hasPrivateKey} label="Private key" />
        <Pill on={status.hasCsr} label="CSR" />
        <Pill on={!!status.submittedAt} label="Emailed to INSA" />
        <Pill on={status.hasCert} label="Certificate" />
      </div>
      <p className="text-muted-foreground">
        Emails go to{" "}
        <span className="font-mono">{status.submissionEmail}</span>.
      </p>
    </div>
  );
}

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        on
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-input text-muted-foreground",
      )}
    >
      {on ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <span className="size-2 rounded-full border" />
      )}
      {label}
    </span>
  );
}

function IssuedPanel({ status }: { status: CertificateStatus }) {
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
        <KeyRound className="size-4" />
        Certificate installed
        {status.usedByo && (
          <Badge variant="muted" className="ml-2">
            BYO key
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Subject CN</dt>
        <dd className="font-mono">{status.cert.subjectCn ?? "—"}</dd>
        <dt className="text-muted-foreground">Serial</dt>
        <dd className="truncate font-mono">{status.cert.serial ?? "—"}</dd>
        <dt className="text-muted-foreground">Valid from</dt>
        <dd>
          {status.cert.notBefore
            ? new Date(status.cert.notBefore).toLocaleDateString()
            : "—"}
        </dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd>
          {status.cert.notAfter
            ? new Date(status.cert.notAfter).toLocaleDateString()
            : "—"}
        </dd>
      </dl>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  caption,
  done,
  locked,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  caption: string;
  done?: boolean;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-md border p-4",
        done && "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <header className="mb-3 flex items-start gap-3">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
            done
              ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
              : "border-input text-muted-foreground",
          )}
        >
          {done ? <CheckCircle2 className="size-4" /> : number}
        </div>
        <div className="flex-1">
          <p className="flex items-center gap-2 font-medium">
            {icon}
            {title}
            {locked && (
              <Badge variant="muted" className="text-[10px]">
                Locked
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </header>
      <div className="flex flex-col gap-3 pl-10">{children}</div>
    </section>
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
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
