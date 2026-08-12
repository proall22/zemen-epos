import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { getAuditLog } from "@/lib/resources";
import type { AuditLog } from "@/lib/types";

export function AuditDetailSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [log, setLog] = useState<AuditLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLog(null);
    setError(null);
    getAuditLog(id)
      .then(setLog)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : (e as Error).message),
      );
  }, [id]);

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Audit entry</SheetTitle>
          <SheetDescription>{log?.action ?? "Loading…"}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!log && !error && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {log && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    log.direction === "OUTBOUND" ? "secondary" : "default"
                  }
                >
                  {log.direction}
                </Badge>
                <Badge variant={log.success ? "success" : "destructive"}>
                  {log.success ? "Success" : "Failed"}
                </Badge>
                {log.statusCode != null && (
                  <Badge variant="muted">HTTP {log.statusCode}</Badge>
                )}
              </div>

              <div className="flex flex-col">
                <Row label="When">
                  {new Date(log.createdAt).toLocaleString()}
                </Row>
                <Row label="Action">{log.action}</Row>
                <Row label="Actor">
                  {log.actorEmail ?? "system"}
                  {log.actorRole ? ` · ${log.actorRole}` : ""}
                </Row>
                {log.method && <Row label="Method">{log.method}</Row>}
                {log.path && <Row label="Path">{log.path}</Row>}
                {log.entityType && (
                  <Row label="Entity">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId}` : ""}
                  </Row>
                )}
                {log.durationMs != null && (
                  <Row label="Duration">{log.durationMs} ms</Row>
                )}
                {log.ip && <Row label="IP">{log.ip}</Row>}
                {log.errorMessage && <Row label="Error">{log.errorMessage}</Row>}
              </div>

              <JsonBlock label="Request" value={log.requestBody} />
              <JsonBlock label="Response" value={log.responseBody} />
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-medium">{children}</span>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value, null, 2);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is best-effort — a permission-denied prompt or an
      // insecure origin just leaves the button untouched.
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={copy}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}
