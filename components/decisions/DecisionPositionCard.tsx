import Link from "next/link";
import type { ReactNode } from "react";
import { Shield, Info, ArrowRight } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { NativeFinancialPosition } from "@/lib/domain/financial-position/types";
import type { UpcomingObligation } from "@/lib/domain/obligations/types";

interface DecisionPositionCardProps {
  nativePositions: NativeFinancialPosition[];
  upcomingObligations: UpcomingObligation[];
  currencies: Map<string, Currency>;
}

function fmt(amount: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(amount, currency, { trimTrailingZeros: true }) : `${currencyCode} ${amount}`;
}

/**
 * Renders one metric across every native currency the user actually has
 * — never blended into one number (Decisions is multi-currency-first,
 * same discipline as Home's PositionSection). A single-currency user
 * simply sees one line per cell, matching the reference's plain
 * single-value composition exactly; a multi-currency user sees a short
 * stacked list instead of a silently-summed total.
 */
function MetricLines({ rows }: { rows: { key: string; node: ReactNode }[] }) {
  if (rows.length === 0) return <span className="font-semibold text-text-primary">Not set</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <div key={r.key}>{r.node}</div>
      ))}
    </div>
  );
}

/**
 * "DECISION POSITION" — reads Home's exact same canonical figures
 * (financial_position_by_currency() via getFinancialPositionSummary(),
 * the SAME function Home's PositionSection uses — no second
 * calculation). Cash Position (not "Liquid Cash" — see P0-E4-S2's
 * PositionSection rationale, reused verbatim here for terminology
 * consistency), Protected Cash, Safe to Deploy, and Upcoming Obligations
 * match the approved reference's 4-card grid composition. Every cell
 * shows "Not configured"/"Not set"/"Not calculated" rather than a
 * fabricated figure when the underlying fact doesn't exist yet — the
 * reference's own hardcoded "Not configured" cells are reproduced
 * exactly as REAL empty states here, not literal copy.
 */
export function DecisionPositionCard({ nativePositions, upcomingObligations, currencies }: DecisionPositionCardProps) {
  const cashRows = nativePositions.map((p) => ({
    key: p.currencyCode,
    node: (
      <span className="tabular-figures text-[22px] font-bold leading-tight text-text-primary">{fmt(p.liquidCash, p.currencyCode, currencies)}</span>
    ),
  }));

  const protectedRows = nativePositions
    .filter((p) => p.protectedCommitments !== null)
    .map((p) => ({
      key: p.currencyCode,
      node: <span className="text-sm font-semibold text-text-primary">{fmt(p.protectedCommitments!, p.currencyCode, currencies)}</span>,
    }));

  const safeRows = nativePositions
    .filter((p) => p.safeToDeployStatus === "calculated" && p.safeToDeploy !== null)
    .map((p) => ({
      key: p.currencyCode,
      node: <span className="text-sm font-semibold text-attention">{fmt(p.safeToDeploy!, p.currencyCode, currencies)}</span>,
    }));

  const nearestObligation = upcomingObligations.length > 0
    ? [...upcomingObligations].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    : null;

  return (
    <section className="rounded-xl bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-text-primary">Decision Position</h2>
          <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] font-semibold text-focus">Based on Tracked Data</span>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">Cash Position</span>
          <div className="mt-1">
            <MetricLines rows={cashRows} />
            <p className="mt-0.5 truncate text-[11px] text-text-muted">Across your cash accounts</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">Protected Cash</span>
          <div className="mt-1">
            {protectedRows.length > 0 ? (
              <MetricLines rows={protectedRows} />
            ) : (
              <span className="text-sm font-semibold text-text-secondary">Not configured</span>
            )}
            <p className="mt-0.5 truncate text-[11px] text-text-muted">Set your protected cash rules</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Safe to Deploy</span>
            <Shield size={13} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="mt-1">
            {safeRows.length > 0 ? (
              <MetricLines rows={safeRows} />
            ) : (
              <span className="text-sm font-semibold text-text-secondary">Not calculated</span>
            )}
            <p className="mt-0.5 truncate text-[11px] text-text-muted">Money you can use after protected savings and commitments</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-lg bg-surface-strong p-2.5">
          <span className="text-[11px] text-text-muted">Upcoming Obligations</span>
          <div className="mt-1">
            {upcomingObligations.length > 0 ? (
              <span className="text-sm font-semibold text-text-primary">
                {upcomingObligations.length} upcoming
              </span>
            ) : (
              <span className="text-sm font-semibold text-text-secondary">Not set</span>
            )}
            <p className="mt-0.5 truncate text-[11px] text-text-muted">
              {nearestObligation ? `Next: ${nearestObligation.name}` : "No upcoming obligations recorded"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 pt-1">
        <span className="flex items-start gap-1.5 text-xs text-text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-primary" aria-hidden="true" />
          Set the cash you want to keep protected and your upcoming commitments to calculate Safe to Deploy.
        </span>
        <Link href="/rules" className="relative flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent-primary before:absolute before:-inset-2.5 before:content-[''] hover:underline">
          Set Financial Rules
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
