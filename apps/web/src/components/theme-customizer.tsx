import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = [
  { name: "Indigo", color: "#4F46E5", hover: "#4338CA" },
  { name: "Sky", color: "#0EA5E9", hover: "#0284C7" },
  { name: "Rose", color: "#E11D48", hover: "#BE123C" },
  { name: "Emerald", color: "#10B981", hover: "#059669" },
  { name: "Amber", color: "#F59E0B", hover: "#D97706" },
  { name: "Slate", color: "#475569", hover: "#334155" },
  { name: "Violet", color: "#7C3AED", hover: "#6D28D9" },
  { name: "Teal", color: "#0F766E", hover: "#115E59" },
  { name: "Orange", color: "#EA580C", hover: "#C2410C" },
  { name: "Blue", color: "#2563EB", hover: "#1D4ED8" },
];

export function ThemeCustomizer() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("app-theme-color") || "#4F46E5";
  });
  const [customColor, setCustomColor] = useState(theme);

  useEffect(() => {
    const selected = THEMES.find((t) => t.color === theme);
    document.documentElement.style.setProperty("--primary", theme);
    document.documentElement.style.setProperty("--primary-hover", selected?.hover ?? theme);
    document.documentElement.style.setProperty("--ring", theme);
    localStorage.setItem("app-theme-color", theme);
  }, [theme]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0 rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <Palette className="size-4" />
          <span className="sr-only">Customize Theme</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 rounded-[16px] shadow-dialog">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Business Theme Color
          </span>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.name}
                onClick={() => setTheme(t.color)}
                className={cn(
                  "flex items-center gap-2 rounded-[8px] p-2 text-[13px] font-medium transition-colors border",
                  theme === t.color ? "bg-muted border-border" : "border-transparent hover:bg-muted/50"
                )}
              >
                <span className="size-4 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-2 text-[13px] font-medium">
            Custom color
            <input
              type="color"
              value={customColor}
              onChange={(event) => {
                setCustomColor(event.target.value);
                setTheme(event.target.value.toUpperCase());
              }}
              className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
              aria-label="Choose a custom theme color"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
