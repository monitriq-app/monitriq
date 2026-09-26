import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { HOME_CTA } from "@/lib/domain/spending-check/presentation";

/** Compact everyday entry to "Can I afford this?" — a link only; it shows no figures. */
export function SpendingCheckCard() {
  return (
    <Link href="/spending-check" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-accent-primary/25 bg-surface-raised px-4 py-[1.125rem]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
          <ShoppingBag size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-text-primary">{HOME_CTA.title}</span>
          <span className="block text-xs text-text-muted">{HOME_CTA.body}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
    </Link>
  );
}
