import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { nonTaxableSuffix } from "@/lib/invoice-types";
import { listInventory } from "@/lib/resources";
import type { InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface InventoryPickerProps {
  value: string | undefined;
  onPick: (item: InventoryItem) => void;
}

export function InventoryPicker({ value, onPick }: InventoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    listInventory().then(setItems).catch(() => setItems([]));
  }, []);

  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate text-left">
              <span className="font-medium">{selected.code}</span>
              <span className="text-muted-foreground">·</span>
              <span className="truncate">
                {selected.description}
                {nonTaxableSuffix(selected.taxCode)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Pick from inventory…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Code or description…" />
          <CommandList>
            <CommandEmpty>No items. Add some on the Inventory page.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.code} ${item.description}`}
                  onSelect={() => {
                    onPick(item);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected?.id === item.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex w-full justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{item.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                        {nonTaxableSuffix(item.taxCode)}
                      </span>
                    </div>
                    <span className="text-xs tabular-nums">
                      {item.unitPrice.toFixed(2)} ETB · {item.taxCode}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
