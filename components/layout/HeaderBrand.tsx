"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Route -> real page title. Every route actually reachable from
 * AppShell's own navigation (MobileBottomNav/DesktopNav/AccountMenu's
 * foundation routes) has an entry; the header falls back to nothing
 * shown if a route isn't listed rather than guessing. This is the
 * shared header for every (app) route (see app/(app)/layout.tsx), so
 * this label is genuinely dynamic per page — never hardcoded to "Home"
 * globally, even though Home was the page the gap audit compared
 * against the reference's own single-page "Home" header.
 */
const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/home", title: "Home" },
  { prefix: "/money", title: "Money" },
  { prefix: "/assets", title: "Assets" },
  { prefix: "/decisions", title: "Decisions" },
  { prefix: "/goals", title: "Goals" },
  { prefix: "/financial-position", title: "Financial Position" },
  { prefix: "/rules", title: "Rules & Obligations" },
  { prefix: "/receivables", title: "Receivables" },
  { prefix: "/liabilities", title: "Liabilities" },
];

function titleFor(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = ROUTE_TITLES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match?.title ?? null;
}

/**
 * Header-left brand + real page-context block — the reference's
 * icon-badge + eyebrow/title composition, adapted: the badge uses
 * Monatriq's own mark (never "Capital Compass"), and the title is the
 * CURRENT real route's own name (never a static "Home" shown on every
 * page), derived from the URL Next.js itself resolved, not invented.
 */
export function HeaderBrand() {
  const pathname = usePathname();
  const title = titleFor(pathname);

  return (
    <Link href="/home" className="flex items-center gap-2.5" aria-label="Monatriq Home">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
        <BrandLogo variant="mark" className="h-5 w-5" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Monatriq</span>
        {title ? <span className="mt-0.5 text-lg font-semibold text-text-primary">{title}</span> : null}
      </span>
    </Link>
  );
}
