import { useEffect, useState } from "react";
import { Languages, RotateCcw, Search, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { TABLE_PAGE_SIZE, TablePagination } from "@/components/table-pagination";
import { loadOverrides } from "@/i18n";
import {
  createLanguage,
  deleteLanguage,
  deleteTranslationOverride,
  listLanguagesAdmin,
  listTranslationKeys,
  updateLanguage,
  upsertTranslationOverride,
  type Language,
  type TranslationKeyRow,
} from "@/lib/resources";

/**
 * SUPER_ADMIN translation-management page. Two sections:
 *
 *   1. Languages — enable / disable + reorder. Removes are soft-delete
 *      (the migration seeds `en` + `am`; anything else the SUPER_ADMIN
 *      creates lives alongside them).
 *   2. Keys — every translation key with EN reference + target-language
 *      base + editable override. Filter by "missing only" to see rows that
 *      still need translating.
 */
export function AdminTranslationsPage() {
  const { can } = useAuth();
  const allowed = can("translation.manage");

  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLang, setSelectedLang] = useState<string>("am");
  const [rows, setRows] = useState<TranslationKeyRow[]>([]);
  const [missingOnly, setMissingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [keyPage, setKeyPage] = useState(1);
  useEffect(() => setKeyPage(1), [selectedLang, missingOnly, search]);
  const [newLanguage, setNewLanguage] = useState({
    code: "",
    name: "",
    nativeName: "",
    ordering: "",
  });

  useEffect(() => {
    if (!allowed) return;
    void refreshLanguages();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !selectedLang) return;
    void refreshKeys();
  }, [allowed, selectedLang, missingOnly, search]);

  async function refreshLanguages() {
    try {
      const list = await listLanguagesAdmin();
      setLanguages(list);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function refreshKeys() {
    setLoading(true);
    setError(null);
    try {
      const list = await listTranslationKeys({
        language: selectedLang,
        missingOnly,
        search: search.trim() || undefined,
      });
      setRows(list);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveOverride(row: TranslationKeyRow, value: string) {
    try {
      await upsertTranslationOverride({
        language: selectedLang,
        key: row.key,
        value,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key ? { ...r, override: value, source: "override" } : r,
        ),
      );
      // Refresh the SPA's own runtime bundle so the change takes effect
      // without a page reload.
      void loadOverrides(selectedLang);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function clearOverride(row: TranslationKeyRow) {
    try {
      await deleteTranslationOverride({
        language: selectedLang,
        key: row.key,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key
            ? { ...r, override: undefined, source: "base" }
            : r,
        ),
      );
      void loadOverrides(selectedLang);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function toggleLanguage(lang: Language) {
    try {
      const updated = await updateLanguage(lang.code, {
        active: !lang.active,
      });
      setLanguages((prev) =>
        prev.map((l) => (l.code === updated.code ? updated : l)),
      );
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleCreateLanguage(event: React.FormEvent) {
    event.preventDefault();
    const code = newLanguage.code.trim();
    const name = newLanguage.name.trim();
    const nativeName = newLanguage.nativeName.trim();
    if (!code || !name || !nativeName) {
      setError("Language code, name, and native name are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createLanguage({
        code,
        name,
        nativeName,
        ordering: newLanguage.ordering === "" ? undefined : Number(newLanguage.ordering),
      });
      setNewLanguage({ code: "", name: "", nativeName: "", ordering: "" });
      await refreshLanguages();
      setSelectedLang(created.code);
    } catch (err) {
      setError(readError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(lang: Language) {
    if (!confirm(`Deactivate language "${lang.name}"?`)) return;
    try {
      await deleteLanguage(lang.code);
      await refreshLanguages();
    } catch (err) {
      setError(readError(err));
    }
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Not authorised</h1>
        <p className="text-sm text-muted-foreground">
          Translation management is available to platform back-office
          administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-8 lg:px-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Zemen-ePos · Platform
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Translation management
          </h1>
          <p className="text-sm text-muted-foreground">Manage languages and translation overrides.</p>
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
            <Languages className="size-4 text-muted-foreground" />
            Languages
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <form
            onSubmit={handleCreateLanguage}
            className="mb-5 grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-5 sm:items-end"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="language-code">Code</Label>
              <Input id="language-code" placeholder="or" maxLength={5} value={newLanguage.code} onChange={(e) => setNewLanguage((v) => ({ ...v, code: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="language-name">Name</Label>
              <Input id="language-name" placeholder="Oromo" maxLength={60} value={newLanguage.name} onChange={(e) => setNewLanguage((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="language-native-name">Native name</Label>
              <Input id="language-native-name" placeholder="Afaan Oromoo" maxLength={60} value={newLanguage.nativeName} onChange={(e) => setNewLanguage((v) => ({ ...v, nativeName: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="language-ordering">Ordering</Label>
              <Input id="language-ordering" type="number" placeholder="10" value={newLanguage.ordering} onChange={(e) => setNewLanguage((v) => ({ ...v, ordering: e.target.value }))} />
            </div>
            <Button type="submit" disabled={creating}>{creating ? "Adding…" : "Add language"}</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Native name</TableHead>
                <TableHead>Ordering</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {languages.map((l) => (
                <TableRow key={l.code}>
                  <TableCell className="font-mono">{l.code}</TableCell>
                  <TableCell>{l.name}</TableCell>
                  <TableCell>{l.nativeName}</TableCell>
                  <TableCell className="tabular-nums">{l.ordering}</TableCell>
                  <TableCell>
                    {l.active ? (
                      <Badge variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleLanguage(l)}
                    >
                      {l.active ? "Deactivate" : "Activate"}
                    </Button>
                    {l.active && l.code !== "en" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(l)}
                      >
                        Soft-delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">Translation keys</CardTitle>
            <span className="text-xs text-muted-foreground">
              Every key the SPA can look up. Overrides win over base values.
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Language</Label>
              <Select value={selectedLang} onValueChange={setSelectedLang}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.code} — {l.nativeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Search</Label>
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Key, EN, or AM…"
                />
              </div>
            </div>
            <label className="mb-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(e) => setMissingOnly(e.target.checked)}
                className="size-4 accent-[#5700FF]"
              />
              Missing only
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshKeys()}
              disabled={loading}
            >
              <RotateCcw />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">Key</TableHead>
                <TableHead>English (reference)</TableHead>
                <TableHead>Base ({selectedLang})</TableHead>
                <TableHead>Override ({selectedLang})</TableHead>
                <TableHead className="w-24">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {missingOnly
                      ? "Nothing missing — every key has a translation or override."
                      : "No keys match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.slice((keyPage - 1) * TABLE_PAGE_SIZE, keyPage * TABLE_PAGE_SIZE).map((r) => (
                  <KeyRow
                    key={r.key}
                    row={r}
                    onSave={(value) => saveOverride(r, value)}
                    onClear={() => clearOverride(r)}
                  />
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination page={keyPage} pageCount={Math.ceil(rows.length / TABLE_PAGE_SIZE)} total={rows.length} shown={rows.slice((keyPage - 1) * TABLE_PAGE_SIZE, keyPage * TABLE_PAGE_SIZE).length} onPage={setKeyPage} />
        </CardContent>
      </Card>
    </div>
  );
}

function KeyRow({
  row,
  onSave,
  onClear,
}: {
  row: TranslationKeyRow;
  onSave: (value: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(row.override ?? "");
  const dirty = draft !== (row.override ?? "");

  useEffect(() => {
    setDraft(row.override ?? "");
  }, [row.override]);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs align-top">{row.key}</TableCell>
      <TableCell className="text-sm align-top text-muted-foreground">
        {row.reference || <span className="italic">(empty)</span>}
      </TableCell>
      <TableCell className="text-sm align-top">
        {row.base || <span className="italic text-muted-foreground">(empty)</span>}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Leave blank + save to fall back to base"
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || draft.trim() === ""}
              onClick={() => onSave(draft.trim())}
            >
              Save override
            </Button>
            {row.override !== undefined && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                <Undo2 className="size-3.5" />
                Revert to base
              </Button>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        {row.source === "override" ? (
          <Badge variant="default">Override</Badge>
        ) : (
          <Badge variant="outline">Base</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function readError(err: unknown): string {
  if (err instanceof ApiError) {
    return readApiMessage(err.body) ?? err.message;
  }
  return (err as Error).message;
}
