import Link from "next/link";
import { Wallet, Target, PieChart, Compass, CalendarClock, ShieldCheck } from "lucide-react";

const TRACKED_ITEMS = [
  { label: "Cash position", Icon: Wallet },
  { label: "Goals", Icon: Target },
  { label: "Assets", Icon: PieChart },
  { label: "Decisions", Icon: Compass },
  { label: "Commitments", Icon: CalendarClock },
  { label: "Money you want to keep", Icon: ShieldCheck },
] as const;

/**
 * Shown only when the authenticated user has no financial data anywhere
 * yet (no cash, assets, receivables, or liabilities). Deliberately an
 * open, editorial layout — spacing and typography carry the hierarchy,
 * not a large bordered card — per the Visual Constitution's "prefer
 * spacing, alignment, dividers... before reaching for another card."
 * Progressive, not exhaustive: one primary action (cash is the most
 * foundational starting point), two restrained secondary links, never a
 * financial recommendation. The "What Monitriq will track" section below
 * is product orientation only — no numbers, no charts, nothing invented.
 */
export function NewUserSetup() {
  return (
    <div className="flex flex-col gap-10">
      <div className="border-t border-border pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Your financial picture starts here</p>
        <p className="mt-3 text-lg font-medium text-text-primary">No balances recorded yet.</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          Add the cash you actually have first. Monitriq will build your financial position as you add assets, goals, and
          commitments.
        </p>
        <Link
          href="/money#record-money"
          className="mt-5 inline-flex h-12 items-center justify-center rounded-lg bg-accent-primary px-5 text-sm font-medium text-background hover:opacity-90"
        >
          Add cash balance
        </Link>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <Link href="/assets" className="text-text-secondary hover:text-accent-primary">
            Add asset
          </Link>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <Link href="/goals" className="text-text-secondary hover:text-accent-primary">
            Create goal
          </Link>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">What Monitriq will track</p>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
          {TRACKED_ITEMS.map(({ label, Icon }) => (
            <div key={label} className="flex items-center gap-2.5">
              <Icon size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
              <span className="text-sm text-text-secondary">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
