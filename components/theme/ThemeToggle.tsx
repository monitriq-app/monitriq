"use client";

import { useTheme } from "next-themes";
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
 * AppShell) per the phase brief. `theme` is `undefined` until next-themes'
 * own provider has read localStorage on the client (it cannot know the
 * value during server rendering) — no local mounted/effect state is
 * needed here: next-themes re-renders every `useTheme()` consumer via
 * context once it resolves, so `selected` is simply false for every
 * option until then and correct immediately after. UI-only state
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
