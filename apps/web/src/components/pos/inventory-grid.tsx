import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { resolveImageUrl } from "@/lib/api";
import { nonTaxableSuffix } from "@/lib/invoice-types";
import type { InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

import { AddAdHocLineDialog } from "./add-adhoc-line-dialog";

export interface InventoryGridProps {
  items: InventoryItem[];
  search: string;
  onSearchChange: (value: string) => void;
  /** Fired on Enter in the search box. The page uses this to try an exact
   *  UPC/SKU/code lookup — the barcode-scanner path. */
  onSearchSubmit?: () => void;
  onAdd: (item: InventoryItem) => void;
  cartCounts: Map<string, number>;
  /** Locked nature for the next add — null when the cart is empty.
   *  Threaded into the ad-hoc dialog so the user can't accidentally mix
   *  goods + services. */
  forcedNature: InventoryItem["nature"] | null;
  /** Branch is in BLOCK_ON_EMPTY mode. Tracked items with insufficient
   *  on-hand get a disabled Add + an "Out — cannot sell" ribbon. */
  blockOnEmpty?: boolean;
}

export function InventoryGrid({
  items,
  search,
  onSearchChange,
  onSearchSubmit,
  onAdd,
  cartCounts,
  forcedNature,
  blockOnEmpty = false,
}: InventoryGridProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchSubmit?.();
              }
            }}
            placeholder="Search or scan (name, code, SKU, UPC)…"
            className="h-11 pl-9"
            autoComplete="off"
            autoFocus
          />
        </div>
        <AddAdHocLineDialog onAdd={onAdd} forcedNature={forcedNature} />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          search.trim() ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              No items match "{search}".
            </p>
          ) : (
            <EmptyHint />
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-4 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                count={cartCounts.get(item.id) ?? 0}
                onAdd={() => onAdd(item)}
                blockOnEmpty={blockOnEmpty}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  count,
  onAdd,
  blockOnEmpty,
}: {
  item: InventoryItem;
  count: number;
  onAdd: () => void;
  blockOnEmpty: boolean;
}) {
  const { t } = useTranslation();
  const inCart = count > 0;
  // Sales-floor stock, not the branch total: a back room holding 70 doesn't
  // help a cashier, and the gate would refuse the sale anyway.
  const onHand = item.sellable ?? 0;
  // Under BLOCK_ON_EMPTY, disable Add when: the item is tracked AND adding
  // one more line would drive on-hand below zero, accounting for what's
  // already in the cart.
  const blocked =
    blockOnEmpty && item.trackStock && count + 1 > onHand;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={blocked}
      title={blocked ? t("pos.stock.blocked") : undefined}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-[#5700FF]/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5700FF]/40",
        inCart && "border-[#5700FF]/60 ring-1 ring-[#5700FF]/30",
        blocked &&
          "cursor-not-allowed opacity-60 grayscale hover:translate-y-0 hover:border-input hover:shadow-sm",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800/50">
        {item.imageUrl ? (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img
            src={resolveImageUrl(item.imageUrl)}
            alt={item.description}
            className="size-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-3xl font-semibold text-[#5700FF]/40">
            {item.description.charAt(0).toUpperCase()}
          </div>
        )}

        {item.trackStock && (
          <span
            className={cn(
              "absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shadow",
              onHand <= 0
                ? "bg-destructive text-destructive-foreground"
                : item.lowStockThreshold != null &&
                    onHand <= item.lowStockThreshold
                  ? "bg-amber-500 text-white"
                  : "bg-white/95 text-foreground",
            )}
          >
            {onHand <= 0
              ? t("pos.stock.out")
              : t("pos.stock.left", { count: onHand })}
          </span>
        )}

        {inCart && (
          <span className="absolute right-2 top-2 inline-flex items-center justify-center rounded-full bg-[#5700FF] px-2 py-0.5 text-xs font-semibold text-white shadow">
            ×{count}
          </span>
        )}

        <div className="absolute bottom-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-white/95 text-[#5700FF] shadow-sm transition-transform group-hover:scale-110">
          <Plus className="size-4" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1 p-3">
        <span className="line-clamp-2 min-h-10 break-words text-sm font-medium leading-tight">
          {item.description}
          {nonTaxableSuffix(item.taxCode)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {item.sku ?? item.code}
        </span>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <span className="min-w-0 break-all text-base font-semibold tabular-nums sm:text-lg">
            {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            {item.taxCode}
          </span>
        </div>
      </div>
    </button>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="text-sm font-medium">No inventory yet</span>
      <span className="text-xs text-muted-foreground">
        Head to the Inventory page to add the items you sell.
      </span>
    </div>
  );
}
