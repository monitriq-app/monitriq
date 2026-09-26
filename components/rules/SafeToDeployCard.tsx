import { Shield } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/domain/currency/format";
import type { Currency } from "@/lib/domain/currency/types";
import type { SafeToDeployResult } from "@/lib/domain/rules/types";

interface SafeToDeployCardProps {
  results: SafeToDeployResult[];
  currencies: Map<string, Currency>;
}

function fmt(value: string, currencyCode: string, currencies: Map<string, Currency>): string {
  const currency = currencies.get(currencyCode);
  return currency ? formatCurrencyAmount(value, currency, { trimTrailingZeros: true }) : `${currencyCode} ${value}`;
}

/**
 * Production Safe to Deploy summary (P0-E4-S3A) — replaces the old
 * foundation-level `SafeToDeployPanel`'s raw `<dl>` grid with the same
 * card idiom used everywhere else in Monitriq (`rounded-xl bg-surface-
 * raised`, inner `bg-surface-strong` metric tiles). Reads
 * `getSafeToDeployByCurrency()` verbatim — no figure here is
 * recalculated; this is a presentation-only pass. One card per currency
 * the user actually has a row for (never every system currency) — never
 * blended across currencies.
 */
export function SafeToDeployCard({ results, currencies }: SafeToDeployCardProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-surface-raised p-4">
        <p className="text-sm text-text-muted">Add cash in Money to see your Safe to Deploy summary here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((r) => (
        <div key={r.currencyCode} className="rounded-xl bg-surface-raised p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text-primary">{r.currencyCode}</span>
            <Shield size={14} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface-strong p-2.5">
              <p className="text-[11px] text-text-muted">Cash Position</p>
              <p className="tabular-figures text-sm font-semibold text-text-primary">{fmt(r.liquidCash, r.currencyCode, currencies)}</p>
            </div>
            <div className="rounded-lg bg-surface-strong p-2.5">
              <p className="text-[11px] text-text-muted">Minimum Cash to Keep</p>
              <p className="tabular-figures text-sm font-semibold text-text-primary">
                {r.minimumCashFloor !== null ? fmt(r.minimumCashFloor, r.currencyCode, currencies) : "Not set"}
              </p>
            </div>
            <div className="rounded-lg bg-surface-strong p-2.5">
              <p className="text-[11px] text-text-muted">Protected Goals &amp; Commitments</p>
              <p className="tabular-figures text-sm font-semibold text-text-primary">
                {r.protectedCommitments !== null ? fmt(r.protectedCommitments, r.currencyCode, currencies) : "Not set"}
              </p>
            </div>
            <div className="rounded-lg bg-surface-strong p-2.5">
              <p className="text-[11px] text-text-muted">Safe to Deploy</p>
              {r.status === "calculated" && r.safeToDeploy !== null ? (
                <p className="tabular-figures text-sm font-semibold text-attention">{fmt(r.safeToDeploy, r.currencyCode, currencies)}</p>
              ) : (
                <p className="text-sm font-semibold text-text-secondary">Not calculated</p>
              )}
            </div>
          </div>
          {r.status === "not_configured" ? (
            <p className="mt-2 text-xs text-text-muted">Set a minimum cash amount for {r.currencyCode} below to calculate Safe to Deploy.</p>
          ) : r.retainedDeficit !== null && Number(r.retainedDeficit) > 0 ? (
            <p className="mt-2 text-xs text-danger">
              Your protected cash is short by {fmt(r.retainedDeficit, r.currencyCode, currencies)} — actual cash hasn&apos;t caught up with what&apos;s protected.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
