"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SignOutButton } from "@/components/auth/SignOutButton";

interface AccountMenuProps {
  email: string | null;
}

const FOUNDATION_ROUTES = [
  { href: "/budget", label: "Budget" },
  { href: "/financial-position", label: "Financial Position" },
  { href: "/rules", label: "Rules & Obligations" },
  { href: "/receivables", label: "Money Owed to You" },
  { href: "/liabilities", label: "Debts" },
] as const;

/**
 * The one place appearance (Light/Dark/System) lives — deliberately kept
 * out of the financial dashboard body. Also the production home for the
 * foundation/development routes (Financial Position, Rules, Receivables,
 * Liabilities): they remain real, fully working routes, just not primary
 * navigation (see docs/product/PRODUCT_DEFINITION.md #3 and the P0-E3-S2
 * report's "Navigation" section).
 */
export function AccountMenu({ email }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
      >
        <User size={19} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
        >
          {email ? <p className="truncate px-1 pb-3 text-sm text-text-secondary">{email}</p> : null}

          <div className="flex flex-col gap-1.5 border-b border-border pb-3">
            <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Appearance</span>
            <ThemeToggle />
          </div>

          <div className="flex flex-col gap-1 border-b border-border py-3">
            <span className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
              Foundation routes
            </span>
            {FOUNDATION_ROUTES.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              >
                {route.label}
              </Link>
            ))}
          </div>

          <div className="pt-3">
            <SignOutButton className="w-full" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
