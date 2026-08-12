import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus, Plus, RefreshCw } from "lucide-react";

import { PurchaseFormSheet } from "@/components/purchase-form-sheet";
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
import { useAuth } from "@/lib/auth";
import {
  listBranches,
  listInventory,
  listPurchases,
  listVendors,
} from "@/lib/resources";
import type {
  InventoryItem,
  SafeBranch,
  StockPurchase,
  Vendor,
} from "@/lib/types";

export function InventoryPurchasesPage() {
  const { t } = useTranslation();
  const { can, user: actor, merchant } = useAuth();
  const [purchases, setPurchases] = useState<StockPurchase[]>([]);
  const [branches, setBranches] = useState<SafeBranch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const merchantId = actor?.merchantId ?? merchant?.id ?? null;
    if (!merchantId) return;
    void listBranches(merchantId).then(setBranches).catch(() => undefined);
  }, [actor?.merchantId, merchant?.id]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [p, v, i] = await Promise.all([
        listPurchases(),
        listVendors(),
        listInventory(),
      ]);
      setPurchases(p);
      setVendors(v);
      setItems(i);
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <PurchaseFormSheet
        open={showForm}
        branches={branches}
        vendors={vendors}
        items={items}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          void refresh();
        }}
      />

      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Inventory
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("purchases.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("purchases.header.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw />
            {t("common.refresh")}
          </Button>
          {can("purchase.create") && (
            <Button onClick={() => setShowForm(true)}>
              <Plus />
              {t("purchases.newPurchase")}
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
            <PackagePlus className="size-4 text-muted-foreground" />
            {t("purchases.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("purchases.columns.date")}</TableHead>
                <TableHead>{t("purchases.columns.branch")}</TableHead>
                <TableHead>{t("purchases.columns.vendor")}</TableHead>
                <TableHead>{t("purchases.columns.reference")}</TableHead>
                <TableHead>{t("purchases.columns.lines")}</TableHead>
                <TableHead className="text-right">
                  {t("purchases.columns.total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {t("purchases.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(p.purchaseDate).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {branchNameById.get(p.branchId) ?? p.branchId}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.vendor?.name ?? (
                        <span className="text-muted-foreground">
                          {t("purchases.cashLabel")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t("purchases.lines", { count: p.items.length })}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {p.totalCost.toFixed(2)} {p.currency}
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
