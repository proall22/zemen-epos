import { useEffect, useState } from "react";
import {
  ChevronRight,
  FileMinus,
  FilePlus,
  FileText,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInvoiceChain } from "@/lib/resources";
import { formatIssuedAt } from "@/lib/invoice-date";
import type { Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface InvoiceChainProps {
  invoiceId: string;
  onOpen: (invoiceId: string) => void;
}

export function InvoiceChain({ invoiceId, onOpen }: InvoiceChainProps) {
  const [chain, setChain] = useState<Invoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getInvoiceChain(invoiceId)
      .then((c) => {
        if (!cancelled) setChain(c);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading chain…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-destructive">
        Couldn't load chain: {error}
      </p>
    );
  }
  if (!chain || chain.length <= 1) {
    return null;
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Amendment chain
        </p>
        <span className="font-mono text-[10px] text-muted-foreground">
          {chain.length} documents
        </span>
      </div>
      <ol className="flex flex-col divide-y">
        {chain.map((node) => (
          <ChainNode
            key={node.id}
            node={node}
            active={node.id === invoiceId}
            onOpen={() => onOpen(node.id)}
          />
        ))}
      </ol>
    </div>
  );
}

function ChainNode({
  node,
  active,
  onOpen,
}: {
  node: Invoice;
  active: boolean;
  onOpen: () => void;
}) {
  const kind = kindOf(node.documentType);
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm",
        active && "bg-[#5700FF]/5",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          kind.className,
        )}
      >
        {kind.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">
            #{node.documentNumber}
          </span>
          <Badge variant="muted" className="text-[9px] uppercase">
            {node.documentType}
          </Badge>
          {node.status === "CANCELLED" && (
            <Badge variant="destructive" className="text-[9px]">
              Cancelled
            </Badge>
          )}
          {node.paymentStatus === "PAID" && (
            <Badge variant="success" className="text-[9px]">
              Paid
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {formatIssuedAt(node)} · {node.totalValue.toFixed(2)} {node.currency}
        </p>
      </div>
      {!active && (
        <Button variant="ghost" size="sm" onClick={onOpen} className="shrink-0">
          Open
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

function kindOf(type: string): { icon: React.ReactNode; className: string } {
  switch (type) {
    case "CRE":
      return {
        icon: <FileMinus className="size-4" />,
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "DEB":
      return {
        icon: <FilePlus className="size-4" />,
        className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    default:
      return {
        icon: <FileText className="size-4" />,
        className: "bg-[#5700FF]/10 text-[#5700FF]",
      };
  }
}
