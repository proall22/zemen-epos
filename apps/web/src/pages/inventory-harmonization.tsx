import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Percent, Plus, RefreshCw, Trash2 } from "lucide-react";

import { HarmonizationFormSheet } from "@/components/harmonization-form-sheet";
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
import {
  deleteHarmonizationCode,
  listHarmonizationCodes,
} from "@/lib/resources";
import type { HarmonizationCode } from "@/lib/types";

export function InventoryHarmonizationPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [codes, setCodes] = useState<HarmonizationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<HarmonizationCode | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setCodes(await listHarmonizationCodes(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(c: HarmonizationCode) {
    if (!confirm(t("harmonization.confirmDelete", { code: c.code }))) return;
    try {
      await deleteHarmonizationCode(c.id);
      void refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <HarmonizationFormSheet
        mode={formMode}
        code={editing}
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
            {t("harmonization.header.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("harmonization.header.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw />
            {t("common.refresh")}
          </Button>
          {can("inventory.create") && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormMode("create");
              }}
            >
              <Plus />
              {t("harmonization.addCode")}
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
            <Percent className="size-4 text-muted-foreground" />
            {t("harmonization.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("harmonization.columns.code")}</TableHead>
                <TableHead>{t("harmonization.columns.description")}</TableHead>
                <TableHead className="text-right">
                  {t("harmonization.columns.exciseRate")}
                </TableHead>
                <TableHead>{t("harmonization.columns.status")}</TableHead>
                {can("inventory.update") && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {t("harmonization.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.exciseRate}%
                    </TableCell>
                    <TableCell>
                      {c.active ? (
                        <Badge variant="outline">
                          {t("stores.flags.active")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("stores.flags.inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    {can("inventory.update") && (
                      <TableCell className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(c);
                            setFormMode("edit");
                          }}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {can("inventory.delete") && c.active && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(c)}
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
