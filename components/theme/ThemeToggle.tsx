"use client";

import { useTheme } from "@teispace/next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Restrained appearance control — Light/Dark/System. Deliberately kept out
 * of the financial dashboard body and placed in the account menu (see
 * AppShell). Built on @teispace/next-themes (see ThemeProvider.tsx for why
 * this replaced upstream next-themes). `theme` is backed by
 * `useSyncExternalStore` under the hood, so it's never `undefined` here —
 * it starts at `defaultTheme` ("system") and updates the instant the
 * client store finishes reading `localStorage`, with no manual mounted/
 * effect state needed in this component either way. UI-only state
 * throughout — never a financial one.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              selected ? "bg-accent-primary text-background" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
