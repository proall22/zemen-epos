import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, Copy } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { formatAckDate } from "@/lib/invoice-types";
import type { Invoice } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  A: "Accepted",
  R: "Rejected",
  P: "Pending",
};

export function InvoiceSuccess({ data }: { data: Invoice }) {
  return (
    <Card className="border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-emerald-700 dark:text-emerald-300">
              Invoice registered &amp; saved
            </CardTitle>
            <CardDescription>
              {STATUS_LABELS[data.eirmsStatus] ?? data.eirmsStatus} ·{" "}
              {formatAckDate(data.ackDate)}
            </CardDescription>
          </div>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            #{data.documentNumber}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                IRN
              </span>
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
                  {data.irn}
                </code>
                <CopyButton value={data.irn} />
              </div>
            </div>

            <Separator />

            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Buyer</dt>
              <dd className="font-medium">
                {data.buyer.legalName}
                <span className="text-muted-foreground"> · TIN {data.buyer.tin}</span>
              </dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium tabular-nums">
                {data.totalValue.toFixed(2)} {data.currency}
              </dd>
              <dt className="text-muted-foreground">Items</dt>
              <dd>{data.items.length}</dd>
            </dl>

            <Link
              to="/invoices"
              className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
            >
              View all invoices →
            </Link>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              QR
            </span>
            <img
              alt="Invoice QR"
              src={`data:image/png;base64,${data.signedQR}`}
              className="size-44 rounded-md border bg-white p-2"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InvoiceError({
  status: _status,
  body,
}: {
  status: number | null;
  body: unknown;
}) {
  const title = readApiMessage(body) ?? "We couldn't register this invoice.";
  const items = readUserMessages(body);
  return <ErrorCallout title={title} items={items} />;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
    >
      {copied ? <CheckCheck /> : <Copy />}
    </Button>
  );
}

