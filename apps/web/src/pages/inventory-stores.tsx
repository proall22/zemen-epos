import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRightLeft,
  Boxes,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Warehouse,
} from "lucide-react";

import { StockTransferDialog } from "@/components/stock-transfer-dialog";
import { StoreFormSheet } from "@/components/store-form-sheet";
import { StoreStockSheet } from "@/components/store-stock-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { deleteStore, listBranches, listStores } from "@/lib/resources";
import type { SafeBranch, Store } from "@/lib/types";

export function InventoryStoresPage() {
  const { t } = useTranslation();
  const { can, user: actor, merchant } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [branches, setBranches] = useState<SafeBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Store | null>(null);
  const [viewingStock, setViewingStock] = useState<Store | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Transfers need at least two active stores sharing a branch to be possible.
  const canTransferAny = useMemo(() => {
    const activeByBranch = new Map<string, number>();
    for (const s of stores) {
      if (!s.active) continue;
      activeByBranch.set(s.branchId, (activeByBranch.get(s.branchId) ?? 0) + 1);
    }
    return [...activeByBranch.values()].some((n) => n > 1);
  }, [stores]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const merchantId = actor?.merchantId ?? merchant?.id ?? null;
    if (!merchantId) return;
    void listBranches(merchantId).then(setBranches).catch(() => setBranches([]));
  }, [actor?.merchantId, merchant?.id]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setStores(await listStores(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of branches) m.set(b.id, b.name);
    return m;
  }, [branches]);

  async function handleDelete(store: Store) {
    if (!confirm(t("stores.confirmDelete", { name: store.name }))) return;
    try {
      await deleteStore(store.id);
      void refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(readApiMessage(err.body) ?? t("stores.deactivateError"));
      } else {
        alert((err as Error).message);
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <StoreFormSheet
        mode={formMode}
        store={editing}
        branches={branches}
        onClose={() => {
          setFormMode(null);
          setEditing(null);
        }}
        onSaved={() => {
          setFormMode(null);
          setEditing(null);
          void refresh();
        }}
      />

      <StoreStockSheet
        store={viewingStock}
        onClose={() => setViewingStock(null)}
      />

      <StockTransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSaved={() => {
          setTransferOpen(false);
          void refresh();
        }}
        stores={stores}
        branches={branches}
      />

      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Inventory
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("stores.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("stores.header.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw />
            {t("common.refresh")}
          </Button>
          {can("store.update") && canTransferAny && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowRightLeft />
              {t("stores.transfer.openButton")}
            </Button>
          )}
          {can("store.create") && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormMode("create");
              }}
            >
              <Plus />
              {t("stores.addStore")}
            </Button>
          )}
        </div>
      </header>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Warehouse className="size-4 text-muted-foreground" />
            {t("stores.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stores.columns.name")}</TableHead>
                <TableHead>{t("stores.columns.code")}</TableHead>
                <TableHead>{t("stores.columns.branch")}</TableHead>
                <TableHead>{t("stores.columns.flags")}</TableHead>
                <TableHead>{t("stores.columns.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {t("stores.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                stores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {branchNameById.get(s.branchId) ?? s.branchId}
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {s.isDefault && (
                        <Badge variant="outline">
                          {t("stores.flags.default")}
                        </Badge>
                      )}
                      {s.isSalesFloor && (
                        <Badge variant="default">
                          {t("stores.flags.salesFloor")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge variant="outline">
                          {t("stores.flags.active")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("stores.flags.inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingStock(s)}
                      >
                        <Boxes className="mr-1.5 size-4" />
                        {t("stores.stock.view")}
                      </Button>
                      {can("store.update") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(s);
                            setFormMode("edit");
                          }}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {can("store.delete") && !s.isDefault && s.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(s)}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
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
