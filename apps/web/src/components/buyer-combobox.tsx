import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";

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
import { listBuyers } from "@/lib/resources";
import type { Buyer } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BuyerComboboxProps {
  value: string;
  onPick: (buyer: Buyer) => void;
  onClear: () => void;
}

export function BuyerCombobox({ value, onPick, onClear }: BuyerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBuyers()
      // The shared "Walk In Customer" singleton (tin WALKIN) backs every B2C
      // sale — it's not a real saved buyer you'd pick for a business invoice.
      .then((all) => setBuyers(all.filter((b) => b.tin !== "WALKIN")))
      .catch((e: Error) => setError(e.message));
  }, []);

  const selected = buyers.find((b) => b.tin === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-medium">{selected.legalName}</span>
              <span className="text-xs text-muted-foreground">
                · TIN {selected.tin}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Pick a saved buyer or enter manually below
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search by name or TIN…" />
          <CommandList>
            <CommandEmpty>
              {error ?? "No saved buyers yet. Submit an invoice to create one."}
            </CommandEmpty>
            <CommandGroup heading="Saved buyers">
              {buyers.map((b) => (
                <CommandItem
                  key={b.id}
                  value={`${b.legalName} ${b.tin}`}
                  onSelect={() => {
                    onPick(b);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected?.id === b.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{b.legalName}</span>
                    <span className="text-xs text-muted-foreground">
                      TIN {b.tin}
                      {b.vatNumber ? ` · VAT ${b.vatNumber}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {selected && (
              <CommandGroup>
                <CommandItem onSelect={() => {
                  onClear();
                  setOpen(false);
                }}>
                  <UserPlus className="size-4" />
                  Clear &amp; enter new buyer
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
