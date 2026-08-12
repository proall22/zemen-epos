import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import {
  writeOffInventoryItem,
  type WriteOffReason,
} from "@/lib/resources";
import type { InventoryItem, Store } from "@/lib/types";

const REASON_KEY: Record<WriteOffReason, string> = {
  DAMAGE: "inventory.writeOff.reasonDamage",
  EXPIRY: "inventory.writeOff.reasonExpiry",
  THEFT: "inventory.writeOff.reasonTheft",
  INTERNAL_USE: "inventory.writeOff.reasonInternal",
};

export interface WriteOffDialogProps {
  item: InventoryItem | null;
  stores: Store[];
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}

export function WriteOffDialog({
  item,
  stores,
  onClose,
  onSaved,
}: WriteOffDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<WriteOffReason>("DAMAGE");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const storesForItem = useMemo(
    () => stores.filter((s) => s.active),
    [stores],
  );

  useEffect(() => {
    if (!item) return;
    setReason("DAMAGE");
    setQuantity("");
    setNote("");
    setStoreId(
      storesForItem.find((s) => s.isSalesFloor)?.id ?? storesForItem[0]?.id ?? "",
    );
    setError(null);
    setBusy(false);
  }, [item?.id, storesForItem]);

  const open = item !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!item) return;
    const q = Number(quantity);
    const problems: string[] = [];
    if (!Number.isFinite(q) || q <= 0)
      problems.push(t("inventory.writeOff.quantityRequired"));
    if (!note.trim()) problems.push(t("inventory.writeOff.noteRequired"));
    if (problems.length) {
      setError({
        title: t("inventory.writeOff.problemsTitle"),
        items: problems,
      });
      return;
    }
    setBusy(true);
    try {
      const saved = await writeOffInventoryItem(item.id, {
        quantity: q,
        reason,
        note: note.trim(),
        storeId: storeId || undefined,
      });
      onSaved(saved);
    } catch (err) {
      const fallback = t("purchases.form.cannotSave");
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? fallback,
          items: readUserMessages(err.body),
        });
      } else {
        setError({ title: (err as Error).message, items: [] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {t("inventory.writeOff.title")}
          </DialogTitle>
          <DialogDescription>
            {item ? t("inventory.writeOff.body", { item: item.description }) : ""}
          </DialogDescription>
        </DialogHeader>

        <form id="writeoff-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">
                {t("inventory.writeOff.reason")}
              </Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as WriteOffReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REASON_KEY) as WriteOffReason[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(REASON_KEY[k])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                {t("inventory.writeOff.quantity")}
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {storesForItem.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">
                  {t("inventory.writeOff.store")}
                </Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("inventory.writeOff.storeDefault")} />
                  </SelectTrigger>
                  <SelectContent>
                    {storesForItem.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">{t("inventory.writeOff.note")}</Label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("inventory.writeOff.notePlaceholder")}
              />
            </div>
          </div>

          {error && <ErrorCallout title={error.title} items={error.items} />}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("inventory.writeOff.cancel")}
          </Button>
          <Button type="submit" form="writeoff-form" disabled={busy}>
            {busy
              ? t("inventory.writeOff.submitting")
              : t("inventory.writeOff.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
