import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, Trash2, Truck } from "lucide-react";

import { VendorFormSheet } from "@/components/vendor-form-sheet";
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
import { useAuth } from "@/lib/auth";
import { deleteVendor, listVendors } from "@/lib/resources";
import type { Vendor } from "@/lib/types";

export function InventoryVendorsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setVendors(await listVendors(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(v: Vendor) {
    if (!confirm(t("vendors.confirmDelete", { name: v.name }))) return;
    try {
      await deleteVendor(v.id);
      void refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <VendorFormSheet
        mode={formMode}
        vendor={editing}
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

      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Inventory
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("vendors.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vendors.header.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw />
            {t("common.refresh")}
          </Button>
          {can("vendor.create") && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormMode("create");
              }}
            >
              <Plus />
              {t("vendors.addVendor")}
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
            <Truck className="size-4 text-muted-foreground" />
            {t("vendors.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("vendors.columns.name")}</TableHead>
                <TableHead>{t("vendors.columns.contact")}</TableHead>
                <TableHead>{t("vendors.columns.phone")}</TableHead>
                <TableHead>{t("vendors.columns.email")}</TableHead>
                <TableHead>{t("vendors.columns.status")}</TableHead>
                {can("vendor.update") && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {t("vendors.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.contactName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      {v.active ? (
                        <Badge variant="outline">
                          {t("stores.flags.active")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("stores.flags.inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    {can("vendor.update") && (
                      <TableCell className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(v);
                            setFormMode("edit");
                          }}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {can("vendor.delete") && v.active && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(v)}
                            aria-label={t("stores.flags.inactive")}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
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
