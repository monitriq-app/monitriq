"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, PieChart, Compass, Target, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/money", label: "Money", Icon: Wallet },
] as const;

const ITEMS_AFTER = [
  { href: "/assets", label: "Assets", Icon: PieChart },
  { href: "/decisions", label: "Decisions", Icon: Compass },
  { href: "/goals", label: "Goals", Icon: Target },
] as const;

/**
 * Conceptual production navigation only (Home, Money, +, Assets,
 * Decisions, Goals) — Financial Position/Rules/Receivables/Liabilities
 * remain real, working routes but live in the account menu instead, per
 * the phase brief. Fixed + safe-area-aware so it stays usable once
 * installed as a PWA; each link/button keeps a >=48px touch target even
 * though the visible glyph is smaller.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-2">
        {ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors",
              isActive(href) ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={21} aria-hidden="true" />
            {label}
          </Link>
        ))}

        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/money#record-money"
            aria-label="Add money"
            className="relative -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary text-background shadow-md transition-transform active:scale-95"
          >
            <Plus size={23} aria-hidden="true" />
          </Link>
        </div>

        {ITEMS_AFTER.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors",
              isActive(href) ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={21} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
