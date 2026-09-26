"use client";

import { LANGUAGE_MODE_OPTIONS, type FinancialLanguageMode } from "@/lib/domain/language/types";

interface Props {
  value: FinancialLanguageMode;
  onChange: (mode: FinancialLanguageMode) => void;
  /** Distinct per instance so two selectors on a page never share a radio group. */
  name: string;
  disabled?: boolean;
}

/**
 * "How would you like Monitriq to explain your money?" — three plain choices
 * (not a knowledge test, no levels or badges). Native radio inputs inside
 * labelled cards: keyboard and screen-reader friendly, 48px+ targets, and
 * descriptions wrap naturally on narrow screens. Shared by onboarding and the
 * account settings so both stay identical.
 */
export function LanguageModeSelector({ value, onChange, name, disabled }: Props) {
  return (
    <div role="radiogroup" aria-label="How Monitriq explains money" className="flex flex-col gap-2">
      {LANGUAGE_MODE_OPTIONS.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              selected ? "border-accent-primary bg-accent-primary/10" : "border-border bg-surface hover:bg-surface-muted"
            } ${disabled ? "opacity-60" : ""}`}
          >
            <input type="radio" name={name} value={o.value} checked={selected} disabled={disabled} onChange={() => onChange(o.value)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent-primary)]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">{o.label}</span>
              <span className="block text-xs leading-snug text-text-muted">{o.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
