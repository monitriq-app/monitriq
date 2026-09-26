"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, PiggyBank, Target, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useQuickAdd } from "@/components/quick-add/QuickAddContext";
import { PRIMARY_AFTER_ADD, PRIMARY_BEFORE_ADD, type PrimaryNavItem } from "@/components/layout/nav-items";

const ICONS: Record<PrimaryNavItem["icon"], LucideIcon> = { home: Home, money: Wallet, budget: PiggyBank, goals: Target };

/**
 * Everyday navigation only (P0-E5-S4): Home, Money, [+ Quick Add], Budget,
 * Goals. Assets, Decisions and the other financial tools live in the left
 * navigation drawer; account/settings live in the profile menu. Fixed and
 * safe-area-aware; each link/button keeps a >=48px touch target.
 */
function NavLink({ href, label, icon, pathname }: PrimaryNavItem & { pathname: string | null }) {
  const Icon = ICONS[icon];
  const active = pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors",
        active ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
      )}
    >
      <Icon size={21} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { open: openQuickAdd } = useQuickAdd();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-2">
        {PRIMARY_BEFORE_ADD.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label="Quick Add"
            className="relative -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary text-background shadow-md transition-transform active:scale-95"
          >
            <Plus size={23} aria-hidden="true" />
          </button>
        </div>

        {PRIMARY_AFTER_ADD.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
