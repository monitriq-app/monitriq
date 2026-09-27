"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { InstallSection } from "@/components/pwa/InstallSection";
import { LanguageModeSelector } from "@/components/language/LanguageModeSelector";
import { useLanguageMode } from "@/components/language/LanguageProvider";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/domain/profile/repository";
import { LANGUAGE_SETTINGS_HEADING, type FinancialLanguageMode } from "@/lib/domain/language/types";

interface AccountMenuProps {
  displayName: string | null;
  email: string | null;
  preferredCurrency: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Profile menu (P0-E5-S4): ACCOUNT and SETTINGS only — who you are,
 * preferred currency, appearance (Light/Dark/System), password, sign out.
 * Product navigation (Assets, Debts, Money Owed, Decisions, Financial
 * Overview, Rules & Commitments) lives in the left navigation drawer, never
 * here. It also holds the explanation-style preference (Language & explanations). Open state is owned by ShellHeader so this menu and the drawer are
 * mutually exclusive. Escape and outside-click close it; Escape returns
 * focus to the trigger.
 */
export function AccountMenu({ displayName, email, preferredCurrency, open, onOpenChange }: AccountMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const mode = useLanguageMode();
  const [chosen, setChosen] = useState<FinancialLanguageMode | null>(null);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // Saves through the established profile boundary (RLS-protected); the server re-renders with the new mode, no sign-out needed.
  async function changeLanguage(next: FinancialLanguageMode) {
    setLanguageError(null);
    setChosen(next);
    try {
      await updateProfile(createClient(), { financial_language_mode: next });
      router.refresh();
    } catch (err) {
      setChosen(null);
      // Keep the friendly sentence but never hide the real cause (missing column, permission, constraint...).
      const detail = (err as { message?: string } | null)?.message;
      console.error("Saving the language preference failed:", err);
      setLanguageError(detail ? `Could not save this: ${detail}` : "Could not save this. Please try again.");
    }
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onOpenChange(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => onOpenChange(!open)}
        className="-mr-1 flex h-12 w-12 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
      >
        <User size={19} aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-5rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-raised p-3 shadow-lg outline-none"
        >
          <div className="min-w-0 border-b border-border px-1 pb-3">
            {displayName ? <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p> : null}
            {email ? <p className={`truncate text-sm ${displayName ? "text-text-muted" : "text-text-primary"}`}>{email}</p> : null}
          </div>

          {preferredCurrency ? (
            <div className="flex flex-col gap-1 border-b border-border py-3">
              <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Account</span>
              <p className="flex min-h-10 items-center justify-between gap-3 px-1 text-sm">
                <span className="text-text-secondary">Preferred currency</span>
                <span className="font-semibold text-text-primary">{preferredCurrency}</span>
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 border-b border-border py-3">
            <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Appearance</span>
            <ThemeToggle showLabels />
          </div>

          <div className="flex flex-col gap-1.5 border-b border-border py-3">
            <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Language &amp; explanations</span>
            <p className="px-1 text-xs text-text-secondary">{LANGUAGE_SETTINGS_HEADING}</p>
            <LanguageModeSelector name="account-language-mode" value={chosen ?? mode} onChange={changeLanguage} />
            {languageError ? (
              <p role="alert" className="px-1 text-xs text-danger">
                {languageError}
              </p>
            ) : null}
          </div>

          <InstallSection />

          <div className="flex flex-col gap-1 border-b border-border py-3">
            <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Security</span>
            <Link href="/update-password" onClick={() => onOpenChange(false)} className="flex min-h-12 items-center gap-2 rounded-md px-2 text-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary">
              <KeyRound size={16} aria-hidden="true" />
              Change password
            </Link>
          </div>

          <div className="pt-1">
            <SignOutButton subtle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
