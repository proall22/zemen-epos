import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft } from "lucide-react";

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
import { transferStock } from "@/lib/resources";
import type { InventoryItem, Store } from "@/lib/types";

export interface StoreTransferSheetProps {
  item: InventoryItem | null;
  stores: Store[];
  onClose: () => void;
  onSaved: () => void;
}

export function StoreTransferSheet({
  item,
  stores,
  onClose,
  onSaved,
}: StoreTransferSheetProps) {
  const { t } = useTranslation();
  // `stores` is already scoped to the active branch by the server; the
  // catalogue is merchant-wide so the item can't narrow it further.
  const storesInBranch = useMemo(
    () => stores.filter((s) => s.active),
    [stores],
  );

  const [fromStoreId, setFromStoreId] = useState<string>("");
  const [toStoreId, setToStoreId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<{ title: string; items: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setFromStoreId(
      storesInBranch.find((s) => s.isSalesFloor)?.id ?? storesInBranch[0]?.id ?? "",
    );
    setToStoreId(storesInBranch[1]?.id ?? "");
    setQuantity("");
    setNote("");
    setError(null);
    setBusy(false);
  }, [item?.id, storesInBranch]);

  const open = item !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!item) return;
    const q = Number(quantity);
    const problems: string[] = [];
    if (!fromStoreId) problems.push(t("stores.transfer.sourceRequired"));
    if (!toStoreId) problems.push(t("stores.transfer.destinationRequired"));
    if (fromStoreId && fromStoreId === toStoreId)
      problems.push(t("stores.transfer.sameStoreError"));
    if (!Number.isFinite(q) || q <= 0)
      problems.push(t("stores.transfer.quantityRequired"));
    if (problems.length) {
      setError({
        title: t("stores.transfer.problemsTitle"),
        items: problems,
      });
      return;
    }
    setBusy(true);
    try {
      await transferStock({
        fromStoreId,
        toStoreId,
        inventoryItemId: item.id,
        quantity: q,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      const fallback = t("stores.transfer.transferError");
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
            <ArrowRightLeft className="size-5 text-muted-foreground" />
            {t("stores.transfer.title")}
          </DialogTitle>
          <DialogDescription>
            {item
              ? t("stores.transfer.body", { item: item.description })
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form id="transfer-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("stores.transfer.from")}</Label>
              <Select value={fromStoreId} onValueChange={setFromStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("stores.transfer.source")} />
                </SelectTrigger>
                <SelectContent>
                  {storesInBranch.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("stores.transfer.to")}</Label>
              <Select value={toStoreId} onValueChange={setToStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("stores.transfer.destination")} />
                </SelectTrigger>
                <SelectContent>
                  {storesInBranch
                    .filter((s) => s.id !== fromStoreId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">
                {t("stores.transfer.quantity")}
              </Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">{t("stores.transfer.note")}</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("stores.transfer.notePlaceholder")}
              />
            </div>
          </div>

          {error && <ErrorCallout title={error.title} items={error.items} />}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("stores.transfer.cancel")}
          </Button>
          <Button type="submit" form="transfer-form" disabled={busy}>
            {busy
              ? t("stores.transfer.moving")
              : t("stores.transfer.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
