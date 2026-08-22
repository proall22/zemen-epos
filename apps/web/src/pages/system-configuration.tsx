import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/table-pagination";

type TaxCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
  type: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "OTHER";
  description: string | null;
  active: boolean;
};
type Rule = {
  id: string;
  code: string;
  name: string;
  value: number;
  unit: string;
  description: string | null;
  active: boolean;
};
type Edit =
  | { kind: "tax"; value: Partial<TaxCode> }
  | { kind: "rule"; value: Rule };

export function SystemConfigurationPage({
  section,
}: {
  section: "tax" | "withholding" | "supply";
}) {
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  const load = () =>
    Promise.all([
      api<TaxCode[]>("/system-configuration/tax-codes"),
      api<Rule[]>("/system-configuration/rules"),
    ]).then(([tax, configuredRules]) => {
      setTaxCodes(tax);
      setRules(configuredRules);
    });

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!edit) return;
    setMessage("");
    try {
      if (edit.kind === "tax") {
        const value = edit.value;
        const path = value.id
          ? `/system-configuration/tax-codes/${value.id}`
          : "/system-configuration/tax-codes";
        await api(path, {
          method: value.id ? "PATCH" : "POST",
          body: JSON.stringify(value),
        });
      } else {
        await api(`/system-configuration/rules/${edit.value.code}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: edit.value.name,
            value: Number(edit.value.value),
            description: edit.value.description,
            active: edit.value.active,
          }),
        });
      }
      setEdit(null);
      setMessage(
        "Configuration saved. New transactions will use the updated value.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save configuration.",
      );
    }
  }

  const withholding = rules.find((r) => r.code === "WITHHOLDING_SUPPLIER");
  const supply = rules.filter((r) => r.code.startsWith("SUPPLY_"));
  const title =
    section === "tax"
      ? "Tax Codes"
      : section === "withholding"
        ? "Withholding"
        : "Supply Configuration";

  const visibleTaxCodes = taxCodes.slice(
    (page - 1) * TABLE_PAGE_SIZE,
    page * TABLE_PAGE_SIZE,
  );
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-6 py-8 lg:px-8">
      <div>
        <p className="text-sm text-muted-foreground">System Configuration</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global settings used for new transactions.
        </p>
      </div>
      {message && (
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          {message}
        </div>
      )}
      {section === "tax" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tax codes</CardTitle>
            <Button
              size="sm"
              onClick={() =>
                setEdit({
                  kind: "tax",
                  value: {
                    code: "",
                    name: "",
                    rate: 0,
                    type: "STANDARD",
                    description: "",
                    active: true,
                  },
                })
              }
            >
              <Plus className="mr-2 size-4" />
              New tax code
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTaxCodes.map((tax) => (
                  <TableRow key={tax.id}>
                    <TableCell className="font-medium">{tax.code}</TableCell>
                    <TableCell>{tax.name}</TableCell>
                    <TableCell>{tax.rate}%</TableCell>
                    <TableCell>{tax.type.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={tax.active ? "success" : "muted"}>
                        {tax.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 text-muted-foreground">
                      {tax.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEdit({ kind: "tax", value: tax })}
                      >
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageCount={Math.ceil(taxCodes.length / TABLE_PAGE_SIZE)}
              total={taxCodes.length}
              shown={visibleTaxCodes.length}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      )}
      {section === "withholding" && withholding && (
        <RuleCard
          rule={withholding}
          onEdit={() => setEdit({ kind: "rule", value: withholding })}
          detail={`Pre-tax amount × ${withholding.value}% = withholding. VAT is not included in the withholding base.`}
        />
      )}
      {section === "supply" && (
        <div className="grid gap-5 md:grid-cols-2">
          {supply.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => setEdit({ kind: "rule", value: rule })}
              detail={`Withholding applies only when the pre-tax amount is greater than ${money(rule.value)}. Equality does not qualify.`}
            />
          ))}
        </div>
      )}
      <EditDialog
        edit={edit}
        onChange={setEdit}
        onClose={() => setEdit(null)}
        onSave={() => void save()}
      />
    </div>
  );
}

function RuleCard({
  rule,
  detail,
  onEdit,
}: {
  rule: Rule;
  detail: string;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{rule.name}</CardTitle>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {rule.code}
          </p>
        </div>
        <Badge variant={rule.active ? "success" : "muted"}>
          {rule.active ? "Active" : "Inactive"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-semibold">
          {rule.unit === "percent" ? `${rule.value}%` : money(rule.value)}
        </div>
        <p className="text-sm text-muted-foreground">{rule.description}</p>
        <p className="text-sm">{detail}</p>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-2 size-4" />
          Edit configuration
        </Button>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  edit,
  onChange,
  onClose,
  onSave,
}: {
  edit: Edit | null;
  onChange: (edit: Edit) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!edit) return null;
  const v = edit.value;
  const set = (key: string, value: unknown) =>
    onChange({ ...edit, value: { ...v, [key]: value } } as Edit);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {edit.kind === "tax"
              ? `${v.id ? "Edit" : "Create"} tax code`
              : `Edit ${v.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {edit.kind === "tax" ? (
            <>
              <Field label="Code">
                <Input
                  value={edit.value.code ?? ""}
                  disabled={!!edit.value.id}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Name">
                <Input
                  value={edit.value.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={edit.value.type}
                  onValueChange={(value) => set("type", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["STANDARD", "ZERO_RATED", "EXEMPT", "OTHER"].map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace("_", " ")}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rate (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={edit.value.rate ?? 0}
                  onChange={(e) => set("rate", Number(e.target.value))}
                />
              </Field>
            </>
          ) : (
            <Field label={`Value (${edit.value.unit})`}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={edit.value.value}
                onChange={(e) => set("value", Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="Description">
            <Input
              value={v.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.active ?? true}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function money(value: number) {
  return `${new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(value)} ETB`;
}
