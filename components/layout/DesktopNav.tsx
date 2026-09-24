"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, PieChart, Compass, Target } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/money", label: "Money", Icon: Wallet },
  { href: "/assets", label: "Assets", Icon: PieChart },
  { href: "/decisions", label: "Decisions", Icon: Compass },
  { href: "/goals", label: "Goals", Icon: Target },
] as const;

/** Tablet/desktop primary navigation — the same conceptual five items as the mobile bottom nav (see MobileBottomNav.tsx). */
export function DesktopNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(href) ? "bg-surface-muted text-text-primary" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
