import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ErrorCalloutProps {
  title: string;
  items?: string[];
  className?: string;
}

export function ErrorCallout({ title, items, className }: ErrorCalloutProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      {items && items.length > 0 && (
        <ul className="ml-6 list-disc space-y-1 text-sm text-foreground/85">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
