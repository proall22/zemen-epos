import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Clock,
  FileText,
  Loader2,
  Receipt,
  Store,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { BranchReadiness } from "@/components/branch-readiness";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getBranchStats, type BranchStats } from "@/lib/resources";
import type { SafeBranch } from "@/lib/types";

export interface BranchDetailDrawerProps {
  branch: SafeBranch | null;
  onClose: () => void;
  onEdit?: (b: SafeBranch) => void;
  onOpenCertificate?: (b: SafeBranch) => void;
}

export function BranchDetailDrawer({
  branch,
  onClose,
  onEdit,
  onOpenCertificate,
}: BranchDetailDrawerProps) {
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branch) {
      setStats(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getBranchStats(branch.merchantId, branch.id)
      .then((s) => setStats(s))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [branch?.id]);

  const ready =
    branch?.eirmsClientIdSet &&
    branch?.eirmsClientSecretSet &&
    branch?.eirmsApikeySet;

  return (
    <Sheet
      open={branch !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex flex-col gap-1 pr-8">
            <SheetTitle className="flex items-center gap-2">
              <Store className="size-5 text-muted-foreground" />
              {branch?.tradeName ?? branch?.name}
            </SheetTitle>
            <SheetDescription>
              {branch?.subTin
                ? `Sub-TIN ${branch.subTin}`
                : "Branch summary"}
              {branch?.systemNumber ? ` · SYS ${branch.systemNumber}` : ""}
            </SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          {branch && <BranchReadiness branch={branch} variant="full" />}

          <div className="grid grid-cols-3 gap-2">
            <StatBox
              icon={<FileText className="size-4" />}
              label="Invoices"
              value={stats?.invoices ?? 0}
              loading={loading}
            />
            <StatBox
              icon={<Receipt className="size-4" />}
              label="Receipts"
              value={stats?.receipts ?? 0}
              loading={loading}
            />
            <StatBox
              icon={<UserCheck className="size-4" />}
              label="Users"
              value={stats?.activeUsers ?? 0}
              loading={loading}
            />
          </div>

          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-4" />
              <span className="text-[11px] uppercase tracking-wide">
                Last activity
              </span>
            </div>
            <p className="mt-1 font-medium">
              {loading
                ? "…"
                : stats?.lastActivityAt
                  ? new Date(stats.lastActivityAt).toLocaleString()
                  : "No invoices or receipts yet"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ready ? (
              <Badge variant="success" className="gap-1">
                <BadgeCheck className="size-3" />
                Credentials configured
              </Badge>
            ) : (
              <Badge variant="muted" className="gap-1">
                <TriangleAlert className="size-3" />
                Credentials missing
              </Badge>
            )}
            {branch?.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="muted">Disabled</Badge>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive">Couldn't load stats: {error}</p>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onOpenCertificate && branch && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenCertificate(branch);
                onClose();
              }}
            >
              Certificate wizard
            </Button>
          )}
          {onEdit && branch && (
            <Button
              onClick={() => {
                onEdit(branch);
                onClose();
              }}
            >
              Edit branch
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StatBox({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-xl font-semibold tabular-nums">
        {loading ? <Loader2 className="size-4 animate-spin" /> : value}
      </span>
    </div>
  );
}
