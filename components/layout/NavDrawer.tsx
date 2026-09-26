"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, PieChart, Wallet, HandCoins, Compass, LayoutDashboard, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { DRAWER_SECTIONS } from "@/components/layout/nav-items";
import { useTerms } from "@/components/language/LanguageProvider";

const ICONS: Record<string, LucideIcon> = { assets: PieChart, debts: Wallet, owed: HandCoins, decisions: Compass, overview: LayoutDashboard, rules: ShieldCheck };

interface NavDrawerProps {
  /** restoreFocus: hand focus back to the menu button (Escape / close / backdrop); false when navigating away. */
  onClose: (opts: { restoreFocus: boolean }) => void;
}

const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Left-side product navigation (P0-E5-S4): secondary financial tools that
 * are not everyday bottom-nav actions. Rendered only while open. Locks page
 * scrolling (html.nav-locked) while it is open, closes on backdrop, Escape
 * and route selection, moves focus in on open and keeps Tab inside. The
 * parent (ShellHeader) returns focus to the menu button on Escape/close/backdrop.
 */
export function NavDrawer({ onClose }: NavDrawerProps) {
  const pathname = usePathname();
  const terms = useTerms();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("nav-locked");
    closeRef.current?.focus();
    return () => document.documentElement.classList.remove("nav-locked");
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose({ restoreFocus: true });
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-background/70" onClick={() => onClose({ restoreFocus: true })} aria-hidden="true" data-testid="drawer-backdrop" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="drawer-panel absolute left-0 top-0 flex h-full w-[min(85vw,20rem)] flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface-raised pb-[max(env(safe-area-inset-bottom),16px)] pl-[env(safe-area-inset-left)] pt-[max(env(safe-area-inset-top),0px)] shadow-2xl"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <span className="text-base font-semibold text-text-primary">Menu</span>
          <button ref={closeRef} type="button" onClick={() => onClose({ restoreFocus: true })} aria-label="Close navigation" className="-mr-2 flex h-12 w-12 items-center justify-center rounded-full text-text-secondary hover:text-text-primary">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="App navigation" className="flex flex-col gap-5 px-3 pb-4">
          {DRAWER_SECTIONS.map((section) => (
            <div key={section.heading} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{section.heading}</p>
              {section.items.map((item) => {
                const Icon = ICONS[item.key];
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onClose({ restoreFocus: false })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "bg-surface-strong text-accent-primary" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                    )}
                  >
                    <Icon size={18} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{item.term ? terms.t(item.term) : item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
