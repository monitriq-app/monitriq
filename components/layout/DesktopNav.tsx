"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, PiggyBank, Target, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useQuickAdd } from "@/components/quick-add/QuickAddContext";
import { PRIMARY_AFTER_ADD, PRIMARY_BEFORE_ADD, type PrimaryNavItem } from "@/components/layout/nav-items";

const ICONS: Record<PrimaryNavItem["icon"], LucideIcon> = { home: Home, money: Wallet, budget: PiggyBank, goals: Target };
const ITEMS = [...PRIMARY_BEFORE_ADD, ...PRIMARY_AFTER_ADD];

/**
 * Tablet/desktop primary navigation — the same four everyday destinations as
 * the mobile bottom nav (Home, Money, Budget, Goals; the other tools are in the left drawer) (see MobileBottomNav.tsx), plus a real Quick Add
 * trigger (P0-E3-S3): MobileBottomNav's central `+` is `md:hidden`, so
 * without an equivalent control here, Quick Add would be completely
 * unreachable at tablet/desktop widths. Link padding is tighter below `lg`
 * (px-2, then lg:px-3) so the nav plus logo plus account button fit a 768px
 * viewport without horizontal overflow (P0-E3-S1D).
 */
export function DesktopNav() {
  const pathname = usePathname();
  const { open: openQuickAdd } = useQuickAdd();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {ITEMS.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        return (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors lg:px-3",
            isActive(href) ? "bg-surface-muted text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </Link>
        );
      })}
      <button
        type="button"
        onClick={openQuickAdd}
        aria-label="Quick Add"
        className="ml-1 flex items-center gap-1.5 rounded-full bg-accent-primary px-3 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
      >
        <Plus size={16} aria-hidden="true" />
        Add
      </button>
    </nav>
  );
}
